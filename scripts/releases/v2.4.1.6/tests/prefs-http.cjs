'use strict';
// Real HTTP checks for v2.4.1.4, extended in v2.4.1.5 (accent, density, week start, date format, calendar view, code font, formula size)
// and v2.4.1.6 (33 keys: homepage cards, tools pins, notification channels, quiet hours, default reminder): account preferences on Calendar and through the Tools/homepage proxy (login, origin,
// CSRF, account, value checks, atomic merges, time zone), the Study Hub reading settings, the shared hub-prefs.js on
// every host, the settings page and its login gate, and the account-deletion preview of the new table.
const assert=require('node:assert/strict'),http=require('node:http');
const CAL=process.env.CHECK_CALENDAR||'http://calendar-check:3000',LAB=process.env.CHECK_LAB||'http://lab-check:3000',VERSION=process.env.CHECK_VERSION;
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
 r=await fetch(CAL+'/api/login',{method:'POST',headers:{'x-forwarded-for':ip,cookie,origin:'https://calendar.garyhub.uk','x-csrf-token':token,'content-type':'application/json'},body:JSON.stringify({username:'check_'+name,password:'Synthetic-Only-2026!'})});take(r);eq(r.status,200,'login '+name);
 const csrf=async()=>(await (await fetch(CAL+'/api/csrf',{headers:{cookie}})).json()).token;
 const me=(await (await fetch(CAL+'/api/me',{headers:{cookie}})).json()).user;
 const put=async(set,{accountId=me.id,origin='https://calendar.garyhub.uk',token}={})=>fetch(CAL+'/api/hub/preferences',{method:'PUT',headers:{cookie,origin,'x-csrf-token':token||await csrf(),'content-type':'application/json'},body:JSON.stringify({accountId,set})});
 return {get cookie(){return cookie;},me,csrf,put,get:async()=>(await fetch(CAL+'/api/hub/preferences',{headers:{cookie}})).json()};
}
(async()=>{
 assert.match(VERSION,/^\d+\.\d+\.\d+\.\d+$/);
 // Guests.
 eq((await fetch(CAL+'/api/hub/preferences')).status,401);
 for(const host of ['garyhub.uk','tools.garyhub.uk'])eq((await raw(LAB,'/api/hub/preferences',{host})).status,401,'guest via '+host);
 eq((await fetch(CAL+'/api/hub/preferences',{method:'PUT',headers:{'content-type':'application/json'},body:'{}'})).status,403);
 // The shared script is the same file on every host, and pages load it in <head> (before theme.js on Calendar pages).
 const scripts=[];
 for(const [base,host] of [[CAL,null],[LAB,'tools.garyhub.uk'],[LAB,'garyhub.uk']]){const r=await raw(base,'/hub-prefs.js?v='+VERSION,{host});eq(r.status,200,'hub-prefs on '+(host||'calendar'));ok(/javascript/.test(r.headers['content-type']));scripts.push(r.text);}
 eq(new Set(scripts).size,1);ok(scripts[0].includes('window.GaryHubTheme')&&scripts[0].includes('/api/hub/preferences'),'hub-prefs content');
 eq((await raw(LAB,'/hub-prefs.js',{host:'sites.garyhub.uk'})).status,404);
 const tag='<script src="/hub-prefs.js?v='+VERSION+'"></script>';
 for(const [base,host,path] of [[LAB,'garyhub.uk','/'],[LAB,'garyhub.uk','/developer/'],[LAB,'tools.garyhub.uk','/'],[LAB,'tools.garyhub.uk','/useful/markdown-viewer/'],[CAL,null,'/login/'],[CAL,null,'/']]){
  const page=(await raw(base,path,{host})).text;ok(page.indexOf(tag)>0&&page.indexOf(tag)<page.indexOf('</head>'),'hub-prefs in head of '+(host||'calendar')+path);
  if(base===CAL)ok(page.indexOf(tag)<page.indexOf('<script src="/theme.js"></script>'),'hub-prefs before theme.js on '+path);
 }
 // The settings page keeps its login gate.
 const gate=await raw(LAB,'/personalize/',{host:'tools.garyhub.uk'});eq(gate.status,302);ok(gate.headers.location.startsWith('https://calendar.garyhub.uk/login/?next='),'settings login gate');

 const alice=await login('alice','192.0.2.246'),bob=await login('bob','192.0.2.247');
 const empty=await alice.get();eq(empty.accountId,alice.me.id);eq(empty.revision,0);eq(Object.keys(empty.prefs).length,33);ok(Object.values(empty.prefs).every(v=>v===null),'defaults are unset');
 // Origin, CSRF, account and value checks.
 eq((await alice.put({language:'en'},{origin:'https://example.org'})).status,403);
 eq((await alice.put({language:'en'},{token:'0'.repeat(64)})).status,403);
 eq((await alice.put({language:'en'},{accountId:bob.me.id})).status,409);
 for(const set of [{language:'fr'},{'appearance.theme':'neon'},{'companion.off':'1'},{'tools.view':'list'},{'nope':1},{'region.timezone':'Mars/Olympus'},{},{'appearance.accent':'red'},{'region.weekStart':'friday'},{'region.dateFormat':'mm.dd'},{'calendar.view':'year'},{'appearance.density':'dense'}])eq((await alice.put(set)).status,400,JSON.stringify(set));
 let r=await alice.put({'appearance.theme':'dark',language:'en','companion.char':'milu'});eq(r.status,200);eq((await r.json()).revision,1);
 // Through the Tools proxy: same session, the proxy's origin and the Calendar CSRF token.
 const labCsrf=(await raw(LAB,'/api/csrf',{host:'tools.garyhub.uk',cookie:alice.cookie})).json().token;
 r=await raw(LAB,'/api/hub/preferences',{host:'tools.garyhub.uk',cookie:alice.cookie,method:'PUT',headers:{origin:'https://tools.garyhub.uk','x-csrf-token':labCsrf},body:JSON.stringify({accountId:alice.me.id,set:{'tools.view':'dock','appearance.sky':'calm'}})});
 eq(r.status,200,'save through the Tools proxy');
 r=await raw(LAB,'/api/hub/preferences',{host:'tools.garyhub.uk',cookie:alice.cookie,method:'PUT',headers:{origin:'https://evil.example','x-csrf-token':labCsrf},body:JSON.stringify({accountId:alice.me.id,set:{'tools.view':'grid'}})});
 eq(r.status,403,'foreign origin through the proxy');
 const home=(await raw(LAB,'/api/hub/preferences',{host:'garyhub.uk',cookie:alice.cookie})).json();
 eq([home.prefs['appearance.theme'],home.prefs['appearance.sky'],home.prefs['tools.view'],home.prefs.language],['dark','calm','dock','en']);
 // Saves of different keys at the same moment all survive.
 await Promise.all([alice.put({'ledger.currency':'USD'}),alice.put({'companion.mode':'gravity'}),alice.put({'companion.open':'min'})]);
 let state=await alice.get();eq([state.prefs['ledger.currency'],state.prefs['companion.mode'],state.prefs['companion.open'],state.prefs['tools.view']],['USD','gravity','min','dock']);
 // null resets one key; the time zone is the account's (used by reminders and Today).
 r=await alice.put({'appearance.theme':null,'region.timezone':'Asia/Tokyo'});state=await r.json();
 eq(state.prefs['appearance.theme'],null);eq(state.timezone,'Asia/Tokyo');
 eq((await (await fetch(CAL+'/api/account/email',{headers:{cookie:alice.cookie}})).json()).timezone,'Asia/Tokyo');
 eq((await (await fetch(CAL+'/api/hub/today',{headers:{cookie:alice.cookie}})).json()).date,new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo'}).format(new Date()));
 // v2.4.1.5 display settings: saved per account and returned to every host.
 r=await alice.put({'appearance.accent':'teal','appearance.density':'compact','region.weekStart':'sunday','region.dateFormat':'zh','calendar.view':'week'});eq(r.status,200);
 const shown=(await raw(LAB,'/api/hub/preferences',{host:'tools.garyhub.uk',cookie:alice.cookie})).json().prefs;
 eq([shown['appearance.accent'],shown['appearance.density'],shown['region.weekStart'],shown['region.dateFormat'],shown['calendar.view']],['teal','compact','sunday','zh','week']);
 eq((await (await alice.put({'appearance.accent':null})).json()).prefs['appearance.accent'],null);
 // The pages carry what applies them: shared accent and density rules, calendar week start and view, and the Study Hub opts out of the accent.
 const brand=(await raw(CAL,'/brand.css?v='+VERSION)).text;ok(brand.includes('html[data-gh-accent=teal]')&&brand.includes('html[data-gh-density=compact]'),'accent and density rules');
 eq((await raw(LAB,'/brand.css?v='+VERSION,{host:'tools.garyhub.uk'})).text,brand);
 const calendarJs=(await raw(CAL,'/calendar-page.js')).text;ok(calendarJs.includes("value('region.weekStart')==='sunday'?0:1")&&calendarJs.includes("value('calendar.view')"),'calendar reads week start and view');
 ok((await raw(LAB,'/study/',{host:'tools.garyhub.uk',cookie:alice.cookie})).text.includes('data-gh-accent-off'),'Study Hub opts out of the accent');
 // Another account sees only its own.
 const other=await bob.get();eq(other.revision,0);ok(Object.values(other.prefs).every(v=>v===null),'bob unaffected');
 // Study Hub reading settings now include line height and width.
 const study=(await raw(LAB,'/api/academic/preferences',{host:'tools.garyhub.uk',cookie:alice.cookie})).json();
 ok(typeof study.lineHeight==='number'&&Number.isInteger(study.readerWidth),'study reading settings');
 const studyPut=(extra)=>raw(LAB,'/api/academic/preferences',{host:'tools.garyhub.uk',cookie:alice.cookie,method:'PUT',headers:{origin:'https://tools.garyhub.uk','x-csrf-token':labCsrf},
  body:JSON.stringify({accountId:alice.me.id,revision:study.revision,studyTheme:'warm',fontSize:19,headingSize:34,...extra})});
 eq((await studyPut({lineHeight:3})).status,400);eq((await studyPut({readerWidth:500})).status,400);eq((await studyPut({readerWidth:850.5})).status,400);
 eq((await studyPut({codeFont:'papyrus'})).status,400);eq((await studyPut({mathScale:2})).status,400);
 eq((await studyPut({lineHeight:1.65,readerWidth:850,codeFont:'courier',mathScale:1.2})).status,200);
 const saved=(await raw(LAB,'/api/academic/preferences',{host:'tools.garyhub.uk',cookie:alice.cookie})).json();
 eq([saved.studyTheme,saved.fontSize,saved.headingSize,saved.lineHeight,saved.readerWidth,saved.codeFont,saved.mathScale],['warm',19,34,1.65,850,'courier',1.2]);
 // Signed in, the settings page itself.
 const page=(await raw(LAB,'/personalize/',{host:'tools.garyhub.uk',cookie:alice.cookie})).text;
 for(const marker of ['id="settings"','/personalize/settings.js?v='+VERSION,'data-gh-header','<script src="/hub-prefs.js?v='+VERSION+'"></script>'])ok(page.includes(marker),'settings page '+marker);
 // The new table is part of the account deletion preview.
 const admin=await login('admin','192.0.2.248');
 const preview=await (await fetch(CAL+'/api/hub/admin/users/'+alice.me.id+'/deletion-preview',{headers:{cookie:admin.cookie}})).json();
 eq(preview.counts.user_preferences,1);
 console.log('PREFS HTTP PASS: '+count+' assertions; preferences per account on Calendar and through the proxy, origin/CSRF/value checks, atomic merges, time zone, display settings, study reading settings incl. code font and formula size, hub-prefs on every host, settings page and deletion preview.');
})().catch(error=>{console.error(error);process.exit(1);});
