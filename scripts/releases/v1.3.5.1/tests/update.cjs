'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const CAL=process.env.CHECK_CALENDAR||'http://calendar-check:3000',LAB=process.env.CHECK_LAB||'http://lab-check:3000',MAIL=process.env.CHECK_MAIL_DIR||'/app/data/mail-capture';let number=40;
function client(base=CAL){let cookie='',ip='203.0.113.'+(++number);return async function call(route,method='GET',body,options={}){let token;const cookieFrom=r=>{const c=r.headers.getSetCookie();if(c.length)cookie=c.map(x=>x.split(';')[0]).join('; ');};if(method!=='GET'){const r=await fetch(base+'/api/csrf',{headers:{cookie,'x-forwarded-for':ip}});cookieFrom(r);token=(await r.json()).token;}const r=await fetch(base+route,{method,headers:{cookie,origin:base===CAL?'https://calendar.garyhub.uk':'https://tools.garyhub.uk','content-type':'application/json','x-forwarded-for':ip,...(token?{'x-csrf-token':token}:{}),...options.headers},body:body?JSON.stringify(body):undefined});cookieFrom(r);const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data};};}
async function login(call,identifier,password='Synthetic-Only-2026!'){const r=await call('/api/login','POST',{username:identifier,password});assert.equal(r.status,200,JSON.stringify(r));return r;}
(async()=>{
 const alice=client(),lab=client(LAB),guest=client(),recover=client(LAB);
 await login(alice,' ALICE@EXAMPLE.INVALID ');await login(lab,'alice@example.invalid');
 assert.equal((await client()('/api/login','POST',{username:'bob@example.invalid',password:'Synthetic-Only-2026!'})).status,401,'unverified email login denied');
 assert.equal((await guest('/api/password-reset/request','POST',{identifier:'unknown-synthetic'})).status,200);
 const before=new Set(fs.existsSync(MAIL)?fs.readdirSync(MAIL):[]);
 const request=await recover('/api/password-reset/request','POST',{identifier:'alice@example.invalid'});assert.equal(request.status,200);
 let mail;
 for(let i=0;i<100&&!mail;i++){if(fs.existsSync(MAIL))for(const name of fs.readdirSync(MAIL))if(!before.has(name)){const m=JSON.parse(fs.readFileSync(path.join(MAIL,name)));if(m.to==='alice@example.invalid'&&m.text.includes('Password reset code:'))mail=m;}if(!mail)await new Promise(y=>setTimeout(y,20));}
 assert(mail,'synthetic recovery email captured through existing mailer');
 const requestId=request.data.requestId,code=mail.text.match(/code: (\d{6})/)[1];
 const verified=await recover('/api/password-reset/verify','POST',{requestId,code});assert.equal(verified.status,200);
 const changed=await recover('/api/password-reset/complete','POST',{requestId,resetToken:verified.data.resetToken,password:'Recovered-Synthetic-2026!',confirmPassword:'Recovered-Synthetic-2026!'});assert.equal(changed.status,200);
 assert.equal((await alice('/api/me')).status,401,'old Calendar session revoked');
 assert.equal((await lab('/api/lab/state')).status,401,'old Tools/Lab session revoked');
 assert.equal((await recover('/api/me')).status,401,'no automatic login');
 const current=client();await login(current,'alice@example.invalid','Recovered-Synthetic-2026!');
 assert.equal((await current('/api/account/password','POST',{accountId:2,currentPassword:'Recovered-Synthetic-2026!',newPassword:'Synthetic-Only-2026!'})).status,200,'restore synthetic password for regression fixtures');
 const ledger=(route,method='GET',body)=>current('/api/ledger/'+route,method,body,{headers:{'x-garyhub-user':'2'}});
 let first;
 for(let i=0;i<31;i++){const r=await ledger('entries','POST',{kind:'expense',amount:'1.00',currency:'CAD',date:'2026-09-15',categoryId:'food',notes:'Synthetic CAD pagination '+i,requestId:crypto.randomUUID()});assert.equal(r.status,201);first??=r.data.item;}
 assert.equal((await ledger('entries','POST',{kind:'expense',amount:'8.00',currency:'HKD',date:'2026-09-15',categoryId:'food',notes:'Synthetic HKD',requestId:crypto.randomUUID()})).status,201);
 const query='entries?from=2026-09-01&to=2026-09-30&currency=USD';
 for(const [page,length]of [[1,15],[2,15],[3,2]]){const r=await ledger(query+'&page='+page);assert.equal(r.status,200);assert.equal(r.data.items.length,length);assert.equal(r.data.pageSize,15);assert.equal(r.data.pages,3);assert.equal(r.data.total,32);assert.equal(r.data.summary.consumption,2580,'summary includes all pages');}
 const converted=await ledger(query.replace('currency=USD','currency=CAD'));assert.equal(converted.data.summary.consumption,3225);
 const refund=await ledger('entries','POST',{kind:'refund',amount:'0.25',currency:'HKD',date:'2026-09-16',categoryId:'food',refundOf:first.id,notes:'Synthetic linked refund',requestId:crypto.randomUUID()});assert.equal(refund.status,201);assert.equal(refund.data.item.currency,'CAD');
 for(const route of ['/','/journal/','/health-records/','/ledger/','/todos/']){const html=await current(route);assert.equal(html.status,200);const nav=html.data.match(/<div class="nav-links">([\s\S]*?)<button/)[1];for(const target of ['/','/journal/','/health-records/','/ledger/','/todos/'])assert(nav.includes('href="'+target+'"'));assert(nav.includes('href="'+route+'" aria-current="page"'));}
 console.log('UPDATE PASS: verified-email login, existing mailer recovery, shared-session revocation, CAD/HKD cross-rates/refunds, 15-row pagination/full totals and five-page navigation.');
})().catch(e=>{console.error(e.stack);process.exit(1)});
