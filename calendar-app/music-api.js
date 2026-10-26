'use strict';
const crypto=require('node:crypto');
const {openConnection,transaction}=require('./sqlite-connection');
const {currentUser,premium}=require('./entitlements');
const {createStorage,isMp3}=require('./music-storage');
const {rateLimit}=require('./rate-limit');
const FILE_BYTES=20*1024*1024,USER_BYTES=100*1024*1024,TRACKS=10,GLOBAL_BYTES=8*1024*1024*1024;
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const item=r=>({id:r.id,title:r.title,bytes:r.bytes,createdAt:r.created_at});
async function migrateMusic(db){
 // No new users FK: rollback to the older account schema remains supported.
 // Database triggers also enforce deletion if the older image deletes a user.
 await db.run(`CREATE TABLE IF NOT EXISTS music_tracks(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,object_key TEXT NOT NULL UNIQUE,title TEXT NOT NULL,bytes INTEGER NOT NULL,sha256 TEXT NOT NULL,request_id TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN('uploading','ready')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,request_id))`);
 await db.run(`CREATE TABLE IF NOT EXISTS music_preferences(user_id INTEGER PRIMARY KEY,track_id TEXT)`);
 await db.run(`CREATE TABLE IF NOT EXISTS music_delete_jobs(object_key TEXT PRIMARY KEY,owner_id INTEGER NOT NULL,bytes INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,not_before TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
 await db.run('CREATE INDEX IF NOT EXISTS idx_music_owner ON music_tracks(user_id)');
 await db.run(`CREATE TRIGGER IF NOT EXISTS music_track_deleted AFTER DELETE ON music_tracks BEGIN
  INSERT OR IGNORE INTO music_delete_jobs(object_key,owner_id,bytes,not_before) VALUES(OLD.object_key,OLD.user_id,OLD.bytes,CASE WHEN OLD.state='uploading' THEN datetime('now','+15 minutes') ELSE datetime('now') END);
  UPDATE music_preferences SET track_id=NULL WHERE user_id=OLD.user_id AND track_id=OLD.id;
 END`);
 await db.run(`CREATE TRIGGER IF NOT EXISTS music_user_deleted AFTER DELETE ON users BEGIN
  DELETE FROM music_preferences WHERE user_id=OLD.id;
  DELETE FROM music_tracks WHERE user_id=OLD.id;
 END`);
}
function registerMusic(app,{requireLogin,db=openConnection(),storage=createStorage,background=true}={}){
 let queue=db.run('PRAGMA foreign_keys=ON'),uploading=false,cleaning=false;
 const exclusive=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next;};
 const route=fn=>[requireLogin,(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next)];
 const guard=req=>{if(req.get('x-garyhub-user')!==String(req.session.user.id))fail('登录账号已变化，请刷新页面。',409);};
 const store=()=>{try{return storage();}catch{return null;}};
 const usage=async uid=>{
  const t=await db.get('SELECT COUNT(*) AS n,COALESCE(SUM(bytes),0) AS bytes FROM music_tracks WHERE user_id=?',[uid]);
  const j=await db.get('SELECT COUNT(*) AS n,COALESCE(SUM(bytes),0) AS bytes FROM music_delete_jobs WHERE owner_id=?',[uid]);
  return {tracks:t.n+j.n,bytes:t.bytes+j.bytes,pendingDeletion:j.n};
 };
 async function cleanup(){
  if(cleaning)return;const cloud=store();if(!cloud)return;cleaning=true;
  try{
   const jobs=await exclusive(async()=>{
    await db.run("DELETE FROM music_tracks WHERE state='uploading' AND created_at<datetime('now','-15 minutes')");
    await db.run('DELETE FROM music_tracks WHERE NOT EXISTS(SELECT 1 FROM users WHERE users.id=music_tracks.user_id)');
    return db.all("SELECT object_key FROM music_delete_jobs WHERE not_before<=datetime('now') ORDER BY created_at LIMIT 50");
   });
   for(const job of jobs){try{await cloud.remove(job.object_key);await exclusive(()=>db.run('DELETE FROM music_delete_jobs WHERE object_key=?',[job.object_key]));}catch{/* Retain the job and its quota reservation for a later retry. */}}
  }finally{cleaning=false;}
 }
 app.get('/api/music',...route(async(req,res)=>{
  const value=await exclusive(async()=>{
   const user=await currentUser(db,req),paid=premium(user),pref=await db.get('SELECT track_id FROM music_preferences WHERE user_id=?',[user.id]);
   return {accountId:user.id,canUpload:paid,configured:!!store(),selected:paid?pref?.track_id||null:null,limits:{tracks:TRACKS,fileBytes:FILE_BYTES,totalBytes:USER_BYTES},usage:await usage(user.id),items:(await db.all("SELECT * FROM music_tracks WHERE user_id=? AND state='ready' ORDER BY created_at,id",[user.id])).map(item)};
  });res.json(value);
 }));
 app.get('/api/music/selected',...route(async(req,res)=>{
  const selected=await exclusive(async()=>{
   const user=await currentUser(db,req),cloud=store();
   const row=premium(user)&&cloud?await db.get("SELECT t.* FROM music_preferences p JOIN music_tracks t ON t.id=p.track_id AND t.user_id=p.user_id WHERE p.user_id=? AND t.state='ready'",[user.id]):null;
   return {accountId:user.id,id:row?.id||null,url:row?cloud.url(row.object_key):'/ambient.mp3',expiresIn:row?300:null};
  });res.json(selected);
 }));
 app.put('/api/music/selected',...route(async(req,res)=>{
  guard(req);await exclusive(()=>transaction(db,async()=>{
   const user=await currentUser(db,req),id=req.body?.id;
   if(id!==null){if(!premium(user))fail('个人背景音乐需要订阅或管理员权限。',403);if(!store())fail('音乐存储尚未配置。',503);if(typeof id!=='string'||!await db.get("SELECT 1 FROM music_tracks WHERE id=? AND user_id=? AND state='ready'",[id,user.id]))fail('歌曲不存在。',404);}
   await db.run('INSERT INTO music_preferences(user_id,track_id) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET track_id=excluded.track_id',[user.id,id]);
  }));res.json({ok:true});
 }));
 app.delete('/api/music/:id',...route(async(req,res)=>{
  guard(req);await exclusive(()=>transaction(db,async()=>{
   const user=await currentUser(db,req),track=await db.get('SELECT * FROM music_tracks WHERE id=? AND user_id=?',[req.params.id,user.id]);
   if(!track)fail('歌曲不存在。',404);
   await db.run('DELETE FROM music_tracks WHERE id=? AND user_id=?',[track.id,user.id]);
  }));res.json({ok:true,pendingDeletion:true});cleanup().catch(()=>{});
 }));
 app.post('/api/music/upload',requireLogin,rateLimit(12,15*60_000),async(req,res,next)=>{
  let reserved=null,slot=false,deadline;
  try{
   guard(req);
   await exclusive(async()=>{if(!premium(await currentUser(db,req)))fail('上传音乐需要订阅或管理员权限。',403);});
   const cloud=store();if(!cloud)fail('音乐存储尚未配置，请联系管理员完成 R2 设置。',503);
   if(uploading)fail('已有音乐正在上传，请稍后再试。',429);uploading=true;slot=true;
   const size=Number(req.get('content-length'));
   if(!Number.isSafeInteger(size)||size<1)fail('上传必须提供有效文件大小。',411);
   if(size>FILE_BYTES)fail('单首 MP3 最多 20 MiB。',413);
   if(req.get('content-type')!=='audio/mpeg')fail('只接受 MP3 文件。',415);
   let title;try{title=decodeURIComponent(req.get('x-music-filename')||'');}catch{fail('文件名无效。');}
   if(!/^.{1,156}\.mp3$/i.test(title)||/[\x00-\x1f/\\]/.test(title))fail('请选择有效的 .mp3 文件。');
   const requestId=req.get('x-upload-id');if(!/^[a-f0-9-]{36}$/.test(requestId||''))fail('上传请求编号无效。');
   const bytes=Buffer.allocUnsafe(size);let received=0;
   deadline=setTimeout(()=>req.destroy(),60000);deadline.unref();
   for await(const chunk of req){if(received+chunk.length>size)fail('文件大小超过限制。',413);chunk.copy(bytes,received);received+=chunk.length;}
   if(received!==size)fail('文件未完整上传，请重试。');
   if(!isMp3(bytes))fail('文件未通过 MP3 音频格式检查。',415);
   const sha=crypto.createHash('sha256').update(bytes).digest('hex');
   const prepared=await exclusive(()=>transaction(db,async()=>{
    const user=await currentUser(db,req);if(!premium(user))fail('账号订阅权限已变化。',403);
    const old=await db.get('SELECT * FROM music_tracks WHERE user_id=? AND request_id=?',[user.id,requestId]);
    if(old){if(old.sha256!==sha)fail('上传编号已用于其他文件。',409);if(old.state!=='ready')fail('同一文件仍在上传，请稍后重试。',409);return {duplicate:old};}
    const used=await usage(user.id),total=await db.get('SELECT (SELECT COALESCE(SUM(bytes),0) FROM music_tracks)+(SELECT COALESCE(SUM(bytes),0) FROM music_delete_jobs) AS n');
    if(used.tracks>=TRACKS||used.bytes+size>USER_BYTES)fail('个人音乐最多 10 首、合计 100 MiB；清理中的文件仍计入配额。',422);
    if(total.n+size>GLOBAL_BYTES)fail('音乐存储已达到站点容量上限，请联系管理员。',507);
    const id=crypto.randomUUID(),key=`music/${user.id}/${id}.mp3`;
    await db.run("INSERT INTO music_tracks(id,user_id,object_key,title,bytes,sha256,request_id,state) VALUES(?,?,?,?,?,?,?,'uploading')",[id,user.id,key,title,size,sha,requestId]);
    return {id,key};
   }));
   if(prepared.duplicate)return res.status(200).json({item:item(prepared.duplicate),duplicate:true});
   reserved=prepared;await cloud.put(prepared.key,bytes);
   const saved=await exclusive(()=>transaction(db,async()=>{
    const user=await currentUser(db,req);if(!premium(user))fail('上传期间账号权限已变化，文件将被清理。',403);
    const row=await db.get('SELECT * FROM music_tracks WHERE id=? AND user_id=?',[prepared.id,user.id]);if(!row)fail('上传已取消。',409);
    await db.run("UPDATE music_tracks SET state='ready' WHERE id=?",[row.id]);return item(row);
   }));reserved=null;res.status(201).json({item:saved});
  }catch(e){
   if(reserved)await exclusive(()=>db.run('DELETE FROM music_tracks WHERE id=?',[reserved.id])).catch(()=>{});
   next(e.status?e:Object.assign(Error('音乐上传暂时失败，请稍后重试。'),{status:503}));
  }finally{clearTimeout(deadline);if(slot)uploading=false;if(reserved)cleanup().catch(()=>{});}
 });
 if(background){const timer=setInterval(()=>cleanup().catch(()=>{}),30000);timer.unref();setTimeout(()=>cleanup().catch(()=>{}),1000).unref();}
 return {cleanup};
}
module.exports={migrateMusic,registerMusic,FILE_BYTES,USER_BYTES,TRACKS,GLOBAL_BYTES};
