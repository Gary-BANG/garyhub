'use strict';
// Run against synthetic services. Optional: PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path'),fs=require('node:fs');
const CAL=process.env.CHECK_CALENDAR,LAB=process.env.CHECK_LAB,db=require(process.env.APP_DIR+'/db');
let count=0;function eq(a,b){assert.deepEqual(a,b);count++;}
async function cookieFor(username){
 let cookie='';let r=await fetch(CAL+'/api/csrf');cookie=r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');const {token}=await r.json();
 r=await fetch(CAL+'/api/login',{method:'POST',headers:{cookie,origin:'https://calendar.garyhub.uk','x-csrf-token':token,'content-type':'application/json'},body:JSON.stringify({username,password:'Synthetic-Only-2026!'})});eq(r.status,200);
 return r.headers.getSetCookie().map(v=>{const [name,...value]=v.split(';')[0].split('=');return {name,value:value.join('='),domain:'.garyhub.uk',path:'/',secure:true,httpOnly:true,sameSite:'Lax'};});
}
async function proxy(route){
 const request=route.request(),url=new URL(request.url());
 if(!['garyhub.uk','tools.garyhub.uk','calendar.garyhub.uk','lab.garyhub.uk'].includes(url.hostname))return route.abort();
 const target=new URL((url.hostname==='calendar.garyhub.uk'?CAL:LAB)+url.pathname+url.search);
 const headers={...request.headers(),host:url.host};delete headers['accept-encoding'];
 const response=await new Promise((resolve,reject)=>{const req=http.request(target,{method:request.method(),headers},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));});req.on('error',reject);req.end(request.postDataBuffer());});
 delete response.headers['transfer-encoding'];delete response.headers['content-length'];
 if(Array.isArray(response.headers['set-cookie']))response.headers['set-cookie']=response.headers['set-cookie'].join('\n');
 await route.fulfill(response);
}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 const out=process.env.SCREENSHOT_DIR;if(out)fs.mkdirSync(out,{recursive:true});
 try{
  for(const [name,isAdmin,canRead]of [[null,false,false],['alice',false,false],['bob',false,true],['admin',true,true]]){
   const ctx=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});await ctx.route('**/*',proxy);
   await ctx.addCookies([{name:'garyhub_language',value:'zh',domain:'.garyhub.uk',path:'/'},...(name?await cookieFor('check_'+name):[])]);
   const page=await ctx.newPage();await page.goto('https://tools.garyhub.uk');
   await page.waitForFunction(()=>window.GaryHubIdentity!==undefined&&document.querySelector('#tools-controls').hidden===false);
   if(name)await page.waitForFunction(()=>window.GaryHubIdentity?.user?.id);
   eq(await page.locator('#reading-help').isVisible(),isAdmin);
   eq(await page.locator('[data-tool="reading"]').isVisible(),canRead);
   if(isAdmin){
    const icons=await page.locator('[data-tool="status"] use,[data-tool="server-monitor"] use,[data-tool="ai-logs"] use').evaluateAll(xs=>xs.map(x=>x.getAttribute('href')));eq(new Set(icons).size,3);
    for(const id of icons)eq(await page.locator(id).count(),1);
    if(out)await page.screenshot({path:path.join(out,'tools-desktop.png'),fullPage:true});
    await page.locator('[data-view-button="dock"]').click();eq(await page.locator('#tool-browser').getAttribute('data-view'),'dock');
    await page.locator('[data-view-button="grid"]').click();
   }
   await page.setViewportSize({width:390,height:844});eq(await page.locator('#reading-help').isVisible(),isAdmin);
   eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   if(isAdmin&&out)await page.screenshot({path:path.join(out,'tools-mobile.png'),fullPage:true});
   // A fresh identity event must immediately remove the entry on role loss/sign-out.
   await page.evaluate(()=>document.dispatchEvent(new CustomEvent('garyhub:identity',{detail:{user:null}})));eq(await page.locator('#reading-help').isVisible(),false);
   await ctx.close();
  }
  const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await ctx.route('**/*',proxy);await ctx.addCookies([{name:'garyhub_language',value:'zh',domain:'.garyhub.uk',path:'/'},...await cookieFor('check_alice')]);const page=await ctx.newPage();
  for(const scope of ['calendar','access','home'])await db.run("INSERT INTO notifications(user_id,type,scope,title,body)VALUES(2,'release',?,'UI ordinary notice','Synthetic body')",[scope]);
  await db.run("INSERT INTO notifications(user_id,type,scope,title,body)VALUES(2,'account','calendar','UI required notice','Synthetic body')");
  await page.goto('https://calendar.garyhub.uk/');await page.locator('#notificationsBtn').click();
  await page.locator('#notificationsPanel button').filter({hasText:'一键已读'}).click();
  await page.waitForFunction(()=>!document.querySelector('#notificationsPanel button')?.disabled);
  eq((await db.get("SELECT COUNT(*) n FROM notifications WHERE user_id=2 AND type='release' AND scope='calendar' AND read_at IS NULL")).n,0);
  if(out)await page.screenshot({path:path.join(out,'calendar-notices-mobile.png'),fullPage:true});
  await page.locator('#notificationsPanel button').filter({hasText:'一键删除'}).click();
  await page.waitForFunction(()=>!document.querySelector('#notificationsPanel')?.textContent.includes('UI ordinary notice'));
  eq(await page.locator('#notificationsPanel').textContent().then(t=>t.includes('UI required notice')),true);
  await page.goto('https://garyhub.uk/');await page.waitForFunction(()=>window.GaryHubIdentity?.user?.id===2);
  await page.locator('button[aria-controls="gh-notices"]').click();
  if(out)await page.screenshot({path:path.join(out,'home-notices-mobile.png'),fullPage:true});
  const box=await page.locator('#gh-notices').boundingBox();eq(box.x>=0&&box.x+box.width<=391,true);
  await page.locator('#gh-notices button').filter({hasText:'一键删除'}).click();
  await page.waitForFunction(()=>!document.querySelector('#gh-notices')?.textContent.includes('UI ordinary notice'));
  eq((await db.get("SELECT COUNT(*) n FROM notifications WHERE user_id=2 AND type='release'")).n,0);
  eq(await page.locator('#gh-notices').textContent().then(t=>t.includes('UI required notice')),true);
  // A reload reads persisted deletion rather than cached client data.
  await page.reload();await page.waitForFunction(()=>window.GaryHubIdentity?.user?.id===2);await page.locator('button[aria-controls="gh-notices"]').click();eq(await page.locator('#gh-notices').textContent().then(t=>t.includes('UI ordinary notice')),false);
  await ctx.close();
  console.log('BROWSER PASS: '+count+' assertions; guest/member/subscriber/admin, grid/dock, mobile layout and persisted bulk actions.');
 }finally{await browser.close();await new Promise(r=>db.db.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
