'use strict';
const crypto = require('node:crypto');
const {normalizeSecret, totp, secretBox} = require('./totp-crypto');
const {openConnection, queuedRoutes, transaction} = require('./sqlite-connection');
const DURATIONS = [1800,3600,7200,43200,86400,604800];
const fail = (message, status = 400) => { throw Object.assign(Error(message), {status}); };
async function migrateTotp(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS totp_entries(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,ciphertext TEXT NOT NULL,nonce TEXT NOT NULL,tag TEXT NOT NULL,key_id TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_totp_owner ON totp_entries(user_id)');
  await db.run(`CREATE TABLE IF NOT EXISTS totp_grants(entry_id TEXT NOT NULL REFERENCES totp_entries(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,granted_by INTEGER NOT NULL,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(entry_id,user_id))`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_totp_recipient ON totp_grants(user_id,expires_at)');
  // Intentionally no names, secrets, codes, foreign keys or request payloads.
  await db.run(`CREATE TABLE IF NOT EXISTS totp_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id INTEGER NOT NULL,entry_id TEXT NOT NULL,target_id INTEGER,action TEXT NOT NULL,occurred_at INTEGER NOT NULL,dedupe_key TEXT NOT NULL UNIQUE)`);
}
function limiter(max, windowMs, clock) {
  const buckets = new Map();
  return (req,res,next) => {
    const now = clock(), keys = ['ip:' + req.ip, 'user:' + (req.session.user?.id || 'guest')];
    for (const [key,value] of buckets) if (value.until <= now) buckets.delete(key);
    if (buckets.size > 10000) return res.status(429).json({message:'请求过于频繁，请稍后重试'});
    for (const key of keys) {
      const b = buckets.get(key) || {count:0,until:now+windowMs};
      b.count++; buckets.set(key,b);
      // Shared proxies may serve several accounts; the account limit stays strict.
      if (b.count > max * (key.startsWith('ip:') ? 10 : 1)) {
        res.set('Retry-After',String(Math.max(1,Math.ceil((b.until-now)/1000))));
        return res.status(429).json({message:'请求过于频繁，请稍后重试'});
      }
    }
    next();
  };
}
function registerTotp(app, {requireLogin, requireAdmin, db = openConnection(), clock = Date.now, encryptionKey = () => process.env.GARYHUB_TOTP_ENCRYPTION_KEY}) {
  const route = queuedRoutes(db), readLimit = limiter(90,60000,clock), changeLimit = limiter(30,60000,clock), revealLimit = limiter(10,60000,clock);
  const entryId = req => { const id = req.params.id; if (!/^[0-9a-f-]{36}$/.test(id)) fail('条目不存在',404); return id; };
  async function actor(req, admin = false) {
    const u = await db.get('SELECT id,role,enabled,auth_version,must_change_password,deletion_pending FROM users WHERE id=?',[req.session.user.id]);
    if (!u || !u.enabled || u.deletion_pending || u.must_change_password || u.auth_version !== (req.session.authVersion || 0)) fail('登录已失效，请重新登录',401);
    if (admin && u.role !== 'admin') fail('需要管理员权限',403);
    const supplied = ['GET','HEAD'].includes(req.method) ? Number(req.query.accountId) : req.body.accountId;
    if (supplied !== u.id) fail('登录账号已变化，请刷新页面',409);
    return u;
  }
  async function entry(req) { const e = await db.get('SELECT * FROM totp_entries WHERE id=?',[entryId(req)]); if (!e) fail('条目不存在或无权访问',404); return e; }
  async function audit(user,id,action,target = null) {
    const now = clock(), dedupe = action === 'code-view' ? `${user.id}:${id}:${Math.floor(now/30000)}` : crypto.randomUUID();
    await db.run('INSERT OR IGNORE INTO totp_audit(actor_id,entry_id,target_id,action,occurred_at,dedupe_key) VALUES(?,?,?,?,?,?)',[user.id,id,target,action,now,dedupe]);
  }
  function decrypt(row) {
    let box;
    try { box = secretBox(encryptionKey()); return box.decrypt(row); }
    catch { fail('密钥服务暂不可用，请联系管理员',503); }
    finally { box?.destroy(); }
  }
  app.get('/api/hub/totp',requireLogin,readLimit,route(async(req,res) => {
    const u = await actor(req), now = clock();
    const rows = await db.all(`SELECT e.id,e.user_id,e.name,e.created_at,e.updated_at,g.expires_at,u.username AS owner_name FROM totp_entries e JOIN users u ON u.id=e.user_id LEFT JOIN totp_grants g ON g.entry_id=e.id AND g.user_id=? WHERE u.enabled=1 AND u.deletion_pending=0 AND (?=1 OR e.user_id=? OR g.expires_at>?) ORDER BY e.created_at DESC,e.id`,[u.id,Number(u.role==='admin'),u.id,now]);
    res.json({accountId:u.id,serverTime:now,items:rows.map(e=>({id:e.id,name:e.name,source:e.user_id===u.id?'own':u.role==='admin'?'admin':'shared',expiresAt:e.user_id===u.id||u.role==='admin'?null:e.expires_at,...(u.role==='admin'?{ownerId:e.user_id,ownerName:e.owner_name}:{} )}))});
  }));
  app.post('/api/hub/totp',requireLogin,changeLimit,route(async(req,res) => {
    await transaction(db,async()=>{
      const u = await actor(req), name = req.body.name;
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) fail('名称应为 1–80 个字符');
      let secret; try { secret = normalizeSecret(req.body.secret); } catch(e) { fail(e.message); }
      if ((await db.get('SELECT COUNT(*) AS n FROM totp_entries WHERE user_id=?',[u.id])).n >= 50) fail('每个账号最多保存 50 个条目');
      if ((await db.get('SELECT COUNT(*) AS n FROM totp_entries')).n >= 500) fail('条目数量已达到当前服务上限');
      const id = crypto.randomUUID(), now = clock(); let box, encrypted;
      try { box = secretBox(encryptionKey()); encrypted = box.encrypt(secret,id,u.id); } catch { fail('密钥服务暂不可用，请联系管理员',503); } finally { box?.destroy(); }
      await db.run('INSERT INTO totp_entries(id,user_id,name,ciphertext,nonce,tag,key_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',[id,u.id,name.trim(),encrypted.ciphertext,encrypted.nonce,encrypted.tag,encrypted.key_id,now,now]);
      await audit(u,id,'create'); res.status(201); res.locals.result = {id,name:name.trim()};
    });
    res.json(res.locals.result);
  }));
  app.post('/api/hub/totp/codes',requireLogin,readLimit,route(async(req,res) => {
    const ids = req.body.entryIds;
    if (!Array.isArray(ids) || ids.length > 50 || !ids.length || ids.some(id=>typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id)) || new Set(ids).size!==ids.length) fail('请选择 1–50 个条目');
    const result = await transaction(db,async()=>{
      const u = await actor(req), now = clock(), items = [];
      for (const id of ids) {
        const e = await db.get(`SELECT e.*,u.enabled,u.deletion_pending,g.expires_at FROM totp_entries e JOIN users u ON u.id=e.user_id LEFT JOIN totp_grants g ON g.entry_id=e.id AND g.user_id=? WHERE e.id=?`,[u.id,id]);
        if (!e || !e.enabled || e.deletion_pending || !(u.role==='admin'||e.user_id===u.id||e.expires_at>now)) fail('条目不存在、授权已失效或无权访问',404);
        const code = totp(decrypt(e),now);
        await audit(u,id,'code-view');
        items.push({id,code,validUntil:Math.min((Math.floor(now/30000)+1)*30000,u.role==='admin'||e.user_id===u.id?Infinity:e.expires_at)});
      }
      return {accountId:u.id,serverTime:now,items};
    });
    res.json(result);
  }));
  app.put('/api/hub/totp/:id',requireLogin,changeLimit,route(async(req,res)=>{
    await transaction(db,async()=>{const u=await actor(req),e=await entry(req),name=req.body.name;if(e.user_id!==u.id)fail('只能修改自己的条目',403);if(typeof name!=='string'||!name.trim()||name.trim().length>80)fail('名称应为 1–80 个字符');await db.run('UPDATE totp_entries SET name=?,updated_at=? WHERE id=?',[name.trim(),clock(),e.id]);await audit(u,e.id,'rename');});res.json({ok:true});
  }));
  app.delete('/api/hub/totp/:id',requireLogin,changeLimit,route(async(req,res)=>{
    await transaction(db,async()=>{const u=await actor(req),e=await entry(req);if(e.user_id!==u.id)fail('只能删除自己的条目',403);await db.run('DELETE FROM totp_entries WHERE id=?',[e.id]);await audit(u,e.id,'delete');});res.json({ok:true});
  }));
  app.post('/api/hub/totp/:id/reveal',requireAdmin,revealLimit,route(async(req,res)=>{
    const result=await transaction(db,async()=>{const u=await actor(req,true),e=await entry(req),secret=decrypt(e);await audit(u,e.id,'secret-view');return {accountId:u.id,secret};});res.json(result);
  }));
  app.get('/api/hub/totp/:id/grants',requireAdmin,readLimit,route(async(req,res)=>{
    await actor(req,true);const e=await entry(req);const items=await db.all('SELECT g.user_id AS userId,u.username,g.expires_at AS expiresAt,u.enabled,u.deletion_pending AS deletionPending FROM totp_grants g JOIN users u ON u.id=g.user_id WHERE g.entry_id=? ORDER BY g.expires_at DESC',[e.id]);res.json({items,serverTime:clock()});
  }));
  app.put('/api/hub/totp/:id/grants/:userId',requireAdmin,changeLimit,route(async(req,res)=>{
    const result=await transaction(db,async()=>{
      const u=await actor(req,true),e=await entry(req),recipient=Number(req.params.userId),now=clock();
      const owner=await db.get('SELECT enabled,deletion_pending FROM users WHERE id=?',[e.user_id]);if(!owner?.enabled||owner.deletion_pending)fail('条目所属账号已停用',409);
      const target=await db.get('SELECT id,enabled,deletion_pending,must_change_password FROM users WHERE id=?',[recipient]);if(!target||!target.enabled||target.deletion_pending)fail('请选择已启用的账号');if(target.id===e.user_id)fail('条目所有者已有使用权');
      let expiresAt;
      if(req.body.durationSeconds!==undefined&&req.body.expiresAt!==undefined)fail('请选择一种有效期设置');
      if(DURATIONS.includes(req.body.durationSeconds))expiresAt=now+req.body.durationSeconds*1000;
      else if(typeof req.body.expiresAt==='string'&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(req.body.expiresAt))expiresAt=Date.parse(req.body.expiresAt);
      if(!Number.isSafeInteger(expiresAt)||expiresAt<=now||expiresAt>253402300799999)fail('请设置有效的未来截止时间');
      await db.run('INSERT INTO totp_grants(entry_id,user_id,granted_by,expires_at,created_at) VALUES(?,?,?,?,?) ON CONFLICT(entry_id,user_id) DO UPDATE SET granted_by=excluded.granted_by,expires_at=excluded.expires_at,created_at=excluded.created_at',[e.id,target.id,u.id,expiresAt,now]);await audit(u,e.id,'grant',target.id);return {expiresAt};
    });res.json({ok:true,...result});
  }));
  app.delete('/api/hub/totp/:id/grants/:userId',requireAdmin,changeLimit,route(async(req,res)=>{
    await transaction(db,async()=>{const u=await actor(req,true),e=await entry(req),id=Number(req.params.userId);if(!Number.isSafeInteger(id)||id<1)fail('用户编号无效');await db.run('DELETE FROM totp_grants WHERE entry_id=? AND user_id=?',[e.id,id]);await audit(u,e.id,'revoke',id);});res.json({ok:true});
  }));
}
module.exports={migrateTotp,registerTotp,limiter,DURATIONS};
