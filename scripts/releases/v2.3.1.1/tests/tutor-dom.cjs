'use strict';
// Real Academic + companion code in a DOM. This exercises interaction, not rendered geometry.
const {JSDOM}=require(process.env.JSDOM_MODULE||'jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../..'),{fixture}=require('../../v1.4.3.1/tests/study-fixture.cjs');
let n=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);n++;},read=p=>fs.readFileSync(path.join(root,p),'utf8'),tick=()=>new Promise(r=>setTimeout(r,30));
async function setup(tier='subscriber',view='study'){
 const dom=new JSDOM(read('lab-service/public/academic/index.html'),{url:'https://tools.garyhub.uk/'+view+'/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.matchMedia=()=>({matches:false,addEventListener(){}});w.scrollTo=()=>{};
 const calls=[],user={id:3,username:'bob',role:tier==='admin'?'admin':'user',accountTier:tier},state=fixture();
 state.courses[0].lectures[0].content='PRIVATE-DOC-A';state.courses[0].lectures[1].content='PRIVATE-DOC-B';
 let rev=1,holdChat=null,holdStart=null;
 const response=body=>({ok:true,status:200,json:async()=>body});
 w.fetch=async(url,options={})=>{
  const data=options.body?JSON.parse(options.body):undefined;calls.push({url,options,data});
  if(url.endsWith('/csrf'))return response({token:'synthetic-csrf'});
  if(url==='/api/academic/state')return response(options.method==='PUT'?{revision:++rev,updatedAt:new Date().toISOString()}:{state,user,revision:rev});
  if(url==='/api/academic/links')return response({links:[]});
  if(url==='/api/me')return response({user});
  if(url==='/api/academic/tutor/start'){
   if(holdStart)await holdStart;
   return response({token:'consent-'+calls.length,title:state.courses[0].lectures.find(l=>l.id===data.lectureId).title,expiresAt:Date.now()+3600000});
  }
  if(url==='/api/academic/tutor/chat'){
   if(holdChat)await holdChat;
   return response({reply:'# Explanation\n\n**Important**\n\n$x^2$\n\n<img src="https://evil.example/track"><script>window.PWNED=true</script>',reasoning:'high'});
  }
  return response({ok:true});
 };
 for(const name of ['vendor/marked.min.js','vendor/purify.min.js','vendor/katex.min.js','vendor/js-yaml.min.js','core.js','reader.js','app.js'])w.eval(read('lab-service/public/academic/'+name));
 await tick();
 w.eval(read('lab-service/public/tools-catalog.js'));
 for(const name of ['knowledge.js','brain.js','voices.js'])w.eval(read('lab-service/public/companion/'+name));
 w.GaryHubCompanionAssistant={status:async()=>({enabled:true,tier,provider:'Test provider',memoryRounds:5,tutor:{available:tier!=='standard'}}),forget:async()=>{},chat:async()=>({reply:'ordinary'})};
 w.eval(read('lab-service/public/companion/panel.js'));
 const chat=w.GaryHubCompanionChat.mount({launcher:false});chat.setUser(user);chat.open();await tick();
 const shadow=chat.element.shadowRoot;
 return {dom,w,chat,shadow,calls,state,user,holdChat:p=>holdChat=p,holdStart:p=>holdStart=p};
}
(async()=>{
 for(const tier of ['standard','subscriber','admin']){
  const x=await setup(tier);eq(x.shadow.querySelector('.tutor-toggle').disabled,tier==='standard',tier);eq(x.calls.some(c=>c.url.includes('/tutor/')),false,'no sharing on page load');
  eq(JSON.stringify(x.w.GaryHubStudyContext.current()).includes('PRIVATE'),false,'descriptor excludes contents');x.dom.window.close();
 }
 const x=await setup(),{w,chat,shadow,calls}=x,$=s=>shadow.querySelector(s);
 $('.tutor-toggle').click();await tick();eq($('.tutor-consent').hidden,false);eq($('.tutor-consent').textContent.includes('Test provider'),true);
 $('.tutor-cancel').click();eq(calls.some(c=>c.url.includes('/tutor/')),false,'cancel sends no content');
 async function enable(){ $('.tutor-toggle').click();await tick();$('.tutor-accept').click();await tick(); }
 await enable();eq($('.panel').classList.contains('tutoring'),true);eq($('input').maxLength,4000);
 const consent=calls.find(c=>c.url.endsWith('/tutor/start'));eq(consent.data.consent,true);eq(consent.data.accountId,3);eq(consent.data.lectureId,'lecture-a');eq(consent.data.revision,1);eq(JSON.stringify(consent.data).includes('PRIVATE'),false);eq(consent.options.headers['X-CSRF-Token'],'synthetic-csrf');
 chat.place({left:900,right:1020,bottom:700});eq(chat.element.style.left,'230px','wide panel uses actual placement width');
 chat.ask('Explain');await tick();eq(calls.find(c=>c.url.endsWith('/tutor/chat')).data.lectureId,'lecture-a');
 eq(!!$('.log strong'),true);eq(!!$('.log .katex'),true,'existing math renders inside shadow root');eq(!!$('.log img,.log script'),false);eq(w.PWNED,undefined);
 shadow.querySelector('.more').click();[...shadow.querySelectorAll('.menu-item')].find(n=>n.textContent==='清空对话').click();await tick();eq(calls.some(c=>c.url.endsWith('/tutor/clear')),true);
 // A switch to the other view ends consent; old model replies cannot reappear in ordinary chat.
 let release;x.holdChat(new Promise(r=>release=r));chat.ask('slow');await tick();w.document.querySelector('[data-view="grades"]').click();await tick();
 eq($('.panel').classList.contains('tutoring'),false);eq($('.tutor-toggle').disabled,true);eq(calls.some(c=>c.url.endsWith('/tutor/stop')),true);release();await tick();eq($('.log').textContent.includes('Explanation'),false);
 w.document.querySelector('[data-view="study"]').click();await tick();await enable();
 // Switching lecture revokes, then starts with the newly selected ID only.
 const buttons=[...w.document.querySelectorAll('[data-lecture]')];eq(buttons.length>=2,true);buttons.find(b=>b.dataset.lecture==='lecture-b').click();await tick();eq($('.panel').classList.contains('tutoring'),false);
 await enable();eq(calls.filter(c=>c.url.endsWith('/tutor/start')).at(-1).data.lectureId,'lecture-b');
 x.holdChat(null);chat.ask('Keep this conversation');await tick();
 const transcript=$('.log').textContent,stops=calls.filter(c=>c.url.endsWith('/tutor/stop')).length,starts=calls.filter(c=>c.url.endsWith('/tutor/start')).length;
 eq($('.tutor-toggle').getAttribute('role'),'switch');eq($('.tutor-toggle').getAttribute('aria-checked'),'true');
 eq($('.tutor-tooltip').textContent.includes('10 轮记忆'),true);eq($('.tutor-info-button').getAttribute('aria-describedby'),'tutor-help');
 chat.close();await tick();eq($('.panel').hidden,true);eq($('.panel').classList.contains('tutoring'),true);
 chat.open();eq($('.log').textContent,transcript);eq(calls.filter(c=>c.url.endsWith('/tutor/stop')).length,stops);eq(calls.filter(c=>c.url.endsWith('/tutor/start')).length,starts);
 chat.ask('Continue');await tick();eq(calls.filter(c=>c.url.endsWith('/tutor/chat')).at(-1).data.lectureId,'lecture-b');
 // Closing with an answer in flight must retain both the request and its reply.
 let finishHidden;x.holdChat(new Promise(r=>finishHidden=r));chat.ask('Answer while hidden');await tick();
 $('.close').click();eq($('.panel').hidden,true);finishHidden();await tick();
 eq($('.panel').hidden,true);eq($('.log').textContent.includes('Answer while hidden'),true);
 chat.open();eq($('.panel').classList.contains('tutoring'),true);eq($('.log .waiting'),null);
 eq(calls.filter(c=>c.url.endsWith('/tutor/stop')).length,stops);x.holdChat(null);
 $('.tutor-toggle').click();await tick();eq($('.panel').classList.contains('tutoring'),false);eq($('.tutor-toggle').getAttribute('aria-checked'),'false');eq(calls.filter(c=>c.url.endsWith('/tutor/stop')).length,stops+1);
 await enable();w.document.dispatchEvent(new w.CustomEvent('garyhub:identity',{detail:{user:null}}));await tick();eq($('.log').textContent.includes('Plain note'),false);eq($('.panel').classList.contains('tutoring'),false);
 x.dom.window.close();
 // A slow authorization response must not revive consent after navigating away.
 const y=await setup();let startRelease;y.holdStart(new Promise(r=>startRelease=r));y.shadow.querySelector('.tutor-toggle').click();await tick();y.shadow.querySelector('.tutor-accept').click();await tick();
 y.w.document.querySelector('[data-view="grades"]').click();startRelease();await tick();eq(y.shadow.querySelector('.panel').classList.contains('tutoring'),false);eq(y.calls.some(c=>c.url.endsWith('/tutor/stop')),true);y.dom.window.close();
 // Closing while consent is pending cancels it, including a late grant.
 const z=await setup();let finishStart;z.holdStart(new Promise(r=>finishStart=r));z.shadow.querySelector('.tutor-toggle').click();await tick();z.shadow.querySelector('.tutor-accept').click();await tick();z.chat.close();finishStart();await tick();z.chat.open();
 eq(z.shadow.querySelector('.panel').classList.contains('tutoring'),false);eq(z.calls.some(c=>c.url.endsWith('/tutor/stop')),true);z.dom.window.close();
 console.log('TUTOR DOM PASS: '+n+' assertions; consent, role gates, account/view/document switches, stale replies, Markdown safety and math. No visual layout engine.');
})().catch(e=>{console.error(e);process.exit(1);});
