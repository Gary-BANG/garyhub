'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const CAL=process.env.CHECK_CALENDAR,LAB=process.env.CHECK_LAB,OUT=process.env.BROWSER_OUTPUT;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:1365,height:1000}}),errors=[],commits=[];let count=0,dropCommitResponse=false;
 const ok=(value,message)=>{assert.ok(value,message);count++;};
 await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:'https://calendar.garyhub.uk'});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(!['calendar.garyhub.uk','tools.garyhub.uk','lab.garyhub.uk','garyhub.uk'].includes(u.hostname))return route.abort();
  const base=u.hostname==='calendar.garyhub.uk'?CAL:LAB;
  try{
   const headers={...await req.allHeaders(),host:u.host};delete headers['content-length'];const data=req.postDataBuffer();
   if(u.pathname==='/api/todos/import')commits.push(req.postDataJSON());
   const response=await new Promise((resolve,reject)=>{const r=http.request(base+u.pathname+u.search,{method:req.method(),headers},s=>{const chunks=[];s.on('data',c=>chunks.push(c));s.on('end',()=>resolve({status:s.statusCode,headers:s.headers,body:Buffer.concat(chunks)}));});r.on('error',reject);if(data)r.write(data);r.end();});
   if(u.pathname==='/api/todos/import'&&response.status===200&&dropCommitResponse){dropCommitResponse=false;return route.abort('failed');}
   for(const key of ['content-length','transfer-encoding','connection','keep-alive'])delete response.headers[key];
   if(Array.isArray(response.headers['set-cookie']))response.headers['set-cookie']=response.headers['set-cookie'].join('\n');
   await route.fulfill(response);
  }catch(e){errors.push(String(e));await route.abort();}
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const read=()=>page.evaluate(async()=>{const r=await fetch('/api/todos',{headers:{'X-GaryHub-User':'2'}});return r.json();});
 const parse=async()=>{await page.locator('#todo-import-check').click();await page.locator('#todo-import-preview').waitFor({state:'visible'});};
 const item=(title,text)=>({title,done:false,points:[{text,done:false}]});
 try{
  fs.mkdirSync(OUT,{recursive:true});
  await page.goto('https://calendar.garyhub.uk/todos/');await page.waitForURL('https://calendar.garyhub.uk/login/**');
  await page.locator('#username').fill('check_alice');await page.locator('#password').fill('Synthetic-Only-2026!');await page.locator('#submitAuth').click();
  await page.waitForURL('https://calendar.garyhub.uk/todos/');await page.locator('#todo-app').waitFor({state:'visible'});
  await page.locator('#todo-title').fill('Keep existing Todo');await page.locator('#todo-add button[type=submit]').click();
  await page.waitForFunction(()=>document.getElementById('todo-status').textContent==='已保存到服务器');
  const initial=await read();ok(initial.todos.length===1,'manual Todo saved before import');
  await page.locator('#todo-prompt-open').click();let prompt=await page.locator('#todo-prompt-text').inputValue();
  ok(prompt.includes('garyhub-todos-v1')&&prompt.includes('299'),'Chinese prompt matches schema and remaining capacity');
  await page.locator('#todo-prompt-copy').click();await page.waitForFunction(()=>document.getElementById('todo-prompt-message').textContent==='提示词已复制。');
  ok(await page.evaluate(()=>navigator.clipboard.readText())===prompt,'copy button writes the full prompt');
  await page.locator('#todo-prompt-done').click();
  await page.locator('#todo-import-open').click();await page.locator('#todo-import-input').fill('{"todos":[}');await page.locator('#todo-import-check').click();
  await page.waitForFunction(()=>document.getElementById('todo-import-message').classList.contains('error'));
  ok(await page.locator('#todo-import-confirm').isDisabled(),'invalid JSON cannot be confirmed');ok(await page.locator('#todo-import-input').inputValue()==='{"todos":[}','invalid input is preserved');
  const a=item('AI 中文 task','第一步\n保留 "引号"、\\路径及长文字。'.repeat(12)),b=item('Keep existing Todo','Different content'),x=item('<img src=x onerror="window.injected=1">','<script>window.injected=2</script>');
  const raw='```json\n'+JSON.stringify({format:'garyhub-todos-v1',todos:[a,a,b,x]},null,2)+'\n```';
  await page.locator('#todo-import-input').fill(raw);await parse();
  ok((await read()).todos.length===1,'preview does not save anything');ok((await page.locator('#todo-import-summary strong').allTextContents()).join(',')==='4,3,3,1','preview counts match');
  ok((await page.locator('#todo-import-warning').textContent()).includes('同名'),'different same-title content is highlighted');
  ok(await page.locator('#todo-import-items img,#todo-import-items script').count()===0,'imported HTML remains text');
  await page.locator('#todo-import-items details').first().evaluate(el=>el.open=true);
  ok(await page.locator('#todo-import-confirm').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'desktop confirmation stays visible with a long preview');
  await page.screenshot({path:path.join(OUT,'todo-import-desktop-zh.png'),fullPage:true});
  await page.evaluate(()=>window.GaryHubI18n.setLanguage('en'));
  ok(await page.locator('#todo-import-input').inputValue()===raw,'language switch preserves JSON');
  ok((await page.locator('#todo-import-confirm').textContent())==='Confirm import','dialog controls translate');
  ok((await page.locator('.todo-import-title').first().textContent())===a.title,'personal titles retain their original language');
  dropCommitResponse=true;await page.locator('#todo-import-confirm').click();await page.locator('#todo-import-dialog').waitFor({state:'hidden'});
  let state=await read();ok(state.todos.length===4,'lost response retry adds one batch only');ok(commits.length===2&&commits[0].requestId===commits[1].requestId,'lost response uses one request ID');
  ok(state.todos[0].id===initial.todos[0].id&&state.todos[0].title==='Keep existing Todo','existing Todo and order retained');
  ok(state.todos[1].points[0].text===a.points[0].text,'long text, newlines, quotes and slashes preserved');
  ok(await page.evaluate(()=>window.injected===undefined),'imported text cannot execute');
  await page.reload();await page.locator('#todo-app').waitFor({state:'visible'});ok((await read()).todos.length===4,'import persists after reload');
  await page.screenshot({path:path.join(OUT,'todo-list-desktop-en.png'),fullPage:true});
  await page.locator('#todo-prompt-open').click();prompt=await page.locator('#todo-prompt-text').inputValue();ok(prompt.includes('Rules:')&&prompt.includes('296'),'English prompt reflects updated capacity');await page.locator('#todo-prompt-done').click();
  const draft={format:'garyhub-todos-v1',todos:[{...state.todos[1],title:'Imported downloaded draft',done:true,points:[{...state.todos[1].points[0],done:true}]}]};
  await page.locator('#todo-import-open').click();await page.locator('#todo-import-file').setInputFiles({name:'downloaded-draft.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(draft))});
  await page.waitForFunction(()=>document.getElementById('todo-import-input').value.includes('Imported downloaded draft'));await parse();await page.locator('#todo-import-confirm').click();await page.locator('#todo-import-dialog').waitFor({state:'hidden'});
  let next=await read();ok(next.todos.length===5&&next.todos.at(-1).done&&next.todos.at(-1).points[0].done,'downloaded draft completion states import correctly');
  ok(next.todos.at(-1).id!==draft.todos[0].id&&next.todos.at(-1).points[0].id!==draft.todos[0].points[0].id,'draft identifiers are regenerated');
  await page.locator('#todo-import-open').click();await page.locator('#todo-import-input').fill(JSON.stringify(draft));await parse();ok(await page.locator('#todo-import-confirm').isDisabled(),'all-duplicate file has nothing to confirm');
  await page.locator('#todo-import-skip').uncheck();await parse();ok(await page.locator('#todo-import-confirm').isEnabled(),'user can explicitly allow duplicates');await page.locator('#todo-import-skip').check();
  const retained=await page.locator('#todo-import-input').inputValue();await page.locator('#todo-import-file').setInputFiles({name:'oversized.json',mimeType:'application/json',buffer:Buffer.alloc(2000001,32)});
  await page.waitForFunction(()=>document.getElementById('todo-import-message').classList.contains('error'));ok(await page.locator('#todo-import-input').inputValue()===retained,'oversized file preserves previous input');
  await page.locator('#todo-import-input').fill('');await page.locator('#todo-import-cancel').click();
  await page.setViewportSize({width:390,height:844});ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile list has no horizontal overflow');
  await page.locator('.theme').click();await page.locator('#todo-import-open').click();const mobileRaw=JSON.stringify([item('Mobile import','One point')]);await page.locator('#todo-import-input').fill(mobileRaw);await parse();
  ok(await page.evaluate(()=>{const r=document.getElementById('todo-import-dialog').getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.height<=innerHeight;}),'mobile dialog stays within viewport');
  ok(await page.locator('#todo-import-confirm').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'mobile confirmation stays visible');
  await page.screenshot({path:path.join(OUT,'todo-import-mobile-en-dark.png'),fullPage:true});
  await page.evaluate(()=>window.GaryHubI18n.setLanguage('zh'));ok(await page.locator('#todo-import-input').inputValue()===mobileRaw,'mobile language change keeps input');
  ok((await page.locator('#todo-import-message').textContent()).includes('预览已就绪'),'preview status follows language switching');
  await page.screenshot({path:path.join(OUT,'todo-import-mobile-zh-dark.png'),fullPage:true});
  // A second page writes after preview. The import must stop instead of replacing that work.
  await page.evaluate(async()=>{const headers={'X-GaryHub-User':'2'},current=await(await fetch('/api/todos',{headers})).json(),csrf=await(await fetch('/api/csrf')).json();current.todos[0].title='Concurrent change';const r=await fetch('/api/todos',{method:'PUT',headers:{...headers,'Content-Type':'application/json','X-CSRF-Token':csrf.token},body:JSON.stringify({accountId:2,revision:current.revision,requestId:crypto.randomUUID(),todos:current.todos})});if(!r.ok)throw Error('fixture concurrent save');});
  await page.locator('#todo-import-confirm').click();await page.waitForFunction(()=>document.getElementById('todo-import-message').classList.contains('error'));
  ok(await page.locator('#todo-import-input').inputValue()===mobileRaw,'conflict preserves import text');ok((await read()).todos.length===5,'conflict does not append');
  await page.locator('#todo-import-cancel').click();await page.locator('#todo-reload').click();await page.waitForFunction(()=>document.querySelector('.todo-name')?.textContent==='Concurrent change');
  await page.locator('#todo-import-open').click();ok(await page.locator('#todo-import-input').inputValue()===mobileRaw,'reload retains same-account import draft');await parse();await page.locator('#todo-import-confirm').click();await page.locator('#todo-import-dialog').waitFor({state:'hidden'});
  state=await read();ok(state.todos.length===6&&state.todos[0].title==='Concurrent change','fresh preview appends without losing concurrent work');
  // Switching the shared session while a dialog is open clears the old account's draft.
  await page.locator('#todo-import-open').click();await page.locator('#todo-import-input').fill(mobileRaw);
  await page.evaluate(async()=>{const csrf=await(await fetch('/api/csrf')).json();const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf.token},body:JSON.stringify({username:'check_bob',password:'Synthetic-Only-2026!'})});if(!r.ok)throw Error('fixture account switch');window.dispatchEvent(new Event('focus'));});
  await page.locator('#todo-app').waitFor({state:'hidden'});ok(await page.locator('#todo-import-input').inputValue()==='','account switch clears import draft');ok(!(await page.locator('#todo-import-dialog').isVisible()),'account switch closes modal');
  await page.reload();await page.locator('#todo-app').waitFor({state:'visible'});ok(await page.locator('.todo-card').count()===0,'second account does not inherit imported Todos');
  ok(errors.length===0,'no browser or fixture proxy errors: '+errors.join('; '));
  console.log('BROWSER TODO IMPORT PASS: '+count+' checks; paste/file, prompt copy, lost-response retry, duplicate control, drafts, capacity, literal text, bilingual layouts, light/dark, mobile, conflicts and account switching. Screenshots: '+OUT);
 }catch(e){await page.screenshot({path:path.join(OUT,'todo-import-failure.png'),fullPage:true}).catch(()=>{});console.error('Browser failure at '+page.url()+'; '+errors.join('; '));throw e;}
 finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e.stack);process.exit(1)});
