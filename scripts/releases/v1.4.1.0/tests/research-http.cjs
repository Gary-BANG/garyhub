'use strict';
// Uses synthetic accounts only. Also runs unchanged inside the installer test containers.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const CAL=process.env.CHECK_CALENDAR||'http://calendar-check:3000',LAB=process.env.CHECK_LAB,version=process.env.CHECK_VERSION||'1.4.1.0',uuid=()=>crypto.randomUUID();let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
async function client(username,uid){
 let cookie='',csrf;const track=r=>{if(r.headers.getSetCookie().length)cookie=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');};
 async function call(path,method='GET',body,options={}){const r=await fetch(CAL+path,{method,headers:{cookie,origin:options.origin||'https://calendar.garyhub.uk','x-garyhub-user':String(options.uid??uid),'content-type':'application/json',...(options.noCsrf?{}:{'x-csrf-token':csrf||''})},body:body===undefined?undefined:JSON.stringify(body)});track(r);return {status:r.status,data:await r.json()};}
 const r=await fetch(CAL+'/api/csrf');track(r);csrf=(await r.json()).token;
 eq((await call('/api/login','POST',{username:'check_'+username,password:'Synthetic-Only-2026!'})).status,200);csrf=(await call('/api/csrf')).data.token;return call;
}
(async()=>{
 eq((await fetch(CAL+'/api/research')).status,401);
 const html=await(await fetch(CAL+'/research/')).text();assert.ok(html.includes('data-research-release="'+version+'"'));checks++;
 for(const path of ['/research/format.js','/research/research.js','/research/research.css']){const r=await fetch(CAL+path);eq(r.status,200);assert.match(r.headers.get('content-type'),path.endsWith('.css')?/text\/css/:/javascript/);checks++;}
 if(LAB){const html=await(await fetch(LAB+'/')).text();assert.ok(html.includes('data-tool="research"')&&html.includes('https://calendar.garyhub.uk/research/'));checks++;}
 const alice=await client('alice',2),bob=await client('bob',3),admin=await client('admin',1),pid=uuid(),path='/api/research/'+pid;
 eq((await alice('/api/research','POST',{accountId:2,id:pid,name:'HTTP research',description:'Synthetic test only'},{noCsrf:true})).status,403);
 eq((await alice('/api/research','POST',{accountId:2,id:pid,name:'HTTP research'},{origin:'https://evil.example'})).status,403);
 eq((await alice('/api/research','POST',{accountId:2,id:pid,name:'HTTP research'},{uid:3})).status,409);
 let r=await alice('/api/research','POST',{accountId:2,id:pid,name:'HTTP research',description:'Synthetic test only'});eq(r.status,201);eq(r.data.revision,0);
 eq((await bob(path)).status,404);eq((await admin(path)).status,404);eq((await bob('/api/research')).data.projects.some(p=>p.id===pid),false);
 const entry={id:uuid(),english:['inference','model inference'],chinese:['推理','推断'],definition:'从输入计算模型输出。',usage:'Use inference for model execution in this project.',examples:[{en:'We measure inference time on the CPU.',zh:'我们测量 CPU 上的推理时间。'}],tags:['部署'],source:'',status:'verified'};
 let req={accountId:2,revision:0,requestId:uuid(),name:'HTTP research',description:'Synthetic test only',entries:[entry]};
 r=await alice(path,'PUT',req);eq(r.status,200);eq(r.data.revision,1);eq(r.data.entries[0].manual,true);
 eq((await alice(path,'PUT',req)).data.duplicate,true);eq((await alice(path,'PUT',{...req,name:'Changed'})).status,409);
 eq((await alice(path,'PUT',{...req,requestId:uuid()})).status,409);
 eq((await alice(path,'PUT',{...req,accountId:3,revision:1,requestId:uuid()})).status,409);
 const document={format:'garyhub-research-v1',research:{id:pid,name:'HTTP research',description:''},entries:[{...entry,usage:'Updated import',english:['inference','prediction']} ]};
 let imp={accountId:2,revision:1,requestId:uuid(),document,choices:{}};
 r=await alice(path+'/import/preview','POST',imp);eq(r.status,200);eq(r.data.summary.conflicts,1);eq((await alice(path)).data.revision,1);
 eq((await alice(path+'/import','POST',imp)).status,409);eq((await alice(path)).data.entries[0].usage,entry.usage);
 imp.choices={'0':{action:'merge',targetId:entry.id}};r=await alice(path+'/import/preview','POST',imp);eq(r.data.summary.conflicts,0);
 r=await alice(path+'/import','POST',imp);eq(r.status,200);eq(r.data.revision,2);eq(r.data.canUndo,true);eq(r.data.entries[0].usage,entry.usage);assert.ok(r.data.entries[0].english.includes('prediction'));checks++;
 eq((await alice(path+'/import','POST',imp)).data.duplicate,true);eq((await alice(path)).data.revision,2);
 r=await alice(path+'/undo','POST',{accountId:2,revision:2,requestId:uuid()});eq(r.status,200);eq(r.data.entries[0].english,entry.english);eq(r.data.canUndo,false);eq(r.data.revision,3);
 imp={...imp,revision:3,requestId:uuid(),document:{...document,entries:[entry]},choices:{}};r=await alice(path+'/import','POST',imp);eq(r.data.summary.skipped,1);eq(r.data.revision,4);
 req={accountId:2,revision:4,requestId:uuid(),name:'Renamed research',description:'Edited',entries:r.data.entries};r=await alice(path,'PUT',req);eq(r.status,200);eq(r.data.canUndo,false);
 eq((await alice(path+'/undo','POST',{accountId:2,revision:5,requestId:uuid()})).status,409);
 eq((await alice(path+'/import','POST',{...imp,revision:5,requestId:uuid(),document:{...document,entries:[{...entry,examples:[]}]}})).status,400);
 const read=await alice(path);eq(read.data.name,'Renamed research');eq(read.data.entries[0].examples[0].zh,entry.examples[0].zh);
 const preview=await admin('/api/hub/admin/users/2/deletion-preview');eq(preview.status,200);assert.ok(preview.data.counts.research_projects>=1);checks++;
 // A concurrent edit must have exactly one winner.
 const edit={accountId:2,revision:5,name:read.data.name,description:'Parallel edit',entries:read.data.entries};const results=await Promise.all([alice(path,'PUT',{...edit,requestId:uuid()}),alice(path,'PUT',{...edit,requestId:uuid()})]);eq(results.map(r=>r.status).sort(),[200,409]);
 eq((await bob(path+'/import/preview','POST',{accountId:3,revision:6,requestId:uuid(),document})).status,404);
 const other=uuid();eq((await bob('/api/research','POST',{accountId:3,id:other,name:'Bob isolated',description:''})).status,201);eq((await alice('/api/research')).data.projects.some(p=>p.id===other),false);
 const users=(await admin('/api/hub/admin/users')).data,versionBob=users.find(u=>u.id===3).auth_version;
 eq((await admin('/api/hub/admin/users/3/status','PUT',{actorId:1,expectedVersion:versionBob,enabled:false})).status,200);eq((await bob('/api/research')).status,401);eq((await bob('/api/research/'+other,'PUT',{accountId:3,revision:0,requestId:uuid(),name:'Stale session',description:'',entries:[]})).status,403);eq((await admin('/api/hub/admin/users/3/status','PUT',{actorId:1,expectedVersion:versionBob+1,enabled:true})).status,200);
 console.log('RESEARCH HTTP PASS: '+checks+' assertions; auth, Origin, CSRF, private ownership, revisions, manual edits, conflict decisions, import retry, undo and account deletion preview.');
})().catch(e=>{console.error(e);process.exit(1);});
