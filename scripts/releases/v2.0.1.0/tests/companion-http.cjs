'use strict';
// Real HTTP checks for the v2.0.1.0 companion: both services serve every character file named in the
// manifest with the right type, the homepage host whitelist, caching of versioned assets and the
// script tag on every page that loads it.
const assert=require('node:assert/strict'),http=require('node:http');
const CAL=process.env.CHECK_CALENDAR||'http://calendar-check:3000',LAB=process.env.CHECK_LAB||'http://lab-check:3000',VERSION=process.env.CHECK_VERSION;
let count=0;const eq=(a,b)=>{assert.deepEqual(a,b);count++;};
// node:http lets the check send the homepage Host header that fetch() would refuse.
function get(base,path,{host,cookie}={}){
 return new Promise((resolve,reject)=>{
  const url=new URL(base);
  const request=http.get({hostname:url.hostname,port:url.port,path,headers:{...(host?{host}:{}),...(cookie?{cookie}:{})}},response=>{
   const chunks=[];response.on('data',chunk=>chunks.push(chunk));
   response.on('end',()=>{const bytes=Buffer.concat(chunks);resolve({status:response.statusCode,headers:response.headers,bytes,body:bytes.toString('utf8')});});
  });
  request.on('error',reject);
 });
}
// The new Calendar image carries the same manifest the browser reads.
const rigs=require('/app/public/companion/characters.js');
const art=rigs.roster.flatMap(id=>{const spec=rigs.characters[id];return [spec.thumbnail,...(spec.kind==='rig'?[spec.rig]:Object.values(spec.frames).map(frame=>frame[0]))];});
const files=['boot.js','knowledge.js','brain.js','voices.js','panel.js','panel.css','characters.js','pet.js','pet.css',...new Set(art)];
const types={'.js':/javascript/,'.css':/^text\/css/,'.svg':/^image\/svg\+xml/,'.webp':/^image\/webp/};
const tag=scope=>'<script src="/companion/boot.js?v='+VERSION+'" defer data-companion="'+scope+'"></script>';
(async()=>{
 assert.match(VERSION,/^\d+\.\d+\.\d+\.\d+$/);
 eq(rigs.roster,['milu','lili','pudding','pagey','navi']);
 for(const file of files){
  const lab=await get(LAB,'/companion/'+file+'?v='+VERSION),cal=await get(CAL,'/companion/'+file+'?v='+VERSION),type=types[file.slice(file.lastIndexOf('.'))];
  eq(lab.status,200);eq(cal.status,200);eq(Buffer.compare(cal.bytes,lab.bytes),0);
  eq(type.test(lab.headers['content-type']),true);eq(type.test(cal.headers['content-type']),true);
  eq(lab.headers['cache-control'],'public, max-age=86400');
 }
 eq((await get(LAB,'/companion/boot.js')).headers['cache-control'],'no-store');
 const rig=await get(LAB,'/companion/characters/milu/rig.svg?v='+VERSION);
 eq(rig.headers['content-type'],'image/svg+xml');eq(/<script|<foreignObject|<image|\son\w+\s*=|href="(?!#)/i.test(rig.body),false);
 eq((await get(CAL,'/tools-catalog.js')).body,(await get(LAB,'/tools-catalog.js')).body);

 // Homepage host: the companion bundle and public catalogue load; everything else stays hidden.
 for(const path of ['/companion/boot.js?v='+VERSION,'/companion/characters/milu/rig.svg?v='+VERSION,'/companion/characters/navi/idle.webp?v='+VERSION,'/tools-catalog.js'])eq((await get(LAB,path,{host:'garyhub.uk'})).status,200);
 // Existing Tools files outside the list, including dot-segment escapes from /companion/, stay 404.
 for(const path of ['/tools-dock.js','/hub.js','/companion/../tools-dock.js','/companion/%2e%2e/hub.js','/homepage-protected.json','/profile-private.json'])eq((await get(LAB,path,{host:'garyhub.uk'})).status,404);
 // Admin pages are gated by sign-in before the homepage list; a guest is redirected, never served.
 eq((await get(LAB,'/admin.html',{host:'garyhub.uk'})).status,302);
 const home=await get(LAB,'/',{host:'garyhub.uk'});eq(home.status,200);eq(home.body.includes(tag('open')),true);
 const tools=await get(LAB,'/');eq(tools.status,200);eq(tools.body.includes(tag('open')),true);

 for(const page of ['/','/ledger/','/ledger/fixed/','/todos/','/journal/','/health-records/','/research/','/music/']){
  const response=await get(CAL,page);eq(response.status,200);eq(response.body.split('/companion/boot.js').length,2);eq(response.body.includes(tag('quiet')),true);
 }
 for(const page of ['/login/','/register/','/change-password/'])eq((await get(CAL,page)).body.includes('/companion/boot.js'),false);

 // Guests are not identified; the Lab page loads the quiet companion after sign-in.
 const guest=await get(CAL,'/api/hub/me');eq(guest.status,200);eq(JSON.parse(guest.body).user,null);
 eq((await get(LAB,'/lab/')).status,302);
 let cookie='';const take=response=>{const values=response.headers.getSetCookie();if(values.length)cookie=values.map(value=>value.split(';')[0]).join('; ');};
 let response=await fetch(CAL+'/api/csrf');take(response);const {token}=await response.json();
 response=await fetch(CAL+'/api/login',{method:'POST',headers:{cookie,origin:'https://calendar.garyhub.uk','x-csrf-token':token,'content-type':'application/json'},body:JSON.stringify({username:'check_alice',password:'Synthetic-Only-2026!'})});take(response);eq(response.status,200);
 const me=JSON.parse((await get(CAL,'/api/hub/me',{cookie})).body);eq(typeof me.user.id,'number');eq(typeof me.user.role,'string');
 const lab=await get(LAB,'/lab/',{cookie});eq(lab.status,200);eq(lab.body.includes(tag('quiet')),true);
 console.log('COMPANION HTTP PASS: '+count+' assertions; '+files.length+' identical files per service with types, versioned caching, homepage whitelist, page tags and signed-in Lab.');
})().catch(error=>{console.error(error);process.exit(1);});
