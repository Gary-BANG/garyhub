'use strict';
// Real WebSocket checks for v2.4.3.3 through Tools/Lab: 大富翁's new rules. The changed scripts (shared board, Tycoon,
// room page); a timed table that ends an hour after it starts; a classic table where two accounts trade (an offer, a
// counter-offer, only the asked player answers, the land and cash move), pass on land that then goes to auction (bids
// in turn, raises of at least 100, the land to the highest bid), and the computer's reasons, the effects list and the
// net-worth history arrive with the room.
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
 // The scripts this release changes, public with the games CSP and the released hashes.
 for(const route of ['/play/board.js','/play/monopoly.js','/play/play.js','/play/play.css']){
  const asset=config.games_asset_checksums.find(a=>a.route===route);ok(asset,'checked asset '+route);
  const r=await raw(route+'?v='+VERSION);eq(r.status,200,route);eq(sha(r.data),asset.sha256,route);ok(/connect-src 'self' wss:\/\/games\.garyhub\.uk;/.test(r.headers['content-security-policy']),'CSP '+route);
 }
 const alice=await login('alice','192.0.2.232'),bob=await login('bob','192.0.2.233');
 // Earlier suites leave rooms open and an account may be in three at most: leave them first.
 const tidy=async user=>{const open=(await raw('/api/hub/play',{cookie:user.cookie})).json().rooms.filter(x=>x.status!=='finished');if(!open.length)return 0;const c=await user.open();for(const x of open){await c.hello(x.code);await c.act('leave');}c.bye();return open.length;};
 await tidy(alice);await tidy(bob);
 eq((await alice.post('/api/hub/play',{game:'monopoly',settings:{mode:'sprint'}})).status,400);
 eq((await alice.post('/api/hub/play',{game:'monopoly',settings:{mode:'time',minutes:45}})).status,400);
 // A timed table ends about an hour after it starts.
 let r=await alice.post('/api/hub/play',{game:'monopoly',settings:{players:2,mode:'time',minutes:60,limit:0,auction:1,trade:1}});eq(r.status,200);
 const a=await alice.open();let view=await a.hello(r.json().code);
 eq([view.settings.mode,view.settings.minutes,view.settings.auction,view.settings.trade],['time',60,1,1]);
 await a.act('addBot',{level:'easy'});eq((await a.act('start')).ok,true);
 view=await a.state(v=>v.status==='playing');
 ok(Math.abs(view.state.endsAt-Date.now()-3600000)<120000,'ends in about an hour');eq([view.state.mode,view.state.rules],['time',{trade:true,auction:true}]);
 await a.act('leave');
 // A classic table: Alice, Bob and a computer.
 r=await alice.post('/api/hub/play',{game:'monopoly',settings:{players:3,mode:'classic',limit:0,auction:1,trade:1}});eq(r.status,200);const table=r.json().code;
 view=await a.hello(table);const b=await bob.open();await b.hello(table);
 await a.act('addBot',{level:'normal'});await b.act('ready',{ready:true});eq((await a.act('start')).ok,true);
 view=await a.state(v=>v.status==='playing');eq([view.state.mode,view.state.maxRounds],['classic',null]);
 const A=0,B=1,BOT=2,socketOf=s=>s===A?a:s===B?b:null;
 const latest=async()=>{await sleep(150);const list=a.inbox.filter(m=>m.t==='state'&&m.room.code===table&&m.room.state);a.inbox.length=0;b.inbox.length=0;if(list.length)view=list.at(-1).room;return view;};
 // Plays the two accounts' moves until `stop`; the computer plays its own. Offers from the computer are refused.
 async function drive(stop,policy={},tries=600){
  for(let i=0;i<tries;i++){
   await latest();const s=view.state;
   if(stop(view)||view.status!=='playing')return view;
   const who=s.actor,c=socketOf(who);if(!c)continue;
   let move;
   if(s.trade)move=['rejectTrade'];
   else if(s.phase==='auction')move=(policy.auction&&await policy.auction(who,s))||['fold'];
   else if(s.phase==='roll')move=['roll'];
   else if(s.phase==='buy')move=[policy.buy?'buy':'pass'];
   else if(s.phase==='debt')move=[s.players[who].cash>=s.pending.amount?'pay':'bankrupt'];
   else move=['end'];
   const res=await c.act(move[0],move[1]||{});
   if(!res.ok&&res.status!==409)throw Error(move[0]+' '+JSON.stringify(res));
  }
  throw Error('the table did not get there in time');
 }
 // A trade: the player whose turn it is offers a city for cash; the other counters; the counter is accepted.
 view=await drive(v=>v.state.phase==='manage'&&(v.state.turn===A||v.state.turn===B)&&Object.values(v.state.owner).includes(v.state.turn),{buy:true});
 const T=view.state.turn,O=T===A?B:A,tile=Number(Object.keys(view.state.owner).find(i=>view.state.owner[i]===T));
 const cash=[view.state.players[T].cash,view.state.players[O].cash];
 eq((await socketOf(T).act('proposeTrade',{to:O,give:{tiles:[999]},get:{cash:500}})).status,400,'land that is not yours');
 eq((await socketOf(T).act('proposeTrade',{to:O,give:{tiles:[tile]},get:{cash:500}})).ok,true);
 view=await latest();eq([view.state.trade.from,view.state.trade.to,view.state.actor],[T,O,O]);
 eq((await socketOf(T).act('end')).status,409,'waits for the answer');
 eq((await socketOf(O).act('counterTrade',{give:{cash:300},get:{tiles:[tile]}})).ok,true);
 view=await latest();eq([view.state.trade.from,view.state.trade.counters,view.state.actor],[O,1,T]);
 eq((await socketOf(O).act('acceptTrade')).status,409,'only the one asked answers');
 eq((await socketOf(T).act('acceptTrade')).ok,true);
 view=await latest();eq([view.state.owner[tile],view.state.players[T].cash-cash[0],view.state.players[O].cash-cash[1],view.state.trade],[O,300,-300,null]);
 ok(view.state.log.some(e=>e.kind==='trade'&&e.seat===O&&e.to===T),'the trade is in the log');
 await socketOf(T).act('end');
 // An auction: Alice and Bob pass on land; bids go round in turn; a raise below the minimum is refused.
 view=await drive(v=>v.state.phase==='auction'&&v.state.turn!==BOT,{buy:false});
 const lot=view.state.auction.tile;let refused=false,bid=false;
 view=await drive(v=>v.state.phase!=='auction',{auction:async(who,s)=>{
  if(who===A&&!refused){refused=true;eq((await a.act('bid',{amount:s.auction.bid+50})).status,409,'raise by at least 100');}
  if(who===A&&!bid){bid=true;return ['bid',{amount:s.auction.bid+100}];}
  return ['fold'];
 }});
 const outcome=view.state.log.find(e=>(e.kind==='won'||e.kind==='unsold')&&e.tile===lot);ok(outcome,'the auction ended');
 ok(outcome.kind==='won'?view.state.owner[lot]===outcome.seat:view.state.owner[lot]==null,'the land went to the highest bid');
 ok(refused&&bid,'Alice bid in her turn');
 // A few more turns: the computer explains itself; nobody else's moves carry reasons; the page's effects come in order.
 view=await drive(v=>v.state.log.some(e=>e.why),{buy:true});
 ok(view.state.log.filter(e=>e.why).every(e=>e.why.by===BOT),'reasons only from the computer');
 ok(view.state.fx.length&&view.state.fx.every((f,i,l)=>!i||f.id>l[i-1].id)&&view.state.fx.some(f=>f.t==='dice'),'effects in order');
 ok(view.state.history.length>=1&&view.state.history.every(row=>row.length===3),'net worth by round');
 a.bye();b.bye();
 console.log('TYCOON HTTP PASS: '+count+' assertions; released scripts, ways to win, a trade with a counter-offer, an auction in turn, the computer’s reasons and the effects list verified.');
 process.exit(0);
})().catch(error=>{console.error(error);process.exit(1);});
