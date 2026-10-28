'use strict';
const assert=require('node:assert/strict');
const CAL=process.env.CHECK_CALENDAR||'http://calendar-check:3000',LAB=process.env.CHECK_LAB||'http://lab-check:3000';
let count=0;const eq=(a,b)=>{assert.deepEqual(a,b);count++;};
(async()=>{
 eq((await fetch(LAB+'/api/music/selected')).status,401);
 let cookie='';const take=r=>{if(r.headers.getSetCookie().length)cookie=r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');};
 let response=await fetch(CAL+'/api/csrf');take(response);const {token}=await response.json();
 response=await fetch(CAL+'/api/login',{method:'POST',headers:{cookie,origin:'https://calendar.garyhub.uk','x-csrf-token':token,'content-type':'application/json'},body:JSON.stringify({username:'check_alice',password:'Synthetic-Only-2026!'})});take(response);eq(response.status,200);
 response=await fetch(LAB+'/api/music/selected',{headers:{cookie}});eq(response.status,200);const selected=await response.json();eq(selected.accountId,2);eq(selected.url,'/ambient.mp3');
 for(const route of ['/grades/','/study/','/useful/image-eraser/','/useful/markdown-viewer/','/useful/pdf-gray/']){
  response=await fetch(LAB+route,{headers:{cookie}});eq(response.status,200);const html=await response.text();
  eq(html.includes('ambient-music.js')||html.includes('tool-shell.js?v=1.4.3.2'),true);
  if(route.startsWith('/useful/')){const csp=response.headers.get('content-security-policy');eq(csp.includes("connect-src 'self';"),true);eq(csp.includes("media-src 'self' https://*.r2.cloudflarestorage.com;"),true);}
 }
 response=await fetch(LAB+'/ambient.mp3');eq(response.status,200);eq(response.headers.get('content-type'),'audio/mpeg');
 response=await fetch(LAB+'/lab/math-markdown.mjs');eq(response.status,200);eq(response.headers.get('content-type'),'text/javascript');
 console.log('MUSIC HTTP PASS: '+count+' assertions; five pages, authenticated selection, audio and narrow media CSP.');
})().catch(e=>{console.error(e);process.exit(1);});
