const $=s=>document.querySelector(s);
const say=message=>{$('#notice').textContent=message;};
let current=null,admin=false,busy=false;
async function api(route,options){const response=await fetch(route,{cache:'no-store',...options});const data=await response.json();if(!response.ok)throw Error(data.message||'请求失败');return data;}
async function post(route,value={}){const {token}=await api('/api/csrf');return api(route,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':token},body:JSON.stringify(value)});}
const date=value=>new Intl.DateTimeFormat(window.GaryHubI18n?.intlLocale||'zh-CN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
async function refresh(first=false){
  const result=await api('/api/access/status');
  const name=document.createElement('span');name.dataset.i18nIgnore='';name.textContent=result.user.username;$('#account').replaceChildren(name,document.createTextNode(' · 用户编号 '+result.user.id));
  current=result.grant; const g=current;
  $('#grant').textContent=!g?'尚未兑换邀请码。':g.revoked?'授权已由管理员停用。':g.active?(g.permanent?'永久授权（无固定到期日）':`有效期至 ${date(g.expiresAt)}`):`已于 ${date(g.expiresAt)} 到期`;
  $('#connection').textContent=!g?'兑换邀请码即可申请开通。':!g.active?'连接已停用或正在停止，续期请兑换新邀请码。':g.connectionStatus==='ready'?'连接已开通，可以导入。':result.syncHealthy?'正在开通或更新，请稍候…':'连接服务暂时无法确认状态，请联系管理员。';
  $('#connection-actions').hidden=g?.connectionStatus!=='ready';
  $('#subscription').value=g?.subscriptionUrl||'';
  $('#store').hidden=!result.storeUrl;$('#store-unset').hidden=!!result.storeUrl;
  if(result.storeUrl)$('#store').href=result.storeUrl;
  admin=result.user.role==='admin';$('#admin').hidden=!admin;
  if(first&&admin){$('#store-url').value=result.storeUrl||'';await refreshAdmin();}
}
async function refreshAdmin(){
  const [codes,grants]=await Promise.all([api('/api/access/admin/codes'),api('/api/access/admin/grants')]);
  $('#history').replaceChildren();
  for(const item of codes.codes.slice(-30).reverse()){
    const row=document.createElement('div');row.className='history-row';
    row.textContent=`${date(item.createdAt)} · ${item.duration==='permanent'?'永久':item.duration+' 天'} · ${item.redeemedBy===null?'未兑换':'用户 '+item.redeemedBy+' 已兑换'} · ${item.fingerprint}`;
    $('#history').append(row);
  }
  $('#grants').replaceChildren();
  for(const g of grants.grants){
    const row=document.createElement('div');row.className='history-row';
    const label=document.createElement('span');label.textContent=`用户 ${g.userId} · ${g.revoked?'已停用':g.permanent?'永久':date(g.expiresAt)} · ${g.active?'授权有效':'无有效授权'} `;row.append(label);
    if(g.active){const button=document.createElement('button');button.textContent='停用';button.onclick=()=>act(button,async()=>{if(!confirm(`停用用户 ${g.userId} 的连接？`))return;await post('/api/access/admin/revoke',{userId:g.userId});say('已登记停用，服务器通常在一分钟内完成。');await refreshAdmin();await refresh();});row.append(button);}
    $('#grants').append(row);
  }
}
async function act(button,fn){if(busy)return;busy=true;button.disabled=true;try{await fn();}catch(e){say(e.message);}finally{button.disabled=false;busy=false;}}
$('#redeem').onsubmit=e=>{e.preventDefault();act(e.target.querySelector('button'),async()=>{await post('/api/access/redeem',{code:e.target.code.value.trim()});e.target.reset();say('兑换成功，正在开通。页面会自动更新。');await refresh();if(admin)await refreshAdmin();});};
$('#generate').onsubmit=e=>{e.preventDefault();act(e.target.querySelector('button'),async()=>{const duration=e.target.duration.value;const r=await post('/api/access/admin/codes',{duration:duration==='permanent'?duration:Number(duration),count:Number(e.target.count.value)});$('#generated').textContent=r.codes.join('\n');$('#generated').hidden=false;say('已生成，请立即复制保存；刷新后无法再次查看明文。');await refreshAdmin();});};
$('#store-form').onsubmit=e=>{e.preventDefault();act(e.target.querySelector('button'),async()=>{await post('/api/access/admin/settings',{storeUrl:$('#store-url').value.trim()});say('店铺入口已保存。');await refresh();});};
$('#copy-sub').onclick=()=>act($('#copy-sub'),async()=>{await navigator.clipboard.writeText(current.subscriptionUrl);say('订阅地址已复制。在 v2rayN 中按 Ctrl+V 导入。');});
$('#copy-node').onclick=()=>act($('#copy-node'),async()=>{await navigator.clipboard.writeText(current.connectionUri);say('当前节点已复制。在 v2rayN 中按 Ctrl+V 导入。');});
$('#rotate').onclick=()=>act($('#rotate'),async()=>{if(!confirm('重置后需要重新导入。继续？'))return;await post('/api/access/rotate');say('已重置，等待同步完成后请重新导入。');await refresh();});
refresh(true).catch(e=>say(e.message));
setInterval(()=>{if(!document.hidden&&!busy)refresh().catch(e=>say(e.message));},10000);

document.addEventListener('garyhub:language',()=>{if(!busy)refresh().catch(e=>say(e.message));});
