'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.GARYHUB_PLAYWRIGHT||'playwright');
const {fixture,markdown,image}=require('./study-fixture.cjs');
const CAL=process.env.CHECK_CALENDAR,LAB=process.env.CHECK_LAB,OUT=process.env.GARYHUB_SCREENSHOTS||'/tmp/garyhub1431-screenshots';let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
async function login(context,name){const csrf=await(await context.request.get(CAL+'/api/csrf')).json();const r=await context.request.post(CAL+'/api/login',{headers:{origin:'https://calendar.garyhub.uk','x-csrf-token':csrf.token},data:{username:'check_'+name,password:'Synthetic-Only-2026!'}});eq(r.status(),200);}
(async()=>{
 fs.mkdirSync(OUT,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.GARYHUB_CHROME,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[];
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await context.addInitScript(()=>{try{localStorage.setItem('garyhub.language','zh');}catch{}});
  await login(context,'alice');
  const saved=await(await context.request.get(LAB+'/api/academic/state')).json(),csrf=await(await context.request.get(LAB+'/api/academic/csrf')).json();
  eq((await context.request.put(LAB+'/api/academic/state',{headers:{origin:'https://tools.garyhub.uk','x-csrf-token':csrf.token},data:{accountId:2,revision:saved.revision,state:fixture()}})).status(),200);
  const page=await context.newPage();await page.goto(LAB+'/study/');await page.locator('[data-lecture="lecture-a"]').waitFor();
  eq(await page.locator('#courseSidebar').isVisible(),true);
  const before=await page.locator('.workspace>section').boundingBox();
  await page.locator('[data-action="toggle-sidebar"]').click();eq(await page.locator('#courseSidebar').isVisible(),false);
  const after=await page.locator('.workspace>section').boundingBox();assert.ok(after.width>before.width+150);checks++;
  eq(await page.locator('.sidebar-toggle').innerText(),'');
  await page.reload();await page.locator('.viewer-link').waitFor();eq(await page.locator('#courseSidebar').isVisible(),false);
  await page.locator('.sidebar-toggle').press('Enter');eq(await page.locator('#courseSidebar').isVisible(),true);
  const popupEvent=page.waitForEvent('popup');await page.locator('.viewer-link').click();const viewer=await popupEvent;
  await viewer.locator('.md-section').first().waitFor();
  eq(await viewer.evaluate(()=>opener===null),true);eq(await page.locator('[data-lecture="lecture-a"]').getAttribute('class'),'lecture-btn active');
  eq(await viewer.locator('.md-section').count(),5);eq(await viewer.locator('.md-section[open]').count(),0);eq(await viewer.locator('#outlinePanel').isVisible(),false);
  eq(await viewer.locator('#sourcePanel').isVisible(),false);eq(await viewer.locator('#preview').textContent().then(t=>t.includes('not a heading')),true);
  await viewer.locator('#outlineBtn').click();eq(await viewer.locator('#outlineItems a').count(),5);
  await viewer.locator('#outlineItems a').nth(2).click();eq(await viewer.locator('.md-section[open]').count(),3);
  await viewer.screenshot({path:path.join(OUT,'viewer-outline-desktop.png'),fullPage:true});
  eq(await viewer.locator('#outlineItems [aria-current]').count(),1);eq(await viewer.locator('.section-current').count(),1);
  const picture=viewer.locator('#preview img').first();await picture.evaluate(img=>img.decode());eq(await picture.evaluate(img=>img.naturalWidth),1);
  eq(await viewer.locator('#preview math').count()>0,true);eq(await viewer.locator('#preview table').count(),1);eq(await viewer.evaluate(()=>!!window.UNSAFE),false);
  await viewer.locator('#expandBtn').click();eq(await viewer.locator('.md-section[open]').count(),5);
  await viewer.locator('#expandBtn').click();eq(await viewer.locator('.md-section[open]').count(),0);
  await viewer.locator('#preview>.md-section>summary').first().press('Enter');eq(await viewer.locator('.md-section[open]').count(),1);
  await viewer.locator('#sourceBtn').click();eq(await viewer.locator('#sourcePanel').isVisible(),true);eq(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await viewer.locator('#editor').fill(markdown+'\nExtra text.');await viewer.waitForTimeout(220);eq(await viewer.locator('.md-section[open]').count(),1);
  await viewer.locator('#sourceBtn').click();await viewer.locator('#outlineBtn').click();
  await viewer.screenshot({path:path.join(OUT,'viewer-desktop.png'),fullPage:true});
  await viewer.locator('.gary-tool-bar button').first().click();await viewer.evaluate(()=>GaryHubI18n.setLanguage('en'));eq(await viewer.locator('#expandBtn').innerText(),'Expand all');eq(await viewer.locator('#outlineBtn').getAttribute('aria-label'),'Show outline');await viewer.screenshot({path:path.join(OUT,'viewer-dark-english.png'),fullPage:true});await viewer.evaluate(()=>GaryHubI18n.setLanguage('zh'));await viewer.locator('.gary-tool-bar button').first().click();
  await page.locator('.sidebar-toggle').click();await page.screenshot({path:path.join(OUT,'study-desktop.png'),fullPage:true});
  await viewer.setViewportSize({width:390,height:844});await viewer.locator('#outlineBtn').click();
  eq(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await viewer.screenshot({path:path.join(OUT,'viewer-mobile.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.locator('.sidebar-toggle').click();eq(await page.locator('#courseSidebar').isVisible(),true);await page.screenshot({path:path.join(OUT,'study-mobile.png'),fullPage:true});
  await viewer.locator('#fileInput').setInputFiles({name:'bad.exe',mimeType:'application/octet-stream',buffer:Buffer.from('x')});
  eq(await viewer.locator('.md-section').count(),5); // Failed file load must retain the account guard.
  await login(context,'bob');await viewer.evaluate(()=>dispatchEvent(new Event('focus')));await viewer.waitForFunction(()=>document.querySelector('#editor').value==='');
  eq(await viewer.locator('.md-section').count(),0);eq(await viewer.locator('#outlineItems a').count(),0);eq(await viewer.locator('#documentSelect option').count(),0);
  // A copied private lecture URL also checks the opening account.
  const wrong=await context.newPage();await wrong.goto(LAB+'/useful/markdown-viewer/?studyAccount=2&studyCourse=course-a&studyLecture=lecture-a');await wrong.waitForFunction(()=>document.querySelector('#status').classList.contains('error'));eq(await wrong.locator('#editor').inputValue(),'');
  // Local files still work, including no-title documents and ZIP image paths.
  await viewer.locator('#fileInput').setInputFiles({name:'plain.md',mimeType:'text/markdown',buffer:Buffer.from('Plain body without headings.')});await viewer.waitForFunction(()=>document.querySelector('#preview').textContent.includes('Plain body'));eq(await viewer.locator('.md-section').count(),0);eq(await viewer.locator('#expandBtn').isDisabled(),true);
  const JSZip=require(process.env.GARYHUB_JSZIP||'jszip'),zip=new JSZip();zip.file('notes/01.md',markdown);zip.file('plain.md','Another plain note');zip.file('images/pixel.png',Buffer.from(image.split(',')[1],'base64'));
  await viewer.locator('#fileInput').setInputFiles({name:'notes.zip',mimeType:'application/zip',buffer:await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'})});await viewer.waitForFunction(()=>document.querySelectorAll('#documentSelect option').length===2);await viewer.locator('#documentSelect').selectOption('notes/01.md');eq(await viewer.locator('.md-section[open]').count(),0);await viewer.locator('#expandBtn').click();await viewer.locator('#preview img').first().evaluate(img=>img.decode());eq(await viewer.locator('.md-section').count(),5);
  await viewer.locator('#documentSelect').selectOption('plain.md');eq(await viewer.locator('.md-section').count(),0);await viewer.locator('#documentSelect').selectOption('notes/01.md');eq(await viewer.locator('.md-section[open]').count(),0);
  eq(errors,[]);console.log('BROWSER PASS: '+checks+' assertions; desktop/mobile, real popup, keyboard, nested/repeated headings, edit state, source, math, ZIP images, XSS and account changes.');await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
