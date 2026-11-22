'use strict';
// Real WebSocket checks for v2.4.3.4 through Tools/Lab: 大富翁's computer players and bankruptcy. The changed Tycoon
// script; a new table settles bankruptcy with the bank (state.liquidate) while the v2.4.3.3 rules object stays as it
// was; a classic table with a sharp and an easy computer plays three rounds: the computers keep moving (a failing
// computer move would stall the table), every reason in the log is a known one and comes from a computer seat, offers
// they make are answered, nobody's cash goes below zero and land belongs only to players still in the game.
const assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto');
const config=require('./asset-checks.json');
const CAL=process.env.CHECK_CALENDAR||'http://calendar-check:3000',LAB=process.env.CHECK_LAB||'http://lab-check:3000',VERSION=process.env.CHECK_VERSION;
const HOST='games.garyhub.uk',ORIGIN='https://'+HOST,SOCKET='/api/hub/play/socket';
const REASONS=['complete','block','pair','value','cash','reserve','late','random','ahead','build','raise','redeem','early','hide','poor',
 'want','swap','fair','unfair','gift','ask','limit','autoplay','closer','sale','swap2','plan','cheap'];
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
   const c={s,closed:false,inbox,send:m=>s.write(frame(1,JSON.stringify(m))),bye:()=>{try{s.write(frame(8,Buffer.from([3,232])));}catch{}s.end();},
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
 // The script this release changes, public with the games CSP and the released hash.
 const asset=config.games_asset_checksums.find(a=>a.route==='/play/monopoly.js');ok(asset,'checked asset');
 let r=await raw('/play/monopoly.js?v='+VERSION);eq(r.status,200);eq(sha(r.data),asset.sha256);
 ok(/connect-src 'self' wss:\/\/games\.garyhub\.uk;/.test(r.headers['content-security-policy']),'CSP');
 ok(r.text.includes("case 'sale':")&&r.text.includes('e.liquidate'),'the new reasons and the settled bankruptcy are worded');
 const alice=await login('alice','192.0.2.234');
 // Earlier suites leave rooms open and an account may be in three at most: leave them first.
 const open=(await raw('/api/hub/play',{cookie:alice.cookie})).json().rooms.filter(x=>x.status!=='finished');
 if(open.length){const c=await alice.open();for(const x of open){await c.hello(x.code);await c.act('leave');}c.bye();}
 // A classic table: Alice, a sharp and an easy computer.
 r=await alice.post('/api/hub/play',{game:'monopoly',settings:{players:3,mode:'classic',limit:0,auction:1,trade:1}});eq(r.status,200);const table=r.json().code;
 const a=await alice.open();let view=await a.hello(table);
 eq((await a.act('addBot',{level:'smart'})).ok,true);eq((await a.act('addBot',{level:'easy'})).ok,true);eq((await a.act('start')).ok,true);
 view=await a.state(v=>v.status==='playing');
 eq([view.state.liquidate,view.state.rules,view.state.maxRounds],[true,{trade:true,auction:true},null],'settles bankruptcy with the bank; the rules object is unchanged');
 const me=view.seats.findIndex(s=>!s.bot&&!s.empty);ok(me>=0&&view.seats.filter(s=>s.bot).length===2,'Alice and two computers');
 const bots=[0,1,2].filter(i=>i!==me);
 const latest=async()=>{await sleep(150);const list=a.inbox.filter(m=>m.t==='state'&&m.room.code===table&&m.room.state);a.inbox.length=0;if(list.length)view=list.at(-1).room;return view;};
 let offers=0,steps=0;const started=Date.now();
 while(view.status==='playing'&&view.state.round<4){
  if(Date.now()-started>240000)throw Error('the table did not reach round 4 in time (round '+view.state.round+', phase '+view.state.phase+', actor '+view.state.actor+')');
  await latest();const s=view.state;if(s.actor!==me)continue;
  let move;
  if(s.trade){offers++;move=['rejectTrade'];}
  else if(s.phase==='auction')move=['fold'];
  else if(s.phase==='roll')move=['roll'];
  else if(s.phase==='buy')move=[s.players[me].cash-s.pending.price>=3000?'buy':'pass'];
  else if(s.phase==='debt')move=[s.players[me].cash>=s.pending.amount?'pay':'bankrupt'];
  else move=['end'];
  const res=await a.act(move[0],move[1]||{});steps++;
  if(!res.ok&&res.status!==409)throw Error(move[0]+' '+JSON.stringify(res));
 }
 const s=view.state;
 ok(view.status!=='playing'||s.round>=4,'three rounds were played');
 ok(bots.every(seat=>s.log.some(e=>e.seat===seat&&e.kind==='roll')||s.players[seat].out),'both computers moved');
 const reasons=s.log.filter(e=>e.why);
 ok(reasons.length>0,'the computers explained themselves');
 ok(reasons.every(e=>bots.includes(e.why.by)&&REASONS.includes(e.why.c)),'known reasons, only from computer seats');
 ok(s.players.every(p=>p.cash>=0),'no cash below zero');
 ok(Object.values(s.owner).every(o=>!s.players[o].out),'land only with players still in');
 for(const e of s.log.filter(x=>x.kind==='bankrupt'))ok(e.liquidate===true&&Number.isInteger(e.amount),'a bankruptcy is settled with the bank');
 ok(s.history.length>=3&&s.history.every(row=>row.length===3),'net worth by round');
 await a.act('leave');a.bye();
 console.log('TYCOON BOTS HTTP PASS: '+count+' assertions; released script, bankruptcy settled with the bank on new tables, three rounds with a sharp and an easy computer ('+steps+' moves by Alice, '+offers+' offers answered) and their reasons verified.');
 process.exit(0);
})().catch(error=>{console.error(error);process.exit(1);});
