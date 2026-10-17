'use strict';
const crypto=require('node:crypto');
const KEYS=['identity','education','academics','projects','skills'];
const audiences=['guest','member','subscriber'];
const empty=()=>({required:true,protected:[...KEYS],revision:1,salt:null,hash:null});
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
async function migrateProfile(db){
 await db.run('CREATE TABLE IF NOT EXISTS homepage_privacy(id INTEGER PRIMARY KEY CHECK(id=1),settings TEXT NOT NULL)');
 await db.run('INSERT OR IGNORE INTO homepage_privacy(id,settings) VALUES(1,?)',[JSON.stringify({...empty(),schema:2,guest:empty(),member:empty()})]);
 const row=await db.get('SELECT settings FROM homepage_privacy WHERE id=1'),old=JSON.parse(row.settings);
 if(old.schema!==3){const p={...empty(),...old,revision:(old.revision||1)+1},guest=old.schema===2?old.guest:p,member=old.schema===2?old.member:p;await db.run('UPDATE homepage_privacy SET settings=? WHERE id=1 AND settings=?',[JSON.stringify({...empty(),schema:3,guest,member,subscriber:JSON.parse(JSON.stringify(member))}),row.settings]);}
}
function registerProfile(app,{db,requireAdmin}){
 const read=async()=>JSON.parse((await db.get('SELECT settings FROM homepage_privacy WHERE id=1')).settings);
 const publicPolicy=(s,audience)=>({audience,required:s.required,protected:s.protected,revision:s.revision,hasCode:!!s.hash,expiresHours:24});
 async function context(req){
  if(!req.session.user)return {user:null,audience:'guest',identity:'guest'};
  const user=await db.get('SELECT id,role,enabled,account_tier,tier_version,deletion_pending FROM users WHERE id=?',[req.session.user.id]);
  if(!user||user.enabled!==1||user.deletion_pending)throw Object.assign(Error('登录已失效'),{status:401});
  return {user,audience:user.account_tier==='subscriber'?'subscriber':'member',identity:`${user.id}:${user.tier_version}`};
 }
 async function access(req,preview){
  const all=await read(),current=await context(req),user=current.user,audience=preview||current.audience,s=all[audience];
  if(preview&&user?.role!=='admin')throw Object.assign(Error('需要管理员权限'),{status:403});
  const permission=!preview&&user?await db.get('SELECT view_academics FROM hub_permissions WHERE user_id=?',[user.id]):null;
  const grant=req.session.homepageGrants?.[audience];
  const unlocked=!preview&&grant?.identity===current.identity&&grant?.revision===s.revision&&grant.until>Date.now();
  const allowed=KEYS.filter(k=>!s.required||!s.protected.includes(k)||!preview&&user?.role==='admin'||unlocked||k==='academics'&&!preview&&permission?.view_academics===1);
  return {...publicPolicy(s,audience),allowed,unlocked:!!unlocked,expiresAt:unlocked?grant.until:null,preview:preview||null};
 }
 app.get('/api/hub/profile-access',wrap(async(req,res)=>{
  let preview=req.query.preview;if(preview==='1')preview='guest';
  if(preview&&!audiences.includes(preview))return res.status(400).json({message:'预览身份无效'});
  if(preview&&req.session.user?.role!=='admin')return res.status(403).json({message:'需要管理员权限'});
  res.json(await access(req,preview));
 }));
 const attempts=new Map();let globalTimes=[];
 app.post('/api/hub/profile-unlock',wrap(async(req,res)=>{
  const current=await context(req),audience=current.audience;if(req.body.audience&&req.body.audience!==audience)return res.status(409).json({message:'登录身份已变化，请刷新后输入对应访问码'});
  const now=Date.now(),key=(req.ip||'unknown')+':'+audience;
  for(const [k,x]of attempts)if(x.until<=now)attempts.delete(k);
  globalTimes=globalTimes.filter(t=>now-t<60000);const a=attempts.get(key)||{n:0,until:now+600000};
  if(a.n>=8||globalTimes.length>=60||attempts.size>=10000&&!attempts.has(key)){res.set('Retry-After','600');return res.status(429).json({message:'尝试过于频繁，请稍后再试'});}
  a.n++;attempts.set(key,a);globalTimes.push(now);const s=(await read())[audience],code=req.body.code;
  if(typeof code!=='string'||code.length>128||!s.hash)return res.status(400).json({message:'对应身份的访问码不正确或尚未设置'});
  if(!crypto.timingSafeEqual(crypto.scryptSync(code,Buffer.from(s.salt,'hex'),32),Buffer.from(s.hash,'hex')))return res.status(400).json({message:'对应身份的访问码不正确或尚未设置'});
  attempts.delete(key);req.session.homepageGrants={...req.session.homepageGrants,[audience]:{identity:current.identity,revision:s.revision,until:now+86400000}};res.json(await access(req));
 }));
 app.post('/api/hub/profile-lock',wrap(async(req,res)=>{const audience=(await context(req)).audience;if(req.session.homepageGrants)delete req.session.homepageGrants[audience];delete req.session.homepageGrant;res.json({ok:true});}));
 app.get('/api/hub/admin/profile-privacy',requireAdmin,wrap(async(req,res)=>{const s=await read();res.json(Object.fromEntries(audiences.map(a=>[a,publicPolicy(s[a],a)])));}));
 app.put('/api/hub/admin/profile-privacy',requireAdmin,wrap(async(req,res)=>{
  const all=await read(),v=req.body;if(!audiences.includes(v.audience))return res.status(400).json({message:'请选择路人、普通用户或订阅用户'});const s=all[v.audience];
  if(v.revision!==s.revision)return res.status(409).json({message:'这套规则已被另一页面修改，请刷新后重试'});
  if(typeof v.required!=='boolean'||!Array.isArray(v.protected)||new Set(v.protected).size!==v.protected.length||v.protected.some(k=>!KEYS.includes(k)))return res.status(400).json({message:'保护设置无效'});
  if(v.code!==undefined&&v.code!==''&&(typeof v.code!=='string'||v.code.length<8||v.code.length>128||!v.code.trim()))return res.status(400).json({message:'访问码长度应为 8–128 个字符'});
  const next={...s,required:v.required,protected:v.protected,revision:s.revision+1};if(v.code){next.salt=crypto.randomBytes(16).toString('hex');next.hash=crypto.scryptSync(v.code,Buffer.from(next.salt,'hex'),32).toString('hex');}
  const r=await db.run('UPDATE homepage_privacy SET settings=? WHERE id=1 AND settings=?',[JSON.stringify({...all,[v.audience]:next}),JSON.stringify(all)]);
  if(!r.changes)return res.status(409).json({message:'设置已变化，请刷新'});
  if(req.session.homepageGrants)delete req.session.homepageGrants[v.audience];res.json({...publicPolicy(next,v.audience),message:'已保存，并撤销该身份之前的访问码授权'});
 }));
 app.post('/api/hub/admin/profile-revoke',requireAdmin,wrap(async(req,res)=>{
  const all=await read(),target=req.body.audience||'all';if(target!=='all'&&!audiences.includes(target))return res.status(400).json({message:'身份无效'});const next=JSON.parse(JSON.stringify(all));for(const a of audiences)if(target==='all'||target===a)next[a].revision++;
  const r=await db.run('UPDATE homepage_privacy SET settings=? WHERE id=1 AND settings=?',[JSON.stringify(next),JSON.stringify(all)]);if(!r.changes)return res.status(409).json({message:'设置已变化，请刷新'});delete req.session.homepageGrants;res.json({ok:true});
 }));
}
module.exports={migrateProfile,registerProfile,KEYS};
