'use strict';
// Real HTTP checks for v2.4.1.6 on both services: the notification centre (/api/hub/notify) on Calendar and through the
// Tools/homepage proxy — login, origin and CSRF gates, labelled push devices removable only by their owner, the calendar
// subscription created and turned off from the settings page — the ordered-list preferences (homepage cards and entries,
// tools pins, hidden and recent tools), notification channels, quiet hours and default reminder values, the homepage
// budget card, the pages that apply them, and the account-deletion preview of the new table.
const assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto');
const CAL=process.env.CHECK_CALENDAR||'http://calendar-check:3000',LAB=process.env.CHECK_LAB||'http://lab-check:3000',VERSION=process.env.CHECK_VERSION;
const PUSH='http://127.0.0.1:4012/push/';
let count=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);count++;};const ok=(v,m)=>{assert.ok(v,m);count++;};
// Lab decides the site by the Host header, which fetch() cannot set.
function raw(base,path,{method='GET',host,cookie,headers={},body}={}){
 return new Promise((resolve,reject)=>{const url=new URL(base);
  const req=http.request({hostname:url.hostname,port:url.port,path,method,headers:{...(host?{host}:{}),...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{}),...headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const text=Buffer.concat(chunks).toString('utf8');resolve({status:res.statusCode,headers:res.headers,text,json:()=>JSON.parse(text)});});});
  req.on('error',reject);req.end(body);});
}
// Each signed-in suite uses its own documentation address for Calendar's login limit.
async function login(name,ip){
 let cookie='';const take=r=>{const v=r.headers.getSetCookie();if(v.length)cookie=v.map(x=>x.split(';')[0]).join('; ');};
 let r=await fetch(CAL+'/api/csrf',{headers:{'x-forwarded-for':ip}});take(r);const {token}=await r.json();
 r=await fetch(CAL+'/api/login',{method:'POST',headers:{'x-forwarded-for':ip,cookie,origin:'https://calendar.garyhub.uk','x-csrf-token':token,'content-type':'application/json'},body:JSON.stringify({username:'check_'+name,password:'Synthetic-Only-2026!'})});
 if(r.status!==200)throw Error('login '+name+' '+r.status);take(r);
 const me=(await (await fetch(CAL+'/api/me',{headers:{cookie}})).json()).user;
 const csrf=async()=>(await (await fetch(CAL+'/api/csrf',{headers:{cookie}})).json()).token;
 const write=async(path,method,body,{origin='https://calendar.garyhub.uk',token,headers={}}={})=>fetch(CAL+path,{method,headers:{cookie,origin,'x-csrf-token':token||await csrf(),'content-type':'application/json',...headers},body:JSON.stringify(body)});
 // Through the Tools proxy, as the settings page does it.
 const tools=async(path,method='GET',body)=>{const token=method==='GET'?null:(await raw(LAB,'/api/csrf',{host:'tools.garyhub.uk',cookie})).json().token;
  return raw(LAB,path,{host:'tools.garyhub.uk',cookie,method,headers:token?{origin:'https://tools.garyhub.uk','x-csrf-token':token}:{},body:body?JSON.stringify(body):undefined});};
 return {get cookie(){return cookie;},me,csrf,write,tools,prefs:async set=>write('/api/hub/preferences','PUT',{accountId:me.id,set})};
}
function subscription(endpoint){
 const ecdh=crypto.createECDH('prime256v1');ecdh.generateKeys();
 return {endpoint,keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};
}
(async()=>{
 assert.match(VERSION,/^\d+\.\d+\.\d+\.\d+$/);
 // Guests: every host refuses the notification centre; writes need a trusted origin and the page token.
 eq((await fetch(CAL+'/api/hub/notify')).status,401);
 for(const host of ['garyhub.uk','tools.garyhub.uk'])eq((await raw(LAB,'/api/hub/notify',{host})).status,401,'guest notify via '+host);
 for(const path of ['/api/hub/notify/feed','/api/hub/notify/devices/1/remove'])eq((await fetch(CAL+path,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,403,'origin gate '+path);
 ok([403,405].includes((await raw(LAB,'/api/hub/notify/feed',{host:'tools.garyhub.uk',method:'DELETE'})).status),'the proxy refuses DELETE');

 const alice=await login('alice','192.0.2.236'),bob=await login('bob','192.0.2.237');
 let state=(await alice.tools('/api/hub/notify')).json();
 eq(state.accountId,alice.me.id);ok(typeof state.mail==='boolean'&&typeof state.email.verified==='boolean','e-mail status');
 ok(state.email.address===null||/^.\*\*\*@/.test(state.email.address),'e-mail address is masked');
 ok(Array.isArray(state.devices)&&typeof state.feed.enabled==='boolean','devices and subscription');
 eq((await raw(LAB,'/api/hub/notify',{host:'garyhub.uk',cookie:alice.cookie})).json().accountId,alice.me.id);

 // A push device subscribed on Calendar is listed with a browser/system label and can be removed by its owner only.
 const before=state.devices.length,chrome='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
 eq((await alice.write('/api/push/subscribe','POST',{accountId:alice.me.id,subscription:subscription(PUSH+'notify-alice')},{headers:{'user-agent':chrome}})).status,201);
 eq((await bob.write('/api/push/subscribe','POST',{accountId:bob.me.id,subscription:subscription(PUSH+'notify-bob')})).status,201);
 state=(await alice.tools('/api/hub/notify')).json();eq(state.devices.length,before+1);
 const mine=state.devices.at(-1);eq(mine.label,'Chrome · Windows');eq(mine.service,'other');
 const bobs=(await bob.tools('/api/hub/notify')).json().devices.at(-1);
 eq((await alice.tools('/api/hub/notify/devices/'+mine.id+'/remove','POST',{accountId:bob.me.id})).status,409);
 eq((await alice.tools('/api/hub/notify/devices/'+bobs.id+'/remove','POST',{accountId:alice.me.id})).status,404,'another account’s device');
 eq((await alice.write('/api/hub/notify/devices/'+mine.id+'/remove','POST',{accountId:alice.me.id},{origin:'https://example.org'})).status,403);
 let r=await alice.tools('/api/hub/notify/devices/'+mine.id+'/remove','POST',{accountId:alice.me.id});eq(r.status,200);
 eq(r.json().devices.length,before);eq((await bob.tools('/api/hub/notify')).json().devices.some(d=>d.id===bobs.id),true);
 eq((await bob.write('/api/push/unsubscribe','POST',{accountId:bob.me.id,endpoint:PUSH+'notify-bob'})).status,200);

 // The calendar subscription from the settings page: shown once, serves iCalendar, and stops when turned off.
 eq((await alice.tools('/api/hub/notify/feed','POST',{accountId:alice.me.id,action:'rotate'})).status,400);
 r=await alice.tools('/api/hub/notify/feed','POST',{accountId:alice.me.id,action:'create'});eq(r.status,201);
 const created=r.json();eq(created.feed.enabled,true);const path=new URL(created.feedUrl).pathname;ok(/^\/feed\/[A-Za-z0-9_-]{32}\.ics$/.test(path),'feed address');
 const ics=await fetch(CAL+path);eq(ics.status,200);ok((await ics.text()).startsWith('BEGIN:VCALENDAR\r\n'),'ics content');
 eq((await alice.tools('/api/hub/notify')).json().feedUrl,undefined);
 r=await alice.tools('/api/hub/notify/feed','POST',{accountId:alice.me.id,action:'off'});eq(r.status,200);eq(r.json().feed.enabled,false);
 eq((await fetch(CAL+path)).status,404);

 // Ordered-list preferences, channels, quiet hours and the default reminder: fixed values, saved per account.
 for(const set of [{'home.cards':['schedule','schedule']},{'home.cards':['weather']},{'home.portals':'tools'},{'tools.pinned':['grades','study','lab','research','calendar','files','stocks','reading','status']},
   {'tools.recent':['nope']},{'notify.updates.inApp':false},{'notify.alerts.email':'yes'},{'push.quietFrom':'22:15'},{'tasks.reminder':'hourly'},{'tasks.reminderTime1':'25:00'}])
  eq((await alice.prefs(set)).status,400,JSON.stringify(set));
 const chosen={'home.cards':['budget','schedule'],'home.portals':['study','tools','calendar','sites'],'tools.pinned':['totp','markdown'],'tools.hidden':['lab'],'tools.recent':['pdf','study'],
  'notify.updates.push':true,'notify.reminders.inApp':true,'notify.reminders.email':false,'notify.alerts.email':true,'push.quietFrom':'22:00','push.quietTo':'07:30','tasks.reminder':'twice','tasks.reminderTime1':'08:00','tasks.reminderTime2':'20:30'};
 eq((await alice.prefs(chosen)).status,200);
 const shown=(await raw(LAB,'/api/hub/preferences',{host:'garyhub.uk',cookie:alice.cookie})).json().prefs;
 eq(Object.fromEntries(Object.keys(chosen).map(k=>[k,shown[k]])),chosen);
 eq((await raw(LAB,'/api/hub/preferences',{host:'tools.garyhub.uk',cookie:bob.cookie})).json().prefs['home.cards'],null,'bob unaffected');
 // Reset the channels so later suites see the defaults.
 eq((await alice.prefs(Object.fromEntries(Object.keys(chosen).map(k=>[k,null])))).status,200);

 // The homepage budget card: the ledger's "all spending" budget and this month's spending, through both hosts.
 const ledger={headers:{'x-garyhub-user':String(alice.me.id)}};
 eq((await alice.write('/api/ledger/budgets/*','PUT',{amount:'300.00',currency:'USD'},ledger)).status,200);
 for(const host of ['garyhub.uk','tools.garyhub.uk']){const today=(await raw(LAB,'/api/hub/today',{host,cookie:alice.cookie})).json();
  eq([today.budget.currency,today.budget.amount,today.budget.month],['USD',30000,today.date.slice(0,7)],'budget via '+host);ok(today.budget.spent===null||Number.isInteger(today.budget.spent),'budget spending');}
 eq((await (await fetch(CAL+'/api/hub/today',{headers:{cookie:bob.cookie}})).json()).budget,null,'no budget for bob');

 // The pages carry what applies the choices.
 const homepage=(await raw(LAB,'/',{host:'garyhub.uk'})).text;ok(homepage.includes('/home/home.css?v='+VERSION)&&homepage.includes('/home/today.js?v='+VERSION),'homepage assets');
 ok((await raw(LAB,'/home/today.js?v='+VERSION,{host:'garyhub.uk'})).text.includes("'home.cards'"),'today reads the chosen cards');
 const toolsPage=(await raw(LAB,'/',{host:'tools.garyhub.uk'})).text;ok(toolsPage.includes('/tools-dock.css?v='+VERSION)&&toolsPage.includes('/tools-dock.js?v='+VERSION),'tools assets');
 ok((await raw(LAB,'/tools-dock.js?v='+VERSION,{host:'tools.garyhub.uk'})).text.includes("'tools.recent'"),'tools desk reads pins and recent use');
 const settings=(await raw(LAB,'/personalize/settings.js?v='+VERSION,{host:'tools.garyhub.uk'})).text;ok(settings.includes('notify/devices/')&&settings.includes("'tools.pinned'")&&settings.includes("'home.portals'"),'settings controls');
 ok((await raw(LAB,'/personalize/',{host:'tools.garyhub.uk',cookie:alice.cookie})).text.includes('/tools-catalog.js?v='+VERSION),'settings page loads the tools catalogue');
 ok((await raw(CAL,'/unified.js')).text.includes('"tasks.reminder"'),'calendar form reads the default reminder');
 ok((await raw(CAL,'/calendar-extras.js?v='+VERSION)).text.includes('personalize/#notify'),'calendar points to the notification settings');

 // The new table is part of the account-deletion preview.
 const admin=await login('admin','192.0.2.238');
 const preview=await (await fetch(CAL+'/api/hub/admin/users/'+alice.me.id+'/deletion-preview',{headers:{cookie:admin.cookie}})).json();
 ok('notify_deliveries' in preview.counts,'deletion preview lists notify_deliveries');
 console.log('NOTIFY HTTP PASS: '+count+' assertions; notification centre on Calendar and through the proxies, labelled devices and owner-only removal, subscription from settings, list/channel/quiet/reminder preferences, budget card, page assets and deletion preview.');
})().catch(error=>{console.error(error);process.exit(1);});
