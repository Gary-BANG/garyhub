'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),http=require('node:http');
function redirect(path,host){return new Promise((resolve,reject)=>{http.get(LAB+path,{headers:{host}},r=>{r.resume();resolve({status:r.statusCode,location:r.headers.location});}).on('error',reject);});}
const CAL=process.env.CHECK_CALENDAR,LAB=process.env.CHECK_LAB;let count=0,serial=180;
const eq=(a,b,m)=>{assert.equal(a,b,m);count++;};
function client(){let cookie='',ip='203.0.113.'+(++serial);return async function call(route,method='GET',body,{uid,csrf=true,origin='https://calendar.garyhub.uk',base=CAL,host}={}){const update=r=>{if(r.headers.getSetCookie().length)cookie=r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');};let token;if(method!=='GET'&&csrf){const r=await fetch(base+'/api/csrf',{headers:{cookie,'x-forwarded-for':ip}});update(r);token=(await r.json()).token;}const r=await fetch(base+route,{redirect:'manual',method,headers:{cookie,origin,'x-forwarded-for':ip,...(host?{host}:{}),'content-type':'application/json',...(token?{'x-csrf-token':token}:{}),...(uid?{'x-garyhub-user':String(uid)}:{})},body:body?JSON.stringify(body):undefined});update(r);const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data,location:r.headers.get('location')};};}
const plan=(extra={})=>({name:'Synthetic rent',amount:'30.00',currency:'CNY',period:'monthly',categoryId:'housing',notes:'Synthetic only',active:true,requestId:crypto.randomUUID(),...extra});
(async()=>{
const alice=client(),bob=client(),admin=client(),guest=client(),victim=client();
for(const [c,name]of [[alice,'alice'],[bob,'bob'],[admin,'admin'],[victim,'victim']])eq((await c('/api/login','POST',{username:'check_'+name,password:'Synthetic-Only-2026!'})).status,200);
const A=(route,method='GET',body,options={})=>alice('/api/ledger/'+route,method,body,{uid:2,...options});
eq((await guest('/api/ledger/fixed?currency=CNY')).status,401);
eq((await A('fixed','POST',plan(),{csrf:false})).status,403);eq((await A('fixed','POST',plan(),{origin:'https://evil.example'})).status,403);eq((await A('fixed','POST',plan(),{uid:3})).status,409);
const before=(await A('entries?from=2026-01-01&to=2026-12-31&currency=CNY')).data.total;
const monthly=plan(),m=await A('fixed','POST',monthly);eq(m.status,201);const id=m.data.item.id;eq((await A('fixed','POST',monthly)).data.item.id,id);
const yearly=await A('fixed','POST',plan({name:'Synthetic annual fee',amount:'120',period:'yearly'}));eq(yearly.status,201);
let stats=await A('fixed?currency=CNY');eq(stats.data.summary.annual,48000);eq(stats.data.summary.monthly,4000);eq(stats.data.activeCount,2);
eq((await A('entries?from=2026-01-01&to=2026-12-31&currency=CNY')).data.total,before,'estimates never create actual transactions');
eq((await bob('/api/ledger/fixed?currency=CNY','GET',undefined,{uid:3})).data.items.length,0);
eq((await admin('/api/ledger/fixed?currency=CNY&userId=2','GET',undefined,{uid:1})).data.items.length,0,'admin cannot read another owner');
eq((await bob('/api/ledger/fixed/'+id,'PUT',{...monthly,revision:1},{uid:3})).status,404);
const payment={date:'2026-10-19',revision:1,requestId:crypto.randomUUID()};const [first,repeat]=await Promise.all([A('fixed/'+id+'/post','POST',payment),A('fixed/'+id+'/post','POST',payment)]);eq([first.status,repeat.status].sort().join(','),'200,201');eq(first.data.item.id,repeat.data.item.id);const entry=first.data.item;
eq((await A('fixed/'+id+'/post','POST',{...payment,requestId:crypto.randomUUID()})).data.duplicate,true);
eq((await A('fixed/'+id+'/post','POST',{...payment,date:'2026-02-30',requestId:crypto.randomUUID()})).status,400);
eq((await A('fixed/'+id,'PUT',{...monthly,amount:'99',revision:1})).status,200);eq((await A('fixed/'+id,'PUT',{...monthly,revision:1})).status,409);
let actual=await A('entries?from=2026-10-19&to=2026-10-19&currency=CNY');eq(actual.data.items.find(x=>x.id===entry.id).amount,'30.00','fixed edits preserve actual payment amount');
eq((await A('fixed/'+id+'/post','POST',{...payment,date:'2026-11-19',requestId:crypto.randomUUID()})).status,409,'stale form cannot create a payment');
const next=await A('fixed/'+id+'/post','POST',{date:'2026-11-19',revision:2,amount:'98.50',requestId:crypto.randomUUID()});eq(next.status,201);eq(next.data.item.amount,'98.50');
eq((await A('fixed/'+id,'PUT',{...monthly,amount:'99',active:false,revision:2})).status,200);stats=await A('fixed?currency=CNY');eq(stats.data.summary.annual,12000);eq(stats.data.activeCount,1);
eq((await A('fixed/'+id+'/post','POST',{date:'2026-12-19',revision:3,requestId:crypto.randomUUID()})).status,400);
eq((await A('fixed/'+id,'DELETE',{revision:3})).status,200);eq((await A('entries?from=2026-10-19&to=2026-10-19&currency=CNY')).data.items.find(x=>x.id===entry.id).amount,'30.00');
for(const currency of ['USD','CAD','HKD'])eq((await A('fixed','POST',plan({amount:'1.00',currency}))).status,201);
stats=await A('fixed?currency=USD');assert(stats.data.summary.annual>0);count++;
for(const bad of [{amount:'0'},{amount:'NaN'},{amount:'1.001'},{currency:'EUR'},{period:'weekly'},{name:''},{notes:'x'.repeat(801)},{categoryId:'salary'}])eq((await A('fixed','POST',plan(bad))).status,400);
const posted=await A('fixed/'+yearly.data.item.id+'/post','POST',{date:'2026-09-01',revision:1,requestId:crypto.randomUUID()});eq(posted.status,201);eq((await A('entries/'+posted.data.item.id,'DELETE',{revision:1})).status,200);eq((await A('fixed/'+yearly.data.item.id+'/post','POST',{date:'2026-09-01',revision:1,requestId:crypto.randomUUID()})).status,201,'deleted actual payment can be recorded again');
// Distinct same-date transactions can still be opened directly past the first page.
for(let i=0;i<16;i++)await A('entries','POST',{kind:'expense',amount:'1',currency:'CNY',date:'2026-10-19',categoryId:'food',notes:'Synthetic pagination',requestId:crypto.randomUUID()});
actual=await A('entries?from=2026-10-19&to=2026-10-19&currency=CNY&entry='+entry.id);assert(actual.data.items.some(x=>x.id===entry.id));count++;
for(const [host,path,target]of [['tools.garyhub.uk','/login.html?next=%2Fstudy%2F%3Fcourse%3Dx','https://tools.garyhub.uk/study/?course=x'],['lab.garyhub.uk','/lab/','https://lab.garyhub.uk/lab/'],['garyhub.uk','/login.html?next=%2F','https://garyhub.uk/']]){const response=await redirect(path,host);eq(response.status,302);eq(new URL(response.location).origin,'https://calendar.garyhub.uk');eq(new URL(response.location).searchParams.get('next'),target);}
const unsafe=await redirect('/login.html?next=https%3A%2F%2Fevil.example','tools.garyhub.uk');eq(new URL(unsafe.location).searchParams.get('next'),'https://calendar.garyhub.uk/');
// One session from Calendar is accepted by Tools/Lab, then logout invalidates both.
eq((await alice('/api/me','GET',undefined,{base:LAB})).status,200);eq((await alice('/api/logout','POST',{})).status,200);eq((await alice('/api/me','GET',undefined,{base:LAB})).status,401);
// Leave owned fixtures for the separate full account-deletion acceptance test.
for(const [c,uid]of [[victim,5],[bob,3]]){const f=await c('/api/ledger/fixed','POST',plan({name:'Synthetic account cleanup'}),{uid});eq(f.status,201);eq((await c('/api/ledger/fixed/'+f.data.item.id+'/post','POST',{date:'2026-08-01',revision:1,requestId:crypto.randomUUID()},{uid})).status,201);}
console.log('FIXED/AUTH PASS: '+count+' assertions; independent estimates, 4 currencies, ownership, CSRF, concurrency, snapshots, disable/delete retention, repost, links and centralized/shared login.');
})().catch(e=>{console.error(e.stack);process.exit(1)});
