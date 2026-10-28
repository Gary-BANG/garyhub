'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.GARYHUB_PLAYWRIGHT||'playwright');
const CAL=process.env.CHECK_CALENDAR,LAB=process.env.CHECK_LAB;
const ROOT=path.resolve(__dirname,'../../../..'),OUT=process.env.GARYHUB_SCREENSHOTS||'/tmp/garyhub1432-screenshots';
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const statement='Two REVOLUTE joints move from rest at theta0 to rest at theta1 along the straight joint-space path theta(s)=theta0+s*(theta1-theta0), using the SAME quintic time scaling s(t)=10*(t/T)^3-15*(t/T)^4+6*(t/T)^5 for 0<=t<=T. Angles are radians; use theta1-theta0 directly without angle wrapping. Each joint must satisfy abs(theta_dot_i)<=vmax_i in rad/s and abs(theta_ddot_i)<=amax_i in rad/s^2 over the ENTIRE interval. (a) Return scalar T_min (s). If both joint displacements are zero, define T_min=0 and active_limit=0. Return scalar tau_start (Nm), for a link of mass (kg) and com_radius (m).';
async function login(context,name){const {token}=await(await context.request.get(CAL+'/api/csrf')).json();const r=await context.request.post(CAL+'/api/login',{headers:{origin:'https://calendar.garyhub.uk','x-csrf-token':token},data:{username:'check_'+name,password:'Synthetic-Only-2026!'}});eq(r.status(),200);}
async function putState(context){
 const old=await(await context.request.get(LAB+'/api/lab/state')).json(),{token}=await(await context.request.get(LAB+'/api/csrf')).json();
 const problem={id:'formula-regression',version:1,title:'Mock Midterm · Quintic motion',category:'Time scaling',similarity_group:'quintic',statement_en:statement,formula_latex:'s(t)=10(t/T)^3-15(t/T)^4+6(t/T)^5',explanation_md:'Use $\\dot{\\theta}$ and \\(T_{\\min}\\).\n\n$$s(0)=0,\\quad s(T)=1$$',inputs:{theta0:{type:'scalar',value:0},theta1:{type:'scalar',value:1,random:{min:0,max:2,step:1,unit:'rad'}},com_radius:{type:'scalar',value:1}},answers:[{name:'T_min',shape:[],atol:1e-6,rtol:1e-6}],reference_code:'T_min=0',starter_code:'T_min=0'};
 const state={custom:[problem],images:{},instances:[{uid:'formula-instance',p:problem,values:{theta0:0,theta1:1,com_radius:1},code:'import numpy as np\nfrom modern_robotics import *\nT_min=0',revealed:false,created:new Date().toISOString()}],current:'formula-instance',history:[]};
 eq((await context.request.put(LAB+'/api/lab/state',{headers:{origin:'https://lab.garyhub.uk','x-csrf-token':token},data:{accountId:2,revision:old.revision,state}})).status(),200);
 return state;
}
(async()=>{
 fs.mkdirSync(OUT,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.GARYHUB_CHROME,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[];
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await context.addCookies([{name:'gh-music-enabled',value:'0',url:LAB}]);
  // Exercise app render/submit paths without downloading the unrelated Python WASM runtime.
  await context.addInitScript(()=>{const NativeWorker=Worker;window.Worker=class extends NativeWorker{
   constructor(url,...args){if(String(url).endsWith('python-worker.js'))return {postMessage(data){setTimeout(()=>this.onmessage?.({data:{id:data.id,output:'Synthetic render-path check',results:Object.fromEntries((data.names||[]).map(name=>[name,{shape:[],values:[0],nested:0}]))}}),10);},terminate(){}};super(url,...args);}
  };});
  await login(context,'alice');const original=await putState(context);
  const page=await context.newPage();await page.goto(LAB+'/lab/');await page.locator('.workspace .prompt .katex').first().waitFor();
  eq(await page.locator('.workspace .prompt .lab-formula').count()>10,true);eq(await page.locator('.prompt em').count(),0);eq(await page.locator('.solution').count(),0);
  const count=await page.locator('.workspace .prompt .katex').count();await page.locator('#run').click();await page.locator('#run').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#run').disabled);
  eq(await page.locator('.workspace .prompt .katex').count(),count);eq(await page.locator('.solution').count(),0);
  await page.locator('#submit').click();await page.waitForFunction(()=>!document.querySelector('#submit').disabled);eq(await page.locator('.solution .katex').count()>0,true);eq(await page.locator('.workspace .prompt .katex').count(),count);
  await page.locator('#variant').click();eq(await page.locator('.solution').count(),0);eq(await page.locator('.workspace .prompt .katex').count(),count);
  await page.locator('[data-view="reference"]').click();eq(await page.locator('#ref-detail .katex').count()>0,true);await page.locator('[data-view="practice"]').click();
  await page.screenshot({path:path.join(OUT,'lab-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:path.join(OUT,'lab-mobile.png'),fullPage:true});
  // Use the actual sanitizer, Markdown parser and bundled KaTeX in the page.
  const rendering=await page.evaluate(async()=>{
   const {renderMarkdown}=await import('/lab/math-markdown.mjs');
   const source=String.raw`Inline $R=\begin{bmatrix}1&0\\0&1\end{bmatrix}$ and \(\theta\).
\[T=e^{[S]\theta}\]
$$\frac{a}{b}$$
Code: \`theta_dot_i * theta0\`.
\`\`\`python
s(t)=10*(t/T)^3
\`\`\`
<img src=x onerror="window.UNSAFE=true"><script>window.UNSAFE=true</script>
$\notARealMacro{<img src=x>}$`;
   const element=document.createElement('div');element.innerHTML=renderMarkdown(source.replaceAll('\\`','`'),{legacy:true});
   const result={math:element.querySelectorAll('.katex').length,code:[...element.querySelectorAll('code')].map(e=>e.textContent),unsafe:element.querySelectorAll('script,img,[onerror]').length,fallback:element.querySelector('.lab-math-fallback')?.textContent};
   const unknown=document.createElement('div');unknown.innerHTML=renderMarkdown('Use custom_unknown_field and unsupported(foo) exactly.',{legacy:true});result.unknown=unknown.textContent;const code=document.createElement('div');code.innerHTML=renderMarkdown('<pre>theta_dot_i * theta0</pre>\n\n    theta0 * theta1\n',{legacy:true});result.protectedCode=code.textContent;result.codeMath=code.querySelectorAll('.katex').length;return result;
  });
  eq(rendering.codeMath,0);eq(rendering.protectedCode.includes('theta_dot_i * theta0'),true);eq(rendering.protectedCode.includes('theta0 * theta1'),true);eq(rendering.math,4);eq(rendering.unsafe,0);eq(rendering.code.length,2);eq(rendering.code[0],'theta_dot_i * theta0');eq(rendering.code[1].includes('s(t)=10*(t/T)^3'),true);eq(rendering.fallback.includes('notARealMacro'),true);eq(rendering.unknown,'Use custom_unknown_field and unsupported(foo) exactly.\n');
  const state=await(await context.request.get(LAB+'/api/lab/state')).json();eq(state.state.custom[0].statement_en,original.custom[0].statement_en);eq(state.state.custom[0].reference_code,original.custom[0].reference_code);
  // Each requested page has one working player and no Music Library entry.
  for(const route of ['/grades/','/study/','/useful/image-eraser/','/useful/markdown-viewer/','/useful/pdf-gray/']){
   const tool=await context.newPage();await tool.goto(LAB+route);await tool.locator('.ambient-toggle').waitFor();eq(await tool.locator('.ambient-toggle').count(),1);eq(await tool.locator('.ambient-library,a[href*="/music/"]').count(),0);
   await tool.locator('.ambient-toggle').click();await tool.waitForFunction(()=>document.querySelector('.ambient-toggle').dataset.playing==='true');eq(await tool.locator('.ambient-toggle').getAttribute('aria-pressed'),'true');
   await tool.locator('.ambient-toggle').click();await tool.waitForFunction(()=>document.querySelector('.ambient-toggle').dataset.playing==='false');eq(await tool.locator('.ambient-toggle').getAttribute('aria-pressed'),'false');
   await tool.setViewportSize({width:390,height:844});eq(await tool.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   const theme=tool.locator('.tool-theme,#theme');await theme.click();await tool.evaluate(()=>window.GaryHubI18n?.setLanguage('en'));
   eq(await tool.locator('.ambient-toggle').isVisible(),true);await tool.screenshot({path:path.join(OUT,route.split('/').filter(Boolean).at(-1)+'-mobile.png'),fullPage:true});
   if(route.includes('markdown-viewer')){await tool.locator('#fileInput').setInputFiles({name:'math.md',mimeType:'text/markdown',buffer:Buffer.from('# Motion\n\n$T=e^{[S]\\theta}$\n\n| a | b |\n|---|---|\n| 1 | 2 |')});await tool.locator('#expandBtn').click();eq(await tool.locator('#preview math').count()>0,true);eq(await tool.locator('#preview table').count(),1);}
   await tool.close();
  }
  // Existing sky pages retain their library link.
  const home=await context.newPage();await home.goto(LAB+'/');await home.locator('.ambient-toggle').waitFor();eq(await home.locator('.ambient-library').count(),1);await home.close();
  // A synthetic signed R2 selection exercises the actual media CSP and audio element.
  const r2=await context.newPage(),audio=fs.readFileSync(path.join(ROOT,'lab-service/public/ambient.mp3'));let mediaRequests=0;
  await r2.route('**/api/music/selected',r=>r.fulfill({json:{accountId:2,id:'synthetic',url:'https://synthetic.r2.cloudflarestorage.com/check/music.mp3'}}));
  await r2.route('https://synthetic.r2.cloudflarestorage.com/**',r=>{mediaRequests++;return r.fulfill({status:200,contentType:'audio/mpeg',body:audio});});
  await r2.goto(LAB+'/useful/pdf-gray/');await r2.locator('.ambient-toggle').click();await r2.waitForFunction(()=>document.querySelector('.ambient-toggle').dataset.playing==='true');eq(mediaRequests>0,true);
  // New visible tab takes the existing lease; only one player remains active.
  const second=await context.newPage();await second.goto(LAB+'/study/');if(await second.locator('.ambient-toggle').getAttribute('data-playing')!=='true')await second.locator('.ambient-toggle').click();await second.waitForFunction(()=>document.querySelector('.ambient-toggle').dataset.playing==='true');await r2.waitForFunction(()=>document.querySelector('.ambient-toggle').dataset.playing==='false');eq(await second.locator('.ambient-toggle').getAttribute('aria-pressed'),'true');await second.locator('.ambient-toggle').click();
  await r2.close();await second.close();
  eq(errors,[]);console.log('BROWSER PASS: '+checks+' assertions; screenshot ASCII and LaTeX, code/XSS/fallback, run/submit gate, five players, mobile/theme/language, R2 media CSP and tab lease.');await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
