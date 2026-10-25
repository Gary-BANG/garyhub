'use strict';
const assert=require('node:assert/strict'),http=require('node:http');
const CAL=process.env.CHECK_CALENDAR,LAB=process.env.CHECK_LAB,APP=process.env.APP_DIR||'/app',db=require(APP+'/db');
let spy=[],mf;
const clients={};
async function request(base,path,who,options={}){const headers={...(who?{cookie:clients[who].cookie}:{}),...options.headers};if(!headers.host)return fetch(base+path,{redirect:'manual',...options,headers});return new Promise((resolve,reject)=>{const req=http.request(new URL(path,base),{method:options.method||'GET',headers},res=>{const parts=[];res.on('data',x=>parts.push(x));res.on('end',()=>{const h=new Headers();for(let i=0;i<res.rawHeaders.length;i+=2)h.append(res.rawHeaders[i],res.rawHeaders[i+1]);resolve(new Response(Buffer.concat(parts),{status:res.statusCode,headers:h}));});});req.on('error',reject);req.end(options.body);});}
async function login(name){const csrf=await fetch(CAL+'/api/csrf'),cookie=csrf.headers.getSetCookie().map(x=>x.split(';')[0]).join('; '),token=(await csrf.json()).token;const r=await fetch(CAL+'/api/login',{method:'POST',headers:{cookie,origin:CAL,'content-type':'application/json','x-csrf-token':token},body:JSON.stringify({username:'check_'+name,password:'Synthetic-Only-2026!'})});assert.equal(r.status,200);const signed=r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');const fresh=await fetch(CAL+'/api/csrf',{headers:{cookie:signed}});clients[name]={cookie:signed,csrf:(await fresh.json()).token};}
const mutate=(path,who,value,headers={})=>request(CAL,path,who,{method:'POST',headers:{origin:CAL,'content-type':'application/json','x-csrf-token':clients[who].csrf,...headers},body:JSON.stringify(value)});
(async()=>{

 const murl=new URL(process.env.MINIFLUX_URL||'http://127.0.0.1:18100');
 mf=http.createServer((req,res)=>{spy.push({user:req.headers['x-garyhub-user'],cookie:req.headers.cookie||'',auth:req.headers.authorization,token:req.headers['x-auth-token']});if(req.url==='/v1/me'){const token=req.headers['x-auth-token'];if(!['legacy-bob','legacy-admin'].includes(token)){res.writeHead(401);return res.end('{}');}res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({id:token==='legacy-bob'?21:22,username:token==='legacy-bob'?'legacy_bob':'legacy_admin',is_admin:token==='legacy-admin'}));}res.setHeader('Set-Cookie','session=synthetic-'+req.headers['x-garyhub-user']+'; HttpOnly; Path=/; SameSite=Lax');res.setHeader('Content-Type','application/json');res.end(JSON.stringify(spy.at(-1)));});await new Promise(r=>mf.listen(Number(murl.port),'0.0.0.0',r));
 try{
  for(const name of ['admin','alice','bob'])await login(name);
  const tiers=await(await request(CAL,'/api/hub/admin/users','admin')).json(),bob=tiers.find(u=>u.id===3);
  const tierChange=await request(LAB,'/api/hub/admin/users/3/tier','admin',{method:'PUT',headers:{origin:'https://tools.garyhub.uk','content-type':'application/json','x-csrf-token':clients.admin.csrf},body:JSON.stringify({actorId:1,accountTier:'subscriber',expectedTierVersion:bob.tier_version})});assert.equal(tierChange.status,200);
  assert.equal((await request(CAL,'/api/hub/admin/users/3/tier','admin',{method:'PUT',headers:{origin:CAL,'content-type':'application/json','x-csrf-token':clients.admin.csrf},body:JSON.stringify({actorId:1,accountTier:'standard',expectedTierVersion:bob.tier_version-1})})).status,409);
  for(const path of ['/api/server-monitor','/server-monitor/']){assert.ok([302,401].includes((await request(LAB,path)).status));assert.equal((await request(LAB,path,'alice')).status,403);assert.equal((await request(LAB,path,'bob')).status,403);}
  const metrics=await request(LAB,'/api/server-monitor','admin');assert.equal(metrics.status,200);const snap=await metrics.json();assert.equal(snap.vpn.users[0].username,'check_alice');assert.equal(snap.schema,1);assert.equal((await request(LAB,'/server-monitor/','admin')).status,200);
  for(const tool of ['files','status','server-monitor']){assert.equal((await request(CAL,'/api/hub/tool-auth/'+tool,'admin')).status,200);assert.equal((await request(CAL,'/api/hub/tool-auth/'+tool,'bob')).status,403);assert.equal((await request(CAL,'/api/hub/tool-auth/'+tool,'alice',{headers:{'x-garyhub-user':'admin'}})).status,403);}
  assert.equal((await request(CAL,'/api/hub/tool-auth/reading','bob')).status,200);assert.equal((await request(CAL,'/api/hub/tool-auth/reading','alice')).status,403);
  const guest=await request(CAL,'/api/hub/tool-auth/files?browser=1');assert.equal(guest.status,302);assert.ok(guest.headers.get('location').includes('files.garyhub.uk'));
  const quote1=await(await request(CAL,'/api/daily-quote','alice')).json(),quote2=await(await request(CAL,'/api/daily-quote','alice')).json();assert.deepEqual(quote1,quote2);assert.ok(quote1.source&&quote1.translation);assert.equal((await request(CAL,'/api/daily-quote')).status,401);
  for(const p of ['/','/journal/','/health-records/','/ledger/','/todos/']){const html=await(await request(CAL,p,'alice')).text();assert.ok(html.indexOf('id="daily-quote"')>html.indexOf('</nav>'));assert.ok(html.indexOf('id="daily-quote"')<html.indexOf('class="page-hero"'));}
  const read=(who,extra={})=>request(LAB,'/',who,{headers:{host:'rss.garyhub.uk',...extra}});
  assert.equal((await read()).status,302);assert.equal((await read('alice',{'x-garyhub-user':'admin'})).status,403);
  const rb=await read('bob',{'x-garyhub-user':'admin',authorization:'Basic forged','x-auth-token':'forged'});assert.equal(rb.status,200);const sb=await rb.json();assert.match(sb.user,/^gh-[a-f0-9]{24}-3$/);assert.equal(sb.auth,undefined);assert.equal(sb.token,undefined);const bobCookie=rb.headers.getSetCookie()[0].split(';')[0];assert.match(bobCookie,/^gh-r-3-/);
  const ra=await read('admin',{cookie:clients.admin.cookie+'; '+bobCookie});assert.equal((await ra.json()).cookie,'');
  const again=await read('bob',{cookie:clients.bob.cookie+'; '+bobCookie});assert.ok((await again.json()).cookie.startsWith('session='));
  assert.equal((await request(LAB,'/v1/me','bob',{headers:{host:'rss.garyhub.uk'}})).status,403);
  assert.equal((await request(LAB,'/','bob',{method:'POST',headers:{host:'rss.garyhub.uk',origin:'https://evil.invalid'}})).status,403);
  assert.equal((await mutate('/api/hub/reading-link','bob',{accountId:3,token:'legacy-bob'},{'x-csrf-token':''})).status,403);
  assert.equal((await mutate('/api/hub/reading-link','bob',{accountId:2,token:'legacy-bob'})).status,409);
  assert.equal((await mutate('/api/hub/reading-link','bob',{accountId:3,token:'legacy-admin'})).status,403);
  assert.equal((await mutate('/api/hub/reading-link','bob',{accountId:3,token:'legacy-bob'})).status,200);
  assert.equal((await(await read('bob',{cookie:clients.bob.cookie+'; '+bobCookie})).json()).user,'legacy_bob');assert.equal(spy.at(-1).cookie,'');
  assert.equal((await mutate('/api/hub/reading-link','admin',{accountId:1,token:'legacy-bob'})).status,409);
  const link=await db.get('SELECT * FROM reading_links WHERE user_id=3');assert.equal(link.mf_user_id,21);assert.ok(!JSON.stringify(link).includes('legacy-bob'));
  await db.run("UPDATE users SET account_tier='standard' WHERE id=3");assert.equal((await read('bob')).status,403);
  await db.run("UPDATE users SET enabled=0 WHERE id=3");assert.ok([302,401].includes((await read('bob')).status));
  await db.run("UPDATE users SET enabled=1,account_tier='subscriber' WHERE id=3");
  console.log('FEATURE HTTP PASS: role gates, no header bypass, daily quote placement, Reading identity/cookie isolation, token ownership, CSRF/account drift, downgrade and disable enforcement.');
 }finally{mf.closeAllConnections();await new Promise(r=>mf.close(r));await new Promise(r=>db.db.close(r));}
})().catch(e=>{console.error(e);process.exit(1);});
