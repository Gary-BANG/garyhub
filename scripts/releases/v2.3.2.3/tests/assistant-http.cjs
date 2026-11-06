'use strict';
// Isolated v2.3.0.0 check: the companion assistant through Calendar and the Tools/Lab proxy, with the
// fallback model, web search, server memory, tier allowances and the admin AI log tool.
// A stand-in chat-completions and web-search server runs in this process; Calendar reaches it through
// GARYHUB_ASSISTANT_ENDPOINT / GARYHUB_ASSISTANT_SEARCH_ENDPOINT, so no real key or network is used.
const assert=require('node:assert/strict'),http=require('node:http');
const CAL=process.env.CHECK_CALENDAR||'http://calendar-check:3000',LAB=process.env.CHECK_LAB||'http://lab-check:3000',V=process.env.CHECK_VERSION||'2.3.0.0';
const PORT=Number(process.env.ASSISTANT_FAKE_PORT||4011),KEY='synthetic-assistant-key-0042';
let count=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);count++;};
const seen=[],script=[],searches=[];
const call=(name,args)=>({role:'assistant',content:null,tool_calls:[{id:'call_'+name,type:'function',function:{name,arguments:JSON.stringify(args)}}]});
const lastTool=body=>JSON.parse(body.messages.filter(m=>m.role==='tool').at(-1).content);
const model=http.createServer((req,res)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{const body=JSON.parse(raw);res.setHeader('content-type','application/json');
 if(req.url.endsWith('/web_search')){searches.push(body);return res.end(JSON.stringify({search_result:[{title:'Synthetic news',link:'https://news.example/item',media:'Example',content:'Synthetic summary.'}]}));}
 seen.push({auth:req.headers.authorization,body});let reply=script.shift()||{content:'好的。'};if(typeof reply==='function')reply=reply(body);
 if(reply.status){res.statusCode=reply.status;return res.end(JSON.stringify({error:{code:reply.code||'1',message:'provider detail '+KEY}}));}
 res.end(JSON.stringify({choices:[{message:reply}],usage:{prompt_tokens:50,completion_tokens:5}}));});});
