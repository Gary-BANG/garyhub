/* Calendar account panel additions (v2.4.1.3): a read-only calendar subscription (ICS) and browser push on this device.
   Uses api() and state from workspace.js, so the CSRF token and account checks are the same as the rest of the page. */
(()=>{'use strict';
const host=document.querySelector('#accountPanel .panel-content');if(!host)return;
const TEXT={
 zh:{feed:'日历订阅（ICS）',feedNote:'把日程同步到手机或电脑自带的日历：复制地址，在日历应用里选择“通过 URL 订阅”。地址相当于只读密码，请勿分享；重新生成或关闭后，旧地址立即失效。',
  create:'生成订阅地址',rotate:'重新生成地址',off:'关闭订阅',copy:'复制',copied:'已复制。',shownOnce:'地址只显示这一次，请现在复制。',
  on:at=>'订阅已开启（创建于 '+at+'）。',used:at=>'最近一次同步：'+at+'。',never:'还没有日历应用来同步过。',disabled:'订阅未开启。',confirmRotate:'重新生成后，旧地址会立即失效。继续吗？',
  push:'浏览器推送提醒',pushNote:'在这台设备上接收事项提醒和 A 股到价提醒。事项提醒时间与邮件提醒相同。iPhone / iPad 需要先把本页“添加到主屏幕”，再从主屏幕打开后开启。',
  pushOn:'在此设备开启',pushTest:'发送测试通知',pushOff:'在此设备关闭',unsupported:'这个浏览器不支持推送通知。',denied:'通知权限已被拒绝，请在浏览器的网站设置里允许通知后再试。',
  pushEnabled:n=>'这台设备已开启推送。账号共有 '+n+' 台设备接收推送。',pushDisabled:n=>'这台设备未开启推送'+(n?'；账号另有 '+n+' 台设备接收推送。':'。'),
  testSent:r=>r.sent?'测试通知已发送到 '+r.sent+' 台设备。':'没有设备接收到测试通知，请重新开启推送。',working:'正在处理…'},
 en:{feed:'Calendar subscription (ICS)',feedNote:'Sync your schedule to the calendar app on your phone or computer: copy the address and choose "Subscribe by URL". The address works like a read-only password; do not share it. A new address or turning this off stops the old one at once.',
  create:'Create address',rotate:'Create a new address',off:'Turn off',copy:'Copy',copied:'Copied.',shownOnce:'The address is shown only now; copy it.',
  on:at=>'Subscription on (created '+at+').',used:at=>'Last synced: '+at+'.',never:'No calendar app has synced yet.',disabled:'Subscription is off.',confirmRotate:'The old address will stop working at once. Continue?',
  push:'Browser push reminders',pushNote:'Receive task reminders and A-share price alerts on this device, at the same times as e-mail reminders. On iPhone / iPad, add this page to the Home Screen and open it from there first.',
  pushOn:'Turn on for this device',pushTest:'Send a test',pushOff:'Turn off for this device',unsupported:'This browser does not support push notifications.',denied:'Notifications are blocked; allow them in the site settings and try again.',
  pushEnabled:n=>'Push is on for this device; '+n+' device(s) on this account.',pushDisabled:n=>'Push is off for this device'+(n?'; '+n+' other device(s) on this account.':'.'),
  testSent:r=>r.sent?'Test sent to '+r.sent+' device(s).':'No device received it; turn push on again.',working:'Working…'}
};
const lang=()=>window.GaryHubI18n?.language==='en'?'en':'zh',t=()=>TEXT[lang()];
const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null&&text!=='')n.textContent=text;return n;};
const when=value=>{if(!value)return '';const d=new Date(String(value).replace(' ','T')+(/[zZ]|[+-]\d\d:?\d\d$/.test(value)?'':'Z'));return Number.isNaN(d.getTime())?value:d.toLocaleString(lang()==='en'?'en-US':'zh-CN');};
const button=(text,cls='secondary')=>{const b=make('button',cls+' compact-button',text);b.type='button';return b;};

