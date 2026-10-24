'use strict';
/* Local disposable data only. Installation uses the reviewed internal checks. */
const assert=require('node:assert/strict'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=process.env.APP_DIR;if(!root)throw Error('APP_DIR must point at the synthetic Calendar source');
(async()=>{
  for(const script of [path.join(__dirname,'dock-http.cjs'),path.resolve(__dirname,'../../v1.3.6.1/tests/useful-http.cjs'),path.resolve(__dirname,'../../v1.3.6.0/tests/lab-distribution.cjs')])execFileSync(process.execPath,[script],{env:process.env,stdio:'inherit'});
  const db=require(root+'/db'),release='garyhub-1.4.0.0';
  try{
    await db.run('UPDATE users SET enabled=0 WHERE id=5');
    const publish=()=>JSON.parse(execFileSync(process.execPath,[root+'/scripts/publish-hub-release.js',root+'/releases/'+release+'.json'],{env:process.env,encoding:'utf8'}));
    const first=publish();assert.equal(first.recipients,4);assert.equal(first.notifications,8);
    const unread=await db.get('SELECT COUNT(*) AS n FROM notifications WHERE dedupe_key LIKE ? AND read_at IS NULL',[release+':%']);assert.equal(unread.n,8);
    await db.run('UPDATE notifications SET read_at=? WHERE user_id=1 AND dedupe_key=?',['2026-10-23T00:00:00Z',release+':0']);
    await db.run('UPDATE users SET enabled=1 WHERE id=5');
    const again=publish();assert.equal(again.alreadyPublished,true);assert.equal(again.recipients,4);
    const read=await db.get('SELECT read_at FROM notifications WHERE user_id=1 AND dedupe_key=?',[release+':0']);assert.equal(read.read_at,'2026-10-23T00:00:00Z');
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM notifications WHERE dedupe_key LIKE ?',[release+':%'])).n,8);
    console.log('RELEASE NOTICE PASS: 4 enabled synthetic accounts including both administrators; disabled account excluded, 8 notices, repeat does not reset read state or add later users.');
  }finally{await new Promise(resolve=>db.db.close(resolve));}
})().catch(error=>{console.error(error);process.exit(1)});
