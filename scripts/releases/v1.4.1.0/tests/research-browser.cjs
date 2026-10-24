'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.GARYHUB_PLAYWRIGHT||'playwright');
const CAL=process.env.CHECK_CALENDAR,OUT=process.env.RESEARCH_SCREENSHOTS||'/tmp/garyhub-research-qa';
(async()=>{
 fs.mkdirSync(OUT,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:process.env.GARYHUB_CHROME,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1100}}),errors=[];
  await context.route('**/*',route=>route.request().url().startsWith(CAL)?route.continue():route.abort());
  let token=(await(await context.request.get(CAL+'/api/csrf')).json()).token;
  const login=await context.request.post(CAL+'/api/login',{headers:{origin:CAL,'x-csrf-token':token},data:{username:'check_alice',password:'Synthetic-Only-2026!'}});assert.equal(login.status(),200);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(CAL+'/research/');await page.locator('#workspace').waitFor({state:'visible'});
  await page.locator('#new-project').click();await page.locator('#project-name').fill('Aurora · Writing');await page.locator('#project-description').fill('Forecast quantisation and deployment.');await page.locator('#project-form button[type=submit]').click();await page.locator('#project-dialog').waitFor({state:'hidden'});
  await page.locator('#add').click();
  const values={english:'quantisation\nquantization',chinese:'量化\n低精度量化',definition:'将数值映射到有限的离散表示。',usage:'说明量化对象、位宽与评测条件。',en1:'We evaluate the effect of weight quantisation on forecast accuracy.',zh1:'我们评估权重量化对预报准确性的影响。','entry-tags':'量化\n评测'};
  for(const [key,value]of Object.entries(values))await page.locator('#'+key).fill(value);
  await page.locator('#entry-form button[type=submit]').click();await page.locator('#entry-dialog').waitFor({state:'hidden'});await page.locator('#detail h2').filter({hasText:'quantisation'}).waitFor();
  await page.getByRole('button',{name:'编辑词条',exact:true}).click();await page.locator('#chinese').fill('量化\n低精度量化\n离散化表达');await page.locator('#entry-form button[type=submit]').click();await page.locator('#entry-dialog').waitFor({state:'hidden'});assert.ok((await page.locator('#detail').innerText()).includes('离散化表达'));
  await page.locator('#search').fill('离散化表达');assert.equal(await page.locator('.entry-row').count(),1);await page.locator('#search').fill('QUANTIZATION');assert.equal(await page.locator('.entry-row').count(),1);await page.locator('#search').fill('不存在的术语');assert.equal(await page.locator('.entry-row').count(),0);await page.locator('#search').fill('');
  await page.locator('#tags button').filter({hasText:'量化'}).click();assert.equal(await page.locator('#count').innerText(),'1 / 1 条');await page.locator('#clear-tags').click();
  const promptWait=page.waitForEvent('download');await page.locator('#prompt').click();const promptDownload=await promptWait;const promptText=fs.readFileSync(await promptDownload.path(),'utf8');assert.ok(promptText.includes('Aurora · Writing')&&promptText.includes('Forecast quantisation'));
  const exportWait=page.waitForEvent('download');await page.locator('#export').click();const exported=JSON.parse(fs.readFileSync(await(await exportWait).path(),'utf8'));assert.equal(exported.entries[0].chinese.length,3);assert.equal(exported.format,'garyhub-research-v1');
  const incoming=structuredClone(exported);incoming.entries[0].english.push('quantizing');incoming.entries[0].usage='New wording requiring review.';
  await page.locator('#import').click();await page.locator('#import-text').fill(JSON.stringify(incoming));await page.locator('#preview-button').click();await page.locator('.preview-summary').waitFor();assert.ok((await page.locator('.preview-summary').innerText()).includes('待处理 1'));assert.equal(await page.locator('#commit-import').isDisabled(),true);
  await page.locator('.preview-row select').selectOption('merge:'+exported.entries[0].id);await page.locator('#preview-button').click();await page.waitForFunction(()=>!document.getElementById('commit-import').disabled);await page.locator('#commit-import').click();await page.locator('#import-dialog').waitFor({state:'hidden'});assert.ok((await page.locator('#detail').innerText()).includes('quantizing'));
  page.on('dialog',dialog=>dialog.accept());await page.locator('#undo').click();await page.waitForFunction(()=>document.getElementById('undo').hidden);assert.ok(!(await page.locator('#detail').innerText()).includes('quantizing'));
  // User text remains literal, including would-be markup.
  await page.getByRole('button',{name:'编辑词条',exact:true}).click();await page.locator('#usage').fill('<img src=x onerror="window.researchXss=true"> is literal research text.');await page.locator('#entry-form button[type=submit]').click();await page.locator('#entry-dialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.researchXss),undefined);assert.equal(await page.locator('#detail img').count(),0);
  await page.getByRole('button',{name:'编辑词条',exact:true}).click();await page.locator('#usage').fill(values.usage);await page.locator('#entry-form button[type=submit]').click();await page.locator('#entry-dialog').waitFor({state:'hidden'});
  const searchRect=await page.locator('.search').boundingBox();assert.ok(searchRect.height<65);
  const noOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await noOverflow();await page.screenshot({path:path.join(OUT,'research-desktop.png'),fullPage:true});
  const left=await page.locator('#sidebar').boundingBox(),right=await page.locator('#detail').boundingBox();assert.ok(right.width>left.width*1.7);
  await page.locator('#theme').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await page.screenshot({path:path.join(OUT,'research-dark.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await noOverflow();await page.screenshot({path:path.join(OUT,'research-mobile-detail.png'),fullPage:true});await page.locator('.mobile-back').click();assert.equal(await page.locator('#sidebar').isVisible(),true);await page.screenshot({path:path.join(OUT,'research-mobile-list.png'),fullPage:true});
  await page.locator('.entry-row').first().click();await page.getByRole('button',{name:'编辑词条',exact:true}).click();await noOverflow();await page.screenshot({path:path.join(OUT,'research-mobile-editor.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('RESEARCH BROWSER PASS: real Chromium desktop/mobile, themes, create/edit, bilingual and alias search, tags, Prompt/export downloads, conflict merge/undo, literal text and no horizontal overflow.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
