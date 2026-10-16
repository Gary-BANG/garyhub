'use strict';
const state={me:null,account:null,calendar:null,selectedUserId:null};
const $=id=>document.getElementById(id);
const escapeHtml=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let csrfToken=null,dirty=false,identityBlocked=false;
const dirtyForms=new Set();
function showLoginPage(){location.replace('/login/?next='+encodeURIComponent(location.pathname));}
async function api(url,options={}){
 const opts={...options,credentials:'same-origin',cache:'no-store',headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}};
 if(identityBlocked)throw Error('账号已变化，请刷新页面后继续。');
 if(state.me&&url.startsWith('/api/personal/'))opts.headers['X-GaryHub-User']=String(state.me.id);
 if(!['GET','HEAD'].includes(opts.method||'GET')){
  if(!csrfToken){const r=await fetch('/api/csrf',{cache:'no-store'});if(!r.ok)throw Error('无法校验登录状态，请重试。');csrfToken=(await r.json()).token;}
  opts.headers['X-CSRF-Token']=csrfToken;
 }
 const res=await fetch(url,opts);const data=await res.json();
 if(res.status===401){if(dirty){identityBlocked=true;throw Error('登录已过期，请先复制未保存的内容，再重新登录。');}showLoginPage();throw Error('请先登录');}
 if(res.status===428){if(dirty){identityBlocked=true;throw Error('密码已被重置。请先复制未保存内容，再前往 Calendar 的 /change-password/ 修改密码。');}location.replace('/change-password/');throw Error('请先修改临时密码');}
 if(!res.ok)throw Error(data.message||'请求失败，请重试。');return data;
}
function installDirtyGuard(forms){forms.forEach(form=>{form.addEventListener('input',()=>{dirtyForms.add(form);dirty=true;});form.addEventListener('change',()=>{dirtyForms.add(form);dirty=true;});form.addEventListener('saved',()=>{dirtyForms.delete(form);dirty=dirtyForms.size>0;});});}
function confirmDiscard(){if(!dirty)return true;if(!confirm('有尚未保存的修改，确定放弃这些修改吗？'))return false;dirtyForms.clear();dirty=false;return true;}
function personalToday(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:state.account?.timezone||'Etc/UTC',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const p=t=>parts.find(x=>x.type===t).value;return `${p('year')}-${p('month')}-${p('day')}`;}
async function initWorkspace(start){try{state.me=(await api('/api/me')).user;if(state.me.mustChangePassword){location.replace('/change-password/');return;}state.selectedUserId=state.me.id;state.account=await api('/api/account/email');$('currentUserText').textContent=state.me.username;await start();$('appSection').classList.remove('hidden');$('pageMessage').textContent='';}catch(e){$('pageMessage').textContent=e.message;}}
$('logoutBtn').addEventListener('click',async()=>{if(!confirmDiscard())return;try{await api('/api/logout',{method:'POST'});csrfToken=null;showLoginPage();}catch(e){$('pageMessage').textContent=e.message;}});
addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
let checking=false;
async function checkIdentity(){if(checking||document.hidden||!state.me||identityBlocked)return;checking=true;try{const r=await fetch('/api/me',{cache:'no-store'});if(r.status!==401&&r.status!==403&&!r.ok)return;const d=await r.json();if(!r.ok||d.user?.id!==state.me.id){identityBlocked=true;if(dirty){$('pageMessage').textContent='登录账号已变化。请先复制未保存的内容，再刷新页面。';document.querySelectorAll('button[type=submit],form button:not([type])').forEach(b=>b.disabled=true);}else location.reload();return;}state.me=d.user;if(d.user.mustChangePassword&&!dirty){location.replace('/change-password/');return;}if(typeof renderNotifications==='function'){state.notifications=await api('/api/notifications');renderNotifications();}}catch{}finally{checking=false;}}
addEventListener('focus',checkIdentity);document.addEventListener('visibilitychange',checkIdentity);setInterval(checkIdentity,10000);
