/* Admin settings for the companion AI assistant. A saved API key is never shown again:
   leave the field empty to keep it, or remove it to switch the assistant off. */
(()=>{'use strict';const $=id=>document.getElementById(id),form=$('assistantForm'),status=$('assistantStatus');if(!form)return;
 function fill(s){const p=$('assistantProvider');p.replaceChildren(...s.providers.map(x=>{const o=document.createElement('option');o.value=x.id;o.textContent=x.label;return o;}));p.value=s.provider;
  $('assistantEnabled').checked=s.enabled;$('assistantModel').value=s.model;$('assistantLimit').value=s.dailyLimit;$('assistantKey').value='';
  $('assistantKey').placeholder=s.keySet?`已保存 ${s.keyHint}，留空则保留`:'粘贴服务商的 API Key';$('assistantClear').hidden=!s.keySet;}
 async function load(){const {api}=window.GaryHub;try{if((await api('/api/hub/me')).user?.role!=='admin')return;fill(await api('/api/assistant/admin/settings'));$('assistantAdmin').hidden=false;}catch(e){status.textContent=e.message;}}
 async function save(extra={}){status.textContent='';try{fill(await window.GaryHub.mutate('/api/assistant/admin/settings','PUT',{enabled:$('assistantEnabled').checked,provider:$('assistantProvider').value,model:$('assistantModel').value.trim(),dailyLimit:Number($('assistantLimit').value),apiKey:$('assistantKey').value.trim(),...extra}));status.textContent='已保存。';}catch(e){status.textContent=e.message;}}
 form.addEventListener('submit',e=>{e.preventDefault();save();});
 $('assistantClear').addEventListener('click',()=>{if(confirm('删除已保存的 API Key 并停用 AI 助手？'))save({clearKey:true,enabled:false,apiKey:''});});
 $('assistantTest').addEventListener('click',async()=>{status.textContent='正在测试…';try{status.textContent=`连接正常：${(await window.GaryHub.mutate('/api/assistant/admin/test','POST',{})).model}`;}catch(e){status.textContent=e.message;}});
 load();
})();
