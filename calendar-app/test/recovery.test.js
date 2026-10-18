'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),sqlite=require('sqlite3');
const {migratePasswordReset,registerPasswordReset,GENERIC}=require('../password-reset');
const {findLoginIdentity}=require('../login-identity');
const {hashPassword,verifyPassword}=require('../auth-utils');
process.env.SESSION_SECRET='synthetic-recovery-only-secret-not-production';
function database(){const raw=new sqlite.Database(':memory:');return {raw,run:(s,p=[])=>new Promise((y,n)=>raw.run(s,p,function(e){e?n(e):y(this);})),get:(s,p=[])=>new Promise((y,n)=>raw.get(s,p,(e,r)=>e?n(e):y(r))),all:(s,p=[])=>new Promise((y,n)=>raw.all(s,p,(e,r)=>e?n(e):y(r)))};}
test('verified email identity, recovery expiry, single use, attempt limits and account changes',async()=>{
 const db=database(),messages=[];let now=Date.parse('2026-10-18T12:00:00Z'),server;
 try{
  await db.run('CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,email TEXT,email_normalized TEXT,email_verified_at TEXT,enabled INTEGER,deletion_pending INTEGER,auth_version INTEGER,must_change_password INTEGER,password_hash TEXT)');
  for(const [id,name,email,verified,enabled]of [[1,'alice','alice@example.invalid','verified',1],[2,'bob','bob@example.invalid','verified',1],[3,'unverified','new@example.invalid',null,1],[4,'disabled','off@example.invalid','verified',0]])await db.run('INSERT INTO users VALUES(?,?,?,?,?,?,0,0,0,?)',[id,name,email,email,verified,enabled,hashPassword('Previous-Password-2026!')]);
  await migratePasswordReset(db);await migratePasswordReset(db);
  assert.equal((await findLoginIdentity(db,' ALICE@EXAMPLE.INVALID ')).id,1);
  assert.equal(await findLoginIdentity(db,'new@example.invalid'),null);
  await db.run("INSERT INTO users VALUES(5,'alice@example.invalid','fifth@example.invalid','fifth@example.invalid','verified',1,0,0,0,?)",[hashPassword('Previous-Password-2026!')]);
  assert.equal(await findLoginIdentity(db,'alice@example.invalid'),null);await db.run('DELETE FROM users WHERE id=5');
  const app=express();app.set('trust proxy',1);app.use(express.json());registerPasswordReset(app,{db,sendMail:async m=>messages.push(m),clock:()=>now});app.use((e,req,res,next)=>res.status(e.status||500).json({message:e.message}));
  server=await new Promise(y=>{const s=app.listen(0,'127.0.0.1',()=>y(s));});let ip=0;
  async function post(path,body){const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/password-reset/'+path,{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':'192.0.2.'+(++ip)},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
  const request=async identifier=>post('request',{identifier});
  const first=await request('ALICE@EXAMPLE.INVALID');assert.equal(first.status,200);assert.equal(first.body.message,GENERIC);
  await new Promise(y=>setTimeout(y,10));assert.equal(messages.length,1);assert.equal(messages[0].to,'alice@example.invalid');
  const code=messages[0].text.match(/code: (\d{6})/)[1],requestId=first.body.requestId;
  const stored=await db.get('SELECT * FROM password_reset_requests WHERE id=?',[requestId]);assert(!stored.code_digest.includes(code));assert.equal(stored.ticket_digest,null);
  const unknown=await request('nobody');const unverified=await request('new@example.invalid');const disabled=await request('disabled');
  for(const response of [unknown,unverified,disabled]){assert.equal(response.status,200);assert.equal(response.body.message,first.body.message);assert.deepEqual(Object.keys(response.body).sort(),Object.keys(first.body).sort());}assert.equal(messages.length,1);
  assert.equal((await post('verify',{requestId:unknown.body.requestId,code})).status,400);
  assert.equal((await post('verify',{requestId,code:code==='000000'?'000001':'000000'})).status,400);
  const verified=await post('verify',{requestId,code});assert.equal(verified.status,200);
  assert.equal((await post('verify',{requestId,code})).status,400);
  const complete={requestId,resetToken:verified.body.resetToken,password:'Updated-Password-2026!',confirmPassword:'Updated-Password-2026!'};
  const results=await Promise.all([post('complete',complete),post('complete',complete)]);assert.deepEqual(results.map(x=>x.status).sort(),[200,400]);
  const user=await db.get('SELECT * FROM users WHERE id=1');assert(verifyPassword(complete.password,user.password_hash));assert.equal(user.auth_version,1);assert.equal((await db.get('SELECT auth_version FROM users WHERE id=2')).auth_version,0);
  await new Promise(y=>setTimeout(y,10));assert.equal(messages.length,2);assert(!messages[1].text.includes(complete.password));
  now+=61_000;const locked=await request('alice');await new Promise(y=>setTimeout(y,10));const real=messages.at(-1).text.match(/code: (\d{6})/)[1];
  for(let i=0;i<5;i++)assert.equal((await post('verify',{requestId:locked.body.requestId,code:real==='000000'?'000001':'000000'})).status,400);
  assert.equal((await db.get('SELECT attempts FROM password_reset_requests WHERE id=?',[locked.body.requestId])).attempts,5);
  assert.equal((await post('verify',{requestId:locked.body.requestId,code:real})).status,400);
  now+=61_000;const expired=await request('alice');await new Promise(y=>setTimeout(y,10));const oldCode=messages.at(-1).text.match(/code: (\d{6})/)[1];now+=600_001;assert.equal((await post('verify',{requestId:expired.body.requestId,code:oldCode})).status,400);
  const changed=await request('alice');await new Promise(y=>setTimeout(y,10));const changedCode=messages.at(-1).text.match(/code: (\d{6})/)[1];await db.run('UPDATE users SET enabled=0 WHERE id=1');assert.equal((await post('verify',{requestId:changed.body.requestId,code:changedCode})).status,400);
  await db.run('UPDATE users SET enabled=1 WHERE id=1');now+=61_000;
  const emailChanged=await request('alice');await new Promise(y=>setTimeout(y,10));const emailCode=messages.at(-1).text.match(/code: (\d{6})/)[1];await db.run("UPDATE users SET email_normalized='other@example.invalid' WHERE id=1");assert.equal((await post('verify',{requestId:emailChanged.body.requestId,code:emailCode})).status,400);
  console.log('Recovery: unknown/disabled/unverified privacy, expiry, five attempts, concurrent one-use and account binding verified.');
 }finally{if(server)await new Promise(y=>server.close(y));await new Promise(y=>db.raw.close(y));}
});
