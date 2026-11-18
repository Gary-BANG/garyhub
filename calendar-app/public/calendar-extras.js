/* Calendar account panel additions (v2.4.1.3): browser push on this device.
   v2.4.1.6: the calendar subscription, notification channels, quiet hours and the device list moved to the settings
   centre (tools.garyhub.uk/personalize/#notify); turning push on stays here, because it belongs to this site's worker.
   Uses api() and state from workspace.js, so the CSRF token and account checks are the same as the rest of the page. */
(()=>{'use strict';
const host=document.querySelector('#accountPanel .panel-content');if(!host)return;
const SETTINGS='https://tools.garyhub.uk/personalize/#notify';
const TEXT={
 zh:{feed:'日历订阅（ICS）',feedMoved:'日历订阅地址的生成和关闭已移到设置中心的“通知与提醒”。',settings:'前往设置中心',
  push:'浏览器推送提醒',pushNote:'在这台设备上接收事项提醒、A 股到价提醒，以及你在设置中心选择的其他通知。iPhone / iPad 需要先把本页“添加到主屏幕”，再从主屏幕打开后开启。',
  manage:'通知渠道、免打扰时段和已开启推送的设备列表在设置中心管理。',
  pushOn:'在此设备开启',pushTest:'发送测试通知',pushOff:'在此设备关闭',unsupported:'这个浏览器不支持推送通知。',denied:'通知权限已被拒绝，请在浏览器的网站设置里允许通知后再试。',
  pushEnabled:n=>'这台设备已开启推送。账号共有 '+n+' 台设备接收推送。',pushDisabled:n=>'这台设备未开启推送'+(n?'；账号另有 '+n+' 台设备接收推送。':'。'),
  testSent:r=>r.sent?'测试通知已发送到 '+r.sent+' 台设备。':'没有设备接收到测试通知，请重新开启推送。',working:'正在处理…'},
 en:{feed:'Calendar subscription (ICS)',feedMoved:'Creating and turning off the calendar subscription address has moved to Settings → Notifications.',settings:'Open Settings',
  push:'Browser push reminders',pushNote:'Receive task reminders, A-share price alerts and the other notices you choose in Settings on this device. On iPhone / iPad, add this page to the Home Screen and open it from there first.',
  manage:'Notification channels, quiet hours and the list of devices with push are managed in Settings.',
  pushOn:'Turn on for this device',pushTest:'Send a test',pushOff:'Turn off for this device',unsupported:'This browser does not support push notifications.',denied:'Notifications are blocked; allow them in the site settings and try again.',
  pushEnabled:n=>'Push is on for this device; '+n+' device(s) on this account.',pushDisabled:n=>'Push is off for this device'+(n?'; '+n+' other device(s) on this account.':'.'),
  testSent:r=>r.sent?'Test sent to '+r.sent+' device(s).':'No device received it; turn push on again.',working:'Working…'}
};
const lang=()=>window.GaryHubI18n?.language==='en'?'en':'zh',t=()=>TEXT[lang()];
const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null&&text!=='')n.textContent=text;return n;};
const button=(text,cls='secondary')=>{const b=make('button',cls+' compact-button',text);b.type='button';return b;};
const settingsLink=()=>{const a=make('a','settings-link',t().settings+' →');a.href=SETTINGS;return a;};

const feed=make('section','extra-block'),push=make('section','extra-block');
feed.dataset.i18nIgnore='';push.dataset.i18nIgnore='';host.append(feed,push);
let pushState={supported:'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window,devices:0,here:false},pushMessage='',busy=false;

function renderFeed(){const x=t();feed.replaceChildren(make('h3','',x.feed),make('p','small',x.feedMoved),settingsLink());}
const key=value=>{const b=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));return Uint8Array.from(b,c=>c.charCodeAt(0));};
async function registration(){return navigator.serviceWorker.register('/sw.js',{scope:'/'});}
async function pushStatus(){
 if(!pushState.supported)return;
 try{const s=await api('/api/push/status');pushState.devices=s.devices;pushState.publicKey=s.publicKey;const reg=await navigator.serviceWorker.getRegistration('/');const sub=reg&&await reg.pushManager.getSubscription();pushState.here=!!sub&&Notification.permission==='granted';}catch(e){pushMessage=e.message;}
}
function renderPush(){
 const x=t(),row=make('div','btn-row'),status=make('p','small');status.setAttribute('role','status');
 push.replaceChildren(make('h3','',x.push),make('p','small',x.pushNote));
 if(!pushState.supported){status.textContent=x.unsupported;push.append(status,make('p','small',x.manage),settingsLink());return;}
 if(!pushState.here){const on=button(x.pushOn,'primary');on.disabled=busy;on.onclick=enable;row.append(on);}
 else{const test=button(x.pushTest);test.disabled=busy;test.onclick=async()=>{busy=true;renderPush();try{pushMessage=x.testSent(await api('/api/push/test',{method:'POST',body:JSON.stringify({accountId:state.me.id})}));}catch(e){pushMessage=e.message;}busy=false;await pushStatus();renderPush();};
  const off=button(x.pushOff);off.disabled=busy;off.onclick=disable;row.append(test,off);}
 push.append(row);
 status.textContent=pushMessage||(pushState.here?x.pushEnabled(pushState.devices):x.pushDisabled(pushState.devices));
 push.append(status,make('p','small',x.manage),settingsLink());
}
async function enable(){
 const x=t();busy=true;pushMessage=x.working;renderPush();
 try{
  const permission=await Notification.requestPermission();if(permission!=='granted')throw Error(x.denied);
  const reg=await registration();await navigator.serviceWorker.ready;
  if(!pushState.publicKey)await pushStatus();
  let sub=await reg.pushManager.getSubscription();
  if(sub&&sub.options?.applicationServerKey){const current=new Uint8Array(sub.options.applicationServerKey),wanted=key(pushState.publicKey);if(current.length!==wanted.length||current.some((v,i)=>v!==wanted[i])){await sub.unsubscribe();sub=null;}}
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key(pushState.publicKey)});
  await api('/api/push/subscribe',{method:'POST',body:JSON.stringify({accountId:state.me.id,subscription:sub.toJSON()})});
  pushMessage='';
 }catch(e){pushMessage=e.message;}
 busy=false;await pushStatus();renderPush();
}
async function disable(){
 busy=true;renderPush();
 try{const reg=await navigator.serviceWorker.getRegistration('/');const sub=reg&&await reg.pushManager.getSubscription();
  if(sub){await api('/api/push/unsubscribe',{method:'POST',body:JSON.stringify({accountId:state.me.id,endpoint:sub.endpoint})});await sub.unsubscribe();}pushMessage='';}
 catch(e){pushMessage=e.message;}
 busy=false;await pushStatus();renderPush();
}
async function start(){
 if(!state.me){setTimeout(start,400);return;}
 // A search result opens the calendar at its date: show that day's tasks.
 const asked=new URLSearchParams(location.search).get('date');
 if(/^\d{4}-\d\d-\d\d$/.test(asked||'')&&typeof setTaskDateFilter==='function'){setTaskDateFilter(asked);try{state.calendar?.gotoDate?.(asked);}catch{}}
 // The settings centre links here to turn push on for this device and to verify the e-mail address.
 if(new URLSearchParams(location.search).get('panel')==='account'&&typeof openPanel==='function'){openPanel('accountPanel');setTimeout(()=>document.getElementById('accountPanel')?.scrollIntoView({block:'start'}),50);}
 await pushStatus();renderFeed();renderPush();
}
document.addEventListener('garyhub:language',()=>{renderFeed();renderPush();});
renderFeed();renderPush();start();
})();
