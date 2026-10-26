'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.GARYHUB_PLAYWRIGHT||'playwright');
const CAL=process.env.CHECK_CALENDAR,LAB=process.env.CHECK_LAB,ROOT=process.env.APP_DIR,OUT=process.env.GARYHUB_SCREENSHOTS||'/tmp/garyhub143-browser';
async function login(context,name){let r=await context.request.get(CAL+'/api/csrf'),token=(await r.json()).token;r=await context.request.post(CAL+'/api/login',{headers:{origin:CAL,'x-csrf-token':token},data:{username:'check_'+name,password:'Synthetic-Only-2026!'}});assert.equal(r.status(),200);}
(async()=>{
 fs.mkdirSync(OUT,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:process.env.GARYHUB_CHROME,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--in-process-gpu','--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),mp3=fs.readFileSync(ROOT+'/public/ambient.mp3'),errors=[];
  await context.addInitScript(()=>{const Native=window.Audio;window.Audio=function(...args){const audio=new Native(...args);window.__testAudio=audio;return audio;};});
  await context.route('**/*',r=>{const url=r.request().url();if(url.includes('.r2.cloudflarestorage.com/'))return r.fulfill({status:200,contentType:'audio/mpeg',body:mp3,headers:{'Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*'}});return [CAL,LAB].some(base=>url.startsWith(base))?r.continue():r.abort();});
  await login(context,'bob');const page=await context.newPage();page.setDefaultTimeout(18000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(CAL+'/music/');await page.locator('#music-app').waitFor({state:'visible'});assert.equal(await page.locator('#music-upload').isVisible(),true);
  await page.locator('#music-file').setInputFiles({name:'My soundtrack.mp3',mimeType:'audio/mpeg',buffer:mp3});await page.locator('#music-upload-button').click();
  await page.getByLabel('选择 My soundtrack.mp3',{exact:true}).waitFor();await page.getByLabel('选择 My soundtrack.mp3',{exact:true}).check();
  await page.waitForFunction(()=>window.__testAudio?.src.includes('.r2.cloudflarestorage.com/'));assert.equal(await page.getByLabel('选择 My soundtrack.mp3',{exact:true}).isChecked(),true);
  await page.locator('.theme').click();await page.screenshot({path:path.join(OUT,'music-desktop-dark.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(OUT,'music-mobile.png'),fullPage:true});
  await page.goto(CAL+'/todos/');await page.locator('#todo-app').waitFor({state:'visible'});assert.match(await page.locator('.todo-limits').innerText(),/300/);await page.waitForFunction(()=>window.__testAudio?.src.includes('.r2.cloudflarestorage.com/'));
  const toggle=page.locator('.ambient-toggle');if(await toggle.getAttribute('data-playing')==='true')await toggle.click();await toggle.click();await page.waitForFunction(()=>document.querySelector('.ambient-toggle').dataset.playing==='true');await toggle.click();
  await page.goto(LAB+'/');await page.waitForFunction(()=>window.__testAudio?.src.includes('.r2.cloudflarestorage.com/'));assert.equal(await page.locator('.ambient-library').count(),1);assert.equal(await page.locator('.ambient-toggle + .theme').count(),1);
  // Switch the shared account while keeping this page open: custom audio clears.
  const token=(await(await context.request.get(CAL+'/api/csrf')).json()).token;await context.request.post(CAL+'/api/logout',{headers:{origin:CAL,'x-csrf-token':token}});await login(context,'alice');await page.evaluate(()=>dispatchEvent(new Event('focus')));await page.waitForFunction(()=>window.__testAudio?.src.endsWith('/ambient.mp3'));
  await page.goto(CAL+'/music/');await page.locator('#music-app').waitFor({state:'visible'});assert.equal(await page.locator('#music-upload').isVisible(),false);assert.equal(await page.locator('#music-list input').count(),1);
  await page.goto(CAL+'/todos/');await page.locator('#todo-app').waitFor({state:'visible'});assert.match(await page.locator('.todo-limits').innerText(),/5.*10/);
  for(let i=1;i<=5;i++){await page.locator('#todo-title').fill('Task '+i);await page.locator('#todo-add button[type=submit]').click();}
  await page.waitForFunction(()=>document.querySelectorAll('.todo-card').length===5);await page.waitForTimeout(800);
  await page.locator('#todo-title').fill('Sixth task');await page.locator('#todo-add button[type=submit]').click();assert.match(await page.locator('#todo-status').innerText(),/最多保存 5/);assert.equal(await page.locator('.todo-card').count(),5);assert.equal(await page.locator('#todo-title').inputValue(),'Sixth task');await page.locator('#todo-title').fill('');
  await page.locator('#todo-prompt-open').click();assert.match(await page.locator('#todo-prompt-text').inputValue(),/最多 5 条待办.*最多 10 个/);await page.locator('#todo-prompt-done').click();await page.screenshot({path:path.join(OUT,'todos-mobile.png'),fullPage:true});
  await page.goto(CAL+'/ledger/fixed/');await page.locator('#appSection').waitFor({state:'visible'});assert.match(await page.locator('#fixedCount').innerText(),/0 \/ 5/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);console.log('BROWSER PASS: desktop/390px, dark theme, MP3 upload/select, direct R2 audio playback/pause, Calendar/Tools persistence, account switch, standard upload visibility and Todo/prompt/fixed limits.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
