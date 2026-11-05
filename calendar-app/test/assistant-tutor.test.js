'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {registerTutor,fingerprint}=require('../assistant-tutor');
test('tutor grants expire, do not survive restart, recheck entitlements and never bill failed work',async()=>{
 let active=true,tier='subscriber',enabled=true,allow=true,charged=0,refunds=0,calls=0,hook=null,now=Date.now();
 const realNow=Date.now;Date.now=()=>now;
 const doc={courseId:'c',lectureId:'l',title:'title',content:'private document'},servers=[];
 function serve(){
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.session={user:{id:3}};req.sessionID='session';next();});
  registerTutor(app,{requireLogin:(req,res,next)=>next(),settings:async()=>({model:'glm-4.7',enabled}),ready:s=>s.enabled,
   provider:()=>({label:'Synthetic'}),account:async()=>({active,tier,now:{date:'2026-11-04'}}),quotasOf:()=>({chat:{subscriber:10,admin:10}}),
   charge:async()=>{if(allow)charged++;return allow;},refund:async()=>refunds++,usage:async()=>({}),purge:async()=>{},
   think:async(s,call,messages)=>{calls++;call.model='glm-4.7';if(hook)await hook();return {content:'answer'};},logCall:async()=>{},logFailures:async()=>{},reasoning:()=>({thinking:{type:'enabled'}})});
  const server=app.listen(0,'127.0.0.1');servers.push(server);return server;
 }
 try{
  const a=serve();await new Promise(r=>a.once('listening',r));
  const post=async(server,verb,data)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/assistant/tutor/`+verb,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:3,...data})});return {status:r.status,body:await r.json()};};
  const start=()=>post(a,'start',{consent:true,provider:'Synthetic',document:doc});
  const ask=token=>post(a,'chat',{token,fingerprint:fingerprint(doc),message:'question'});
  const grant=(await start()).body;
  now+=3600001;assert.equal((await ask(grant.token)).body.code,'consent');assert.equal(calls,0);
  const next=(await start()).body;
  const restarted=serve();await new Promise(r=>restarted.once('listening',r));assert.equal((await post(restarted,'chat',{token:next.token,fingerprint:fingerprint(doc),message:'question'})).body.code,'consent');
  allow=false;assert.equal((await ask(next.token)).body.code,'quota');assert.equal(calls,0);allow=true;
  enabled=false;assert.equal((await ask(next.token)).body.code,'disabled');assert.equal(calls,0);enabled=true;
  hook=async()=>{tier='standard';};assert.equal((await ask(next.token)).status,403);assert.equal(charged,1);assert.equal(refunds,1);
  tier='subscriber';hook=null;assert.equal((await ask(next.token)).body.code,'consent','downgrade permanently revokes old grant');
  const last=(await start()).body;hook=async()=>{active=false;};assert.equal((await ask(last.token)).status,403);assert.equal(refunds,2,'account disable/deletion while answering refunds');
  active=true;const renewed=(await start()).body;hook=async()=>{now+=3600001;};assert.equal((await ask(renewed.token)).body.code,'consent');assert.equal(refunds,3,'expiry while answering refunds');
 }finally{Date.now=realNow;await Promise.all(servers.map(s=>new Promise(r=>s.close(r))));}
});
