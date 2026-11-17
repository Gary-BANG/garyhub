'use strict';
// Real HTTP checks for v2.4.1.3 on both services: today summary and search (Calendar and the Tools/homepage proxy),
// calendar subscription, browser push (against a local fake push service), ledger budgets and CSV, A-share alerts,
// the shared header/icon assets on each host, and the account-deletion preview of the new tables.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),http=require('node:http');
const CAL=process.env.CHECK_CALENDAR||'http://calendar-check:3000',LAB=process.env.CHECK_LAB||'http://lab-check:3000',VERSION=process.env.CHECK_VERSION;
const PUSH_PORT=Number(process.env.PUSH_FAKE_PORT||4012);
let count=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);count++;};const ok=(v,m)=>{assert.ok(v,m);count++;};
// Each signed-in suite uses its own documentation address for Calendar's login limit.
async function login(name,ip){
 let cookie='';const take=r=>{const v=r.headers.getSetCookie();if(v.length)cookie=v.map(x=>x.split(';')[0]).join('; ');};
 const call=async(base,route,{method='GET',body,headers={},host}={})=>{
  if(host)return raw(base,route,{cookie,host});
  const r=await fetch(base+route,{method,redirect:'manual',headers:{cookie,'x-forwarded-for':ip,...headers},body});take(r);return r;
 };
 const token=async()=>(await (await call(CAL,'/api/csrf')).json()).token;
 const r=await call(CAL,'/api/login',{method:'POST',headers:{origin:'https://calendar.garyhub.uk','x-csrf-token':await token(),'content-type':'application/json'},body:JSON.stringify({username:'check_'+name,password:'Synthetic-Only-2026!'})});
 eq(r.status,200,'login '+name);
 const write=async(route,method,data,extra={})=>call(CAL,route,{method,headers:{origin:'https://calendar.garyhub.uk','x-csrf-token':await token(),'content-type':'application/json',...extra},body:JSON.stringify(data)});
 const me=(await (await call(CAL,'/api/me')).json()).user;
 return {call,write,me,get cookie(){return cookie;}};
}
// Lab decides the site by the Host header, which fetch() cannot set.
function raw(base,path,{cookie,host}={}){
 return new Promise((resolve,reject)=>{const url=new URL(base);
  const req=http.request({hostname:url.hostname,port:url.port,path,headers:{...(host?{host}:{}),...(cookie?{cookie}:{})}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const body=Buffer.concat(chunks);resolve({status:res.statusCode,headers:res.headers,body,text:()=>body.toString('utf8'),json:()=>JSON.parse(body.toString('utf8'))});});});
  req.on('error',reject);req.end();});
}
function localDate(timezone){const p=new Intl.DateTimeFormat('en-CA',{timeZone:timezone||'Etc/UTC',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const v=t=>p.find(x=>x.type===t).value;return v('year')+'-'+v('month')+'-'+v('day');}
// A fake push service: records what Calendar sends and answers with the status the test chooses.
const pushes=[];let pushReply=201;
const fake=http.createServer((req,res)=>{const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{pushes.push({url:req.url,headers:req.headers,body:Buffer.concat(chunks)});res.writeHead(pushReply);res.end();});});
(async()=>{
 assert.match(VERSION,/^\d+\.\d+\.\d+\.\d+$/);
 await new Promise(r=>fake.listen(PUSH_PORT,'127.0.0.1',r));
 // Guests: every new API needs a session, on Calendar and through the Tools/homepage proxy.
 for(const route of ['/api/hub/today','/api/hub/search?q=x','/api/calendar-feed','/api/push/status','/api/ledger/budgets?month=2026-11&currency=USD','/api/stocks/alerts'])eq((await fetch(CAL+route)).status,401,'guest '+route);
 for(const host of ['garyhub.uk','tools.garyhub.uk'])for(const route of ['/api/hub/today','/api/hub/search?q=x'])eq((await raw(LAB,route,{host})).status,401,'guest '+host+route);
 eq((await fetch(CAL+'/feed/'+'A'.repeat(32)+'.ics')).status,404);
 // Shared assets on each host.
 for(const [base,host,routes] of [[LAB,'garyhub.uk',['/brand.css','/hub-nav.js','/hub-search.js','/hub-search.css','/home/today.js','/manifest.webmanifest','/favicon.svg','/icons/icon-192.png','/icons/icon-512.png','/icons/icon-maskable-512.png','/icons/apple-touch-icon.png','/developer/public-card.json']],
  [LAB,'tools.garyhub.uk',['/brand.css','/hub-nav.js','/hub-search.js','/hub-search.css','/manifest.webmanifest','/favicon.svg','/icons/icon-192.png']],
  [LAB,'sites.garyhub.uk',['/favicon.svg']],
  [CAL,null,['/brand.css','/hub-nav.js','/hub-search.js','/hub-search.css','/manifest.webmanifest','/favicon.svg','/icons/icon-192.png','/sw.js','/calendar-extras.js','/ledger/budget.js','/tools-catalog.js']]]){
  for(const route of routes){const r=await raw(base,route,{host});eq(r.status,200,(host||'calendar')+route);
   const type=String(r.headers['content-type']);
   if(route.endsWith('.webmanifest'))ok(/^application\/manifest\+json/.test(type),'manifest type '+type);
   if(route.endsWith('.png'))ok(type.startsWith('image/png')&&r.body.subarray(1,4).toString()==='PNG','png '+route);
   if(route.endsWith('.js'))ok(/javascript/.test(type),'js type '+route);}
 }
 const manifest=(await raw(LAB,'/manifest.webmanifest',{host:'garyhub.uk'})).json();eq(manifest.icons.length,3);eq(manifest.display,'standalone');
 const card=(await raw(LAB,'/developer/public-card.json',{host:'garyhub.uk'})).json();ok(card.name&&Array.isArray(card.links)&&card.links.every(l=>/^https:\/\//.test(l.url)),'public card');
 ok(!/ZJUI|Zhejiang|Urbana|2028|Multi-UAV|Intelligent Assistants/i.test(JSON.stringify(card)),'public card carries no private profile text');
 for(const route of ['/tools-dock.js','/hub.js','/home/../server.cjs','/developer/../developer-profile.json'])eq((await raw(LAB,route,{host:'garyhub.uk'})).status,404,'homepage host '+route);
 eq((await raw(LAB,'/brand.css',{host:'sites.garyhub.uk'})).status,404);
 const home=(await raw(LAB,'/',{host:'garyhub.uk'})).text();
 for(const marker of ['data-gh-header','data-gh-menu','id="today"','/home/today.js?v='+VERSION,'/hub-search.js?v='+VERSION,'rel="manifest"','class="brand gh-brand"'])ok(home.includes(marker),'homepage '+marker);
 const tools=(await raw(LAB,'/',{host:'tools.garyhub.uk'})).text();
 for(const marker of ['data-gh-header','data-gh-menu data-gh-search-host','class="brand gh-brand"','/hub-nav.js?v='+VERSION])ok(tools.includes(marker),'tools '+marker);
 const loginPage=await (await fetch(CAL+'/login/')).text();ok(loginPage.includes('id="loginReason"')&&loginPage.includes('class="brand gh-brand"'),'login page');

 const alice=await login('alice','192.0.2.251'),bob=await login('bob','192.0.2.252');
 const tz=(await (await alice.call(CAL,'/api/account/email')).json()).timezone,today=localDate(tz);
 const marker='Orbit review '+crypto.randomBytes(3).toString('hex');
 eq((await alice.write('/api/tasks','POST',{title:marker,start_date:today,end_date:today,note:'search me 100%',status:'todo'})).status,201);
 // Today: Calendar and the homepage proxy (which adds the Study Hub summary) answer for the same account.
 const direct=await (await alice.call(CAL,'/api/hub/today')).json();
 eq(direct.accountId,alice.me.id);eq(direct.date,today);ok(direct.tasks.items.some(t=>t.title===marker),'today lists the new task');
 for(const host of ['garyhub.uk','tools.garyhub.uk']){const r=await raw(LAB,'/api/hub/today',{host,cookie:alice.cookie});eq(r.status,200);const v=r.json();eq(v.accountId,alice.me.id);ok(v.study&&typeof v.study.total==='number','study summary via '+host);}
 const bobToday=await (await bob.call(CAL,'/api/hub/today')).json();ok(!bobToday.tasks.items.some(t=>t.title===marker),'today is per account');
 // Search: own records only, through both entry points.
 const found=(await raw(LAB,'/api/hub/search?q='+encodeURIComponent(marker),{host:'tools.garyhub.uk',cookie:alice.cookie})).json();
 ok(found.groups.some(g=>g.type==='task'&&g.items.some(i=>i.title===marker)),'search finds the task');
 eq((await (await bob.call(CAL,'/api/hub/search?q='+encodeURIComponent(marker))).json()).groups,[]);
 eq((await alice.call(CAL,'/api/hub/search?q=')).status,400);
 ok((await (await alice.call(CAL,'/api/hub/search?q=100%25')).json()).groups.some(g=>g.type==='task'),'literal % search');

 // Calendar subscription.
 eq((await alice.write('/api/calendar-feed','POST',{accountId:bob.me.id})).status,409);
 eq((await alice.write('/api/calendar-feed','POST',{accountId:alice.me.id},{origin:'https://example.org'})).status,403);
 eq((await alice.write('/api/calendar-feed','POST',{accountId:alice.me.id},{'x-csrf-token':'0'.repeat(64)})).status,403);
 const feed=await (await alice.write('/api/calendar-feed','POST',{accountId:alice.me.id})).json();
 const path=new URL(feed.url).pathname;ok(/^\/feed\/[A-Za-z0-9_-]{32}\.ics$/.test(path),'feed address');
 const ics=await fetch(CAL+path);eq(ics.status,200);ok(/^text\/calendar/.test(ics.headers.get('content-type')),'ics type');eq(ics.headers.get('cache-control'),'private, no-store');
 const body=await ics.text();ok(body.startsWith('BEGIN:VCALENDAR\r\n')&&body.includes('SUMMARY:'+marker),'ics content');
 const rotated=await (await alice.write('/api/calendar-feed','POST',{accountId:alice.me.id})).json();eq((await fetch(CAL+path)).status,404);
 eq((await alice.write('/api/calendar-feed','DELETE',{accountId:alice.me.id})).status,200);eq((await fetch(CAL+new URL(rotated.url).pathname)).status,404);

 // Push: the subscription keys come from a real P-256 key pair, and the fake service receives an encrypted message.
 const status=await (await alice.call(CAL,'/api/push/status')).json();eq(Buffer.from(status.publicKey,'base64url').length,65);
 const browser=crypto.createECDH('prime256v1');browser.generateKeys();
 const keys={p256dh:browser.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')};
 const endpoint='http://127.0.0.1:'+PUSH_PORT+'/push/alice';
 eq((await alice.write('/api/push/subscribe','POST',{accountId:alice.me.id,subscription:{endpoint:'https://example.org/push',keys}})).status,400);
 eq((await alice.write('/api/push/subscribe','POST',{accountId:alice.me.id,subscription:{endpoint,keys}})).status,201);
 eq((await (await alice.write('/api/push/test','POST',{accountId:alice.me.id})).json()),{sent:1,failed:0,removed:0});
 eq(pushes.length,1);eq(pushes[0].url,'/push/alice');eq(pushes[0].headers['content-encoding'],'aes128gcm');ok(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/.test(pushes[0].headers.authorization),'vapid header');
 eq(pushes[0].body.readUInt32BE(16),4096);
 eq((await (await bob.write('/api/push/test','POST',{accountId:bob.me.id})).json()),{sent:0,failed:0,removed:0});
 pushReply=410;eq((await (await alice.write('/api/push/test','POST',{accountId:alice.me.id})).json()),{sent:0,failed:0,removed:1});
 eq((await (await alice.call(CAL,'/api/push/status')).json()).devices,0);

 // Ledger budgets and CSV follow the ledger's account header.
 const headers={'x-garyhub-user':String(alice.me.id)};
 eq((await alice.call(CAL,'/api/ledger/budgets?month=2026-11&currency=USD')).status,409);
 eq((await alice.write('/api/ledger/budgets/food','PUT',{amount:'120.50',currency:'USD'},headers)).status,200);
 eq((await alice.write('/api/ledger/budgets/salary','PUT',{amount:'1',currency:'USD'},headers)).status,400);
 const budgets=await (await alice.call(CAL,'/api/ledger/budgets?month='+today.slice(0,7)+'&currency=USD',{headers})).json();
 eq(budgets.accountId,alice.me.id);ok(budgets.items.some(i=>i.categoryId==='food'&&i.amount==='120.50'),'budget saved');
 eq((await (await bob.call(CAL,'/api/ledger/budgets?month='+today.slice(0,7)+'&currency=USD',{headers:{'x-garyhub-user':String(bob.me.id)}})).json()).items.length,0);
 const trend=await alice.call(CAL,'/api/ledger/trend?month='+today.slice(0,7)+'&currency=USD&months=6',{headers});eq(trend.status,200);
 const csv=await alice.call(CAL,'/api/ledger/export?from=1900-01-01&to=2199-12-31',{headers});eq(csv.status,200);ok(/^text\/csv/.test(csv.headers.get('content-type')),'csv type');
 ok(Buffer.from(await csv.arrayBuffer()).toString('utf8').startsWith('﻿date,kind,category,currency,amount,notes,refund_of,id'),'csv header');

 // A-share alerts: subscribers only, behind the same gate as quotes.
 eq((await alice.call(CAL,'/api/stocks/alerts')).status,403);eq((await alice.call(CAL,'/stocks/alerts.js')).status,403);
 eq((await bob.call(CAL,'/stocks/alerts.js')).status,200);
 const alerts=await (await bob.call(CAL,'/api/stocks/alerts')).json();eq(alerts.accountId,bob.me.id);eq(alerts.limit,3);
 eq((await bob.write('/api/stocks/alerts','POST',{accountId:bob.me.id,symbol:'sz300033',direction:'above',price:'1.5'},{origin:'https://example.org'})).status,403);
 eq((await bob.write('/api/stocks/alerts','POST',{accountId:alice.me.id,symbol:'sz300033',direction:'above',price:'1.5'})).status,409);
 eq((await bob.write('/api/stocks/alerts','POST',{accountId:bob.me.id,symbol:'xx1',direction:'above',price:'1.5'})).status,422);
 const added=await (await bob.write('/api/stocks/alerts','POST',{accountId:bob.me.id,symbol:'sz300033',name:'同花顺',direction:'above',price:'999999'})).json();eq(added.alerts.length,1);
 eq((await bob.write('/api/stocks/alerts/'+added.alerts[0].id,'DELETE',{accountId:alice.me.id})).status,409);
 // The new per-account tables are part of the account deletion preview.
 const admin=await login('admin','192.0.2.254');
 const preview=await (await admin.call(CAL,'/api/hub/admin/users/'+bob.me.id+'/deletion-preview')).json();
 eq(preview.counts.stock_alerts,1);
 eq((await bob.write('/api/stocks/alerts/'+added.alerts[0].id,'DELETE',{accountId:bob.me.id})).status,200);
 fake.close();
 console.log('EXTRAS HTTP PASS: '+count+' assertions; today and search per account on both services, calendar subscription rotation, encrypted push and removal, budgets and CSV, subscriber-only alerts, shared header and icon assets, deletion preview.');
})().catch(error=>{console.error(error);fake.close();process.exit(1);});
