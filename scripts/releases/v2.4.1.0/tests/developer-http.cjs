'use strict';
// Real HTTP checks for v2.4.1.0: the starfield homepage carries no personal text, the developer profile
// page lives only on the homepage host, and /api/hub/developer-profile returns exactly the sections the
// Calendar access policy allows for each identity (guest, member, admin, admin preview) and nothing else.
const assert=require('node:assert/strict'),http=require('node:http');
const CAL=process.env.CHECK_CALENDAR||'http://calendar-check:3000',LAB=process.env.CHECK_LAB||'http://lab-check:3000',VERSION=process.env.CHECK_VERSION;
let count=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);count++;};const ok=(v,m)=>{assert.ok(v,m);count++;};
function get(base,path,{host,cookie}={}){
 return new Promise((resolve,reject)=>{
  const url=new URL(base);
  const request=http.request({hostname:url.hostname,port:url.port,path,method:'GET',headers:{...(host?{host}:{}),...(cookie?{cookie}:{})}},response=>{
   const chunks=[];response.on('data',c=>chunks.push(c));
   response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks).toString('utf8')}));
  });
  request.on('error',reject);request.end();
 });
}
function post(base,path,{host}={}){
 return new Promise((resolve,reject)=>{
  const url=new URL(base);
  const request=http.request({hostname:url.hostname,port:url.port,path,method:'POST',headers:{...(host?{host}:{}),origin:'https://garyhub.uk','content-type':'application/json'}},response=>{response.resume();response.on('end',()=>resolve({status:response.statusCode}));});
  request.on('error',reject);request.end('{}');
 });
}
const PERSONAL=/ZJUI|Zhejiang|Urbana|2028|Multi-UAV|Intelligent Assistants|data-profile-fragment|该部分已隐藏/i;
const tag=scope=>'<script src="/companion/boot.js?v='+VERSION+'" defer data-companion="'+scope+'"></script>';
const SECTIONS=['identity','education','projects','skills','academics'];
const ACCESS_KEYS=['audience','complete','expiresAt','hasCode','preview','required','unlocked'];
// Calendar allows 12 logins per 15 minutes per client address, and the earlier suites already use 11 from the
// shared container address (v2.4.1.0-r1 stopped here with 429). Like stocks-http and tutor-http, sign in from
// this suite's own documentation address; sessions are not tied to the address.
const CLIENT='192.0.2.241';
async function login(username){
 let cookie='';const take=r=>{const v=r.headers.getSetCookie();if(v.length)cookie=v.map(x=>x.split(';')[0]).join('; ');};
 let r=await fetch(CAL+'/api/csrf',{headers:{'x-forwarded-for':CLIENT}});take(r);const {token}=await r.json();
 r=await fetch(CAL+'/api/login',{method:'POST',headers:{'x-forwarded-for':CLIENT,cookie,origin:'https://calendar.garyhub.uk','x-csrf-token':token,'content-type':'application/json'},body:JSON.stringify({username,password:'Synthetic-Only-2026!'})});take(r);eq(r.status,200,'login '+username);
 return cookie;
}
async function policy(cookie,query=''){const r=await get(CAL,'/api/hub/profile-access'+query,{cookie});eq(r.status,200);return JSON.parse(r.body);}
async function developer(cookie,query=''){
 const r=await get(LAB,'/api/hub/developer-profile'+query,{host:'garyhub.uk',cookie});eq(r.status,200,'developer profile '+query);
 eq(r.headers['cache-control'],'no-store');const data=JSON.parse(r.body);
 eq(Object.keys(data).sort(),['access','profile']);eq(Object.keys(data.access).sort(),ACCESS_KEYS);
 ok(!/"protected"|"revision"|"salt"|"hash"/.test(r.body),'policy internals leaked');
 return data;
}
function sameSections(data,access,label){
 const expected=SECTIONS.filter(k=>access.allowed.includes(k)).sort();
 eq(Object.keys(data.profile).sort(),expected,label);
 eq(data.access.complete,access.allowed.length===5,label+' complete');
 if(data.profile.academics)eq(Object.keys(data.profile.academics).sort(),['gpa','rank']);
}
(async()=>{
 assert.match(VERSION,/^\d+\.\d+\.\d+\.\d+$/);
 // Homepage: starfield page, no personal text, developer link in the More menu, companion and Elsewhere kept.
 const home=await get(LAB,'/',{host:'garyhub.uk'});eq(home.status,200);
 for(const marker of ['data-cosmos="full"','<a href="/developer/"><strong>Developer Profile</strong>','<a href="https://sites.garyhub.uk/" target="_blank" rel="noopener"><strong>Elsewhere ↗</strong>',tag('open')])ok(home.body.includes(marker),'homepage marker '+marker);
 ok(!PERSONAL.test(home.body),'homepage carries personal text');
 for(const [path,type] of [['/home/site.css',/^text\/css/],['/home/home.css',/^text\/css/],['/home/cosmos.js',/javascript/],['/home/site.js',/javascript/],['/developer/developer.css',/^text\/css/],['/developer/developer.js',/javascript/]]){
  const r=await get(LAB,path,{host:'garyhub.uk'});eq(r.status,200,path);ok(type.test(r.headers['content-type']),path+' type');
 }
 // Developer page: homepage host only; the static page carries no profile text.
 const redirect=await get(LAB,'/developer?preview=guest',{host:'garyhub.uk'});eq(redirect.status,302);eq(redirect.headers.location,'/developer/?preview=guest');
 for(const path of ['/developer/','/developer/index.html']){const page=await get(LAB,path,{host:'garyhub.uk'});eq(page.status,200);ok(page.body.includes('id="devView"'));ok(page.body.includes(tag('quiet')));ok(!PERSONAL.test(page.body),'developer page carries personal text');}
 for(const host of [undefined,'tools.garyhub.uk','lab.garyhub.uk'])for(const path of ['/developer/','/developer','/developer/developer.js','/Developer/'])eq((await get(LAB,path,{host})).status,404,'developer page on '+host+path);
 for(const host of [undefined,'garyhub.uk'])for(const path of ['/developer-profile.json','/homepage-protected.json','/profile-private.json','/developer/../developer-profile.json','/home/%2e%2e/developer-profile.json'])eq((await get(LAB,path,{host})).status,404,'private file '+path);
 eq((await post(LAB,'/api/hub/developer-profile',{host:'garyhub.uk'})).status,405);
 // Guest, member and admin each receive exactly what the Calendar policy allows.
 const guest=await developer('');sameSections(guest,await policy(''),'guest');eq(guest.access.preview,null);
 const alice=await login('check_alice');sameSections(await developer(alice),await policy(alice),'member');
 eq((await get(LAB,'/api/hub/developer-profile?preview=guest',{host:'garyhub.uk',cookie:alice})).status,403);
 const admin=await login('check_admin');const adminView=await developer(admin);sameSections(adminView,await policy(admin),'admin');eq(adminView.access.complete,true);
 eq(Object.keys(adminView.profile).sort(),[...SECTIONS].sort());
 for(const key of ['identity','education','projects','skills'])ok(adminView.profile[key]&&typeof adminView.profile[key]==='object','private profile section '+key);
 for(const audience of ['guest','member','subscriber']){const view=await developer(admin,'?preview='+audience);sameSections(view,await policy(admin,'?preview='+audience),'preview '+audience);eq(view.access.preview,audience);}
 console.log('DEVELOPER HTTP PASS: '+count+' assertions; starfield homepage without personal text, developer page on the homepage host only, private files hidden, sections match guest/member/admin/preview policies.');
})().catch(error=>{console.error(error);process.exit(1);});
