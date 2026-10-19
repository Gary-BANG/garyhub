'use strict';
const crypto=require('node:crypto'),path=require('node:path');
const {hashPassword,verifyPassword}=require('./auth-utils');
const owned=['fixed_expense_posts','fixed_expenses','password_reset_requests','reminder_deliveries','notifications','email_verifications','events','tasks','categories','diary_entries','weight_entries','exercise_entries','hub_permissions','ledger_entries','ledger_categories','todo_lists','totp_grants','totp_entries'];
const error=(message,status=400)=>{throw Object.assign(Error(message),{status});};
function connection(){const sqlite=require('sqlite3'),raw=new sqlite.Database(path.join(require('./db').dataDir,'calendar.sqlite'));raw.configure('busyTimeout',5000);return {run:(s,p=[])=>new Promise((y,n)=>raw.run(s,p,function(e){e?n(e):y(this);})),get:(s,p=[])=>new Promise((y,n)=>raw.get(s,p,(e,r)=>e?n(e):y(r))),all:(s,p=[])=>new Promise((y,n)=>raw.all(s,p,(e,r)=>e?n(e):y(r)))};}
async function migrateAccounts(db){
 const cols=await db.all('PRAGMA table_info(users)');for(const [name,def] of [['auth_version','INTEGER NOT NULL DEFAULT 0'],['must_change_password','INTEGER NOT NULL DEFAULT 0'],['deletion_pending','INTEGER NOT NULL DEFAULT 0']])if(!cols.some(c=>c.name===name))await db.run(`ALTER TABLE users ADD COLUMN ${name} ${def}`);
 await db.run(`CREATE TABLE IF NOT EXISTS admin_user_deletions(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,actor_id INTEGER NOT NULL,token_hash TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT)`);
 await db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_deletion_pending ON admin_user_deletions(user_id) WHERE status='pending'`);
 await db.run(`CREATE TABLE IF NOT EXISTS admin_operations(id TEXT PRIMARY KEY,actor_id INTEGER NOT NULL,target_id INTEGER NOT NULL,action TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
}
function registerAccounts(app,{requireLogin,requireAdmin,sessionStore,db=connection()}){
 let queue=db.run('PRAGMA foreign_keys=ON');
 const route=(auth,fn)=>[auth,(req,res,next)=>{const t=queue.then(()=>fn(req,res));queue=t.catch(()=>{});t.catch(next);}];
 async function transaction(fn){await db.run('BEGIN IMMEDIATE');try{const v=await fn();await db.run('COMMIT');return v;}catch(e){await db.run('ROLLBACK');throw e;}}
 async function purge(uid){const raw=sessionStore.db;const rows=await new Promise((y,n)=>raw.all('SELECT sid,sess FROM sessions',(e,r)=>e?n(e):y(r)));for(const row of rows){let s;try{s=JSON.parse(row.sess);}catch{continue;}if(s.user?.id===uid)await new Promise((y,n)=>raw.run('DELETE FROM sessions WHERE sid=?',[row.sid],e=>e?n(e):y()));}}
 const audit=(actor,target,action)=>db.run('INSERT INTO admin_operations(id,actor_id,target_id,action) VALUES(?,?,?,?)',[crypto.randomUUID(),actor,target,action]);
 function id(req){const v=Number(req.params.id);if(!Number.isSafeInteger(v)||v<1)error('用户编号无效');return v;}
 async function actor(req){if(req.body.actorId!==req.session.user.id)error('管理员登录身份已变化，请刷新管理页面',409);const u=await db.get('SELECT role,enabled,deletion_pending,auth_version FROM users WHERE id=?',[req.session.user.id]);if(!u||u.role!=='admin'||!u.enabled||u.deletion_pending||u.auth_version!==(req.session.authVersion||0))error('管理员登录已失效，请刷新',401);return req.session.user.id;}
 async function target(req){const user=await db.get('SELECT * FROM users WHERE id=?',[id(req)]);if(!user)error('用户不存在',404);return user;}
 async function protectedTarget(req,user){if(user.id===req.session.user.id)error('不能停用或删除当前操作的管理员');if(user.role==='admin'&&user.enabled===1&&(await db.get("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND enabled=1 AND deletion_pending=0")).n<=1)error('不能停用或删除最后一个启用的管理员');}
 function version(req,user){if(req.body.expectedVersion!==user.auth_version)error('账号状态已变化，请刷新后重试',409);}
 async function schema(){const tables=await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");for(const t of tables){if(!/^[A-Za-z_]\w*$/.test(t.name))error('数据库结构需要核对，未执行删除',409);for(const fk of await db.all(`PRAGMA foreign_key_list(${t.name})`))if(fk.table==='users'&&(!owned.includes(t.name)||fk.from!=='user_id'))error('存在尚未识别的账号关联表，未执行删除',409);}}
 async function preview(user){await schema();const counts={};for(const table of owned){if(await db.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",[table]))counts[table]=(await db.get(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id=?`,[user.id])).n;}return {id:user.id,username:user.username,email:user.email||null,counts,authVersion:user.auth_version,deletionPending:!!user.deletion_pending,otherData:['Lab 练习进度','课程、成绩、讲义和学习进度','Calendar 联动记录','网络授权和订阅链接','登录会话'],backupNotice:'已有受限备份按原保留策略保存；本操作清理当前在线数据'};}
 app.get('/api/hub/admin/users/:id/deletion-preview',...route(requireAdmin,async(req,res)=>{const user=await target(req);await protectedTarget(req,user);res.json(await preview(user));}));
 const changeStatus=async(req,res)=>{const a=await actor(req);if(typeof req.body.enabled!=='boolean')error('状态无效');const user=await transaction(async()=>{const u=await target(req);version(req,u);if(u.deletion_pending)error('账号正在删除，不能重新启用',409);if(!req.body.enabled)await protectedTarget(req,u);await db.run('UPDATE users SET enabled=?,auth_version=auth_version+1 WHERE id=?',[Number(req.body.enabled),u.id]);await audit(a,u.id,req.body.enabled?'enable':'disable');return u;});await purge(user.id);res.json({ok:true});};
 app.put('/api/hub/admin/users/:id/status',...route(requireAdmin,changeStatus));
 app.put('/api/admin/users/:id/status',...route(requireAdmin,changeStatus));
 app.post('/api/hub/admin/users/:id/reset-password',...route(requireAdmin,async(req,res)=>{
  const a=await actor(req),password=req.body.password===undefined?crypto.randomBytes(15).toString('base64url'):req.body.password;
  if(typeof password!=='string'||password.length<10||password.length>128||!password.trim())error('临时密码应为10–128个字符');
  const u=await transaction(async()=>{const u=await target(req);version(req,u);if(u.deletion_pending)error('账号正在删除',409);await db.run('UPDATE users SET password_hash=?,auth_version=auth_version+1,must_change_password=1 WHERE id=?',[hashPassword(password),u.id]);await audit(a,u.id,'reset-password');return u;});await purge(u.id);res.json({ok:true,temporaryPassword:password,mustChangePassword:true});
 }));
 app.post('/api/account/password',...route(requireLogin,async(req,res)=>{
  const uid=req.session.user.id;if(req.body.accountId!==uid)error('登录账号已变化，请刷新',409);const v=req.body;if(typeof v.currentPassword!=='string'||typeof v.newPassword!=='string'||v.newPassword.length<10||v.newPassword.length>128||!v.newPassword.trim()||v.currentPassword===v.newPassword)error('请填写当前密码和不同的新密码；新密码10–128个字符');
  const user=await transaction(async()=>{const u=await db.get('SELECT * FROM users WHERE id=?',[uid]);if(!u||!u.enabled||u.deletion_pending||u.auth_version!==(req.session.authVersion||0))error('登录已失效',401);if(!verifyPassword(v.currentPassword,u.password_hash))error('当前密码不正确');await db.run('UPDATE users SET password_hash=?,auth_version=auth_version+1,must_change_password=0 WHERE id=?',[hashPassword(v.newPassword),uid]);return {...u,auth_version:u.auth_version+1};});await purge(uid);await new Promise((y,n)=>req.session.regenerate(e=>e?n(e):y()));req.session.authVersion=user.auth_version;req.session.user={id:user.id,username:user.username,role:user.role,accountTier:user.account_tier,mustChangePassword:false};res.json({ok:true,user:req.session.user});
 }));
 app.post('/api/hub/admin/users/:id/delete-start',...route(requireAdmin,async(req,res)=>{
  const a=await actor(req),token=crypto.randomBytes(32).toString('hex');const job=await transaction(async()=>{const user=await target(req);await protectedTarget(req,user);if(req.body.confirmUsername!==user.username)error('请输入完整用户名确认删除');await schema();
   const existing=await db.get("SELECT * FROM admin_user_deletions WHERE user_id=? AND status='pending'",[user.id]);if(!existing)version(req,user);const jobId=existing?.id||crypto.randomUUID();await db.run("INSERT INTO admin_user_deletions(id,user_id,actor_id,token_hash) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash",[jobId,user.id,a,crypto.createHash('sha256').update(token).digest('hex')]);await db.run('DELETE FROM totp_grants WHERE user_id=? OR entry_id IN (SELECT id FROM totp_entries WHERE user_id=?)',[user.id,user.id]);await db.run("UPDATE users SET enabled=0,deletion_pending=1,account_tier='standard',tier_version=tier_version+1,auth_version=auth_version+1 WHERE id=?",[user.id]);await audit(a,user.id,'delete-start');return {id:jobId,userId:user.id,token};});await purge(job.userId);res.status(202).json(job);
 }));
 app.get('/api/hub/admin/user-deletions',...route(requireAdmin,async(req,res)=>res.json(await db.all('SELECT d.id,d.user_id,d.status,d.created_at,d.completed_at,u.username FROM admin_user_deletions d LEFT JOIN users u ON u.id=d.user_id ORDER BY d.created_at DESC LIMIT 100'))));
 // Narrow capability endpoint: only finishes an already admin-approved, disabled target. Public reverse-proxy traffic is rejected.
 app.post('/internal/user-deletions/:id/complete',...route((req,res,next)=>req.get('x-forwarded-for')?res.status(404).json({message:'Not found'}):next(),async(req,res)=>{
  const token=req.get('x-deletion-token')||'';if(!/^[0-9a-f]{64}$/.test(token))error('Not found',404);
  const job=await db.get('SELECT * FROM admin_user_deletions WHERE id=?',[req.params.id]);if(!job||!crypto.timingSafeEqual(Buffer.from(job.token_hash,'hex'),crypto.createHash('sha256').update(token).digest()))error('Not found',404);
  if(job.status==='complete')return res.json({ok:true,alreadyComplete:true});
  await transaction(async()=>{const u=await db.get('SELECT * FROM users WHERE id=?',[job.user_id]);if(!u||u.enabled||!u.deletion_pending)error('删除状态已变化',409);await schema();
   await db.run("DELETE FROM ledger_entries WHERE user_id=? AND kind='refund'",[u.id]);
   for(const table of owned)if(await db.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",[table]))await db.run(`DELETE FROM ${table} WHERE user_id=?`,[u.id]);
   await db.run("DELETE FROM email_verifications WHERE user_id IS NULL AND email_normalized=? AND purpose='registration'",[u.email_normalized]);
   await db.run('DELETE FROM register_requests WHERE username=?',[u.username]);await db.run('UPDATE register_requests SET reviewed_by=NULL WHERE reviewed_by=?',[u.id]);
   await db.run('DELETE FROM users WHERE id=?',[u.id]);await db.run("UPDATE admin_user_deletions SET status='complete',completed_at=CURRENT_TIMESTAMP WHERE id=?",[job.id]);await audit(job.actor_id,u.id,'delete-complete');
  });await purge(job.user_id);res.json({ok:true});
 }));
}
module.exports={migrateAccounts,registerAccounts};
