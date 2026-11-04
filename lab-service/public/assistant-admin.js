/* Admin settings for the companion AI assistant. A saved API key is never shown again:
   leave the field empty to keep it, or remove it to switch the assistant off.
   Daily allowances are set per tier: chat (every message), calendar requests and web searches. */
(()=>{'use strict';const $=id=>document.getElementById(id),form=$('assistantForm'),status=$('assistantStatus');if(!form)return;
 const kinds=['chat','data','search'],tiers=['standard','subscriber','admin'],cell=(kind,tier)=>form.querySelector(`input[data-kind="${kind}"][data-tier="${tier}"]`);
 for(const row of form.querySelectorAll('.assistant-quotas tr[data-kind]'))for(const tier of tiers){const td=document.createElement('td'),input=document.createElement('input');Object.assign(input,{type:'number',min:row.dataset.kind==='chat'?1:0,max:5000,step:1,required:true});input.dataset.kind=row.dataset.kind;input.dataset.tier=tier;input.setAttribute('aria-label',row.querySelector('th').textContent+' · '+form.querySelectorAll('.assistant-quotas thead th')[tiers.indexOf(tier)+1].textContent);td.append(input);row.append(td);}
 function fill(s){const p=$('assistantProvider');p.replaceChildren(...s.providers.map(x=>{const o=document.createElement('option');o.value=x.id;o.textContent=x.label;return o;}));p.value=s.provider;
  $('assistantEnabled').checked=s.enabled;$('assistantModel').value=s.model;$('assistantFallback').value=s.fallbackModel||'';$('assistantSearch').checked=s.search;$('assistantKey').value='';
  for(const kind of kinds)for(const tier of tiers)cell(kind,tier).value=s.quotas[kind][tier];
  $('assistantKey').placeholder=s.keySet?`已保存 ${s.keyHint}，留空则保留`:'粘贴服务商的 API Key';$('assistantClear').hidden=!s.keySet;}
 const quotas=()=>Object.fromEntries(kinds.map(kind=>[kind,Object.fromEntries(tiers.map(tier=>[tier,Number(cell(kind,tier).value)]))]));
 async function load(){const {api}=window.GaryHub;try{if((await api('/api/hub/me')).user?.role!=='admin')return;fill(await api('/api/assistant/admin/settings'));$('assistantAdmin').hidden=false;}catch(e){status.textContent=e.message;}}
 async function save(extra={}){status.textContent='';try{fill(await window.GaryHub.mutate('/api/assistant/admin/settings','PUT',{enabled:$('assistantEnabled').checked,provider:$('assistantProvider').value,model:$('assistantModel').value.trim(),fallbackModel:$('assistantFallback').value.trim(),search:$('assistantSearch').checked,quotas:quotas(),apiKey:$('assistantKey').value.trim(),...extra}));status.textContent='已保存。';}catch(e){status.textContent=e.message;}}
 form.addEventListener('submit',e=>{e.preventDefault();save();});
 $('assistantClear').addEventListener('click',()=>{if(confirm('删除已保存的 API Key 并停用 AI 助手？'))save({clearKey:true,enabled:false,apiKey:''});});
 // Each configured model and the search API are tried once; failures also appear in the error log.
 $('assistantTest').addEventListener('click',async()=>{const list=$('assistantChecks');list.replaceChildren();status.textContent='正在测试…';
  try{const r=await window.GaryHub.mutate('/api/assistant/admin/test','POST',{}),names={model:'主模型',fallback:'备用模型',search:'联网搜索'};
   status.textContent=r.ok?'全部正常。':'有项目失败，详情见下方或错误日志。';
   for(const c of r.checks){const li=document.createElement('li');li.textContent=`${names[c.role]||c.role}（${c.model}）：${c.ok?'正常':'失败'} · ${c.ms} ms`+(c.ok?'':` · HTTP ${c.status} · ${c.code}${c.detail?' · '+c.detail:''}`);list.append(li);}}
  catch(e){status.textContent=e.message;}});
 load();
})();
