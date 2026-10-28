'use strict';
const assert=require('node:assert/strict'),{fixture}=require('./study-fixture.cjs');
const CAL=process.env.CHECK_CALENDAR||'http://calendar-check:3000',LAB=process.env.CHECK_LAB||'http://lab-check:3000';let n=0;
const eq=(a,b)=>{assert.deepEqual(a,b);n++;};
async function session(name){let cookie='';const take=r=>{const c=r.headers.getSetCookie();if(c.length)cookie=c.map(s=>s.split(';')[0]).join('; ');};let r=await fetch(CAL+'/api/csrf');take(r);const token=(await r.json()).token;r=await fetch(CAL+'/api/login',{method:'POST',headers:{cookie,origin:'https://calendar.garyhub.uk','x-csrf-token':token,'content-type':'application/json'},body:JSON.stringify({username:'check_'+name,password:'Synthetic-Only-2026!'})});take(r);eq(r.status,200);const call=(path,options={})=>fetch(LAB+path,{...options,headers:{cookie,...options.headers}});const csrf=await(await call('/api/academic/csrf')).json();return {call,headers:{origin:'https://tools.garyhub.uk','x-csrf-token':csrf.token,'content-type':'application/json'}};}
(async()=>{
 eq((await fetch(LAB+'/api/academic/state')).status,401);
 const alice=await session('alice'),bob=await session('bob');
 const old=await(await alice.call('/api/academic/state')).json();
 let r=await alice.call('/api/academic/state',{method:'PUT',headers:alice.headers,body:JSON.stringify({accountId:2,revision:old.revision,state:fixture()})});eq(r.status,200);
 const saved=await(await alice.call('/api/academic/state')).json();eq(saved.user.id,2);eq(saved.state.courses[0].lectures[0].path,'notes/01.md');eq(saved.state.courses[0].assets.length,1);
 eq((await(await bob.call('/api/academic/state')).json()).state.courses.length,0);
 eq((await alice.call('/api/academic/state',{method:'PUT',headers:alice.headers,body:JSON.stringify({accountId:3,revision:saved.revision,state:fixture()})})).status,409);
 eq((await alice.call('/api/academic/state',{method:'PUT',headers:{...alice.headers,'x-csrf-token':'0'.repeat(64)},body:JSON.stringify({accountId:2,revision:saved.revision,state:fixture()})})).status,403);
 const html=await(await alice.call('/study/')).text();assert.ok(html.includes('app.js?v=1.4.3.1'));n++;
 for(const route of ['/academic/app.js','/useful/markdown-viewer/sections.mjs','/useful/markdown-viewer/study-document.mjs']){const result=await alice.call(route);eq(result.status,200);assert.match(result.headers.get('content-type'),/javascript/);n++;}
 const target=await alice.call('/useful/markdown-viewer/?studyAccount=2&studyCourse=course-a&studyLecture=lecture-a');eq(target.status,200);assert.ok((await target.text()).includes('id="outlinePanel"'));n++;
 console.log('STUDY HTTP PASS: '+n+' assertions; selected source, images, session, account isolation, CSRF and asset routes.');
})().catch(e=>{console.error(e);process.exit(1)});
