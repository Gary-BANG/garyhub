'use strict';
// Real HTTP and WebSocket checks for v2.4.3.0 on both services: the live rooms on games.garyhub.uk. The room page needs
// a sign-in; the one socket path is upgraded only on the games host and only for a session from the games origin
// (Tools/Lab passes it through, Calendar checks it). Then whole rooms over real sockets: a 词语默契 game whose words stay
// hidden until both are in, a dropped connection (FIN only) that pauses the clock and a return that resumes it with
// nothing lost, a 对战猜数字 game against the computer whose secret never reaches the page, an invitation in the inbox,
// and the account-deletion preview of the new table.
const assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto');
const config=require('./asset-checks.json');
const CAL=process.env.CHECK_CALENDAR||'http://calendar-check:3000',LAB=process.env.CHECK_LAB||'http://lab-check:3000',VERSION=process.env.CHECK_VERSION;
const HOST='games.garyhub.uk',ORIGIN='https://'+HOST,SOCKET='/api/hub/play/socket';
let count=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);count++;};const ok=(v,m)=>{assert.ok(v,m);count++;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
function raw(path,{method='GET',host=HOST,cookie,headers={},body}={}){
 return new Promise((resolve,reject)=>{const url=new URL(LAB);
  const req=http.request({hostname:url.hostname,port:url.port,path,method,agent:false,headers:{host,...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{}),...headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const data=Buffer.concat(chunks),text=data.toString('utf8');resolve({status:res.statusCode,headers:res.headers,data,text,json:()=>JSON.parse(text)});});});
  req.on('error',reject);req.end(body);});
}
// A small WebSocket client: masked text frames out, JSON messages in.
function frame(opcode,payload){const key=crypto.randomBytes(4),body=Buffer.from(payload);for(let i=0;i<body.length;i++)body[i]^=key[i&3];
 const head=body.length<126?Buffer.from([0x80|opcode,0x80|body.length]):Buffer.from([0x80|opcode,0x80|126,body.length>>8,body.length&255]);return Buffer.concat([head,key,body]);}
