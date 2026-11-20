'use strict';
// Real HTTP checks for v2.4.2.0 on both services: the games host (games.garyhub.uk) served by Tools/Lab — only its own
// files and APIs, signed-in pages with the released bytes, a login redirect back to the same page, a strict CSP, and
// /games/ hidden on other hosts — and Daydreamer through that host: trusted-origin and page-token gates, a game that only
// its two accounts can see, boxes that stay hidden until opened, moves only by the right side in the right order,
// stale revisions refused, a whole game played to the end with the published order matching the seal, the turn notice
// in the player's inbox, and the account-deletion preview of the new table.
const assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto');
const config=require('./asset-checks.json');
const CAL=process.env.CHECK_CALENDAR||'http://calendar-check:3000',LAB=process.env.CHECK_LAB||'http://lab-check:3000',VERSION=process.env.CHECK_VERSION;
const HOST='games.garyhub.uk',ORIGIN='https://'+HOST;
let count=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);count++;};const ok=(v,m)=>{assert.ok(v,m);count++;};
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
// Lab decides the site by the Host header, which fetch() cannot set.
function raw(path,{method='GET',host=HOST,cookie,headers={},body}={}){
 return new Promise((resolve,reject)=>{const url=new URL(LAB);
  const req=http.request({hostname:url.hostname,port:url.port,path,method,headers:{host,...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{}),...headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const data=Buffer.concat(chunks),text=data.toString('utf8');resolve({status:res.statusCode,headers:res.headers,data,text,json:()=>JSON.parse(text)});});});
  req.on('error',reject);req.end(body);});
}
// Each signed-in suite uses its own documentation address for Calendar's login limit.
async function login(name,ip){
 let cookie='';const take=r=>{const v=r.headers.getSetCookie();if(v.length)cookie=v.map(x=>x.split(';')[0]).join('; ');};
 let r=await fetch(CAL+'/api/csrf',{headers:{'x-forwarded-for':ip}});take(r);const {token}=await r.json();
 r=await fetch(CAL+'/api/login',{method:'POST',headers:{'x-forwarded-for':ip,cookie,origin:'https://calendar.garyhub.uk','x-csrf-token':token,'content-type':'application/json'},body:JSON.stringify({username:'check_'+name,password:'Synthetic-Only-2026!'})});
 if(r.status!==200)throw Error('login '+name+' '+r.status);take(r);
 const me=(await (await fetch(CAL+'/api/me',{headers:{cookie}})).json()).user;
 // As the games pages do it: same-origin calls on games.garyhub.uk with the page token.
 const token_=async()=>(await raw('/api/csrf',{cookie})).json().token;
 const get=path=>raw(path,{cookie});
 const post=async(path,body,{origin=ORIGIN,token}={})=>raw(path,{cookie,method:'POST',headers:{origin,'x-csrf-token':token===undefined?await token_():token},body:JSON.stringify({accountId:me.id,...body})});
 return {cookie,me,get,post};
}
const money=n=>({kind:'money',amount:n*100});
const PRIZES=[1,5,10,20,50,100,200,500,1000,2000,5000].map(money).concat([{kind:'gift',name:'一束花',icon:'flower',value:null}]);
(async()=>{
 assert.match(VERSION,/^\d+\.\d+\.\d+\.\d+$/);
 // Guests: the pages redirect to the shared login page and come back to the same page.
 for(const [path,next] of [['/','https://games.garyhub.uk/'],['/dream/?id=7','https://games.garyhub.uk/dream/?id=7'],['/index.html?v='+VERSION,'https://games.garyhub.uk/?v='+VERSION]]){
  const r=await raw(path);eq(r.status,302,'guest '+path);
  const login=new URL(r.headers.location);eq(login.origin+login.pathname,'https://calendar.garyhub.uk/login/');eq(login.searchParams.get('next'),next);
 }
 eq((await raw('/dream')).headers.location,'/dream/');
 // Public scripts and styles carry the released bytes and a strict CSP.
 for(const asset of config.games_asset_checksums){
  const r=await raw(asset.route+'?v='+VERSION);eq(r.status,200,asset.route);eq(sha(r.data),asset.sha256,asset.route);
  ok(/^default-src 'none'; script-src 'self'; style-src 'self';/.test(r.headers['content-security-policy']),'CSP '+asset.route);
 }
 eq((await raw('/hub-prefs.js')).status,200);
 // Only this host's files and APIs; other hosts never serve /games/.
 for(const path of ['/lab/','/tools-catalog.js','/health','/games/games.js','/companion/boot.js','/admin/','/api/todos','/api/hub/notify','/api/access/status','/api/hub/games/1/explode'])
  eq((await raw(path)).status,404,'games host '+path);
 eq((await raw('/api/hub/games',{method:'POST'})).status,403,'no origin');
 for(const host of ['tools.garyhub.uk','garyhub.uk','lab.garyhub.uk'])for(const path of ['/games/index.html','/games/games.js','/games/dream/dream.js'])eq((await raw(path,{host})).status,404,host+path);
 // The API needs a session on every host.
 eq((await raw('/api/hub/games')).status,401);eq((await raw('/api/hub/games',{host:'tools.garyhub.uk'})).status,401);eq((await fetch(CAL+'/api/hub/games')).status,401);

 // admin is an outsider to this game: no role reads someone else's game.
 const alice=await login('alice','192.0.2.221'),bob=await login('bob','192.0.2.222'),outsider=await login('admin','192.0.2.223');
 // Signed in, the pages are the released files.
 for(const asset of config.games_page_checksums){const r=await alice.get(asset.route+'?v='+VERSION);eq(r.status,200,asset.route);eq(sha(r.data),asset.sha256,asset.route);}
 const create={title:'检查',currency:'CNY',prizes:PRIZES,player:'check_bob',firstCount:2};
 // Writes need a trusted origin and the page token.
 eq((await alice.post('/api/hub/games',create,{origin:'https://evil.example'})).status,403);
 eq((await alice.post('/api/hub/games',create,{token:''})).status,403);
 eq((await alice.post('/api/hub/games',{...create,player:'check_alice'})).status,400);
 eq((await alice.post('/api/hub/games',{...create,player:'nobody-here'})).status,404);
 eq((await alice.post('/api/hub/games',{...create,prizes:PRIZES.slice(0,9)})).status,400);
 let r=await alice.post('/api/hub/games',create);eq(r.status,200);
 let game=r.json();const id=game.id;
 eq([game.status,game.role,game.turn,game.boxes,game.pending],['invited','host','them',12,2]);
 const hidden=view=>!('layout' in view)&&view.reveal===null&&!JSON.stringify(view).includes('"salt"');
 ok(hidden(game),'host sees no order');ok(/^[0-9a-f]{64}$/.test(game.commitment));
 // Only the two accounts can see the game.
 eq((await outsider.get('/api/hub/games/'+id)).status,404);
 eq((await outsider.post('/api/hub/games/'+id+'/choose',{revision:0,box:0})).status,404);
 r=await bob.get('/api/hub/games/'+id);eq(r.status,200);let seen=r.json();
 eq([seen.role,seen.turn,seen.host,seen.pending],['player','me','check_alice',2]);ok(hidden(seen),'player sees no order');
 // The invitation is in bob's inbox.
 r=await raw('/api/hub/notifications?scope=all',{host:'garyhub.uk',cookie:bob.cookie});eq(r.status,200);
 ok(r.json().items.some(n=>n.type==='game'&&n.title.includes('白日梦想家')),'turn notice');
 // Moves: right side, right order, current revision.
 eq((await alice.post('/api/hub/games/'+id+'/choose',{revision:0,box:0})).status,403);
 eq((await bob.post('/api/hub/games/'+id+'/open',{revision:0,boxes:[1,2]})).status,409);
 eq((await bob.post('/api/hub/games/'+id+'/choose',{revision:5,box:0})).status,409);
 r=await bob.post('/api/hub/games/'+id+'/choose',{revision:0,box:4});eq(r.status,200);game=r.json();eq([game.status,game.pending,game.chosen],['opening',2,4]);
 eq((await bob.post('/api/hub/games/'+id+'/open',{revision:game.revision,boxes:[4,5]})).status,400);
 r=await bob.post('/api/hub/games/'+id+'/open',{revision:game.revision,boxes:[0,11]});game=r.json();eq(game.status,'offering');
 ok(game.opened.length===2&&game.opened.every(o=>Number.isInteger(o.prize)),'opened boxes show their prize');ok(hidden(game));
 r=await alice.post('/api/hub/games/'+id+'/offer',{revision:game.revision,amount:30000,note:'试试',nextCount:20});eq(r.status,400);
 r=await alice.post('/api/hub/games/'+id+'/offer',{revision:game.revision,amount:30000,note:'试试',nextCount:3});eq(r.status,200);game=r.json();
 r=await bob.post('/api/hub/games/'+id+'/answer',{revision:game.revision,accept:true});eq(r.status,200);game=r.json();eq([game.status,game.deal],['revealing',30000]);
 r=await alice.get('/api/hub/games/'+id);game=r.json();
 for(let b=0;b<game.boxes;b++){
  if(b===game.chosen||game.opened.some(o=>o.box===b))continue;
  r=await alice.post('/api/hub/games/'+id+'/reveal',{revision:game.revision,box:b});eq(r.status,200);game=r.json();ok(hidden(game)||game.status==='finished');
 }
 r=await alice.post('/api/hub/games/'+id+'/reveal',{revision:game.revision,box:game.chosen});eq(r.status,200);game=r.json();
 eq(game.status,'finished');
 eq(sha(game.reveal.salt+'|'+game.reveal.layout.join(',')),game.commitment,'published order matches the seal');
 for(const o of game.opened)eq(o.prize,game.reveal.layout[o.box]);
 eq((await bob.post('/api/hub/games/'+id+'/honor',{revision:game.revision})).status,403);
 eq((await alice.post('/api/hub/games/'+id+'/honor',{revision:game.revision})).json().honored,true);
 r=await bob.get('/api/hub/games');eq(r.status,200);const listed=r.json();
 eq(listed.accountId,bob.me.id);ok(listed.games.some(g=>g.id===id&&g.status==='finished'&&g.opponent==='check_alice'));eq(listed.recent,['check_alice']);
 // The tools host proxies the same API (the game pages use their own host).
 eq((await raw('/api/hub/games/'+id,{host:'tools.garyhub.uk',cookie:alice.cookie})).status,200);
 // The new table is part of the account-deletion preview (games are kept under the host's account).
 const preview=await (await fetch(CAL+'/api/hub/admin/users/'+alice.me.id+'/deletion-preview',{headers:{cookie:outsider.cookie}})).json();
 ok(preview.counts.dream_games>=1,'deletion preview lists dream_games');
 console.log('GAMES HTTP PASS: '+count+' assertions; games host gates, released pages, hidden boxes, turn order, seal and turn notice verified.');
})().catch(error=>{console.error(error);process.exit(1);});
