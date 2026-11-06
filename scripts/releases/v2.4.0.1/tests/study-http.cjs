'use strict';
const assert=require('node:assert/strict'),{fixture}=require('./study-fixture.cjs');
const CAL=process.env.CHECK_CALENDAR||'http://calendar-check:3000',LAB=process.env.CHECK_LAB||'http://lab-check:3000';let n=0;
const eq=(a,b)=>{assert.deepEqual(a,b);n++;};
async function session(name){let cookie='';const take=r=>{const c=r.headers.getSetCookie();if(c.length)cookie=c.map(s=>s.split(';')[0]).join('; ');};let r=await fetch(CAL+'/api/csrf');take(r);const token=(await r.json()).token;r=await fetch(CAL+'/api/login',{method:'POST',headers:{cookie,origin:'https://calendar.garyhub.uk','x-csrf-token':token,'content-type':'application/json'},body:JSON.stringify({username:'check_'+name,password:'Synthetic-Only-2026!'})});take(r);eq(r.status,200);const call=(path,options={})=>fetch(LAB+path,{...options,headers:{cookie,...options.headers}});const csrf=await(await call('/api/academic/csrf')).json();return {call,headers:{origin:'https://tools.garyhub.uk','x-csrf-token':csrf.token,'content-type':'application/json'}};}
(async()=>{
 eq((await fetch(LAB+'/api/academic/state')).status,401);
 eq((await (await fetch(LAB+'/academic/release.json')).json()).version,'v'+process.env.CHECK_VERSION);
 for(const route of ['/grades/','/study/']){const r=await fetch(LAB+route);eq(r.status,200);eq((await r.text()).split('companion/boot.js?v='+process.env.CHECK_VERSION).length-1,1);}
 const alice=await session('alice'),bob=await session('bob');
 const old=await(await alice.call('/api/academic/state')).json();
 const personal=fixture();Object.assign(personal.settings,{studyTheme:'warm',headingSize:38,fontSize:21});
 let r=await alice.call('/api/academic/state',{method:'PUT',headers:alice.headers,body:JSON.stringify({accountId:2,revision:old.revision,state:personal})});eq(r.status,200);
 const saved=await(await alice.call('/api/academic/state')).json();eq(saved.user.id,2);eq(saved.state.settings.studyTheme,'warm');eq(saved.state.settings.headingSize,38);eq(saved.state.settings.fontSize,21);
 eq((await alice.call('/api/academic/state',{method:'PUT',headers:alice.headers,body:JSON.stringify({accountId:2,revision:old.revision,state:personal})})).status,409);
 for(const settings of [{headingSize:2},{studyTheme:'unknown'}]){const invalid=fixture();Object.assign(invalid.settings,settings);eq((await alice.call('/api/academic/state',{method:'PUT',headers:alice.headers,body:JSON.stringify({accountId:2,revision:saved.revision,state:invalid})})).status,400);}
 eq((await(await bob.call('/api/academic/state')).json()).state.settings.studyTheme,undefined);eq(saved.state.courses[0].lectures[0].path,'notes/01.md');eq(saved.state.courses[0].assets.length,1);
 eq((await(await bob.call('/api/academic/state')).json()).state.courses.length,0);
 eq((await alice.call('/api/academic/state',{method:'PUT',headers:alice.headers,body:JSON.stringify({accountId:3,revision:saved.revision,state:fixture()})})).status,409);
 eq((await alice.call('/api/academic/state',{method:'PUT',headers:{...alice.headers,'x-csrf-token':'0'.repeat(64)},body:JSON.stringify({accountId:2,revision:saved.revision,state:fixture()})})).status,403);
 const html=await(await alice.call('/study/')).text();assert.ok(html.includes('app.js?v='+process.env.CHECK_VERSION));n++;
 for(const route of ['/academic/app.js','/useful/markdown-viewer/sections.mjs','/useful/markdown-viewer/study-document.mjs']){const result=await alice.call(route);eq(result.status,200);assert.match(result.headers.get('content-type'),/javascript/);n++;}
 eq((await fetch(LAB+'/api/academic/preferences')).status,401);
 const prefs=await(await alice.call('/api/academic/preferences')).json();
 eq(Object.keys(prefs).sort(),['accountId','fontSize','headingSize','revision','studyTheme']);eq(prefs.studyTheme,'warm');
 const write=(data,headers=alice.headers)=>alice.call('/api/academic/preferences',{method:'PUT',headers,body:JSON.stringify({...prefs,headingSize:41,...data})});
 eq((await write({accountId:3})).status,409);eq((await write({},{...alice.headers,'x-csrf-token':'bad'})).status,403);
 eq((await write({},{...alice.headers,origin:'https://invalid.example'})).status,403);
 eq((await write({fontSize:60})).status,400);eq((await write({studyTheme:'other'})).status,400);
 eq((await write({})).status,200);eq((await write({})).status,409);
 const after=await(await alice.call('/api/academic/state')).json();eq(after.state.courses,saved.state.courses);eq(after.state.settings.headingSize,41);
 eq((await(await bob.call('/api/academic/preferences')).json()).studyTheme,'auto');
 const target=await alice.call('/useful/markdown-viewer/?studyAccount=2&studyCourse=course-a&studyLecture=lecture-a');eq(target.status,200);assert.ok((await target.text()).includes('id="outlinePanel"'));n++;
 console.log('STUDY HTTP PASS: '+n+' assertions; selected source, images, session, account isolation, CSRF and asset routes.');
})().catch(e=>{console.error(e);process.exit(1)});
