'use strict';
const assert=require('node:assert/strict');
const CAL=process.env.CHECK_CALENDAR||'http://calendar-check:3000',LAB=process.env.CHECK_LAB||'http://lab-check:3000';let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
async function client(name,id){let cookie='';const update=r=>{if(r.headers.getSetCookie().length)cookie=r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');};
 async function call(path,method='GET',data,opts={}){let token;if(method!=='GET'&&opts.csrf!==false){const r=await fetch(CAL+'/api/csrf',{headers:{cookie}});update(r);token=(await r.json()).token;}
 const r=await fetch((path.startsWith('/api/lab/')||path.startsWith('/useful/')?LAB:CAL)+path,{method,redirect:'manual',headers:{cookie,origin:opts.origin||'https://lab.garyhub.uk','content-type':'application/json',...(token?{'x-csrf-token':token}:{})},...(method==='GET'?{}:{body:JSON.stringify(data)})});update(r);const text=await r.text();let value;try{value=JSON.parse(text);}catch{value=text;}return {status:r.status,data:value,headers:r.headers};}
 if(name)eq((await call('/api/login','POST',{username:'check_'+name,password:'Synthetic-Only-2026!'})).status,200);return call;}
(async()=>{
 const admin=await client('admin',1),alice=await client('alice',2),bob=await client('bob',3),guest=await client(null,0);
 const original=await Promise.all([admin,alice,bob].map(c=>c('/api/lab/state')));
 const template={id:'distribution-fixture',version:1,title:'Synthetic rotation',assignment:'Homework 1.1',category:'Rotations',similarity_group:'synthetic',statement_en:'Find x',reference_code:'x = 1',explanation_md:'Synthetic solution',formula_latex:'x=1',inputs:{},answers:[{name:'x',shape:[],rtol:0,atol:0,expected:1}],image:'images/fixture.png'};
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvXcAAAAASUVORK5CYII=';
 const empty=()=>({custom:[],images:{},instances:[],history:[],current:null});
 async function save(c,id,state){const v=(await c('/api/lab/state')).data;eq((await c('/api/lab/state','PUT',{accountId:id,revision:v.revision,state})).status,200);}
 try{
 const source={...empty(),custom:[template,{...template,id:'other-group',assignment:'Homework 1.2'}],images:{'images/fixture.png':png},history:[{code:'ADMIN_PRIVATE_HISTORY'}],current:{code:'ADMIN_PRIVATE_DRAFT'}};
 const existing={...empty(),custom:[{...template,image:undefined,title:'Recipient own problem'}],instances:[{code:'RECIPIENT_CODE'}],history:[{code:'RECIPIENT_HISTORY'}],current:{code:'RECIPIENT_DRAFT'}};
 delete existing.custom[0].image;await save(admin,1,source);await save(alice,2,existing);await save(bob,3,empty());
 eq((await guest('/api/lab/distribution/options')).status,401);eq((await alice('/api/lab/distribution/options')).status,403);
 const options=(await admin('/api/lab/distribution/options')).data;eq(options.groups.map(x=>x.assignment),['Homework 1.1','Homework 1.2']);eq(Object.keys(options.users[0]).sort(),['id','role','username']);
 const input={accountId:1,sourceRevision:options.sourceRevision,assignment:'Homework 1.1',recipientIds:[2,3]};
 eq((await admin('/api/lab/distribution/preview','POST',input,{csrf:false})).status,403);eq((await admin('/api/lab/distribution/preview','POST',input,{origin:'https://evil.invalid'})).status,403);
 eq((await admin('/api/lab/distribution/preview','POST',{...input,accountId:2})).status,409);
 eq((await admin('/api/lab/distribution/preview','POST',{...input,recipientIds:[1]})).status,400);
 const preview=(await admin('/api/lab/distribution/preview','POST',input));eq(preview.status,200);eq(preview.data.results.map(x=>[x.added,x.renamed]),[[1,1],[1,0]]);eq((await alice('/api/lab/state')).data.state,existing);
 await save(bob,3,{...empty(),history:[{code:'NEW_DRAFT_HISTORY'}]});
 eq((await admin('/api/lab/distribution/send','POST',{...input,previewId:preview.data.previewId})).status,409);eq((await alice('/api/lab/state')).data.state,existing);
 const fresh=(await admin('/api/lab/distribution/preview','POST',input)).data;
 const result=await admin('/api/lab/distribution/send','POST',{...input,previewId:fresh.previewId});eq(result.status,200);eq(result.data.complete,true);
 const a=(await alice('/api/lab/state')).data;eq(a.state.custom.length,2);eq(a.state.custom[0],existing.custom[0]);eq(a.state.current,existing.current);eq(a.state.history,existing.history);eq(a.state.instances,existing.instances);eq(a.state.images[a.state.custom[1].image],png);assert.notEqual(a.state.custom[1].id,template.id);checks++;
 eq((await bob('/api/lab/state')).data.state.history,[{code:'NEW_DRAFT_HISTORY'}]);eq((await admin('/api/lab/state')).data.state,source);
 const repeat=(await admin('/api/lab/distribution/preview','POST',input)).data;eq(repeat.results.map(x=>[x.added,x.skipped]),[[0,1],[0,1]]);eq((await admin('/api/lab/distribution/send','POST',{...input,previewId:repeat.previewId})).data.complete,true);eq((await alice('/api/lab/state')).data.revision,a.revision);
 eq((await alice('/api/lab/state','PUT',{accountId:2,revision:a.revision-1,state:existing})).status,409);
 source.custom[0].title='Changed admin template';await save(admin,1,source);eq((await alice('/api/lab/state')).data.state.custom[1].title,'Synthetic rotation');
 for(const tool of ['image-eraser','markdown-viewer','pdf-gray']){eq((await guest('/useful/'+tool+'/')).status,302);const page=await alice('/useful/'+tool+'/');eq(page.status,200);assert.ok(page.headers.get('content-security-policy').includes("connect-src 'self'"));checks++;}
 }finally{for(const [i,c] of [admin,alice,bob].entries())await save(c,i+1,original[i].data.state||empty());}
 console.log('LAB DISTRIBUTION HTTP PASS: '+checks+' assertions; permissions, CSRF, preview, concurrent saves, independent copies, image preservation, deduplication, private work and tool authentication.');
})().catch(e=>{console.error(e);process.exit(1)});
