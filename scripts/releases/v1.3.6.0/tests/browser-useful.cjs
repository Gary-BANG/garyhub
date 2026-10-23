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
  }catch(e){errors.push(String(e));console.error('Proxy:',u.href,e);await route.abort();}
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 try{
  fs.mkdirSync(OUT,{recursive:true});
  await page.goto('https://calendar.garyhub.uk/login/?next='+encodeURIComponent('https://tools.garyhub.uk/useful/pdf-gray/'));
  await page.locator('#username').fill('check_admin');await page.locator('#password').fill('Synthetic-Only-2026!');await page.locator('#submitAuth').click();
  await page.waitForURL('https://tools.garyhub.uk/useful/pdf-gray/');
  const {PDFDocument,rgb}=require(process.env.PDF_LIB_MODULE||'pdf-lib');const pdf=await PDFDocument.create();
  for(const size of [[200,300],[300,200]]){const p=pdf.addPage(size);p.drawRectangle({x:20,y:20,width:50,height:50,color:rgb(0,0,0)});p.drawText('Synthetic test',{x:20,y:100,size:12});}
  await page.locator('#pdf-file').setInputFiles({name:'fixture.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
  await page.locator('#pdf-preview').click();await page.waitForFunction(()=>document.querySelector('#pdf-status').textContent.match(/预览完成|处理失败/),{},{timeout:45000});
  ok(await page.locator('#pdf-result').evaluate(c=>c.width>100),'PDF preview rendered');
  const pixel=await page.locator('#pdf-result').evaluate(c=>Array.from(c.getContext('2d').getImageData(Math.floor(c.width*.2),Math.floor(c.height*.85),1,1).data));
  ok(pixel[0]===91&&pixel[1]===98&&pixel[2]===127,'Original PDF tint mapping retained');
  await page.screenshot({path:path.join(OUT,'pdf-desktop.png'),fullPage:true});
  const download=page.waitForEvent('download');await page.locator('#pdf-convert').click();const dl=await download;const output=path.join(OUT,'synthetic-gray.pdf');await dl.saveAs(output);
  const converted=await PDFDocument.load(fs.readFileSync(output));ok(converted.getPageCount()===2,'All PDF pages exported');ok(converted.getPage(0).getWidth()===200&&converted.getPage(1).getHeight()===200,'Page dimensions retained');
  await page.locator('#pdf-mode').selectOption('neutral');await page.locator('#pdf-preview').click();await page.waitForFunction(()=>document.querySelector('#pdf-status').textContent.match(/预览完成|处理失败/));
  ok(await page.locator('#pdf-result').evaluate(c=>{const d=c.getContext('2d').getImageData(Math.floor(c.width*.2),Math.floor(c.height*.85),1,1).data;return d[0]===105&&d[1]===105&&d[2]===105;}),'Neutral gray exact mapping');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(OUT,'pdf-mobile.png'),fullPage:true});ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'PDF mobile no horizontal overflow');
  await page.locator('#pdf-file').setInputFiles({name:'locked.pdf',mimeType:'application/pdf',buffer:Buffer.from('JVBERi0xLjcKJcK1wrYKCjEgMCBvYmoKPDwvVHlwZS9DYXRhbG9nL1BhZ2VzIDIgMCBSPj4KZW5kb2JqCgoyIDAgb2JqCjw8L1R5cGUvUGFnZXMvQ291bnQgMS9LaWRzWzQgMCBSXT4+CmVuZG9iagoKMyAwIG9iago8PD4+CmVuZG9iagoKNCAwIG9iago8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDIwMCAzMDBdL1JvdGF0ZSAwL1Jlc291cmNlcyAzIDAgUi9QYXJlbnQgMiAwIFI+PgplbmRvYmoKCnhyZWYKMCA1CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNiAwMDAwMCBuIAowMDAwMDAwMDYyIDAwMDAwIG4gCjAwMDAwMDAxMTQgMDAwMDAgbiAKMDAwMDAwMDEzNSAwMDAwMCBuIAoKdHJhaWxlcgo8PC9TaXplIDUvUm9vdCAxIDAgUi9JRFs8QzM5MTFFQzM5QUMzQUFDM0FDQzJBOEMyQjEyMDBFNDE+KFwzMDc+eFwzMTZNXDMxN1FPbmt6Pk5vIlwyNDApXS9FbmNyeXB0PDwvRmlsdGVyL1N0YW5kYXJkL1IgNi9WIDUvTGVuZ3RoIDI1Ni9QIC00L0VuY3J5cHRNZXRhZGF0YSB0cnVlL1N0bUYvU3RkQ0YvU3RyRi9TdGRDRi9DRjw8L1N0ZENGPDwvQXV0aEV2ZW50L0RvY09wZW4vQ0ZNL0FFU1YzL0xlbmd0aCAzMj4+Pj4vTzw1OEQ3RjEwNUI4MjM5QzIzRjM2OTlFNzQ4MEI1QzNBOUM3NjBEOTc3QTg2NjJCQ0MzMjU1QTUyQzg4MkNCNTgxNTFDNDM3Njk1MDA5OEIxNzk5RTI3OERGQUJGQzE3Njg+L1U8RTdBMEU1RENBMzAyNUE4RDY0NUI1QTRDRTIxRUVBODUzRDVFMzA4NjM0NDdERDQ1MzQwNEJCM0RDRUZENzBEQjJEMEMxQjQzMDZFM0VGQzk2RTQ5QTJBMzFFNjZFNDFGPi9PRTwzQzlGMTgzRDVENjBFRDc5NDUzOUVDQURENDg4ODVFRDk5NkEwODFGRTY5MzQ0MkY0NzdCMEYxNzJBNUY3N0QyPi9VRTxBQjM4MTZFQzNGRkRDREJDMkExM0ZGMzM3Mzc2MkY0QTAwOTc5NEQ0ODQ2M0ZBOUVFNjg3MzkzNDBEOEQxQjU3Pi9QZXJtczwwN0U4NUI0ODA5ODQxRTRBOUVEREE3QTYyNzBBRTQyNj4+Pj4+CnN0YXJ0eHJlZgoyMjYKJSVFT0YK','base64')});await page.locator('#pdf-preview').click();await page.waitForFunction(()=>document.querySelector('#pdf-status').textContent.includes('密码保护'),{},{timeout:10000});ok(await page.locator('#pdf-preview').isEnabled(),'Password-protected file exits cleanly');
  await page.locator('#pdf-file').setInputFiles({name:'fixture.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});await page.locator('#pdf-convert').click();await page.locator('#pdf-cancel').click();await page.waitForFunction(()=>document.querySelector('#pdf-status').textContent.startsWith('已取消'));ok(await page.locator('#pdf-preview').isEnabled(),'PDF cancellation releases controls');
  await page.goto('https://tools.garyhub.uk/useful/markdown-viewer/');
  await page.locator('#fileInput').setInputFiles({name:'fixture.md',mimeType:'text/markdown',buffer:Buffer.from('# Synthetic Markdown\n\nFormula: $x^2$\n\n<script>window.bad=1</script><img src="https://tracking.invalid/image" onerror="window.bad=2">')});
  await page.waitForFunction(()=>document.body.textContent.includes('Synthetic Markdown'));ok(await page.evaluate(()=>!window.bad&&!document.querySelector('img[src^="https://tracking"]')),'Markdown strips scripts and remote image tracking');
  ok(await page.locator('math').count()>0,'Math rendered');await page.locator('#sourceBtn').click();ok((await page.locator('#editor').inputValue()).includes('# Synthetic Markdown'),'Source retained');
  await page.screenshot({path:path.join(OUT,'markdown-mobile.png'),fullPage:true});ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Markdown mobile fits');
  await page.goto('https://tools.garyhub.uk/useful/image-eraser/');
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=300;const x=c.getContext('2d');x.fillStyle='#aabbcc';x.fillRect(0,0,400,300);x.fillStyle='#ff0000';x.fillRect(180,130,40,40);return c.toDataURL().split(',')[1];});
  await page.locator('#file').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.screenshot({path:path.join(OUT,'image-mobile.png'),fullPage:true});ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Image tool mobile fits');
  await page.locator('#run:not([disabled])').waitFor();await page.locator('#size').fill('100');const box=await page.locator('#view').boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await page.locator('#run').click();await page.locator('#run:not([disabled])').waitFor({timeout:45000});
  ok(await page.evaluate(()=>pc.getImageData(200,150,1,1).data[0]<240),'Image masked red object repaired');await page.locator('#undo').click();ok(await page.evaluate(()=>pc.getImageData(200,150,1,1).data[0]===255),'Image undo restores original');await page.locator('#redo').click();
  const save=page.waitForEvent('download');await page.locator('#save').click();await (await save).saveAs(path.join(OUT,'synthetic-image.png'));
  await page.setViewportSize({width:1365,height:1000});await page.goto('https://lab.garyhub.uk/lab/');await page.locator('#distribute-open').waitFor({timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#cloud-status').textContent==='已保存到服务器');
  const template=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../../lab-service/public/lab/data/starter.json'))).problems[0];template.id='browser-distribution';template.assignment='Homework 1.1';
  await page.evaluate(async p=>{const v=await(await fetch('/api/lab/state')).json();const token=(await(await fetch('/api/csrf')).json()).token;const state=v.state||{custom:[],images:{},instances:[],history:[],current:null};state.custom.push(p);const r=await fetch('/api/lab/state',{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:JSON.stringify({accountId:v.user.id,revision:v.revision,state})});if(!r.ok)throw Error('fixture save');},template);
  await page.reload();await page.locator('#distribute-open').click();await page.locator('[data-recipient][value="2"]').check();await page.locator('[data-recipient][value="3"]').check();await page.locator('#distribute-preview-button').click();await page.locator('#distribute-send:not([disabled])').waitFor();
  await page.screenshot({path:path.join(OUT,'distribution-desktop.png'),fullPage:true});await page.locator('#distribute-send').click();await page.waitForFunction(()=>document.querySelector('#distribute-status').textContent.startsWith('分发完成'));
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(OUT,'distribution-mobile.png'),fullPage:true});ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Distribution mobile fits');
  ok(errors.length===0,'No page errors: '+errors.join('; '));console.log('USEFUL TOOLS AND DISTRIBUTION BROWSER PASS: '+count+' checks, PDF conversion/download, Markdown math/sanitization, image download, admin multi-user distribution and mobile layout.');
 }catch(e){console.error('Browser failure at',page.url(),errors);console.error((await page.locator('body').innerText()).slice(-2500));await page.screenshot({path:path.join(OUT,'useful-failure.png'),fullPage:true});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
