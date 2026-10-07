const status = document.createElement('div');
status.id='cloud-bar';
status.innerHTML='<a href="https://tools.garyhub.uk">← Tools</a><span id="cloud-user"></span><span id="cloud-status">连接个人空间…</span><button id="cloud-retry">重试同步</button><button id="cloud-export">导出本机备份</button><button id="cloud-reload">加载云端</button><a href="/login.html">重新登录</a><button id="cloud-logout">退出</button>';
document.body.prepend(status);
let db, user, revision=0, pending=null, blocked=false, timer, chain=Promise.resolve(), csrf, dirty=false;
const label=t=>document.querySelector('#cloud-status').textContent=t;
async function api(url,options={}) {
  const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
  const data=await r.json(); if(!r.ok){const e=Error(data.message||'连接失败');e.status=r.status;throw e;}return data;
}
function local(write,value){return new Promise((resolve,reject)=>{const tx=db.transaction('kv',write?'readwrite':'readonly');const r=write?tx.objectStore('kv').put(value,'snapshot'):tx.objectStore('kv').get('snapshot');tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
async function flush(){
  if(blocked||!pending)return;
  const snapshot=pending;pending=null;
  label('正在保存到服务器…');
  try{
    csrf=(await api('/api/csrf')).token;
    const r=await api('/api/lab/state',{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({revision,state:snapshot})});
    revision=r.revision;
    await local(true,{revision,state:pending||snapshot,dirty:!!pending});
    dirty=!!pending;label(pending?'还有更改待保存':'已保存到服务器');
  }catch(e){pending=pending||snapshot;dirty=true;blocked=[401,403,409].includes(e.status);label(e.status===409?'保存冲突：先导出本机备份，再加载云端':e.status===401?'登录已过期：先导出备份，再重新登录':'尚未同步：'+e.message);}
}
export async function loadCloud(){
  const r=await api('/api/lab/state'); user=r.user;revision=r.revision;
  document.querySelector('#cloud-user').textContent=user.username;
  db=await new Promise((resolve,reject)=>{const req=indexedDB.open('garyhub-lab-user-'+user.id,1);req.onupgradeneeded=()=>req.result.createObjectStore('kv');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  const cached=await local(false);
  if(cached?.dirty){pending=cached.state;dirty=true;if(cached.revision!==revision){revision=cached.revision;blocked=true;label('本机有未同步内容且云端已更新：请导出备份后加载云端');return cached.state;}label('恢复本机未同步内容');queue();return cached.state;}
  await local(true,{revision,state:r.state,dirty:false});label('已连接个人空间');return r.state;
}
function queue(){clearTimeout(timer);timer=setTimeout(()=>{chain=chain.then(flush).catch(e=>label('保存失败：'+e.message));},700);}
export function markDirty(){dirty=true;label('更改待保存…');}
export function saveCloud(state){
  pending=structuredClone(state);dirty=true;
  const snapshot=pending;
  chain=chain.then(()=>local(true,{revision,state:snapshot,dirty:true})).catch(e=>label('本机缓存失败：'+e.message));
  if(!blocked)queue();return chain;
}
document.querySelector('#cloud-retry').onclick=()=>{if(blocked){label('请先导出备份，再加载云端或重新登录');return;}queue();};
document.querySelector('#cloud-export').onclick=async()=>{
  if(!db)return;const s=pending||(await local(false))?.state;if(!s)return;
  const bank=await fetch('data/starter.json').then(r=>r.json());const map=new Map(bank.problems.map(p=>[p.id,p]));s.custom.forEach(p=>map.set(p.id,p));
  const images={...s.images};for(const p of map.values()){if(p.image&&!images[p.image]){const b=await fetch(p.image).then(r=>r.blob());images[p.image]=await new Promise(resolve=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.readAsDataURL(b);});}}
  const out={kind:'ece470-backup',version:1,pack:{schema_version:1,problems:[...map.values()]},custom_ids:s.custom.map(p=>p.id),images,instances:s.instances,current:s.current,history:s.history};
  const url=URL.createObjectURL(new Blob([JSON.stringify(out)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='ece470-personal-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
};
document.querySelector('#cloud-reload').onclick=async()=>{if(!confirm('将丢弃本机未同步的更改并加载云端。请先导出本机备份。继续？'))return;try{blocked=true;clearTimeout(timer);await chain;const r=await api('/api/lab/state');await local(true,{revision:r.revision,state:r.state,dirty:false});dirty=false;location.reload();}catch(e){label(e.message);}};
document.querySelector('#cloud-logout').onclick=async()=>{if(dirty){label('请先等待同步成功，或导出备份后再退出。');return;}try{const token=(await api('/api/csrf')).token;await api('/api/logout',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:'{}'});location.href='/login.html';}catch(e){label(e.message);}};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
window.addEventListener('online',()=>{if(!blocked)queue();});
