'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const CAL=process.env.CHECK_CALENDAR||'http://calendar-check:3000';let checks=0;
const eq=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
async function client(name,id){
 let cookie='';const update=r=>{const c=r.headers.getSetCookie();if(c.length)cookie=c.map(x=>x.split(';')[0]).join('; ');};
 async function call(path,method='GET',data,opts={}){
  let token;if(method!=='GET'&&opts.csrf!==false){const r=await fetch(CAL+'/api/csrf',{headers:{cookie}});update(r);token=(await r.json()).token;}
  const r=await fetch(CAL+path,{method,headers:{cookie,origin:opts.origin||'https://calendar.garyhub.uk','content-type':'application/json','x-garyhub-user':String(opts.user??id),...(token?{'x-csrf-token':token}:{})},...(method==='GET'?{}:{body:JSON.stringify(data||{})})});update(r);
  return {status:r.status,data:await r.json(),headers:r.headers};
 }
 if(name)eq((await call('/api/login','POST',{username:'check_'+name,password:'Synthetic-Only-2026!'})).status,200);
 return call;
}
const item=(title,text='Long note\n中文 / "quotes" / \\ slash')=>({title,done:false,points:[{text,done:false}]});
(async()=>{
 const alice=await client('alice',2),bob=await client('bob',3),admin=await client('admin',1),guest=await client(null,0);
 const before=(await alice('/api/todos')).data,otherBefore=(await bob('/api/todos')).data;
 const p={accountId:2,revision:before.revision,document:{format:'garyhub-todos-v1',todos:[item('Imported A'),item('Imported B'),item('Imported A')]},skipDuplicates:true};
 eq((await guest('/api/todos/import','POST',p)).status,401);eq((await alice('/api/todos/import/preview','POST',p,{csrf:false})).status,403);
 eq((await alice('/api/todos/import/preview','POST',p,{origin:'https://evil.example'})).status,403);
 eq((await alice('/api/todos/import/preview','POST',{...p,accountId:3})).status,409);eq((await alice('/api/todos/import/preview','POST',p,{user:3})).status,409);
 const preview=await alice('/api/todos/import/preview','POST',p);eq(preview.status,200);eq(preview.data.summary.addedCount,2);eq(preview.data.summary.skippedCount,1);
 eq((await alice('/api/todos')).data,before); // Preview is read-only.
 const request={...p,requestId:crypto.randomUUID()},saved=await alice('/api/todos/import','POST',request);
 eq(saved.status,200);eq(saved.data.todos.slice(0,before.todos.length),before.todos);eq(saved.data.todos.slice(-2).map(t=>t.title),['Imported A','Imported B']);
 eq(saved.data.import.addedCount,2);eq(saved.headers.get('cache-control'),'no-store');eq(saved.data.revision,before.revision+1);
 eq(saved.data.todos.at(-2).points[0].text,p.document.todos[0].points[0].text);
 const replay=await alice('/api/todos/import','POST',request);eq(replay.status,200);eq(replay.data.duplicate,true);eq(replay.data.revision,saved.data.revision);eq(replay.data.import,saved.data.import);
 eq((await alice('/api/todos/import','POST',{...request,document:[item('changed')]})).status,409);
 eq((await alice('/api/todos/import','POST',{...request,requestId:crypto.randomUUID()})).status,409);
 const dup=await alice('/api/todos/import/preview','POST',{...p,revision:saved.data.revision});eq(dup.data.summary.addedCount,0);eq(dup.data.summary.skippedCount,3);
 const latest=()=>alice('/api/todos');
 const invalid={...p,revision:saved.data.revision,document:[item('Valid but must not be added'),item('Invalid','x'.repeat(1001))]};
 const rejected=await alice('/api/todos/import','POST',{...invalid,requestId:crypto.randomUUID()});eq(rejected.status,400);eq(rejected.data.path,'todos[1].points[0].text');eq((await latest()).data.todos,saved.data.todos);
 const current=saved.data.todos.at(-2),draft={format:'garyhub-todos-v1',todos:[{...current,title:'Imported draft',done:true,points:[{...current.points[0],done:true}]}]};
 const importedDraft=await alice('/api/todos/import','POST',{accountId:2,revision:saved.data.revision,requestId:crypto.randomUUID(),document:draft});eq(importedDraft.status,200);
 const added=importedDraft.data.todos.at(-1);eq(added.done,true);eq(added.points[0].done,true);assert.notEqual(added.id,current.id);checks++;assert.notEqual(added.points[0].id,current.points[0].id);checks++;
 const r=importedDraft.data.revision;
 const race=await Promise.all(['Concurrent A','Concurrent B'].map(title=>alice('/api/todos/import','POST',{accountId:2,revision:r,requestId:crypto.randomUUID(),document:[item(title)]})));
 eq(race.map(x=>x.status).sort(),[200,409]);
 const afterRace=(await latest()).data;eq(afterRace.todos.length,importedDraft.data.todos.length+1);
 // A later successful save invalidates an old import retry instead of re-appending it.
 const put={accountId:2,revision:afterRace.revision,requestId:crypto.randomUUID(),todos:afterRace.todos};eq((await alice('/api/todos','PUT',put)).status,200);
 eq((await alice('/api/todos/import','POST',request)).status,409);
 eq((await bob('/api/todos')).data,otherBefore);eq((await admin('/api/todos?userId=2')).data.todos,[]);
 const row=(await bob('/api/todos')).data;
 const full=Array.from({length:300},(_,i)=>({id:crypto.randomUUID(),title:'Capacity '+i,done:false,points:[]}));
 eq((await bob('/api/todos','PUT',{accountId:3,revision:row.revision,requestId:crypto.randomUUID(),todos:full})).status,200);
 const br=(await bob('/api/todos')).data;
 const over=await bob('/api/todos/import','POST',{accountId:3,revision:br.revision,requestId:crypto.randomUUID(),document:[item('over limit')]});eq(over.status,400);eq(over.data.code,'capacity');eq((await bob('/api/todos')).data,br);
 eq((await bob('/api/todos','PUT',{accountId:3,revision:br.revision,requestId:crypto.randomUUID(),todos:otherBefore.todos})).status,200);
 console.log('TODO IMPORT HTTP PASS: '+checks+' assertions; atomic append, preview, drafts, deduplication, request replay, conflicts, limits, CSRF and account isolation.');
})().catch(e=>{console.error(e);process.exit(1)});
