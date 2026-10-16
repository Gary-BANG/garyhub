'use strict';
const crypto=require('node:crypto');
const KEYS=['identity','education','academics','projects','skills'];
const DEFAULT={required:true,protected:KEYS,revision:1,salt:null,hash:null};
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
async function migrateProfile(db){
 await db.run('CREATE TABLE IF NOT EXISTS homepage_privacy(id INTEGER PRIMARY KEY CHECK(id=1),settings TEXT NOT NULL)');
 await db.run('INSERT OR IGNORE INTO homepage_privacy(id,settings) VALUES(1,?)',[JSON.stringify(DEFAULT)]);
}
function registerProfile(app,{db,requireAdmin}){
 const read=async()=>JSON.parse((await db.get('SELECT settings FROM homepage_privacy WHERE id=1')).settings);
 const publicSettings=s=>({required:s.required,protected:s.protected,revision:s.revision,hasCode:!!s.hash,expiresHours:24});
 async function access(req,preview=false){
  const s=await read(),user=req.session.user;
  const permission=user?await db.get('SELECT view_academics FROM hub_permissions WHERE user_id=?',[user.id]):null;
  const grant=req.session.homepageGrant;
  const unlocked=!preview&&!!grant&&grant.revision===s.revision&&grant.until>Date.now();
  const admin=!preview&&user?.role==='admin';
  const allowed=KEYS.filter(k=>!s.required||!s.protected.includes(k)||admin||unlocked||(k==='academics'&&!preview&&!!permission?.view_academics));
  return {...publicSettings(s),allowed,unlocked,expiresAt:unlocked?grant.until:null};
 }
 app.get('/api/hub/profile-access',wrap(async(req,res)=>{
  const preview=req.query.preview==='1';
  if(preview&&req.session.user?.role!=='admin')return res.status(403).json({message:'需要管理员权限'});
  res.json(await access(req,preview));
 }));
 const attempts=new Map();let globalTimes=[];
 app.post('/api/hub/profile-unlock',wrap(async(req,res)=>{
  const now=Date.now(),ip=req.ip||'unknown';
  for(const [key,x] of attempts)if(x.until<=now)attempts.delete(key);
  globalTimes=globalTimes.filter(t=>now-t<60000);
  const a=attempts.get(ip)||{n:0,until:now+10*60000};
  if(a.n>=8||globalTimes.length>=60||attempts.size>=10000&&!attempts.has(ip)){res.set('Retry-After','600');return res.status(429).json({message:'尝试过于频繁，请稍后再试'});}
  a.n++;attempts.set(ip,a);globalTimes.push(now);
  const s=await read(),code=req.body.code;
  if(typeof code!=='string'||code.length>128||!s.hash)return res.status(400).json({message:'访问码不正确或尚未设置'});
  const value=crypto.scryptSync(code,Buffer.from(s.salt,'hex'),32);
  if(!crypto.timingSafeEqual(value,Buffer.from(s.hash,'hex')))return res.status(400).json({message:'访问码不正确或尚未设置'});
  attempts.delete(ip);req.session.homepageGrant={revision:s.revision,until:now+24*3600000};
  res.json(await access(req));
 }));
 app.post('/api/hub/profile-lock',wrap(async(req,res)=>{delete req.session.homepageGrant;res.json({ok:true});}));
 app.get('/api/hub/admin/profile-privacy',requireAdmin,wrap(async(req,res)=>res.json(publicSettings(await read()))));
 app.put('/api/hub/admin/profile-privacy',requireAdmin,wrap(async(req,res)=>{
  const s=await read(),v=req.body;
  if(v.revision!==s.revision)return res.status(409).json({message:'设置已被另一页面修改，请刷新后重试'});
  if(typeof v.required!=='boolean'||!Array.isArray(v.protected)||new Set(v.protected).size!==v.protected.length||v.protected.some(k=>!KEYS.includes(k)))return res.status(400).json({message:'保护设置无效'});
  if(v.code!==undefined&&v.code!==''&&(typeof v.code!=='string'||v.code.length<8||v.code.length>128||!v.code.trim()))return res.status(400).json({message:'访问码长度应为 8–128 个字符'});
  const next={...s,required:v.required,protected:v.protected,revision:s.revision+1};
  if(v.code){next.salt=crypto.randomBytes(16).toString('hex');next.hash=crypto.scryptSync(v.code,Buffer.from(next.salt,'hex'),32).toString('hex');}
  const r=await db.run('UPDATE homepage_privacy SET settings=? WHERE id=1 AND settings=?',[JSON.stringify(next),JSON.stringify(s)]);
  if(!r.changes)return res.status(409).json({message:'设置已变化，请刷新'});
  delete req.session.homepageGrant;res.json({...publicSettings(next),message:'已保存，并撤销之前的访客授权'});
 }));
 app.post('/api/hub/admin/profile-revoke',requireAdmin,wrap(async(req,res)=>{
  const s=await read(),r=await db.run('UPDATE homepage_privacy SET settings=? WHERE id=1 AND settings=?',[JSON.stringify({...s,revision:s.revision+1}),JSON.stringify(s)]);
  if(!r.changes)return res.status(409).json({message:'设置已变化，请刷新'});
  delete req.session.homepageGrant;res.json({ok:true});
 }));
}
module.exports={migrateProfile,registerProfile,KEYS};
