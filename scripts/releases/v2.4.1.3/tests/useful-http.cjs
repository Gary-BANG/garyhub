'use strict';
// v2.4.1.3: the three in-browser tools open without signing in. Same bilingual assets, MIME types and CSP as before
// (v1.3.6.1's suite), and the private record APIs still refuse guests.
const assert=require('node:assert/strict');
const CAL=process.env.CHECK_CALENDAR||'http://calendar-check:3000',LAB=process.env.CHECK_LAB||'http://lab-check:3000',version=process.env.CHECK_VERSION;
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};const ok=(v,m)=>{assert.ok(v,m);checks++;};
(async()=>{
 assert.match(version,/^\d+\.\d+\.\d+\.\d+$/);
 for(const base of [CAL,LAB]){
  eq((await(await fetch(base+'/health')).json()).hubVersion,version);
  eq((await(await fetch(base+'/privacy-ledger-release.json')).json()).version,version);
 }
 let cookie='';const cookies=response=>{const values=response.headers.getSetCookie();if(values.length)cookie=values.map(s=>s.split(';')[0]).join('; ');};
 const tokenResponse=await fetch(CAL+'/api/csrf',{headers:{'x-forwarded-for':'192.0.2.253'}});cookies(tokenResponse);const token=(await tokenResponse.json()).token;
 const login=await fetch(CAL+'/api/login',{method:'POST',headers:{cookie,'x-forwarded-for':'192.0.2.253',origin:'https://calendar.garyhub.uk','x-csrf-token':token,'content-type':'application/json'},body:JSON.stringify({username:'check_alice',password:'Synthetic-Only-2026!'})});cookies(login);eq(login.status,200);
 for(const name of ['image-eraser','markdown-viewer','pdf-gray']){
  const route='/useful/'+name+'/';
  for(const who of ['guest','member']){
   const result=await fetch(LAB+route,{redirect:'manual',headers:who==='member'?{cookie}:{}});eq(result.status,200,who+' '+route);
   const html=await result.text();
   ok(html.includes('/useful/tool-i18n.js')&&html.includes('/i18n/i18n.js'),'bilingual assets '+route);
   ok(html.includes('rel="icon" href="/favicon.svg"'),'site icon '+route);
   const csp=result.headers.get('content-security-policy')||'';
   ok(csp.includes("connect-src 'self'")&&csp.includes("object-src 'none'")&&csp.includes("base-uri 'none'"),'CSP '+route);
  }
  const bare=await fetch(LAB+'/useful/'+name,{redirect:'manual'});eq(bare.status,302);eq(bare.headers.get('location'),route);
 }
 for(const route of ['/useful/tool-i18n.js','/useful/markdown-viewer/app.js','/useful/markdown-viewer/zip-reader.mjs','/useful/pdf-gray/app.js']){
  const result=await fetch(LAB+route);eq(result.status,200);assert.match(result.headers.get('content-type'),/javascript/);checks++;
 }
 const source=await(await fetch(LAB+'/useful/markdown-viewer/')).text();ok(source.includes('data-user-content')&&source.includes('id="documentSelect"')&&source.includes('.zip'));
 // The tools page marks them for guests; other tools keep their login gates.
 const tools=await(await fetch(LAB+'/')).text();
 for(const id of ['eraser','markdown','pdf'])ok(tools.includes('<li data-tool="'+id+'" data-guest>'),'guest mark '+id);
 // (/totp/ is left out: the capability variant without TOTP has no such page to gate.)
 for(const route of ['/lab/','/access/','/personalize/'])eq((await fetch(LAB+route,{redirect:'manual'})).status,302,route);
 for(const route of ['/api/todos','/api/ledger/categories','/api/academic/state'])eq((await fetch((route.startsWith('/api/academic')?LAB:CAL)+route)).status,401,route);
 console.log('USEFUL HTTP PASS: '+checks+' checks; tools open to guests with CSP and icons, other login gates and private records unchanged.');
})().catch(error=>{console.error(error);process.exit(1)});
