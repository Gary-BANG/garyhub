'use strict';
// Real WebSocket checks for v2.4.3.1 through Tools/Lab: 合作小车 rooms. Released car scripts on the games host; then a whole
// room of two accounts: frames about twenty times a second with server times, pedals only from the pedal seat and
// steering only from the steering seat, the latest control echoed in frames, quick calls to both players, a flood of
// controls dropped without closing, a player who drops out (FIN only) released at once and the room paused within the
// realtime grace, a countdown on return, and the host starting the next level at once from a finished run.
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
function frame(opcode,payload){const key=crypto.randomBytes(4),body=Buffer.from(payload);for(let i=0;i<body.length;i++)body[i]^=key[i&3];
 const head=body.length<126?Buffer.from([0x80|opcode,0x80|body.length]):Buffer.from([0x80|opcode,0x80|126,body.length>>8,body.length&255]);return Buffer.concat([head,key,body]);}
function socket(cookie){
 return new Promise((resolve,reject)=>{const url=new URL(LAB);
  const req=http.request({hostname:url.hostname,port:url.port,path:SOCKET,method:'GET',agent:false,headers:{host:HOST,connection:'Upgrade',upgrade:'websocket','sec-websocket-version':'13','sec-websocket-key':crypto.randomBytes(16).toString('base64'),cookie,origin:ORIGIN}});
  req.on('response',res=>{res.resume();reject(Error('socket refused '+res.statusCode));});
  req.on('upgrade',(res,s,head)=>{
   let buffer=Buffer.from(head||[]);const inbox=[],waiters=[];
   const c={s,closed:false,inbox,send:m=>s.write(frame(1,JSON.stringify(m))),bye:()=>{try{s.write(frame(8,Buffer.from([3,232])));}catch{}s.end();},drop:()=>s.end(),
    next(test,ms=15000){const i=inbox.findIndex(test);if(i>=0)return Promise.resolve(inbox.splice(i,1)[0]);
     return new Promise((ok_,no)=>{const w={test,ok_,timer:setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);no(Error('no message in time'));},ms)};waiters.push(w);});}};
   const parse=()=>{while(buffer.length>=2){const op=buffer[0]&15;let len=buffer[1]&127,off=2;if(len===126){if(buffer.length<4)return;len=buffer.readUInt16BE(2);off=4;}else if(len===127){if(buffer.length<10)return;len=Number(buffer.readBigUInt64BE(2));off=10;}
    if(buffer.length<off+len)return;const p=buffer.subarray(off,off+len);buffer=buffer.subarray(off+len);
    if(op===1){const m=JSON.parse(p.toString());const i=waiters.findIndex(w=>w.test(m));if(i>=0){const[w]=waiters.splice(i,1);clearTimeout(w.timer);w.ok_(m);}else inbox.push(m);}
    else if(op===9)s.write(frame(10,p));else if(op===8)c.closed=true;}};
   s.on('data',d=>{buffer=Buffer.concat([buffer,d]);parse();});s.on('error',()=>{});s.on('close',()=>{c.closed=true;});parse();
   let n=0;
   c.act=async(a,d={})=>{const id='c'+(++n)+'-'+Math.random();c.send({t:'act',id,a,d});return c.next(m=>m.t==='ack'&&m.id===id);};
   c.state=test=>c.next(m=>m.t==='state'&&m.room.code===c.room&&(!test||test(m.room))).then(m=>m.room);
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
 const post=async(path,body)=>{const token_=(await raw('/api/csrf',{cookie})).json().token;return raw(path,{cookie,method:'POST',headers:{origin:ORIGIN,'x-csrf-token':token_},body:JSON.stringify({accountId:me.id,...body})});};
 const open=async()=>{const c=await socket(cookie);await c.next(m=>m.t==='welcome');return c;};
 return {cookie,me,post,open};
}
(async()=>{
 assert.match(VERSION,/^\d+\.\d+\.\d+\.\d+$/);
 // The released car scripts, public with the games CSP; the page loads both.
 for(const route of ['/play/car.js','/play/car-sim.js']){
  const asset=config.games_asset_checksums.find(a=>a.route===route);ok(asset,'checked asset '+route);
  const r=await raw(route+'?v='+VERSION);eq(r.status,200,route);eq(sha(r.data),asset.sha256,route);ok(/connect-src 'self' wss:\/\/games\.garyhub\.uk;/.test(r.headers['content-security-policy']),'CSP '+route);
 }
 ok(/typeof module === 'object' && module\.exports/.test((await raw('/play/car-sim.js?v='+VERSION)).text),'one file for the server and the page');

 const alice=await login('alice','192.0.2.227'),bob=await login('bob','192.0.2.228');
 eq((await alice.post('/api/hub/play',{game:'car',settings:{level:4}})).status,400);
 let r=await alice.post('/api/hub/play',{game:'car',settings:{level:1,steer:0,easy:0}});eq(r.status,200);const room=r.json().code;
 const a=await alice.open();let b=await bob.open();
 let view=await a.hello(room);eq([view.game,view.rules.bots],['car',[]]);
 await b.hello(room);eq((await b.act('addBot',{level:'easy'})).ok,false);
 await b.act('ready',{ready:true});eq((await a.act('start')).ok,true);
 view=await b.state(v=>v.status==='playing');eq([view.state.role,view.state.phase],['gas','countdown']);
 // About twenty frames a second, with the server's time.
 await a.next(m=>m.t==='f',5000);a.inbox.length=0;
 const t0=Date.now();await sleep(1000);
 const frames=a.inbox.filter(m=>m.t==='f');
 ok(frames.length>=14&&frames.length<=26,'frames per second: '+frames.length);
 ok(frames.every(m=>Math.abs(m.s-t0)<5000&&typeof m.d.x==='number'&&Array.isArray(m.d.q)),'frame shape');
 ok(frames.every(m=>JSON.stringify(m).length<400),'frames stay small');
 await a.state(v=>v.state?.phase==='running');
 // Pedals only from the pedal seat; steering only from the steering seat; the latest control comes back in frames.
 a.send({t:'in',q:1,k:{gas:1,steer:0.4}});b.send({t:'in',q:9,k:{gas:1,steer:-1}});
 const echo=await a.next(m=>m.t==='f'&&m.d.q[1]===9&&m.d.q[0]===1&&m.d.v>2,5000);
 eq([echo.d.gas,echo.d.steer],[1,0.4],'gas from bob, steering from alice');
 // Quick calls reach both players once; unknown ones do not.
 b.send({t:'say',c:'slow'});b.send({t:'say',c:'slow'});b.send({t:'say',c:'explode'});
 const said=await a.next(m=>m.t==='said',3000);eq([said.seat,said.c],[1,'slow']);eq((await b.next(m=>m.t==='said',3000)).c,'slow');
 await sleep(300);eq(a.inbox.filter(m=>m.t==='said').length,0,'one call only');
 // A flood of controls is dropped, the connection stays.
 for(let i=0;i<200;i++)b.send({t:'in',q:100+i,k:{gas:1}});
 await sleep(500);eq(b.closed,false);
 // Bob goes away with only a FIN: the room pauses within the realtime grace (3 s) and the frames stop.
 const dropped=Date.now();b.drop();
 view=await a.next(m=>m.t==='state'&&m.room.code===room&&!!m.room.paused,8000).then(m=>m.room);
 ok(Date.now()-dropped<6000,'paused within the grace');eq(view.state.gas,0,'his pedals were released');
 a.inbox.length=0;await sleep(500);eq(a.inbox.filter(m=>m.t==='f').length,0,'no frames while paused');
 b=await bob.open();view=await b.hello(room);
 eq(view.paused,null);eq(view.state.phase,'countdown');
 await a.next(m=>m.t==='f'&&m.d.p==='countdown',3000);
 // From a finished run the host starts the next level at once; the other player cannot.
 await b.act('leave');
 view=await a.state(v=>v.status==='finished');eq(view.result.result,'aborted');
 eq((await a.act('rematch',{start:true})).ok,false,'a seat is empty');
 b=await bob.open();await b.hello(room);
 eq((await b.act('rematch',{start:true})).status,403);
 eq((await a.act('rematch',{start:true,settings:{level:2,steer:1,easy:1}})).ok,true);
 view=await b.state(v=>v.status==='playing'&&v.matches===1);
 eq([view.state.level,view.state.role,view.state.easy],[2,'steer',true]);
 a.bye();b.bye();
 console.log('CAR HTTP PASS: '+count+' assertions; released car scripts, frames, role-gated controls and echo, quick calls, floods, drop and return, instant next level verified.');
 process.exit(0);
})().catch(error=>{console.error(error);process.exit(1);});
