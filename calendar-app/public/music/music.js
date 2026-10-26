(()=>{'use strict';
 const $=id=>document.getElementById(id);let user=null,data=null,busy=false,token=null,epoch=0,controller=null;
 const message=(s,error=false)=>{$('music-status').textContent=s;$('music-status').classList.toggle('error',error);};
 async function api(path,method='GET',body,headers={}){
  if(method!=='GET'&&!token){const r=await fetch('/api/csrf',{cache:'no-store'});if(!r.ok)throw Error('请重新登录。');token=(await r.json()).token;}
  const r=await fetch(path,{method,cache:'no-store',headers:{'X-GaryHub-User':String(user.id),...(method==='GET'?{}:{'X-CSRF-Token':token}),...(body&&typeof body==='string'?{'Content-Type':'application/json'}:{}),...headers},body,signal:controller?.signal});
  const d=await r.json();if(!r.ok)throw Error(d.message||'操作失败，请重试。');return d;
 }
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 function render(){
  const list=$('music-list');list.replaceChildren();
  for(const track of [{id:null,title:'GaryHub 默认音乐',bytes:0},...data.items]){
   const row=node('div');row.className='music-row';const radio=node('input');radio.type='radio';radio.name='background-music';radio.value=track.id||'';radio.checked=data.selected===track.id;radio.disabled=busy||!!track.id&&!data.canUpload;radio.setAttribute('aria-label','选择 '+track.title);
   radio.onchange=()=>act(async()=>{await api('/api/music/selected','PUT',JSON.stringify({id:track.id}));dispatchEvent(new Event('garyhub:music-changed'));});
   const title=node('label',track.title);radio.id='music-'+(track.id||'default');title.htmlFor=radio.id;title.className='music-title';if(track.bytes)title.append(node('small',(track.bytes/1048576).toFixed(1)+' MiB'));row.append(radio,title);
   if(track.id){const del=node('button','删除');del.type='button';del.className='text-button';del.disabled=busy;del.setAttribute('aria-label','删除 '+track.title);del.onclick=()=>{if(confirm('删除这首音乐？'))act(async()=>{await api('/api/music/'+track.id,'DELETE');dispatchEvent(new Event('garyhub:music-changed'));});};row.append(del);}list.append(row);
  }
  $('music-usage').textContent=data.items.length+' 首 · '+(data.usage.bytes/1048576).toFixed(1)+' / 100 MiB'+(data.usage.pendingDeletion?'（含清理中的文件）':'');
  $('music-access').textContent=!data.canUpload?'上传和播放个人音乐需要订阅或管理员权限。已有文件保留，可删除。':!data.configured?'云存储尚未配置，请管理员按升级包中的 Cloudflare 指南完成设置。':'云存储已配置；音乐仅在你自己的账号中使用。';
  $('music-upload').hidden=!data.canUpload;$('music-upload-button').disabled=busy||!data.configured;$('music-file').disabled=busy||!data.configured;
 }
 async function load(){const ticket=epoch,d=await api('/api/music');if(ticket!==epoch)return;data=d;render();}
 async function act(fn){if(busy)return;busy=true;render();message('正在保存…');try{await fn();await load();message('已保存。');}catch(e){message(e.message,true);}finally{busy=false;if(data)render();}}
 $('music-upload').onsubmit=e=>{e.preventDefault();const file=$('music-file').files[0];if(!file)return;if(!/\.mp3$/i.test(file.name)||file.size>20*1048576)return message('请选择不超过 20 MiB 的 MP3。',true);act(async()=>{controller=new AbortController();message('正在上传，请保持页面打开…');try{await api('/api/music/upload','POST',file,{'Content-Type':'audio/mpeg','X-Music-Filename':encodeURIComponent(file.name),'X-Upload-Id':crypto.randomUUID()});$('music-file').value='';}finally{controller=null;}});};
 let checking=false;async function identity(){if(checking||document.hidden)return;checking=true;try{const r=await fetch('/api/me',{cache:'no-store'}),d=await r.json();if(!r.ok||user&&d.user.id!==user.id){epoch++;controller?.abort();$('music-app').hidden=true;data=null;message('登录账号已变化，请刷新页面后继续。',true);return;}user=d.user;if(!busy&&data)await load();}catch{}finally{checking=false;}}
 addEventListener('focus',identity);document.addEventListener('visibilitychange',identity);setInterval(identity,10000);
 (async()=>{const r=await fetch('/api/me',{cache:'no-store'});if(!r.ok){location.replace('/login/?next=%2Fmusic%2F');return;}user=(await r.json()).user;if(user.mustChangePassword){location.replace('/change-password/');return;}$('music-user').textContent=user.username;await load();$('music-app').hidden=false;message('选择一首背景音乐。');})().catch(e=>message(e.message,true));
})();