async function session(username){
 let cookie='';const take=r=>{if(r.headers.getSetCookie().length)cookie=r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');};
 let r=await fetch(CAL+'/api/csrf');take(r);const {token}=await r.json();
 r=await fetch(CAL+'/api/login',{method:'POST',headers:{cookie,origin:'https://calendar.garyhub.uk','x-csrf-token':token,'content-type':'application/json'},body:JSON.stringify({username,password:'Synthetic-Only-2026!'})});take(r);eq(r.status,200,'login '+username);
 // Each host gets its own CSRF token from the same shared session.
 const send=async(base,origin,path,method='GET',body)=>{const headers={cookie,origin};if(method!=='GET'){const t=await(await fetch(base+'/api/csrf',{headers:{cookie}})).json();Object.assign(headers,{'x-csrf-token':t.token,'content-type':'application/json'});}
  const response=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined,redirect:'manual'});const text=await response.text();assert.ok(!text.includes(KEY),'the key never reaches a browser: '+path);return {status:response.status,body:text.startsWith('{')||text.startsWith('[')?JSON.parse(text):text};};
 return {lab:(...a)=>send(LAB,'https://tools.garyhub.uk',...a),cal:(...a)=>send(CAL,'https://calendar.garyhub.uk',...a),cookie};
}
const quotas={chat:{standard:200,subscriber:200,admin:500},data:{standard:30,subscriber:50,admin:200},search:{standard:5,subscriber:30,admin:100}};
const settings=extra=>({enabled:true,provider:'bigmodel',model:'glm-4.7-flash',fallbackModel:'glm-4-flashx-250414',search:true,quotas,...extra});
(async()=>{
 await new Promise(resolve=>model.listen(PORT,'127.0.0.1',resolve));
 try{
  for(const base of [CAL,LAB])eq((await fetch(base+'/api/assistant/status')).status,401,'guests are refused');
  const alice=await session('check_alice'),admin=await session('check_admin'),bob=await session('check_bob');
  eq((await alice.lab('/api/assistant/status')).body.enabled,false);
  const off=await alice.lab('/api/assistant/chat','POST',{message:'今天有什么安排'});eq([off.status,off.body.code],[503,'disabled']);
  eq((await alice.lab('/api/assistant/admin/settings')).status,403);
  const saved=await admin.lab('/api/assistant/admin/settings','PUT',settings({apiKey:KEY}));
  eq(saved.status,200);eq(saved.body.keyHint,'••••0042');eq(saved.body.fallbackModel,'glm-4-flashx-250414');eq(saved.body.quotas,quotas);
  const st=(await alice.lab('/api/assistant/status')).body;eq([st.enabled,st.tier,st.search,st.quota.data.limit],[true,'standard',true,30]);
  eq((await admin.lab('/api/assistant/status')).body.quota.data.limit,200,'admins get their own allowance');
  const tasks=async()=>(await alice.cal('/api/tasks')).body.length,before=await tasks();

  script.push(call('add_task',{title:'Dentist',start_date:'2026-11-12',time:'15:00'}),{content:'请确认。'});
  const added=await alice.lab('/api/assistant/chat','POST',{message:'下周四下午三点看牙',lang:'zh',character:'milu'});
  eq(added.status,200);eq(added.body.actions[0].summary.title,'15:00 Dentist');eq(added.body.counted,['chat','data']);
  eq(seen[0].auth,'Bearer '+KEY);eq(seen[0].body.thinking,{type:'disabled'});eq(seen[0].body.model,'glm-4.7-flash');
  eq(seen[0].body.tools.map(t=>t.function.name),['read_health','change_health','read_todos','change_todo','update_task','complete_task','set_pending_category','add_expense','add_fixed_expense','list_tasks','add_task','delete_task','open_page','web_search']);
  eq(await tasks(),before,'nothing is written before confirmation');
  const id=added.body.actions[0].id;
  eq((await bob.cal(`/api/assistant/actions/${id}/confirm`,'POST',{})).status,404,'another account cannot confirm');
  eq((await alice.lab(`/api/assistant/actions/${id}/confirm`,'POST',{})).status,200);
  eq((await alice.cal(`/api/assistant/actions/${id}/confirm`,'POST',{})).status,409,'a card applies once');
  eq(await tasks(),before+1);

  // Server memory: the next message on another host still sees the previous round.
  script.push(call('list_tasks',{from:'2026-11-01',to:'2026-11-30',keyword:'Dentist'}),body=>call('delete_task',{task_id:lastTool(body).tasks[0].task_id}),{content:'请确认删除。'});
  const removal=await alice.cal('/api/assistant/chat','POST',{message:'删掉刚才那个',lang:'zh'});
  eq(seen.at(-3).body.messages[1],{role:'user',content:'下周四下午三点看牙'});
  eq((await alice.cal(`/api/assistant/actions/${removal.body.actions[0].id}/confirm`,'POST',{})).status,200);
  eq(await tasks(),before);
  eq((await alice.lab('/api/assistant/memory/clear','POST',{})).status,200);

  // The free model is busy: the message moves to the fallback model and is counted once.
  script.push({status:429,code:'1302'},{content:'备用模型回答。'});
  const rescued=await alice.lab('/api/assistant/chat','POST',{message:'你好',lang:'zh'});
  eq([rescued.status,rescued.body.fallback,rescued.body.reply],[200,true,'备用模型回答。']);
  eq(seen.at(-2).body.messages.length,2,'cleared memory starts fresh');
  eq([seen.at(-1).body.model,seen.at(-1).body.thinking],['glm-4-flashx-250414',undefined]);
  // Both fail: busy, nothing counted.
  const chats=rescued.body.quota.chat.used;
  script.push({status:503},{status:500});
  const busy=await alice.lab('/api/assistant/chat','POST',{message:'在吗',lang:'zh'});
  eq([busy.status,busy.body.code],[503,'busy']);
  eq((await alice.lab('/api/assistant/status')).body.quota.chat.used,chats,'a failed message is not counted');

  // Web search with sources; calendar tools are refused after a search in the same message.
  script.push(call('web_search',{query:'synthetic news'}),call('list_tasks',{from:'2026-11-01',to:'2026-11-02'}),{content:'据网络搜索……'});
  const searched=await alice.lab('/api/assistant/chat','POST',{message:'今天有什么新闻',lang:'zh'});
  eq(searched.body.sources,[{title:'Synthetic news',url:'https://news.example/item'}]);eq(searched.body.counted,['chat','search']);
  eq(searches.at(-1).search_engine,'search_std');eq(searches.at(-1).search_query,'synthetic news');
  eq(/not available after a web search/.test(lastTool(seen.at(-1).body).error),true);

  // Admin AI logs through the Tools proxy, including query strings; metadata only.
  eq((await alice.lab('/api/assistant/admin/calls')).status,403);
  const logs=(await admin.lab('/api/assistant/admin/calls?limit=50&outcome=ok')).body;
  eq(logs.calls.every(c=>c.outcome==='ok'),true,'the outcome filter reaches Calendar');
  eq(logs.calls.some(c=>c.fallback&&c.model==='glm-4-flashx-250414'&&c.errors===1),true);
  const errs=(await admin.lab('/api/assistant/admin/errors?source=chat')).body.errors;
  eq(errs.some(e=>e.code==='1302'&&e.recovered),true);eq(errs.filter(e=>!e.recovered).length,2);
  eq(/看牙|新闻/.test(JSON.stringify([logs,errs])),false,'conversation text is never logged');
  eq((await fetch(LAB+'/ai-logs/',{redirect:'manual'})).status,302,'guests are sent to sign in');
  eq((await alice.lab('/ai-logs/')).status,403);
  const tool=await admin.lab('/ai-logs/');eq(tool.status,200);eq(tool.body.includes('/ai-logs/logs.js?v='+V),true);
  eq((await admin.lab('/ai-logs')).status,302);

  eq((await fetch(LAB+'/api/assistant/chat',{method:'POST',headers:{cookie:alice.cookie,origin:'https://evil.example','content-type':'application/json'},body:'{}'})).status,403,'untrusted origins are refused');
  eq((await alice.lab('/api/assistant/status','DELETE')).status,405);
  const page=await admin.lab('/admin/');eq(page.status,200);eq(page.body.includes('/assistant-admin.js?v='+V),true);eq(page.body.includes('id="assistantFallback"'),true);
  for(const asset of ['/companion/assistant.js?v='+V,'/assistant-admin.js?v='+V,'/ai-logs/logs.js?v='+V,'/ai-logs/logs.css?v='+V])eq((await fetch(LAB+asset)).status,200,asset);
  eq((await fetch(CAL+'/companion/assistant.js?v='+V)).status,200);
  async function draft(name,args,message){
    script.push(call(name,args),{content:'请核对'});
    const answer=await bob.lab('/api/assistant/chat','POST',{message,lang:'zh'});
    eq(answer.status,200);return answer.body.actions[0];
  }
  const confirm=(client,card)=>client.cal('/api/assistant/actions/'+card.id+'/confirm','POST',{});
  const task=await draft('change_todo',{operation:'create',title:'Fixture report',points:['Prepare notes']},'增加待办和子项');
  eq(task.summary.note,'Prepare notes');
  eq((await confirm(alice,task)).status,404);
  eq((await confirm(bob,task)).body.ok,true);
  eq((await confirm(bob,task)).status,409);
  const weight=await draft('change_health',{kind:'weight',weight:150,unit:'lb'},'今天体重150磅');
  eq((await confirm(bob,weight)).body.ok,true);
  const weights=(await bob.cal('/api/personal/weight')).body;
  eq(weights.some(w=>w.weight_g===68039),true);
  const correction=await draft('change_health',{kind:'weight',record_id:weights[0].id,weight:149,unit:'lb'},'更正为149磅');
  const another=await draft('change_health',{kind:'weight',record_id:weights[0].id,weight:151,unit:'lb'},'更正为151磅');
  eq((await confirm(bob,another)).body.ok,true);
  const refresh=(await confirm(bob,correction)).body;
  eq(refresh.ok,false);eq(refresh.replacement.summary.title.includes('149 lb'),true);
  eq((await bob.cal('/api/personal/weight')).body[0].weight_g,68492);
  eq((await confirm(bob,refresh.replacement)).body.ok,true);
  eq((await bob.cal('/api/personal/weight')).body[0].weight_g,67585);
  const offAgain=await admin.lab('/api/assistant/admin/settings','PUT',settings({enabled:false,clearKey:true}));
  eq(offAgain.body.keySet,false);eq((await alice.lab('/api/assistant/status')).body.enabled,false);
  console.log('ASSISTANT HTTP PASS: '+count+' assertions; fallback, refunds, search, memory, tier allowances, AI logs and a private key.');
 }finally{model.close();}
})().catch(e=>{console.error(e);process.exit(1);});
