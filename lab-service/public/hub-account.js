(()=>{'use strict';
 const mount=document.querySelector('[data-hub-account]');if(!mount)return;
 const scope=mount.dataset.scope||'',labels={home:'Homepage',calendar:'Calendar',tools:'Tools',access:'Network Access',lab:'ECE 470 Lab'};
 let user=null,items=[],nextBefore=null,loading=false,started=false,requestId=0;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const name=el('span','正在确认登录…','gh-name'),login=el('a','登录','gh-button'),logout=el('button','退出登录','gh-button'),admin=el('a','用户管理 ↗','gh-button');
 login.href='/login.html?next='+encodeURIComponent(location.pathname);admin.href='https://tools.garyhub.uk/admin/';admin.target='_blank';admin.rel='noopener';logout.type='button';
 const bell=el('button','🔔','gh-button'),panel=el('section',undefined,'gh-notices'),message=el('span','','gh-message');bell.type='button';bell.setAttribute('aria-label','更新通知');bell.setAttribute('aria-expanded','false');panel.id='gh-notices';panel.setAttribute('aria-label','更新通知');bell.setAttribute('aria-controls',panel.id);panel.hidden=true;message.setAttribute('role','status');
 mount.append(name,login,admin,...(scope?[bell]:[]),logout,message,panel);login.hidden=logout.hidden=admin.hidden=bell.hidden=true;
 async function api(path,options={}){const r=await fetch(path,{cache:'no-store',...options});let data;try{data=await r.json();}catch{throw Error('服务暂时不可用');}if(!r.ok)throw Error(data.message||'请求失败');return data;}
 async function mutate(path,method='POST',body={}){const {token}=await api('/api/csrf');return api(path,{method,headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:JSON.stringify(body)});}
 function conceal(){const p=document.querySelector('[data-academics]');if(p&&!document.getElementById('profileUnlock')){p.replaceChildren(el('span','GPA: •••• · Rank: ••••','gh-masked'));p.setAttribute('aria-label','GPA 和 Rank 已隐藏');}}
 function resetPrivate(){conceal();panel.hidden=true;panel.replaceChildren();items=[];bell.textContent='🔔';bell.setAttribute('aria-expanded','false');}
 function render(){panel.replaceChildren(el('h3',scope==='all'?'全部更新':'Network Access 更新'));if(!items.length)panel.append(el('p','暂无通知'));
  for(const n of items){const row=el('article',undefined,'gh-notice'+(!n.read_at?' gh-unread':''));row.append(el('small',`${labels[n.scope]||n.scope} · ${n.created_at}`),el('strong',n.title),el('p',n.body));if(!n.read_at){const read=el('button','标为已读','gh-button');read.type='button';read.onclick=async()=>{read.disabled=true;try{await mutate(`/api/hub/notifications/${n.id}/read`);await notices();}catch(e){message.textContent=e.message;read.disabled=false;}};row.append(read);}else row.append(el('small','已读'));panel.append(row);}
  if(nextBefore){const more=el('button','加载更早通知','gh-button');more.type='button';more.onclick=()=>notices(true).catch(e=>message.textContent=e.message);panel.append(more);}
 }
 async function notices(more=false){if(!user||!scope)return;const id=user.id;const r=await api('/api/hub/notifications?scope='+scope+(more&&nextBefore?'&before='+nextBefore:''));if(user?.id!==id)return;items=more?[...items,...r.items]:r.items;nextBefore=r.nextBefore;bell.textContent='🔔'+(r.unread?' '+r.unread:'');bell.setAttribute('aria-label',`更新通知，${r.unread} 条未读`);render();}
 async function refresh(){if(loading)return;loading=true;const ticket=++requestId;
  try{const me=await api('/api/hub/me');if(ticket!==requestId)return;const changed=started&&user?.id!==me.user?.id;if(changed)resetPrivate();user=me.user;started=true;name.textContent=user?user.username:'';login.hidden=!!user;logout.hidden=!user;bell.hidden=!user;admin.hidden=!(user?.role==='admin'&&mount.dataset.admin==='true');message.textContent='';
   if(!user){resetPrivate();if(mount.dataset.required==='true')location.replace(login.href);}
   const p=document.querySelector('[data-academics]');if(p&&!document.getElementById('profileUnlock')){if(!me.canViewAcademics)conceal();else{const academic=await api('/api/hub/academics');if(ticket===requestId&&user&&academic.allowed){p.textContent=`GPA: ${academic.gpa} · Rank: ${academic.rank}`;p.removeAttribute('aria-label');}else conceal();}}
   await notices();document.dispatchEvent(new CustomEvent('garyhub:identity',{detail:me}));
  }catch(e){resetPrivate();message.textContent='登录状态暂不可用';name.textContent='';}finally{loading=false;}
 }
 logout.onclick=async()=>{logout.disabled=true;try{await mutate('/api/logout');++requestId;user=null;resetPrivate();if(mount.dataset.required==='true')location.replace(login.href);else location.reload();}catch(e){message.textContent=e.message;logout.disabled=false;}};
 bell.onclick=()=>{panel.hidden=!panel.hidden;bell.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)notices().catch(e=>message.textContent=e.message);};
 document.addEventListener('click',e=>{if(!mount.contains(e.target)){panel.hidden=true;bell.setAttribute('aria-expanded','false');}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){panel.hidden=true;bell.setAttribute('aria-expanded','false');bell.focus();}});
 // Conceal private values while hidden; a fresh server permission check reveals them on return.
 document.addEventListener('visibilitychange',()=>{if(document.hidden){++requestId;conceal();}else refresh();});window.addEventListener('focus',refresh);window.addEventListener('pageshow',refresh);
 setInterval(()=>{if(!document.hidden)refresh();},10000);conceal();refresh();
 window.GaryHub={api,mutate};
})();

