'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const ROOT=process.env.APP_DIR||'/app',CAL=process.env.CHECK_CALENDAR||'http://calendar-check:3000',LAB=process.env.CHECK_LAB||'http://lab-check:3000';
const db=require(ROOT+'/db'),mp3=fs.readFileSync(ROOT+'/public/ambient.mp3');let checks=0;
const eq=(a,b,message)=>{assert.deepEqual(a,b,message);checks++;};
async function client(name,id){let cookie='',token='';const absorb=r=>{const c=r.headers.getSetCookie();if(c.length)cookie=c.map(s=>s.split(';')[0]).join('; ');};
 async function call(route,method='GET',body,options={}){
  if(method!=='GET'&&!token){const r=await fetch(CAL+'/api/csrf',{headers:{cookie}});absorb(r);token=(await r.json()).token;}
  const r=await fetch((options.lab?LAB:CAL)+route,{method,headers:{cookie,origin:options.origin||CAL,'x-csrf-token':options.csrf===false?'':token,'x-garyhub-user':String(options.user??id),...(body?{'content-type':Buffer.isBuffer(body)?'audio/mpeg':'application/json'}:{}),...options.headers},body:body?(Buffer.isBuffer(body)?body:JSON.stringify(body)):undefined});absorb(r);if(route==='/api/login'&&r.ok)token='';let d;try{d=await r.json();}catch{d=null;}return {status:r.status,data:d};
 }
 if(name)eq((await call('/api/login','POST',{username:'check_'+name,password:'Synthetic-Only-2026!'})).status,200,'login '+name);return call;
}
const todo=(points=0)=>({id:crypto.randomUUID(),title:'Synthetic todo',done:false,points:Array.from({length:points},()=>({id:crypto.randomUUID(),text:'Point',done:false}))});
const plan=()=>({name:'Synthetic fixed',amount:'1.00',currency:'USD',period:'monthly',categoryId:'food',notes:'',active:true,requestId:crypto.randomUUID()});
const upload=(call,body=mp3,opts={})=>call('/api/music/upload','POST',body,{headers:{'x-music-filename':encodeURIComponent('Synthetic.mp3'),'x-upload-id':crypto.randomUUID()},...opts});
(async()=>{
 const alice=await client('alice',2),bob=await client('bob',3),admin=await client('admin',1),guest=await client(null,0);
 eq((await guest('/api/music')).status,401);eq((await guest('/api/music/selected','GET',undefined,{lab:true})).status,401);
 eq((await alice('/api/music')).data.canUpload,false);eq((await bob('/api/music')).data.canUpload,true);eq((await admin('/api/music')).data.canUpload,true);
 eq((await upload(alice)).status,403);eq((await upload(bob,mp3,{csrf:false})).status,403);eq((await upload(bob,mp3,{origin:'https://evil.invalid'})).status,403);eq((await upload(bob,mp3,{user:2})).status,409);
 eq((await upload(bob,Buffer.from('ID3badfile'))).status,415);
 console.log('HTTP: music auth, CSRF, Origin, owner and MP3 rejection passed.');
 let ar=(await alice('/api/todos')).data;eq(ar.limits.todos,5);const makeSave=(todos,revision=ar.revision)=>({accountId:2,revision,requestId:crypto.randomUUID(),todos});
 eq((await alice('/api/todos','PUT',makeSave(Array.from({length:6},()=>({...todo(),done:true}))))).status,422);
 eq((await alice('/api/todos','PUT',makeSave([todo(11)]))).status,422);
 const four=Array.from({length:4},()=>todo(10));ar=(await alice('/api/todos','PUT',makeSave(four))).data;
 const races=await Promise.all([alice('/api/todos','PUT',makeSave([...four,todo()],ar.revision)),alice('/api/todos','PUT',makeSave([...four,todo()],ar.revision))]);eq(races.map(r=>r.status).sort(),[200,409]);
 ar=(await alice('/api/todos')).data;
 const doc={format:'garyhub-todos-v1',todos:[{title:'Imported over quota',points:[]}]},imp={accountId:2,revision:ar.revision,document:doc,requestId:crypto.randomUUID()};
 eq((await alice('/api/todos/import/preview','POST',imp)).status,422);eq((await alice('/api/todos/import','POST',imp)).status,422);eq((await alice('/api/todos')).data.todos.length,5);
 const paidTodos=Array.from({length:6},()=>todo(12));let br=(await bob('/api/todos')).data;
 eq((await bob('/api/todos','PUT',{accountId:3,revision:br.revision,requestId:crypto.randomUUID(),todos:paidTodos})).status,200);
 const tier=async(value)=>{const list=(await admin('/api/hub/admin/users')).data,u=list.find(u=>u.id===3);eq((await admin('/api/hub/admin/users/3/tier','PUT',{actorId:1,accountTier:value,expectedTierVersion:u.tier_version})).status,200);};
 await tier('standard');br=(await bob('/api/todos')).data;eq(br.limits.todos,5);eq(br.todos.length,6);
 let edit=await bob('/api/todos','PUT',{accountId:3,revision:br.revision,requestId:crypto.randomUUID(),todos:br.todos.map(t=>({...t,title:'Edited legacy',done:true}))});eq(edit.status,200);
 eq((await bob('/api/todos','PUT',{accountId:3,revision:edit.data.revision,requestId:crypto.randomUUID(),todos:[...edit.data.todos,todo()]})).status,422);
 eq((await bob('/api/todos','PUT',{accountId:3,revision:edit.data.revision,requestId:crypto.randomUUID(),todos:[{...paidTodos[0],points:[...paidTodos[0].points,{id:crypto.randomUUID(),text:'extra',done:false}]}]})).status,422);
 await tier('subscriber');
 console.log('HTTP: Todo limits, imports, concurrent revisions and non-destructive downgrade passed.');
 for(let i=0;i<4;i++)eq((await alice('/api/ledger/fixed','POST',plan())).status,201);
 const fixed=await Promise.all([alice('/api/ledger/fixed','POST',plan()),alice('/api/ledger/fixed','POST',plan())]);eq(fixed.map(r=>r.status).sort(),[201,422]);
 const fr=(await alice('/api/ledger/fixed?currency=USD')).data;eq(fr.used,5);eq(fr.limit,5);
 const f=fr.items[0];eq((await alice('/api/ledger/fixed/'+f.id,'PUT',{...plan(),revision:f.revision,active:false})).status,200);eq((await alice('/api/ledger/fixed','POST',plan())).status,422);
 const changed=(await alice('/api/ledger/fixed?currency=USD')).data.items.find(x=>x.id===f.id);eq((await alice('/api/ledger/fixed/'+f.id,'DELETE',{revision:changed.revision})).status,200);eq((await alice('/api/ledger/fixed','POST',plan())).status,201);
 for(let i=0;i<6;i++)eq((await bob('/api/ledger/fixed','POST',plan())).status,201);
 const nonce=crypto.randomUUID(),up=await upload(bob,mp3,{headers:{'x-music-filename':'Synthetic.mp3','x-upload-id':nonce}});eq(up.status,201);
 eq((await upload(bob,mp3,{headers:{'x-music-filename':'Synthetic.mp3','x-upload-id':nonce}})).status,200,'lost-response retry deduplicates');
 eq((await alice('/api/music')).data.items.length,0);eq((await alice('/api/music/'+up.data.item.id,'DELETE',{})).status,404);eq((await alice('/api/music/selected','PUT',{id:up.data.item.id})).status,403);
 eq((await bob('/api/music/selected','PUT',{id:up.data.item.id})).status,200);
 const selected=(await bob('/api/music/selected')).data;eq(selected.id,up.data.item.id);assert.ok(selected.url.includes('X-Amz-Expires=300'));checks++;
 eq((await bob('/api/music/selected','GET',undefined,{lab:true})).data.id,up.data.item.id);
 const fresh=await client('bob',3);eq((await fresh('/api/music')).data.selected,up.data.item.id,'selection persists across login');
 await tier('standard');eq((await fresh('/api/music/selected')).data.url,'/ambient.mp3');eq((await fresh('/api/music')).data.items.length,1);await tier('subscriber');
 eq((await bob('/api/music/'+up.data.item.id,'DELETE',{})).status,200);eq((await bob('/api/music/selected')).data.id,null);
 console.log('HTTP: fixed limits/race, music upload/deduplication, isolation, persistent selection and downgrade passed.');
 // Inject uncertain PUT and failed DELETE only in the synthetic cloud fixture.
 const fixture=path.join(process.env.DATA_DIR,'synthetic-r2');fs.writeFileSync(path.join(fixture,'fail-put'),'');fs.writeFileSync(path.join(fixture,'fail-delete'),'');
 const failed=await upload(admin);eq(failed.status,503);assert.ok((await admin('/api/music')).data.usage.pendingDeletion>=1);checks++;
 fs.rmSync(path.join(fixture,'fail-put'));fs.rmSync(path.join(fixture,'fail-delete'));
 // Quotas include pending cloud deletions and in-flight reservations.
 for(let i=0;i<10;i++)await db.run("INSERT INTO music_delete_jobs(object_key,owner_id,bytes) VALUES(?,2,1)",['music/2/pending-'+i+'.mp3']);
 await db.run("UPDATE users SET account_tier='subscriber' WHERE id=2");eq((await upload(alice)).status,422);await db.run('DELETE FROM music_delete_jobs WHERE owner_id=2');await db.run("UPDATE users SET account_tier='standard' WHERE id=2");
 // Deleting a whole account queues its remote objects without touching others.
 const {hashPassword}=require(ROOT+'/auth-utils');await db.run("INSERT INTO users(id,username,password_hash,role,enabled,account_tier) VALUES(6,'check_musicdelete',?,'user',1,'subscriber')",[hashPassword('Synthetic-Only-2026!')]);
 const doomed=await client('musicdelete',6),owned=await upload(doomed);eq(owned.status,201);
 const started=await admin('/api/hub/admin/users/6/delete-start','POST',{actorId:1,expectedVersion:0,confirmUsername:'check_musicdelete'});eq(started.status,202);
 const done=await fetch(CAL+'/internal/user-deletions/'+started.data.id+'/complete',{method:'POST',headers:{'x-deletion-token':started.data.token}});eq(done.status,200);eq((await db.get('SELECT COUNT(*) AS n FROM music_tracks WHERE user_id=6')).n,0);eq((await db.get('SELECT COUNT(*) AS n FROM music_delete_jobs WHERE owner_id=6')).n,1);
 eq((await db.get('SELECT COUNT(*) AS n FROM users WHERE enabled=1')).n,5);eq((await guest('/api/music')).status,401);
 await db.run('UPDATE users SET enabled=0 WHERE id=3');eq((await bob('/api/music')).status,401);await db.run('UPDATE users SET enabled=1 WHERE id=3');
 eq(await db.all('PRAGMA foreign_key_check'),[]);
 console.log('SUBSCRIPTION HTTP PASS: '+checks+' assertions; quota and cloud failure reservations, account deletion, disabled sessions and existing-record isolation.');
 await new Promise(r=>db.db.close(r));
})().catch(e=>{console.error(e);process.exit(1);});
