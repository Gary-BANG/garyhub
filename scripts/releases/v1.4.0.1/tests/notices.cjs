'use strict';
const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=process.env.APP_DIR,db=require(root+'/db');
(async()=>{try{
  await db.run('UPDATE users SET enabled=0 WHERE id=5');
  const publish=()=>JSON.parse(execFileSync(process.execPath,[root+'/scripts/publish-hub-release.js',root+'/releases/garyhub-1.4.0.1.json'],{env:process.env,encoding:'utf8'}));
  const first=publish();assert.equal(first.recipients,4);assert.equal(first.notifications,4);
  await db.run("UPDATE notifications SET read_at='2026-10-23T00:00:00Z' WHERE user_id=1 AND dedupe_key='garyhub-1.4.0.1:0'");
  await db.run('UPDATE users SET enabled=1 WHERE id=5');
  const again=publish();assert.equal(again.alreadyPublished,true);assert.equal(again.recipients,4);
  const row=await db.get("SELECT read_at FROM notifications WHERE user_id=1 AND dedupe_key='garyhub-1.4.0.1:0'");assert.ok(row.read_at);
  const count=await db.get("SELECT COUNT(*) AS n FROM notifications WHERE dedupe_key LIKE 'garyhub-1.4.0.1:%'");assert.equal(count.n,4);
  console.log('HOVER FIX NOTICE PASS: 4 enabled synthetic recipients, administrators included, disabled account excluded, deduplication/read state preserved.');
}finally{await new Promise(r=>db.db.close(r));}})().catch(error=>{console.error(error);process.exitCode=1;});
