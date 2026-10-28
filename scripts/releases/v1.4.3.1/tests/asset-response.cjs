'use strict';
// Exercise the real HTTP responses which r1's file-only verifier mock missed.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const config=require('./asset-checks.json');
const CAL=process.env.CHECK_CALENDAR||'http://calendar-check:3000',LAB=process.env.CHECK_LAB||'http://lab-check:3000';
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{
 for(const asset of config.asset_checksums){
  const response=await fetch(LAB+asset.route+'?v='+config.version,{redirect:'manual'});
  eq(response.status,200);eq(digest(Buffer.from(await response.arrayBuffer())),asset.sha256);
 }
 let cookie='';const take=response=>{const values=response.headers.getSetCookie();if(values.length)cookie=values.map(v=>v.split(';')[0]).join('; ');};
 let response=await fetch(CAL+'/api/csrf');take(response);const token=(await response.json()).token;
 response=await fetch(CAL+'/api/login',{method:'POST',headers:{cookie,origin:'https://calendar.garyhub.uk','x-csrf-token':token,'content-type':'application/json'},body:JSON.stringify({username:'check_alice',password:'Synthetic-Only-2026!'})});take(response);eq(response.status,200);
 for(const asset of config.protected_asset_checksums){
  const route=asset.route+'?v='+config.version;
  const guest=await fetch(LAB+route,{redirect:'manual'});eq(guest.status,302);
  const login=new URL(guest.headers.get('location'));eq(login.origin+login.pathname,'https://calendar.garyhub.uk/login/');
  eq(login.searchParams.get('next'),'https://'+asset.host+asset.route.replace(/index\.html$/,'')+'?v='+config.version);
  assert.notEqual(digest(Buffer.from(await guest.arrayBuffer())),asset.sha256);checks++;
  const signed=await fetch(LAB+route,{headers:{cookie},redirect:'manual'});eq(signed.status,200);eq(digest(Buffer.from(await signed.arrayBuffer())),asset.sha256);
 }
 console.log('ASSET RESPONSE PASS: '+checks+' assertions; r1 redirect/hash failure reproduced, public assets and authenticated HTML bytes verified.');
})().catch(error=>{console.error(error);process.exit(1);});
