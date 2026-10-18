'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),sqlite=require('sqlite3');
const {migrateLedger}=require('../ledger-api');
test('legacy currency constraint migration preserves exact records, refund links, indexes and foreign keys',async()=>{
 const raw=new sqlite.Database(':memory:'),db={run:(s,p=[])=>new Promise((y,n)=>raw.run(s,p,function(e){e?n(e):y(this);})),get:(s,p=[])=>new Promise((y,n)=>raw.get(s,p,(e,r)=>e?n(e):y(r))),all:(s,p=[])=>new Promise((y,n)=>raw.all(s,p,(e,r)=>e?n(e):y(r)))};
 try{
  await db.run('PRAGMA foreign_keys=ON');await db.run('CREATE TABLE users(id INTEGER PRIMARY KEY)');await db.run('INSERT INTO users VALUES(1)');
  await db.run("CREATE TABLE ledger_entries(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN('expense','income','refund')),currency TEXT NOT NULL CHECK(currency IN('CNY','USD')),date TEXT NOT NULL,category_id TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),notes TEXT NOT NULL DEFAULT '',refund_of TEXT REFERENCES ledger_entries(id) ON DELETE RESTRICT,revision INTEGER NOT NULL DEFAULT 1,request_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,request_id))");
  await db.run("INSERT INTO ledger_entries(id,user_id,kind,currency,date,category_id,amount,request_id)VALUES('expense',1,'expense','USD','2026-10-01','food',10001,'a')");
  await db.run("INSERT INTO ledger_entries(id,user_id,kind,currency,date,category_id,amount,refund_of,request_id)VALUES('refund',1,'refund','USD','2026-10-02','food',5000,'expense','b')");
  const before=await db.all('SELECT * FROM ledger_entries ORDER BY id');
  await migrateLedger(db);await migrateLedger(db);
  assert.deepEqual(await db.all('SELECT * FROM ledger_entries ORDER BY id'),before);
  assert.equal((await db.get('PRAGMA foreign_keys')).foreign_keys,1);assert.deepEqual(await db.all('PRAGMA foreign_key_check'),[]);
  await assert.rejects(db.run("DELETE FROM ledger_entries WHERE id='expense'"));
  for(const currency of ['CAD','HKD'])await db.run("INSERT INTO ledger_entries(id,user_id,kind,currency,date,category_id,amount,request_id)VALUES(?,1,'expense',?,'2026-10-03','food',123,?)",[currency,currency,currency]);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM ledger_entries')).n,4);
  assert.equal((await db.all("SELECT name FROM sqlite_master WHERE type='index' AND name IN('idx_ledger_user_date','idx_ledger_refund')")).length,2);
 }finally{await new Promise(y=>raw.close(y));}
});
