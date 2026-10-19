'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const CAL=process.env.CHECK_CALENDAR||'http://calendar-check:3000';let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
async function client(name,id){let cookie='';const update=r=>{const c=r.headers.getSetCookie();if(c.length)cookie=c.map(x=>x.split(';')[0]).join('; ');};async function call(path,method='GET',data,opts={}){let token;if(method!=='GET'&&opts.csrf!==false){const r=await fetch(CAL+'/api/csrf',{headers:{cookie}});update(r);token=(await r.json()).token;}const r=await fetch(CAL+path,{method,headers:{cookie,origin:opts.origin||'https://calendar.garyhub.uk','content-type':'application/json','x-garyhub-user':String(opts.user??id),...(token?{'x-csrf-token':token}:{})},...(method==='GET'?{}:{body:JSON.stringify(data||{})})});update(r);return {status:r.status,data:await r.json(),headers:r.headers};}if(name)eq((await call('/api/login','POST',{username:'check_'+name,password:'Synthetic-Only-2026!'})).status,200);return call;}
const todo=title=>({id:crypto.randomUUID(),title,done:false,points:[]});
(async()=>{
 const alice=await client('alice',2),bob=await client('bob',3),guest=await client(null,0),victim=await client('victim',5),admin=await client('admin',1);
 eq((await guest('/api/todos')).status,401);eq((await alice('/api/todos')).data.todos,[]);
 const a=todo('已保存'),b=todo('Second Todo');a.points.push({id:crypto.randomUUID(),text:'<script>alert(1)</script> 中文笔记',done:false});
 const value={accountId:2,revision:0,requestId:crypto.randomUUID(),todos:[a,b]};
 eq((await alice('/api/todos','PUT',value,{csrf:false})).status,403);eq((await alice('/api/todos','PUT',value,{origin:'https://evil.example'})).status,403);
 eq((await alice('/api/todos','PUT',{...value,accountId:3})).status,409);eq((await alice('/api/todos','PUT',value,{user:3})).status,409);
 const saved=await alice('/api/todos','PUT',value);eq(saved.status,200);eq(saved.data.revision,1);eq(saved.headers.get('cache-control'),'no-store');
 const duplicate=await alice('/api/todos','PUT',value);eq(duplicate.data.revision,1);eq(duplicate.data.duplicate,true);
 eq((await alice('/api/todos','PUT',{...value,todos:[]})).status,409);
 eq((await bob('/api/todos')).data.todos,[]);eq((await admin('/api/todos?userId=2')).data.todos,[]);
 eq((await alice('/api/todos','PUT',{...value,requestId:crypto.randomUUID()})).status,409);
 const second={accountId:2,revision:1,requestId:crypto.randomUUID(),todos:[b,{...a,done:true,points:[{...a.points[0],done:true}]}]};
 eq((await alice('/api/todos','PUT',second)).status,200);const read=(await alice('/api/todos')).data;eq(read.todos.map(t=>t.id),[b.id,a.id]);eq(read.todos[1].points[0].done,true);eq(read.todos[1].points[0].text,a.points[0].text);
 const invalid=await alice('/api/todos','PUT',{...second,revision:2,requestId:crypto.randomUUID(),todos:[{...a,title:' '} ]});eq(invalid.status,400);
 eq((await alice('/api/todos','PUT',{...second,revision:2,requestId:crypto.randomUUID(),todos:[{...a,points:[...a.points,...a.points]}]})).status,400);
 const race=await Promise.all([alice('/api/todos','PUT',{accountId:2,revision:2,requestId:crypto.randomUUID(),todos:[a]}),alice('/api/todos','PUT',{accountId:2,revision:2,requestId:crypto.randomUUID(),todos:[b]})]);eq(race.map(x=>x.status).sort(),[200,409]);
 const again=await client('alice',2);eq((await again('/api/todos')).data.revision,3);
 const initial=await victim('/api/todos');eq((await victim('/api/todos','PUT',{accountId:5,revision:initial.data.revision,requestId:crypto.randomUUID(),todos:[todo('Remove with account')]})).status,200);
 console.log('TODO HTTP PASS: '+checks+' assertions; ordering, points, completion, isolation, CSRF, conflicts and retry deduplication.');
})().catch(e=>{console.error(e);process.exit(1)});
