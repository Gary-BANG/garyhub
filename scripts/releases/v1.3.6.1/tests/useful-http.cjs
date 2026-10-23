'use strict';
const assert=require('node:assert/strict');
const CAL=process.env.CHECK_CALENDAR||'http://calendar-check:3000',LAB=process.env.CHECK_LAB||'http://lab-check:3000',version=process.env.CHECK_VERSION||'1.3.6.1';
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{
 for(const base of [CAL,LAB]){
  eq((await(await fetch(base+'/health')).json()).hubVersion,version);
  eq((await(await fetch(base+'/privacy-ledger-release.json')).json()).version,version);
 }
 let cookie='';const cookies=response=>{const values=response.headers.getSetCookie();if(values.length)cookie=values.map(s=>s.split(';')[0]).join('; ');};
 const tokenResponse=await fetch(CAL+'/api/csrf');cookies(tokenResponse);const token=(await tokenResponse.json()).token;
 const login=await fetch(CAL+'/api/login',{method:'POST',headers:{cookie,origin:'https://calendar.garyhub.uk','x-csrf-token':token,'content-type':'application/json'},body:JSON.stringify({username:'check_alice',password:'Synthetic-Only-2026!'})});cookies(login);eq(login.status,200);
 for(const name of ['image-eraser','markdown-viewer','pdf-gray']){
  const route='/useful/'+name+'/';const guest=await fetch(LAB+route,{redirect:'manual'});eq(guest.status,302);assert.match(guest.headers.get('location'),/^https:\/\/calendar\.garyhub\.uk\/login\//);checks++;
  const result=await fetch(LAB+route,{headers:{cookie}});eq(result.status,200);const html=await result.text();
  assert.ok(html.includes('/useful/tool-i18n.js')&&html.includes('/i18n/i18n.js'));checks++;
  assert.ok(result.headers.get('content-security-policy').includes("connect-src 'self'"));checks++;
 }
 for(const route of ['/useful/tool-i18n.js','/useful/markdown-viewer/app.js','/useful/markdown-viewer/zip-reader.mjs']){
  const result=await fetch(LAB+route);eq(result.status,200);assert.match(result.headers.get('content-type'),/javascript/);checks++;
 }
 const source=await(await fetch(LAB+'/useful/markdown-viewer/',{headers:{cookie}})).text();assert.ok(source.includes('data-user-content')&&source.includes('id="documentSelect"')&&source.includes('.zip'));checks++;
 for(const route of ['/api/todos','/api/ledger/categories'])eq((await fetch(CAL+route)).status,401);
 console.log('USEFUL HTTP PASS: '+checks+' checks; version, login gate, bilingual assets, MIME, CSP and private records.');
})().catch(error=>{console.error(error);process.exit(1)});
