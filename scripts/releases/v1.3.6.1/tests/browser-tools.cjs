'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {PDFDocument,rgb}=require(process.env.PDF_LIB_MODULE||'pdf-lib');
const {zipSync,strToU8}=require('../../../../lab-service/public/lab/vendor/fflate.js');
const CAL=process.env.CHECK_CALENDAR,LAB=process.env.CHECK_LAB,OUT=process.env.BROWSER_OUTPUT;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvXcAAAAASUVORK5CYII=','base64');
(async()=>{
 if(process.env.CHECK_NOTICES==='1')execFileSync(process.execPath,[path.join(__dirname,'local-http.cjs')],{env:process.env,stdio:'inherit'});
 else if(process.env.CHECK_HTTP!=='0') for(const test of [path.join(__dirname,'useful-http.cjs'),path.resolve(__dirname,'../../v1.3.6.0/tests/lab-distribution.cjs')])execFileSync(process.execPath,[test],{env:process.env,stdio:'inherit'});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:1365,height:1000}}),errors=[],external=[];let checks=0;
 const ok=(value,message)=>{assert.ok(value,message);checks++;};
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(!['calendar.garyhub.uk','tools.garyhub.uk','lab.garyhub.uk','garyhub.uk'].includes(u.hostname)) {external.push(u.href);return route.abort();}
  try{
   const headers={...await req.allHeaders(),host:u.host};delete headers['content-length'];
   const response=await new Promise((resolve,reject)=>{const r=http.request((u.hostname==='calendar.garyhub.uk'?CAL:LAB)+u.pathname+u.search,{method:req.method(),headers},s=>{const chunks=[];s.on('data',c=>chunks.push(c));s.on('end',()=>resolve({status:s.statusCode,headers:s.headers,body:Buffer.concat(chunks)}));});r.on('error',reject);if(req.postDataBuffer())r.write(req.postDataBuffer());r.end();});
   for(const key of ['content-length','transfer-encoding','connection','keep-alive'])delete response.headers[key];
   if(Array.isArray(response.headers['set-cookie']))response.headers['set-cookie']=response.headers['set-cookie'].join('\n');
   await route.fulfill(response);
  }catch(error){errors.push(String(error));await route.abort();}
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const english=async()=>{if(await page.locator('html').getAttribute('lang')!=='en')await page.locator('#gh-language-switch').click();await page.waitForFunction(()=>document.documentElement.lang==='en');};
 const chinese=async()=>{if(await page.locator('html').getAttribute('lang')==='en')await page.locator('#gh-language-switch').click();await page.waitForFunction(()=>document.documentElement.lang==='zh-CN');};
 const noChineseUI=async()=>page.evaluate(()=>{
  const excluded='script,style,[data-user-content],[data-i18n-ignore],textarea,#editor';
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),out=[];let n;
  while(n=walker.nextNode())if(!n.parentElement.closest(excluded)&&/[\u3400-\u9fff]/.test(n.data))out.push(n.data.trim());return out;
 });
 try{
  fs.mkdirSync(OUT,{recursive:true});
  await page.goto('https://calendar.garyhub.uk/login/?next='+encodeURIComponent('https://tools.garyhub.uk/'));
  await page.locator('#username').fill('check_admin');await page.locator('#password').fill('Synthetic-Only-2026!');await page.locator('#submitAuth').click();await page.waitForURL('https://tools.garyhub.uk/');
  await english();
  for(const [tool,title] of [['image-eraser','Image Eraser'],['markdown-viewer','Markdown Viewer'],['pdf-gray','PDF Light-Gray Converter']])ok((await page.locator(`a[href="/useful/${tool}/"] h2`).textContent()).includes(title),'Tool catalog translated: '+tool);
  await page.goto('https://tools.garyhub.uk/useful/markdown-viewer/');await page.locator('#gh-language-switch').waitFor();
  ok(await page.locator('html').getAttribute('lang')==='en','Language preference inherited by tool');
  ok((await noChineseUI()).length===0,'Markdown initial English UI: '+(await noChineseUI()).join(';'));
  const zip=zipSync({
   '书稿/README.md':strToU8('# 保存\n\nFormula $x^2$.\n\n![图](images/图%20a.png)\n\n![引用][picture]\n\n[picture]: images/图%20a.png\n\n<img src="images/图%20a.png" onerror="window.bad=1">\n\n<script>window.bad=2</script>\n\n![remote](https://tracking.invalid/a.png)'),
   '书稿/章节/第二篇.md':strToU8('# 第二篇\n\n![图](../images/图%20a.png)'),
   '书稿/images/图 a.png':png
  });
  await page.locator('#fileInput').setInputFiles({name:'保存 文档.zip',mimeType:'application/zip',buffer:Buffer.from(zip)});
  await page.waitForFunction(()=>document.querySelectorAll('#documentSelect option').length===2);
  await page.waitForFunction(()=>[...document.querySelectorAll('#preview img[src^="blob:"]')].length===3&&[...document.querySelectorAll('#preview img[src^="blob:"]')].every(i=>i.complete&&i.naturalWidth));
  ok(await page.locator('#preview h1').textContent()==='保存','Chinese user content is unchanged in English');
  ok(await page.locator('#preview math').count()===1,'Math still rendered');
  ok(await page.evaluate(()=>!window.bad&&!document.querySelector('#preview [onerror]')&&!document.querySelector('#preview script')),'Scripts and event handlers stripped');
  ok(external.length===0,'Document import makes no external request');
  ok((await page.locator('#fileInfo').textContent()).includes('保存 文档.zip'),'File names are unchanged');
  ok((await page.locator('#status').textContent()).includes('1 missing'),'Missing/remote image reported');
  await page.locator('#sourceBtn').click();const original=await page.locator('#editor').inputValue();
  await page.locator('#editor').fill(original+'\n\n## 本地编辑\n');await page.waitForFunction(()=>document.querySelector('#preview h2')?.textContent==='本地编辑');
  const edited=await page.locator('#editor').inputValue();await chinese();
  ok(await page.locator('#editor').inputValue()===edited,'Language switch retains editor content');
  ok(await page.locator('#preview h1').textContent()==='保存','Language switch does not translate user content');
  await page.locator('#documentSelect').selectOption('书稿/章节/第二篇.md');
  await page.waitForFunction(()=>document.querySelector('#preview img')?.naturalWidth===1);
  ok(await page.locator('#preview h1').textContent()==='第二篇','Multiple documents and parent-relative image resolved');
  await page.locator('#documentSelect').selectOption('书稿/README.md');ok(await page.locator('#editor').inputValue()===edited,'Per-document edits retained when switching documents');
  await english();
  ok((await noChineseUI()).length===0,'Markdown English UI after load');
  await page.screenshot({path:path.join(OUT,'markdown-zip-desktop.png'),fullPage:true});
  await page.locator('#fileInput').setInputFiles({name:'broken.zip',mimeType:'application/zip',buffer:Buffer.from('broken')});await page.waitForFunction(()=>document.querySelector('#status').classList.contains('error'));
  ok((await page.locator('#status').textContent()).includes('damaged'),'Invalid ZIP error is English');
  ok(await page.locator('#editor').inputValue()===edited,'Invalid ZIP keeps previous document');
  await chinese();ok((await page.locator('#status').textContent()).includes('已损坏'),'Error switches back to Chinese');await english();
  await page.locator('#fileInput').setInputFiles({name:'plain.md',mimeType:'text/markdown',buffer:Buffer.from('# 普通文档\n\n![old](images/图%20a.png)')});
  await page.waitForFunction(()=>document.querySelector('#preview h1')?.textContent==='普通文档');
  ok(await page.locator('#documentPicker').isHidden(),'Standalone Markdown still supported and clears ZIP context');
  ok(await page.locator('#preview img[src]').count()===0,'Stale ZIP image references cannot leak into a new document');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(OUT,'markdown-mobile.png'),fullPage:true});ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Markdown mobile layout fits');
  await page.goto('https://tools.garyhub.uk/useful/pdf-gray/');await english();
  ok((await noChineseUI()).length===0,'PDF initial English UI: '+(await noChineseUI()).join(';'));
  const pdf=await PDFDocument.create();for(const size of [[200,300],[300,200]]){const p=pdf.addPage(size);p.drawRectangle({x:20,y:20,width:50,height:50,color:rgb(0,0,0)});}
  await page.locator('#pdf-file').setInputFiles({name:'保存.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
  await page.locator('#pdf-mode').selectOption('neutral');await page.locator('#pdf-level').fill('130');await page.locator('#pdf-dpi').selectOption('150');
  await chinese();await english();ok(await page.locator('#pdf-level').inputValue()==='130'&&await page.locator('#pdf-mode').inputValue()==='neutral'&&await page.locator('#pdf-dpi').inputValue()==='150','PDF settings retained across language changes');
  ok((await page.locator('#pdf-info').textContent()).includes('保存.pdf'),'PDF filename kept verbatim');
  await page.locator('#pdf-preview').click();await page.waitForFunction(()=>document.querySelector('#pdf-status').textContent.startsWith('Preview complete'),{},{timeout:45000});
  ok(await page.locator('#pdf-result').evaluate(c=>c.width>100),'PDF preview works in English');
  const dl=page.waitForEvent('download');await page.locator('#pdf-convert').click();const result=await dl;ok(result.suggestedFilename()==='保存_light-gray.pdf','English download suffix and original basename retained');
  const out=path.join(OUT,'gray.pdf');await result.saveAs(out);const output=await PDFDocument.load(fs.readFileSync(out));ok(output.getPageCount()===2&&output.getPage(0).getWidth()===200&&output.getPage(1).getHeight()===200,'PDF page count and dimensions retained');
  await page.locator('#pdf-file').setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('x')});ok((await page.locator('#pdf-status').textContent()).includes('Choose a PDF'),'PDF validation message is English');
  await page.screenshot({path:path.join(OUT,'pdf-mobile.png'),fullPage:true});ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'PDF mobile layout fits');
  await page.setViewportSize({width:1365,height:1000});await page.goto('https://tools.garyhub.uk/useful/image-eraser/');await english();
  ok((await noChineseUI()).length===0,'Image tool initial English UI: '+(await noChineseUI()).join(';'));
  const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=300;const x=c.getContext('2d');x.fillStyle='#aabbcc';x.fillRect(0,0,400,300);x.fillStyle='#ff0000';x.fillRect(180,130,40,40);return c.toDataURL().split(',')[1];});
  await page.locator('#file').setInputFiles({name:'保存.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});await page.locator('#run:not([disabled])').waitFor();
  await page.locator('#size').fill('100');const box=await page.locator('#view').boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  const mask=await page.evaluate(()=>Array.from(mc.getImageData(200,150,1,1).data));await chinese();await english();
  ok(await page.locator('#size').inputValue()==='100'&&await page.locator('#run').isEnabled(),'Image and brush retained on language switch');
  ok(JSON.stringify(await page.evaluate(()=>Array.from(mc.getImageData(200,150,1,1).data)))===JSON.stringify(mask),'Painted mask retained');
  await page.locator('#run').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Repair complete'),{},{timeout:45000});
  ok(await page.evaluate(()=>pc.getImageData(200,150,1,1).data[0]<240),'Image repair still works');
  await page.locator('#undo').click();ok(await page.evaluate(()=>pc.getImageData(200,150,1,1).data[0]===255),'Image undo retained');
  const download=page.waitForEvent('download');await page.locator('#save').click();ok((await download).suggestedFilename()==='保存-repaired.png','Image download translated without changing basename');
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>scale<1);await page.screenshot({path:path.join(OUT,'image-mobile.png'),fullPage:true});ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Image mobile layout fits');
  ok(await page.evaluate(()=>ox>=0&&oy>=0&&ox+pic.width*scale<=canvas.width&&oy+pic.height*scale<=canvas.height),'Image remains visible after switching to a phone layout');
  await page.reload();ok(await page.locator('html').getAttribute('lang')==='en','Language persists after reload');
  ok(errors.length===0,'No browser errors: '+errors.join('; '));ok(external.length===0,'No external dependencies or document requests');
  console.log('BILINGUAL TOOLS / ZIP BROWSER PASS: '+checks+' checks. Screenshots: '+OUT);
 }catch(error){console.error('Browser failed at '+page.url(),errors);console.error((await page.locator('body').innerText()).slice(-2600));await page.screenshot({path:path.join(OUT,'failure.png'),fullPage:true});throw error;}
 finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
