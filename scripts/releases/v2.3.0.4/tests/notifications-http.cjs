'use strict';
// Synthetic isolated database only. The updater runs this before backing up/switching production.
const assert=require('node:assert/strict');
const CAL=process.env.CHECK_CALENDAR||'http://calendar-check:3000',LAB=process.env.CHECK_LAB||'http://lab-check:3000';
const db=require((process.env.APP_DIR||'/app')+'/db');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
async function session(username){
 let cookie='';const take=r=>{if(r.headers.getSetCookie().length)cookie=r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');};
 let r=await fetch(CAL+'/api/csrf');take(r);const {token}=await r.json();
 r=await fetch(CAL+'/api/login',{method:'POST',headers:{cookie,origin:'https://calendar.garyhub.uk','x-csrf-token':token,'content-type':'application/json'},body:JSON.stringify({username,password:'Synthetic-Only-2026!'})});take(r);eq(r.status,200);
 return async(base,path,body,extra={})=>{
  const headers={cookie,origin:base===CAL?'https://calendar.garyhub.uk':'https://tools.garyhub.uk'};
  if(body){const t=await(await fetch(base+'/api/csrf',{headers:{cookie}})).json();Object.assign(headers,{'x-csrf-token':t.token,'content-type':'application/json'});}
  Object.assign(headers,extra);
  const r=await fetch(base+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,redirect:'manual'});
  const text=await r.text();return {status:r.status,data:text.startsWith('{')||text.startsWith('[')?JSON.parse(text):text};
 };
}
(async()=>{
 try{
  const alice=await session('check_alice'),bob=await session('check_bob');
  const prefix='v2304-http-';
  await db.run('DELETE FROM notifications WHERE dedupe_key LIKE ?',[prefix+'%']);
  for(const [key,user,type,scope,age]of [['old',2,'release','calendar','-15 days'],['mandatory',2,'account','calendar','-90 days'],['calendar',2,'release','calendar','-1 day'],['access',2,'release','access','-1 day'],['bob',3,'release','calendar','-1 day']]){
   await db.run("INSERT INTO notifications(user_id,type,title,body,scope,created_at,dedupe_key)VALUES(?,?,'Synthetic retention test','Synthetic data only',?,datetime('now',?),?)",[user,type,scope,age,prefix+key]);
  }
  for(const base of [CAL,LAB]){
   eq((await alice(base,'/api/hub/notifications/delete-all',{scope:'all',userId:2},{'x-csrf-token':'invalid'})).status,403);
   eq((await alice(base,'/api/hub/notifications/delete-all',{scope:'all',userId:2},{origin:'https://untrusted.invalid'})).status,403);
   eq((await alice(base,'/api/hub/notifications/delete-all',{scope:'all',userId:3})).status,409);
   eq((await alice(base,'/api/hub/notifications/read-all',{scope:'invalid',userId:2})).status,400);
   eq((await fetch(base+'/api/hub/notifications')).status,401);
  }
  const expired=await db.get('SELECT id FROM notifications WHERE dedupe_key=?',[prefix+'old']);
  let list=(await alice(CAL,'/api/notifications')).data;eq(list.some(n=>n.id===expired.id),false);
  eq((await db.get('SELECT COUNT(*) n FROM notifications WHERE id=?',[expired.id])).n,0);
  const mandatory=await db.get('SELECT id FROM notifications WHERE dedupe_key=?',[prefix+'mandatory']);
  eq(list.find(n=>n.id===mandatory.id).required,1);
  eq((await alice(LAB,'/api/hub/notifications/read-all',{scope:'calendar',userId:2})).status,200);
  eq((await db.get('SELECT read_at FROM notifications WHERE id=?',[mandatory.id])).read_at,null);
  eq((await db.get('SELECT read_at FROM notifications WHERE dedupe_key=?',[prefix+'access'])).read_at,null);
  assert.ok((await db.get('SELECT read_at FROM notifications WHERE dedupe_key=?',[prefix+'calendar'])).read_at);checks++;
  eq((await alice(LAB,'/api/hub/notifications/delete-all',{scope:'calendar',userId:2})).status,200);
  eq((await db.get('SELECT COUNT(*) n FROM notifications WHERE dedupe_key=?',[prefix+'calendar'])).n,0);
  eq((await db.get('SELECT COUNT(*) n FROM notifications WHERE id=?',[mandatory.id])).n,1);
  eq((await db.get('SELECT COUNT(*) n FROM notifications WHERE dedupe_key=?',[prefix+'access'])).n,1);
  eq((await bob(CAL,'/api/hub/notifications?scope=calendar')).data.items.some(n=>n.id===mandatory.id),false);
  eq((await db.get('SELECT COUNT(*) n FROM notifications WHERE dedupe_key=?',[prefix+'bob'])).n,1);
  eq((await alice(CAL,'/api/hub/notifications/delete-all',{scope:'all',userId:2})).status,200);
  eq((await db.get('SELECT COUNT(*) n FROM notifications WHERE dedupe_key=?',[prefix+'access'])).n,0);
  // Disabled sessions are revoked by the real authentication middleware, including bulk mutations.
  await db.run('UPDATE users SET enabled=0 WHERE id=3');
  try {eq((await bob(LAB,'/api/hub/notifications')).status,401);eq([401,403].includes((await bob(LAB,'/api/hub/notifications/delete-all',{scope:'all',userId:3})).status),true);eq((await db.get('SELECT COUNT(*) n FROM notifications WHERE dedupe_key=?',[prefix+'bob'])).n,1);}
  finally {await db.run('UPDATE users SET enabled=1 WHERE id=3');}
  console.log('NOTIFICATIONS HTTP PASS: '+checks+' assertions; direct/proxy CSRF, origin, identity, scopes, expiry and required notices.');
 }finally{await new Promise(r=>db.db.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