const feed=make('section','extra-block'),push=make('section','extra-block');
feed.dataset.i18nIgnore='';push.dataset.i18nIgnore='';host.append(feed,push);
let feedState=null,feedUrl='',feedMessage='',pushState={supported:'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window,devices:0,here:false},pushMessage='',busy=false;

function renderFeed(){
 const x=t(),row=make('div','btn-row'),status=make('p','small');status.setAttribute('role','status');
 feed.replaceChildren(make('h3','',x.feed),make('p','small',x.feedNote));
 const create=button(feedState?.enabled?x.rotate:x.create,feedState?.enabled?'secondary':'primary');create.disabled=busy;
 create.onclick=async()=>{if(feedState?.enabled&&!confirm(x.confirmRotate))return;busy=true;renderFeed();try{const r=await api('/api/calendar-feed',{method:'POST',body:JSON.stringify({accountId:state.me.id})});feedState=r;feedUrl=r.url;feedMessage=x.shownOnce;}catch(e){feedMessage=e.message;}busy=false;renderFeed();};
 row.append(create);
 if(feedState?.enabled){const off=button(x.off);off.disabled=busy;off.onclick=async()=>{busy=true;renderFeed();try{feedState=await api('/api/calendar-feed',{method:'DELETE',body:JSON.stringify({accountId:state.me.id})});feedUrl='';feedMessage='';}catch(e){feedMessage=e.message;}busy=false;renderFeed();};row.append(off);}
 feed.append(row);
 if(feedUrl){const line=make('div','feed-url'),input=make('input');input.readOnly=true;input.value=feedUrl;input.setAttribute('aria-label',x.feed);input.onfocus=()=>input.select();
  const copy=button(x.copy);copy.onclick=async()=>{try{await navigator.clipboard.writeText(feedUrl);}catch{input.select();document.execCommand('copy');}feedMessage=x.copied;status.textContent=feedMessage;};line.append(input,copy);feed.append(line);}
 status.textContent=[feedMessage,!feedState?'':feedState.enabled?x.on(when(feedState.createdAt))+' '+(feedState.lastUsedAt?x.used(when(feedState.lastUsedAt)):x.never):x.disabled].filter(Boolean).join(' ');
 feed.append(status);
}
const key=value=>{const b=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));return Uint8Array.from(b,c=>c.charCodeAt(0));};
async function registration(){return navigator.serviceWorker.register('/sw.js',{scope:'/'});}
async function pushStatus(){
 if(!pushState.supported)return;
 try{const s=await api('/api/push/status');pushState.devices=s.devices;pushState.publicKey=s.publicKey;const reg=await navigator.serviceWorker.getRegistration('/');const sub=reg&&await reg.pushManager.getSubscription();pushState.here=!!sub&&Notification.permission==='granted';}catch(e){pushMessage=e.message;}
}
function renderPush(){
 const x=t(),row=make('div','btn-row'),status=make('p','small');status.setAttribute('role','status');
 push.replaceChildren(make('h3','',x.push),make('p','small',x.pushNote));
 if(!pushState.supported){status.textContent=x.unsupported;push.append(status);return;}
 if(!pushState.here){const on=button(x.pushOn,'primary');on.disabled=busy;on.onclick=enable;row.append(on);}
 else{const test=button(x.pushTest);test.disabled=busy;test.onclick=async()=>{busy=true;renderPush();try{pushMessage=x.testSent(await api('/api/push/test',{method:'POST',body:JSON.stringify({accountId:state.me.id})}));}catch(e){pushMessage=e.message;}busy=false;await pushStatus();renderPush();};
  const off=button(x.pushOff);off.disabled=busy;off.onclick=disable;row.append(test,off);}
 push.append(row);
 status.textContent=pushMessage||(pushState.here?x.pushEnabled(pushState.devices):x.pushDisabled(pushState.devices));
 push.append(status);
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
 try{feedState=await api('/api/calendar-feed');}catch(e){feedMessage=e.message;}
 await pushStatus();renderFeed();renderPush();
}
document.addEventListener('garyhub:language',()=>{renderFeed();renderPush();});
renderFeed();renderPush();start();
})();
