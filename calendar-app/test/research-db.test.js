'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
test('additive migration preserves old data, is repeatable, persists records and cascades owner deletion',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'research-db-'));process.env.DATA_DIR=dir;const db=require('../db'),{migrateResearch}=require('../research-api');
 try{
  await db.initDb();await db.run("INSERT INTO users(id,username,password_hash)VALUES(1,'synthetic','synthetic-only')");await db.run("INSERT INTO events(user_id,title,start_date)VALUES(1,'Existing event','2026-10-24')");
  const before=await db.all('SELECT * FROM events');await migrateResearch(db);await migrateResearch(db);assert.deepEqual(await db.all('SELECT * FROM events'),before);
  const pid=crypto.randomUUID(),rid=crypto.randomUUID();await db.run('INSERT INTO research_projects(id,user_id,name,entries)VALUES(?,1,?,?)',[pid,'Persistent test','[{"english":["retained"]}]']);await db.run('INSERT INTO research_receipts(project_id,request_id,hash,revision)VALUES(?,?,?,1)',[pid,rid,'synthetic']);
  const second=new(require('sqlite3').Database)(path.join(dir,'calendar.sqlite'));const stored=await new Promise((resolve,reject)=>second.get('SELECT name FROM research_projects WHERE id=?',[pid],(err,row)=>err?reject(err):resolve(row)));assert.equal(stored.name,'Persistent test');await new Promise(r=>second.close(r));
  await migrateResearch(db);assert.equal((await db.get('SELECT entries FROM research_projects WHERE id=?',[pid])).entries,'[{"english":["retained"]}]');assert.deepEqual(await db.all('PRAGMA foreign_key_check'),[]);
  await db.run('DELETE FROM events WHERE user_id=1');await db.run('DELETE FROM users WHERE id=1');assert.equal((await db.get('SELECT COUNT(*) n FROM research_projects')).n,0);assert.equal((await db.get('SELECT COUNT(*) n FROM research_receipts')).n,0);assert.deepEqual(await db.all('PRAGMA foreign_key_check'),[]);
 }finally{await new Promise(r=>db.db.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
