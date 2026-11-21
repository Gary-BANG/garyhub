'use strict';
// Real WebSocket checks for v2.4.3.2 through Tools/Lab: the board games. Released scripts (shared board, 骰子抢宝箱, 大富翁);
// a treasure room whose seat count follows the settings, where two accounts and a computer take turns in order, chest
// contents never reach the pages, a player who drops out (FIN only) is played by the computer (托管) while the game goes
// on, and takes over again on return; and a 大富翁 table where two computers play their own turns.
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
 // The released board-game scripts, public with the games CSP.
 for(const route of ['/play/board.js','/play/treasure.js','/play/monopoly.js']){
  const asset=config.games_asset_checksums.find(a=>a.route===route);ok(asset,'checked asset '+route);
  const r=await raw(route+'?v='+VERSION);eq(r.status,200,route);eq(sha(r.data),asset.sha256,route);ok(/connect-src 'self' wss:\/\/games\.garyhub\.uk;/.test(r.headers['content-security-policy']),'CSP '+route);
 }
 const alice=await login('alice','192.0.2.229'),bob=await login('bob','192.0.2.230');
 eq((await alice.post('/api/hub/play',{game:'treasure',settings:{players:5}})).status,400);
 let r=await alice.post('/api/hub/play',{game:'treasure',settings:{players:3,rounds:8,limit:0}});eq(r.status,200);const room=r.json().code;
 const a=await alice.open();let b=await bob.open();
 let view=await a.hello(room);eq([view.seats.length,view.rules.autoplay],[3,true]);
 eq((await a.act('settings',{settings:{players:4,rounds:8,limit:0}})).ok,true);view=await a.state(v=>v.seats.length===4);
 eq((await a.act('settings',{settings:{players:3,rounds:8,limit:0}})).ok,true);
 await b.hello(room);eq((await b.act('settings',{settings:{players:2,rounds:8,limit:0}})).status,403);
 eq((await a.act('addBot',{level:'normal'})).ok,true);await b.act('ready',{ready:true});eq((await a.act('start')).ok,true);
 view=await a.state(v=>v.status==='playing');eq([view.state.turn,view.state.players.length],[0,3]);
 ok(view.state.chests.length===3&&view.state.chests.every(c=>!('value' in c)),'chest contents stay on the server');
 eq((await b.act('roll')).status,409,'not his turn');
 // Alice, Bob, then the computer: back to Alice.
 await a.act('roll');view=await a.state(v=>v.state?.phase==='move');await a.act('move',{to:view.state.players[0].pos});
 await b.act('roll');view=await b.state(v=>v.state?.phase==='move'&&v.state.turn===1);await b.act('move',{to:view.state.players[1].pos});
 view=await a.state(v=>v.state?.turn===0&&v.state.round===2);ok(view.state.log.some(e=>e.seat===2&&e.kind==='roll'),'the computer took its turn');
 // Bob goes away (FIN only): after the grace period the computer plays for him and the game does not pause.
 b.drop();
 view=await a.next(m=>m.t==='state'&&m.room.code===room&&m.room.seats[1].auto,25000).then(m=>m.room);eq(view.paused,null);
 await a.act('roll');view=await a.state(v=>v.state?.phase==='move');await a.act('move',{to:view.state.players[0].pos});
 view=await a.state(v=>v.state?.turn===0&&v.state.round===3);ok(view.state.log.some(e=>e.seat===1&&e.kind==='roll'),'his turn was played for him');
 b=await bob.open();view=await b.hello(room);eq(view.seats[1].auto,true);
 eq((await b.act('takeover',{auto:false})).ok,true);view=await b.state(v=>v.seats[1].auto===false);
 // 大富翁 with two computers: 32 squares, everyone starts with 15,000, the computers play their own turns.
 r=await alice.post('/api/hub/play',{game:'monopoly',settings:{players:3,rounds:15,limit:0}});eq(r.status,200);const table=r.json().code;
 view=await a.hello(table);eq(view.seats.length,3);
 await a.act('addBot',{level:'smart'});await a.act('addBot',{level:'easy'});eq((await a.act('start')).ok,true);
 view=await a.state(v=>v.status==='playing');eq(view.state.tiles.length,32);ok(view.state.players.every(p=>p.cash===15000));
 const latest=async()=>{await sleep(200);const list=a.inbox.filter(m=>m.t==='state'&&m.room.code===table&&m.room.state);a.inbox.length=0;if(list.length)view=list.at(-1).room;return view;};
 for(let i=0;i<120&&!(view.state.turn===0&&view.state.phase==='roll');i++)await latest();
 eq([view.state.turn,view.state.phase],[0,'roll']);
 for(let i=0;i<20&&view.state.turn===0;i++){const p=view.state.phase;eq((await a.act(p==='roll'?'roll':p==='buy'?'buy':p==='debt'?'bankrupt':'end')).ok,true,p);await latest();}
 for(let i=0;i<150&&!(view.state.turn===0&&view.state.phase==='roll');i++)await latest();
 ok(view.state.log.some(e=>e.seat===1&&e.kind==='roll')&&view.state.log.some(e=>e.seat===2&&e.kind==='roll'),'both computers rolled');
 eq((await a.act('takeover',{auto:true})).ok,true);view=await a.state(v=>v.seats[0].auto);
 eq((await a.act('takeover',{auto:false})).ok,true);
 a.bye();b.bye();
 console.log('BOARDS HTTP PASS: '+count+' assertions; released board scripts, seat counts, computer turns, hidden chests, 托管 and take over, a Tycoon table verified.');
 process.exit(0);
})().catch(error=>{console.error(error);process.exit(1);});