function socket({cookie,origin=ORIGIN,host=HOST,path=SOCKET}={}){
 return new Promise((resolve,reject)=>{const url=new URL(LAB);
  const req=http.request({hostname:url.hostname,port:url.port,path,method:'GET',agent:false,headers:{host,connection:'Upgrade',upgrade:'websocket','sec-websocket-version':'13','sec-websocket-key':crypto.randomBytes(16).toString('base64'),...(cookie?{cookie}:{}),...(origin?{origin}:{})}});
  req.on('response',res=>{res.resume();resolve({status:res.statusCode});});
  req.on('upgrade',(res,s,head)=>{
   let buffer=Buffer.from(head||[]);const inbox=[],waiters=[];
   const c={status:101,s,closed:false,send:m=>s.write(frame(1,JSON.stringify(m))),bye:()=>{try{s.write(frame(8,Buffer.from([3,232])));}catch{}s.end();},drop:()=>s.end(),
    next(test,ms=15000){const i=inbox.findIndex(test);if(i>=0)return Promise.resolve(inbox.splice(i,1)[0]);
     return new Promise((ok_,no)=>{const w={test,ok_,timer:setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);no(Error('no message in time'));},ms)};waiters.push(w);});}};
   const parse=()=>{while(buffer.length>=2){const op=buffer[0]&15;let len=buffer[1]&127,off=2;if(len===126){if(buffer.length<4)return;len=buffer.readUInt16BE(2);off=4;}else if(len===127){if(buffer.length<10)return;len=Number(buffer.readBigUInt64BE(2));off=10;}
    if(buffer.length<off+len)return;const p=buffer.subarray(off,off+len);buffer=buffer.subarray(off+len);
    if(op===1){const m=JSON.parse(p.toString());const i=waiters.findIndex(w=>w.test(m));if(i>=0){const[w]=waiters.splice(i,1);clearTimeout(w.timer);w.ok_(m);}else inbox.push(m);}
    else if(op===9)s.write(frame(10,p));else if(op===8)c.closed=true;}};
   s.on('data',d=>{buffer=Buffer.concat([buffer,d]);parse();});s.on('error',()=>{});s.on('close',()=>{c.closed=true;});parse();
   let n=0;
   c.act=async(a,d={})=>{const id='p'+(++n)+'-'+Math.random();c.send({t:'act',id,a,d});return c.next(m=>m.t==='ack'&&m.id===id);};
   c.state=test=>c.next(m=>m.t==='state'&&(!c.room||m.room.code===c.room)&&(!test||test(m.room))).then(m=>m.room);
   c.hello=code=>{c.room=code;c.send({t:'hello',room:code});return c.state();};
   resolve(c);
  });
  req.on('error',reject);req.end();});
}
async function login(name,ip){
 let cookie='';const take=r=>{const v=r.headers.getSetCookie();if(v.length)cookie=v.map(x=>x.split(';')[0]).join('; ');};
 let r=await fetch(CAL+'/api/csrf',{headers:{'x-forwarded-for':ip}});take(r);const {token}=await r.json();
 r=await fetch(CAL+'/api/login',{method:'POST',headers:{'x-forwarded-for':ip,cookie,origin:'https://calendar.garyhub.uk','x-csrf-token':token,'content-type':'application/json'},body:JSON.stringify({username:'check_'+name,password:'Synthetic-Only-2026!'})});
 if(r.status!==200)throw Error('login '+name+' '+r.status);take(r);
 const me=(await (await fetch(CAL+'/api/me',{headers:{cookie}})).json()).user;
 const post=async(path,body,{origin=ORIGIN}={})=>{const token_=(await raw('/api/csrf',{cookie})).json().token;return raw(path,{cookie,method:'POST',headers:{origin,'x-csrf-token':token_},body:JSON.stringify({accountId:me.id,...body})});};
 const open=async()=>{const c=await socket({cookie});eq(c.status,101,'socket for '+name);await c.next(m=>m.t==='welcome');return c;};
 return {cookie,me,post,open,get:path=>raw(path,{cookie})};
}
(async()=>{
 assert.match(VERSION,/^\d+\.\d+\.\d+\.\d+$/);
 // The room page needs a sign-in and comes back to the same room; its scripts are public with a CSP that allows the socket.
 let r=await raw('/play/?room=ABCDEF');eq(r.status,302);const next=new URL(r.headers.location);eq(next.origin+next.pathname,'https://calendar.garyhub.uk/login/');eq(next.searchParams.get('next'),'https://games.garyhub.uk/play/?room=ABCDEF');
 eq((await raw('/play?room=ABCDEF')).headers.location,'/play/?room=ABCDEF');
 for(const asset of config.games_asset_checksums){
  r=await raw(asset.route+'?v='+VERSION);eq(r.status,200,asset.route);eq(sha(r.data),asset.sha256,asset.route);
  ok(/^default-src 'none'; script-src 'self'; style-src 'self';.*connect-src 'self' wss:\/\/games\.garyhub\.uk;/.test(r.headers['content-security-policy']),'CSP '+asset.route);
 }
 ok(config.games_asset_checksums.some(a=>a.route==='/play/play.js'),'room scripts are checked');
 // Only the games host upgrades, only on the room socket, only with a session; the origin is checked by Calendar.
 eq((await socket({})).status,401,'no session');
 eq((await raw(SOCKET)).status,404,'plain HTTP on the socket path');
 eq((await raw('/api/hub/play')).status,401);eq((await raw('/api/hub/play',{method:'POST'})).status,403);
 for(const path of ['/api/hub/play/1','/play/other.js','/games/play/play.js'])eq((await raw(path)).status,404,path);
 for(const host of ['tools.garyhub.uk','garyhub.uk'])for(const path of ['/games/play/index.html','/games/play/play.js'])eq((await raw(path,{host})).status,404,host+path);

 const alice=await login('alice','192.0.2.224'),bob=await login('bob','192.0.2.225'),admin=await login('admin','192.0.2.226');
 eq((await socket({cookie:alice.cookie,origin:'https://evil.example'})).status,403,'foreign origin');
 eq((await socket({cookie:alice.cookie,host:'tools.garyhub.uk'})).status,404,'other host');
 eq((await socket({cookie:alice.cookie,path:SOCKET+'x'})).status,404,'other path');
 for(const asset of config.games_page_checksums){r=await alice.get(asset.route+'?v='+VERSION);eq(r.status,200,asset.route);eq(sha(r.data),asset.sha256,asset.route);}
 // Creating a room: a trusted origin and the page token.
 eq((await alice.post('/api/hub/play',{game:'word'},{origin:'https://evil.example'})).status,403);
 eq((await alice.post('/api/hub/play',{game:'chess'})).status,400);
 r=await alice.post('/api/hub/play',{game:'word',settings:{limit:30,cap:5}});eq(r.status,200);const room=r.json().code;ok(/^[A-HJ-NP-Z2-9]{6}$/.test(room));

 // 词语默契 over real sockets.
 const a=await alice.open();let b=await bob.open();
 let view=await a.hello(room);eq([view.status,view.you,view.isHost],['lobby',0,true]);
 view=await b.hello(room);eq(view.you,1);
 // The invitation lands in the invited account's inbox (admin, not in the room).
 eq((await b.act('invite',{username:'check_admin'})).ok,true);
 r=await raw('/api/hub/notifications?scope=all',{host:'garyhub.uk',cookie:admin.cookie});ok(r.json().items.some(n=>n.type==='game'&&n.title.includes('check_bob 邀请你进房间')),'invitation notice');
 eq((await a.act('start')).ok,false,'not ready yet');
 await b.act('ready',{ready:true});eq((await a.act('start')).ok,true);
 view=await b.state(v=>v.status==='playing');ok(view.deadline>view.now,'server clock');
 await a.act('word',{text:'月亮'});
 view=await b.state(v=>v.state?.submitted[0]);ok(!JSON.stringify(view).includes('月亮'),'the other word stays hidden');
 eq((await b.act('word',{text:'星星'})).ok,true);
 view=await a.state(v=>v.state?.phase==='review');eq(view.state.history[0].words,['月亮','星星']);
 await a.act('review',{same:false});await b.act('review',{same:false});
 await b.state(v=>v.state?.round===2);
 eq((await a.act('word',{text:'星星'})).status,409,'used word');
 await a.act('word',{text:'夜空'});
 // Bob's connection goes away with only a FIN: after the grace period the clock stops; back again, nothing is lost.
 b.drop();
 view=await a.next(m=>m.t==='state'&&m.room.code===room&&!!m.room.paused,25000).then(m=>m.room);eq(view.paused.reason,'away');ok(view.remaining>0&&view.deadline===null,'clock stopped');
 b=await bob.open();view=await b.hello(room);
 eq(view.paused,null);eq(view.state.round,2);eq(view.state.submitted,[true,false]);ok(!JSON.stringify(view).includes('夜空'),'still hidden after reconnecting');
 await b.act('word',{text:'夜 空！'});
 view=await a.state(v=>v.status==='finished');eq([view.result.result,view.result.rounds],['success',2]);eq(view.tally,{played:1,success:1,best:2});

 // 对战猜数字 against the computer: it plays on its own and its secret only appears at the end.
 r=await alice.post('/api/hub/play',{game:'digits',settings:{limit:30}});const duel=r.json().code;
 view=await a.hello(duel);
 eq((await a.act('addBot',{level:'genius'})).status,400);
 eq((await a.act('addBot',{level:'normal'})).ok,true);eq((await a.act('start')).ok,true);
 await a.act('secret',{code:'4271'});
 view=await a.state(v=>v.state?.phase==='guess');eq(view.state.secrets,null);
 await a.act('guess',{code:'0123'});
 view=await a.state(v=>v.state?.round===2);
 const theirs=view.state.history[1][0];ok(theirs.timeout||/^\d{4}$/.test(theirs.guess),'the computer guessed');eq(view.state.secrets,null);
 eq((await a.act('forfeit')).ok,true);
 view=await a.state(v=>v.status==='finished');eq(view.result.winner,1);eq(view.state.secrets[0],'4271');ok(/^\d{4}$/.test(view.state.secrets[1]));
 const mine=view.state.history[0][0],score=(g,s)=>{let x=0,c=0;for(let i=0;i<4;i++)if(g[i]===s[i])x++;for(const d of g)if(s.includes(d))c++;return [x,c-x];};
 eq([mine.a,mine.b],score('0123',view.state.secrets[1]),'hint matches the revealed secret');
 // Both rooms are listed, and the new table is part of the account-deletion preview.
 r=await alice.get('/api/hub/play');const listed=r.json();ok([room,duel].every(code=>listed.rooms.some(x=>x.code===code)));eq(listed.recent.includes('check_bob'),true);
 const preview=await (await fetch(CAL+'/api/hub/admin/users/'+alice.me.id+'/deletion-preview',{headers:{cookie:admin.cookie}})).json();
 ok(preview.counts.play_rooms>=2,'deletion preview lists play_rooms');
 a.bye();b.bye();
 console.log('PLAY HTTP PASS: '+count+' assertions; room page and socket gates, hidden words, pause and resume, computer player, invitations and deletion preview verified.');
 process.exit(0);
})().catch(error=>{console.error(error);process.exit(1);});
