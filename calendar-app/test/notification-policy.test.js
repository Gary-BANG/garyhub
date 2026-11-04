'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createSqliteAdapter}=require('./helpers/sqlite-adapter');
const {pruneNotifications,startNotificationCleanup}=require('../notification-policy');
const {migrateHub,publishRelease,registerHubApi}=require('../hub-api');
const express=require('express');
async function fixture(file){const db=createSqliteAdapter(file);await db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,enabled INTEGER);INSERT INTO users VALUES(1,1),(2,1);CREATE TABLE notifications(id INTEGER PRIMARY KEY,user_id INTEGER,type TEXT,title TEXT,body TEXT,dedupe_key TEXT,read_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,dedupe_key));`);await migrateHub(db);return db;}
test('14-day boundary, read/unread expiry, mandatory notices and persistent release deduplication',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'notice-policy-')),file=path.join(dir,'test.sqlite');let db=await fixture(file);
 try{
  for(const [type,age,read] of [['release','-15 days',null],['release','-14 days','read'],['release','-13 days',null],['account','-90 days',null],['security','-90 days',null],['required','-90 days','read']])await db.run(`INSERT INTO notifications(user_id,type,title,body,created_at,read_at)VALUES(1,?,'t','b',datetime('now',?),?)`,[type,age,read]);
  assert.equal((await pruneNotifications(db)).changes,2);
  assert.deepEqual((await db.all('SELECT type FROM notifications ORDER BY id')).map(n=>n.type),['release','account','security','required']);
  const release={version:'garyhub-expiry-test',notes:[{scope:'home',title:'test',body:'test'}]};await publishRelease(db,release);
  await db.run("UPDATE notifications SET created_at=datetime('now','-15 days') WHERE dedupe_key LIKE 'garyhub-expiry-test:%'");await pruneNotifications(db);
  db.close();db=createSqliteAdapter(file);
  assert.equal((await publishRelease(db,release)).alreadyPublished,true);
  assert.equal((await db.get("SELECT COUNT(*) n FROM notifications WHERE dedupe_key LIKE 'garyhub-expiry-test:%'")).n,0);
 }finally{db.close();fs.rmSync(dir,{recursive:true});}
});
test('startup and periodic cleanup operate without readers',async t=>{
 const db=await fixture();let timer;
 try{
  await db.run("INSERT INTO notifications(user_id,type,created_at)VALUES(1,'release',datetime('now','-20 days'))");
  t.mock.timers.enable({apis:['setInterval']});timer=await startNotificationCleanup(db);
  assert.equal((await db.get('SELECT COUNT(*) n FROM notifications')).n,0);
  await db.run("INSERT INTO notifications(user_id,type,created_at)VALUES(1,'release',datetime('now','-20 days'))");
  t.mock.timers.tick(60000);await new Promise(r=>setImmediate(r));
  assert.equal((await db.get('SELECT COUNT(*) n FROM notifications')).n,0);
 }finally{clearInterval(timer);t.mock.timers.reset();db.close();}
});
test('bulk actions cover unseen pages, isolate users/scopes, keep mandatory notices and survive restart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'notice-bulk-')),file=path.join(dir,'test.sqlite');let db=await fixture(file);
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.session={user:req.get('x-user')?{id:Number(req.get('x-user'))}:null};next();});
 registerHubApi(app,{db,requireLogin:(req,res,next)=>req.session.user?next():res.sendStatus(401),requireAdmin:(req,res)=>res.sendStatus(403)});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const call=(action,user=1,body={scope:'calendar',userId:user})=>fetch(`http://127.0.0.1:${server.address().port}/api/hub/notifications/${action}`,{method:'POST',headers:{'x-user':user?String(user):'','content-type':'application/json'},body:JSON.stringify(body)});
 try{
  for(let i=0;i<121;i++)await db.run("INSERT INTO notifications(user_id,type,scope)VALUES(1,'release','calendar')");
  await db.exec("INSERT INTO notifications(user_id,type,scope)VALUES(1,'account','calendar'),(1,'release','access'),(2,'release','calendar')");
  assert.equal((await call('delete-all',0)).status,401);
  assert.equal((await call('delete-all',1,{scope:'calendar',userId:2})).status,409);
  assert.equal((await call('delete-all',1,{scope:'bad',userId:1})).status,400);
  assert.equal((await (await call('read-all')).json()).changed,121);
  assert.equal((await db.get('SELECT COUNT(*) n FROM notifications WHERE read_at IS NULL')).n,3);
  const both=await Promise.all([call('delete-all'),call('delete-all')]);assert.ok(both.every(r=>r.status===200));
  assert.equal((await db.get('SELECT COUNT(*) n FROM notifications')).n,3);
  await call('delete-all',1,{scope:'all',userId:1});
  assert.equal((await db.get('SELECT COUNT(*) n FROM notifications')).n,2);
  db.close();db=createSqliteAdapter(file);assert.equal((await db.get('SELECT COUNT(*) n FROM notifications')).n,2);
 }finally{await new Promise(r=>server.close(r));db.close();fs.rmSync(dir,{recursive:true});}
});
