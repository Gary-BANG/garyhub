'use strict';
// Runs against the server's current Miniflux image and a disposable PostgreSQL instance.
const assert=require('node:assert/strict');
(async()=>{
 const base=process.env.CHECK_MINIFLUX_URL;
 async function enter(username){const first=await fetch(base+'/',{redirect:'manual',headers:{'X-GaryHub-User':username}});assert.ok([200,302,303].includes(first.status));const cookies=first.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');assert.ok(cookies,'Miniflux did not issue a web session');const next=await fetch(base+'/unread',{redirect:'manual',headers:{'X-GaryHub-User':username,cookie:cookies}});assert.equal(next.status,200);assert.ok((await next.text()).includes('<html'));return cookies;}
 const a=await enter('garyhub-fixture-a'),b=await enter('garyhub-fixture-b');assert.notEqual(a,b);
 const guest=await fetch(base+'/unread',{redirect:'manual'});assert.ok([302,303,401,403].includes(guest.status));
 console.log('REAL MINIFLUX PASS: proxy-auth auto-provisioning, separate web sessions, authenticated reading and unauthenticated gate.');
})().catch(e=>{console.error(e.message);process.exit(1);});
