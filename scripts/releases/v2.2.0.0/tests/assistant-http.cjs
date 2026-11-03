'use strict';
// Isolated v2.2.0.0 check: the companion assistant through Calendar and the Tools/Lab proxy.
// A stand-in chat-completions server runs in this process; Calendar reaches it through
// GARYHUB_ASSISTANT_ENDPOINT, so no real key or network leaves the test containers.
const assert=require('node:assert/strict'),http=require('node:http');
const CAL=process.env.CHECK_CALENDAR||'http://calendar-check:3000',LAB=process.env.CHECK_LAB||'http://lab-check:3000';
const PORT=Number(process.env.ASSISTANT_FAKE_PORT||4011),KEY='synthetic-assistant-key-0042';
let count=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);count++;};
const seen=[],script=[];
const call=(name,args)=>({role:'assistant',content:null,tool_calls:[{id:'call_'+name,type:'function',function:{name,arguments:JSON.stringify(args)}}]});
const lastTool=body=>JSON.parse(body.messages.filter(m=>m.role==='tool').at(-1).content);
const model=http.createServer((req,res)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{const body=JSON.parse(raw);seen.push({auth:req.headers.authorization,body});let reply=script.shift()||{content:'好的。'};if(typeof reply==='function')reply=reply(body);res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{message:reply}]}));});});
async function session(username){
 let cookie='';const take=r=>{if(r.headers.getSetCookie().length)cookie=r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');};
 let r=await fetch(CAL+'/api/csrf');take(r);const {token}=await r.json();
 r=await fetch(CAL+'/api/login',{method:'POST',headers:{cookie,origin:'https://calendar.garyhub.uk','x-csrf-token':token,'content-type':'application/json'},body:JSON.stringify({username,password:'Synthetic-Only-2026!'})});take(r);eq(r.status,200,'login '+username);
 // Each host gets its own CSRF token from the same shared session.
 const send=async(base,origin,path,method='GET',body)=>{const headers={cookie,origin};if(method!=='GET'){const t=await(await fetch(base+'/api/csrf',{headers:{cookie}})).json();Object.assign(headers,{'x-csrf-token':t.token,'content-type':'application/json'});}
  const response=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined});const text=await response.text();assert.ok(!text.includes(KEY),'the key never reaches a browser: '+path);return {status:response.status,body:text.startsWith('{')||text.startsWith('[')?JSON.parse(text):text};};
 return {lab:(...a)=>send(LAB,'https://tools.garyhub.uk',...a),cal:(...a)=>send(CAL,'https://calendar.garyhub.uk',...a),cookie};
}
(async()=>{
 await new Promise(resolve=>model.listen(PORT,'127.0.0.1',resolve));
 try{
  for(const base of [CAL,LAB])eq((await fetch(base+'/api/assistant/status')).status,401,'guests are refused');
  const alice=await session('check_alice'),admin=await session('check_admin'),bob=await session('check_bob');
  eq((await alice.lab('/api/assistant/status')).body.enabled,false);
  eq((await alice.lab('/api/assistant/chat','POST',{message:'今天有什么安排'})).status,503);
  eq((await alice.lab('/api/assistant/admin/settings')).status,403);
  const saved=await admin.lab('/api/assistant/admin/settings','PUT',{enabled:true,provider:'bigmodel',model:'glm-4.7-flash',dailyLimit:20,apiKey:KEY});
  eq(saved.status,200);eq(saved.body.keyHint,'••••0042');eq(saved.body.keySet,true);
  eq((await alice.lab('/api/assistant/status')).body.enabled,true);
  const tasks=async()=>(await alice.cal('/api/tasks')).body.length,before=await tasks();

  script.push(call('add_task',{title:'Dentist',start_date:'2026-11-12',time:'15:00'}),{content:'请确认。'});
  const added=await alice.lab('/api/assistant/chat','POST',{message:'下周四下午三点看牙',lang:'zh',character:'milu'});
  eq(added.status,200);eq(added.body.actions.length,1);eq(added.body.actions[0].summary.title,'15:00 Dentist');
  eq(seen[0].auth,'Bearer '+KEY);eq(seen[0].body.thinking,{type:'disabled'});eq(seen[0].body.model,'glm-4.7-flash');
  eq(lastTool(seen[1].body).status,'waiting_for_user_confirmation');
  eq(await tasks(),before,'nothing is written before confirmation');
  const id=added.body.actions[0].id;
  eq((await bob.cal(`/api/assistant/actions/${id}/confirm`,'POST',{})).status,404,'another account cannot confirm');
  eq((await alice.lab(`/api/assistant/actions/${id}/confirm`,'POST',{})).status,200);
  eq((await alice.cal(`/api/assistant/actions/${id}/confirm`,'POST',{})).status,409,'a card applies once');
  eq(await tasks(),before+1);

  script.push(call('list_tasks',{from:'2026-11-01',to:'2026-11-30',keyword:'Dentist'}),body=>call('delete_task',{task_id:lastTool(body).tasks[0].task_id}),{content:'请确认删除。'});
  const removal=await alice.cal('/api/assistant/chat','POST',{message:'删掉看牙',lang:'zh'});
  eq(removal.body.actions[0].kind,'delete_task');
  eq((await alice.cal(`/api/assistant/actions/${removal.body.actions[0].id}/confirm`,'POST',{})).status,200);
  eq(await tasks(),before);

  eq((await fetch(LAB+'/api/assistant/chat',{method:'POST',headers:{cookie:alice.cookie,origin:'https://evil.example','content-type':'application/json'},body:'{}'})).status,403,'untrusted origins are refused');
  eq((await alice.lab('/api/assistant/status','DELETE')).status,405);
  const page=await admin.lab('/admin/');eq(page.status,200);eq(page.body.includes('/assistant-admin.js?v=2.2.0.0'),true);
  for(const asset of ['/companion/assistant.js?v=2.2.0.0','/assistant-admin.js?v=2.2.0.0'])eq((await fetch(LAB+asset)).status,200,asset);
  eq((await fetch(CAL+'/companion/assistant.js?v=2.2.0.0')).status,200);
  const off=await admin.lab('/api/assistant/admin/settings','PUT',{enabled:false,provider:'bigmodel',model:'glm-4.7-flash',dailyLimit:20,clearKey:true});
  eq(off.body.keySet,false);eq((await alice.lab('/api/assistant/status')).body.enabled,false);
  console.log('ASSISTANT HTTP PASS: '+count+' assertions; confirmation-only changes, owner checks, proxy origin rules and a private key.');
 }finally{model.close();}
})().catch(e=>{console.error(e);process.exit(1);});
