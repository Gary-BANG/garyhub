'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {limits,checkTodos}=require('../entitlements');
const {isMp3,presign,configuration,createStorage}=require('../music-storage');
const {migrateMusic,registerMusic}=require('../music-api');
const {createSqliteAdapter}=require('./helpers/sqlite-compatible');
const todo=(n=0)=>({id:crypto.randomUUID(),title:'Synthetic',done:false,points:Array.from({length:n},()=>({id:crypto.randomUUID(),text:'Point',done:false}))});
test('standard quotas count completed todos; downgrade preserves IDs but cannot grow or replace above limit',()=>{
 const user={role:'user',account_tier:'standard'},old=Array.from({length:7},()=>todo(12));old[0].done=true;
 assert.deepEqual(limits(user),{fixedExpenses:5,todos:5,points:10,personalMusic:false});
 assert.doesNotThrow(()=>checkTodos(user,old,old.map(t=>({...t,title:'Edited',done:true}))));
 assert.doesNotThrow(()=>checkTodos(user,old,old.slice(0,4)));
 assert.throws(()=>checkTodos(user,[],Array.from({length:6},()=>({...todo(),done:true}))),/最多保存 5/);
 assert.throws(()=>checkTodos(user,old,[...old.slice(1),todo()]),/最多保存 5/);
 assert.throws(()=>checkTodos(user,[old[0]],[{...old[0],points:[...old[0].points.slice(1),{id:crypto.randomUUID(),text:'New'}]}]),/最多 10/);
 assert.throws(()=>checkTodos(user,[],[todo(11)]),/最多 10/);
 for(const paid of [{role:'admin'},{role:'user',account_tier:'subscriber'}]){assert.equal(limits(paid).personalMusic,true);assert.doesNotThrow(()=>checkTodos(paid,[],old));}
});
test('MP3 validation checks frames and ID3 lengths, not only file magic',()=>{
 const mp3=fs.readFileSync(path.join(__dirname,'../public/ambient.mp3'));assert.equal(isMp3(mp3),true);
 for(const v of [Buffer.from('ID3notaudio'),Buffer.alloc(100),Buffer.from('<script>'),mp3.subarray(0,20)])assert.equal(isMp3(v),false);
 const invalid=Buffer.from(mp3);if(invalid.subarray(0,3).toString()==='ID3'){invalid[6]=255;assert.equal(isMp3(invalid),false);}
});
test('private R2 signer matches independent botocore fixture, expires links, rejects escaping keys',()=>{
 const c={account:'a'.repeat(32),bucket:'garyhub-music-test',accessKey:'b'.repeat(32),secret:'c'.repeat(64)};
 const url=new URL(presign(c,'GET','music/2/11111111-1111-4111-8111-111111111111.mp3',{now:new Date('2026-10-26T12:00:00Z'),expires:300}));
 assert.equal(url.searchParams.get('X-Amz-Expires'),'300');assert.equal(url.searchParams.get('X-Amz-SignedHeaders'),'host');
 assert.equal(url.searchParams.get('X-Amz-Signature'),'8e306e4ab02e31fb6cb53595e2369d8a588e6a30c1e88bde4377c07aa2291423');
 assert.equal(url.toString().includes(c.secret),false);assert.throws(()=>presign(c,'PUT','../escape.mp3'));
 assert.equal(configuration({}),null);assert.throws(()=>configuration({R2_ACCOUNT_ID:'invalid'}));
});
test('storage failures do not disclose signed URLs or keys; DELETE is idempotent',async()=>{
 const c={account:'a'.repeat(32),bucket:'garyhub-music-test',accessKey:'b'.repeat(32),secret:'c'.repeat(64)};
 const cloud=createStorage(c,async()=>{throw Error('SECRET URL')});await assert.rejects(()=>cloud.put('music/2/test.mp3',Buffer.from('x')),e=>!e.message.includes('SECRET'));
 await createStorage(c,async()=>({ok:false,status:404})).remove('music/2/test.mp3');
});
test('migration is additive/idempotent; user deletion queues cloud cleanup even for rollback image',async()=>{
 const db=createSqliteAdapter();try{
  await db.run('CREATE TABLE users(id INTEGER PRIMARY KEY)');await db.run('INSERT INTO users VALUES(2)');await migrateMusic(db);await migrateMusic(db);
  await db.run("INSERT INTO music_tracks(id,user_id,object_key,title,bytes,sha256,request_id,state) VALUES('x',2,'music/2/x.mp3','Owned',512,'hash','r','ready')");
  await db.run("INSERT INTO music_preferences VALUES(2,'x')");
  // An old application's DELETE still runs the persistent new trigger.
  await db.run('DELETE FROM users WHERE id=2');assert.equal((await db.get('SELECT COUNT(*) AS n FROM music_tracks')).n,0);assert.equal((await db.get('SELECT COUNT(*) AS n FROM music_preferences')).n,0);
  assert.equal((await db.get('SELECT * FROM music_delete_jobs')).bytes,512);assert.deepEqual(await db.all('PRAGMA foreign_key_check'),[]);
 }finally{await db.close();}
});
test('cleanup recovers stale uploads and orphaned owners; failed remote deletes remain reserved for retry',async()=>{
 const db=createSqliteAdapter();try{
  await db.run('CREATE TABLE users(id INTEGER PRIMARY KEY)');await db.run('INSERT INTO users VALUES(2)');await migrateMusic(db);
  await db.run("INSERT INTO music_tracks VALUES('stale',2,'music/2/stale.mp3','Stale',100,'h','r1','uploading',datetime('now','-1 day'))");
  await db.run("INSERT INTO music_tracks VALUES('orphan',99,'music/99/orphan.mp3','Orphan',200,'h','r2','ready',datetime('now'))");
  let failing=true;const removed=[],app={get(){},put(){},delete(){},post(){}};
  const service=registerMusic(app,{requireLogin(){},db,background:false,storage:()=>({async remove(key){if(failing)throw Error('Temporary provider failure');removed.push(key);}})});
  await service.cleanup();assert.equal((await db.get('SELECT COUNT(*) AS n FROM music_tracks')).n,0);assert.equal((await db.get('SELECT COUNT(*) AS n FROM music_delete_jobs')).n,2);
  failing=false;await service.cleanup();assert.deepEqual(removed,['music/99/orphan.mp3']);assert.equal((await db.get('SELECT SUM(bytes) AS n FROM music_delete_jobs')).n,100,'uncertain stale PUT retains reservation until its grace period ends');
 }finally{await db.close();}
});
