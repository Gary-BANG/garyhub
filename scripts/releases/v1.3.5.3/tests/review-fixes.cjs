'use strict';
const assert=require('node:assert/strict'),http=require('node:http');
const CAL=process.env.CHECK_CALENDAR,LAB=process.env.CHECK_LAB;
let count=0;const eq=(a,b,m)=>{assert.equal(a,b,m);count++;};
function request(base,route,host){return new Promise((resolve,reject)=>http.get(base+route,{headers:{host}},r=>{let body='';r.on('data',chunk=>body+=chunk);r.on('end',()=>resolve({status:r.statusCode,location:r.headers.location,body}));}).on('error',reject));}
(async()=>{
 for(const [host,path,target] of [
  ['lab.garyhub.uk','/lab/index.html?pack=review','https://lab.garyhub.uk/lab/?pack=review'],
  ['tools.garyhub.uk','/login.html?next='+encodeURIComponent('/study/index.html?course=review#reading'),'https://tools.garyhub.uk/study/?course=review#reading'],
  ['tools.garyhub.uk','/login.html?next='+encodeURIComponent('https://calendar.garyhub.uk/ledger/fixed/index.html?currency=USD#summary'),'https://calendar.garyhub.uk/ledger/fixed/?currency=USD#summary'],
  ['garyhub.uk','/login.html?next='+encodeURIComponent('/index.html?preview=member'),'https://garyhub.uk/?preview=member']
 ]){
  const r=await request(LAB,path,host);eq(r.status,302);const u=new URL(r.location);eq(u.origin+u.pathname,'https://calendar.garyhub.uk/login/');eq(u.searchParams.get('next'),target);
 }
 for(const target of ['https://notgaryhub.uk/lab/index.html','https://evil.garyhub.uk/lab/index.html','https://tools.garyhub.uk/unknown/index.html','https://tools.garyhub.uk/api/index.html','https://tools.garyhub.uk/login/index.html','https://user@tools.garyhub.uk/lab/index.html']){
  const r=await request(LAB,'/login.html?next='+encodeURIComponent(target),'tools.garyhub.uk');eq(r.status,302);eq(new URL(r.location).searchParams.get('next'),'https://calendar.garyhub.uk/');
 }
 // Serve the exact browser helper from both applications; exercise its shared allowlist.
 const modules=[];
 for(const [base,host] of [[CAL,'calendar.garyhub.uk'],[LAB,'tools.garyhub.uk']]){
  const r=await request(base,'/auth-redirect.js',host);eq(r.status,200);modules.push(r.body);
  const box={exports:{}};new Function('module',r.body)(box);
  eq(box.exports.safeNext('https://calendar.garyhub.uk/ledger/fixed/index.html?q=one#payment'),'https://calendar.garyhub.uk/ledger/fixed/?q=one#payment');
  eq(box.exports.safeNext('https://lab.garyhub.uk/lab/index.html?pack=review#q7'),'https://lab.garyhub.uk/lab/?pack=review#q7');
 }
 eq(modules[0],modules[1],'both services must use the same return-address rules');
 console.log('REVIEW FIXES PASS: '+count+' assertions; index aliases, query/fragment retention, real HTTP redirects and closed origin/path allowlist.');
})().catch(e=>{console.error(e.stack);process.exit(1)});
