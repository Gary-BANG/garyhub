'use strict';
const {openConnection,queuedRoutes,transaction}=require('./sqlite-connection');
const {rateLimit}=require('./rate-limit');
const crypto=require('node:crypto');
const allowed=(user,tool)=>!!user&&!user.mustChangePassword&&(user.role==='admin'||tool==='reading'&&user.accountTier==='subscriber');
const fail=(message,status)=>{throw Object.assign(Error(message),{status});};
async function migrateToolAccess(db){
 const columns=await db.all('PRAGMA table_info(users)');
 if(!columns.some(c=>c.name==='account_tier'))await db.run("ALTER TABLE users ADD COLUMN account_tier TEXT NOT NULL DEFAULT 'standard' CHECK(account_tier IN ('standard','subscriber'))");
 if(!columns.some(c=>c.name==='tier_version'))await db.run('ALTER TABLE users ADD COLUMN tier_version INTEGER NOT NULL DEFAULT 0');
 await db.run(`CREATE TABLE IF NOT EXISTS reading_links(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, mf_user_id INTEGER NOT NULL UNIQUE, mf_username TEXT NOT NULL UNIQUE, linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
}
function registerToolAccess(app,{db=openConnection(),legacyTier=false}={}){
 const route=queuedRoutes(db);
 if(legacyTier)app.put('/api/hub/admin/users/:id/tier',route(async(req,res)=>{
  const u=req.session.user,v=req.body,id=Number(req.params.id);if(!u)fail('请先登录',401);if(u.role!=='admin')fail('需要管理员权限',403);
  if(v.actorId!==u.id||!Number.isSafeInteger(id)||id<1||!['standard','subscriber'].includes(v.accountTier)||!Number.isSafeInteger(v.expectedTierVersion))fail('账号等级参数或身份无效',400);
  await transaction(db,async()=>{
   const actor=await db.get('SELECT role,enabled,auth_version,deletion_pending FROM users WHERE id=?',[u.id]);
   if(!actor||actor.role!=='admin'||!actor.enabled||actor.deletion_pending||actor.auth_version!==(req.session.authVersion||0))fail('管理员权限已变化',401);
   const target=await db.get('SELECT * FROM users WHERE id=?',[id]);if(!target)fail('用户不存在',404);if(target.deletion_pending||target.tier_version!==v.expectedTierVersion)fail('账号状态已变化，请刷新',409);
   if(target.account_tier===v.accountTier)return;
   await db.run('UPDATE users SET account_tier=?,tier_version=tier_version+1 WHERE id=?',[v.accountTier,id]);await db.run('INSERT INTO admin_operations(id,actor_id,target_id,action) VALUES(?,?,?,?)',[crypto.randomUUID(),u.id,id,'tier:'+v.accountTier]);
  });res.json({ok:true});
 }));
 app.get('/api/hub/tool-auth/:tool',route(async(req,res)=>{
  const tool=req.params.tool;if(!['files','status','reading','server-monitor'].includes(tool))return res.status(404).end();
  const user=req.session.user;
  if(!user){
   if(req.query.browser==='1')return res.redirect(302,require('./public/auth-redirect').loginUrl({files:'https://files.garyhub.uk/',status:'https://kuma.garyhub.uk/',reading:'https://rss.garyhub.uk/','server-monitor':'https://tools.garyhub.uk/server-monitor/'}[tool]));
   return res.status(401).json({message:'请先登录 GaryHub'});
  }
  if(!allowed(user,tool))return res.status(403).json({message:'此工具需要管理员或相应订阅权限'});
  const link=tool==='reading'?await db.get('SELECT mf_username FROM reading_links WHERE user_id=?',[user.id]):null;
  // A random account namespace prevents collision with legacy Miniflux usernames.
  const namespace=process.env.READING_NAMESPACE;
  if(tool==='reading'&&!/^[a-f0-9]{24}$/.test(namespace||''))return res.status(503).json({message:'Reading 统一登录尚未配置'});
  const readingUsername=tool==='reading'?(link?.mf_username||`gh-${namespace}-${user.id}`):undefined;
  res.set('Cache-Control','no-store');res.json({id:user.id,username:user.username,readingUsername});
 }));
 app.get('/api/hub/reading-link',route(async(req,res)=>{
  if(!req.session.user)return res.status(401).json({message:'请先登录'});
  if(!allowed(req.session.user,'reading'))return res.status(403).json({message:'需要订阅权限'});
  const link=await db.get('SELECT mf_username,linked_at FROM reading_links WHERE user_id=?',[req.session.user.id]);res.json({userId:req.session.user.id,link:link||null});
 }));
 app.post('/api/hub/reading-link',rateLimit(6,15*60_000),route(async(req,res)=>{
  const user=req.session.user;if(!user)fail('请先登录',401);if(!allowed(user,'reading'))fail('需要订阅权限',403);
  const v=req.body;if(v.accountId!==user.id)fail('登录账号已变化，请刷新',409);
  if(typeof v.token!=='string'||!v.token.trim()||v.token.length>512||/[\r\n]/.test(v.token))fail('请填写旧 Reading API Token',400);
  const upstream=process.env.MINIFLUX_URL;if(!upstream)fail('Reading 服务尚未配置',503);
  let r;try{r=await fetch(new URL('/v1/me',upstream),{redirect:'error',signal:AbortSignal.timeout(8000),headers:{'X-Auth-Token':v.token.trim()}});}catch{fail('Reading 暂时不可用',503);}
  if(!r.ok)fail('旧 Reading 账号验证失败',400);
  const mf=await r.json();if(!Number.isSafeInteger(mf.id)||mf.id<1||typeof mf.username!=='string'||mf.username.length>200||/[\r\n]/.test(mf.username))fail('Reading 身份响应无效',502);
  if(mf.is_admin&&user.role!=='admin')fail('Reading 管理账号只能关联到 GaryHub 管理员',403);
  const result=await transaction(db,async()=>{
   const fresh=await db.get('SELECT role,enabled,account_tier,auth_version,deletion_pending FROM users WHERE id=?',[user.id]);
   if(mf.is_admin&&fresh?.role!=='admin')fail('Reading 管理账号需要管理员权限',403);
   if(!fresh||!fresh.enabled||fresh.deletion_pending||fresh.auth_version!==(req.session.authVersion||0)||!allowed({...fresh,accountTier:fresh.account_tier},'reading'))fail('账号权限已变化',403);
   const existing=await db.get('SELECT * FROM reading_links WHERE user_id=? OR mf_user_id=? OR mf_username=?',[user.id,mf.id,mf.username]);
   if(existing){if(existing.user_id===user.id&&existing.mf_user_id===mf.id&&existing.mf_username===mf.username)return {alreadyLinked:true};fail('账号已有不同关联，请联系管理员核对；未更改任何阅读记录',409);}
   await db.run('INSERT INTO reading_links(user_id,mf_user_id,mf_username) VALUES(?,?,?)',[user.id,mf.id,mf.username]);
   await db.run('INSERT INTO admin_operations(id,actor_id,target_id,action) VALUES(?,?,?,?)',[crypto.randomUUID(),user.id,user.id,'reading-link']);return {alreadyLinked:false};
  });res.json({ok:true,...result});
 }));
}
module.exports={allowed,migrateToolAccess,registerToolAccess};
