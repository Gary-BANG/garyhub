(()=>{
 'use strict';
 const F=window.ResearchFormat,$=id=>document.getElementById(id),node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;},id=()=>crypto.randomUUID();
 let uid=null,csrf=null,projects=[],project=null,selected=null,filters=new Set(),epoch=0,busy=false,editing=null,editingProject=false,dirty=false,blocked=false,documentImport=null,choices={},previewReady=false,pending=null;
 const status=(s,error=false)=>{$('status').textContent=s;$('status').className=error?'error':'';};
 function download(name,text,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type})),a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function block(message){blocked=true;status(message,true);$('login').hidden=false;updateControls();}
 async function api(path,method='GET',body){
  if(blocked)throw Error('账号状态已变化，请重新登录后刷新页面。');
  const r=await fetch(path,{method,headers:{'content-type':'application/json','x-garyhub-user':String(uid),...(method==='GET'?{}:{'x-csrf-token':csrf})},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  const v=await r.json().catch(()=>({message:'服务器响应异常'}));
  if(r.status===401||r.status===428)block(v.message||'请重新登录');
  if(!r.ok)throw Error(v.message||'操作失败');
  if(v.accountId!==undefined&&v.accountId!==uid){block('登录账号已变化，请刷新后继续。');throw Error('账号已变化');}return v;
 }
 function updateControls(){
  for(const button of document.querySelectorAll('button'))button.disabled=busy||blocked;
  for(const el of document.querySelectorAll('dialog input,dialog textarea,dialog select'))el.disabled=busy||blocked;
  for(const name of ['edit-project','prompt','import','export','add'])$(name).disabled=busy||blocked||!project;
  $('undo').hidden=!project?.canUndo;$('undo').disabled=busy||blocked;
  $('commit-import').disabled=busy||blocked||!previewReady;
 }
 async function task(fn,errorId){if(busy||blocked)return;busy=true;updateControls();try{await fn();}catch(e){if(errorId)$(errorId).textContent=e.message;status(e.message,true);}finally{busy=false;updateControls();}}
 function base(){return {accountId:uid,revision:project.revision,requestId:id()};}
 function requestBody(key,body){if(pending?.key===key&&pending.signature===JSON.stringify(body))return pending.body;const full={...base(),...body};pending={key,signature:JSON.stringify(body),body:full};return full;}
 async function save(entries,name=project.name,description=project.description){const p=await api('/api/research/'+project.id,'PUT',requestBody('save:'+project.id,{name,description,entries}));pending=null;adopt(p);await refreshProjects();return p;}
 async function refreshProjects(){const v=await api('/api/research');projects=v.projects;renderProjects();}
 function renderProjects(){const box=$('projects');box.replaceChildren();for(const p of projects){const b=node('button',p.name);b.setAttribute('aria-pressed',String(p.id===project?.id));b.title=p.name+' · '+p.entryCount+' 条释义';b.onclick=()=>load(p.id);box.append(b);}updateControls();}
 function adopt(p){project=p;if(!p.entries.some(e=>e.id===selected))selected=null;$('description').textContent=p.description||'为这个 Research 补充简介，让 AI 生成的词库贴近你的研究。';renderProjects();renderList();renderDetail();updateControls();}
 async function load(pid){if(busy||blocked)return;const ticket=++epoch;status('正在加载词库…');try{const p=await api('/api/research/'+pid);if(ticket!==epoch)return;filters.clear();$('search').value='';selected=null;adopt(p);$('panels').classList.remove('show-detail');status('词库已加载 · '+p.entries.length+' 条释义');}catch(e){if(ticket===epoch)status(e.message,true);}}
 function renderList(){
  const tags=[...new Set((project?.entries||[]).flatMap(e=>e.tags))].sort((a,b)=>a.localeCompare(b)),tagBox=$('tags');tagBox.replaceChildren();
  if(!tags.length)tagBox.append(node('span','暂无标签','hint'));
  for(const tag of tags){const b=node('button',tag,'tag');b.setAttribute('aria-pressed',String(filters.has(tag)));b.onclick=()=>{filters.has(tag)?filters.delete(tag):filters.add(tag);renderList();};tagBox.append(b);}
  const q=F.norm($('search').value),tokens=q.split(' ').filter(Boolean),score=e=>e.english.some(t=>F.norm(t)===q)||e.chinese.some(t=>F.norm(t)===q)?0:e.english.concat(e.chinese).some(t=>F.norm(t).startsWith(q))?1:2;
  const entries=(project?.entries||[]).filter(e=>[...filters].every(t=>e.tags.includes(t))&&tokens.every(t=>F.norm([...e.english,...e.chinese,e.definition,e.usage,...e.tags].join(' ')).includes(t))).sort((a,b)=>score(a)-score(b)||a.english[0].localeCompare(b.english[0]));
  $('count').textContent=entries.length+' / '+(project?.entries.length||0)+' 条';const box=$('entries');box.replaceChildren();
  if(!entries.length)box.append(node('p',project?.entries.length?'没有匹配的释义，试试其他关键词或清空标签。':'还没有词条。导入词库，或手动新增第一条释义。','list-empty'));
  for(const e of entries){const b=node('button',undefined,'entry-row');b.dataset.entryId=e.id;b.setAttribute('aria-current',String(selected===e.id));b.append(node('strong',e.english[0]),node('span',e.chinese[0]),node('small',e.definition));b.onclick=()=>{selected=e.id;renderList();renderDetail();$('panels').classList.add('show-detail');};box.append(b);}
 }
 function renderDetail(){
  const box=$('detail'),e=project?.entries.find(e=>e.id===selected);box.replaceChildren();
  if(!e){const empty=node('div',undefined,'empty');empty.append(node('span','Aa','empty-mark'),node('h2','让术语回到语境里'),node('p','选择一条释义，查看用法与双语例句。'));box.append(empty);return;}
  const back=node('button','← 返回术语列表','mobile-back');back.onclick=()=>$('panels').classList.remove('show-detail');box.append(back);
  const top=node('div',undefined,'detail-top'),title=node('div'),badge=node('span',e.status==='verified'?'已核对':'待核对','badge '+e.status);title.append(badge,node('h2',e.english[0]),node('p',e.chinese[0],'translation'));
  const actions=node('div',undefined,'detail-tools'),copy=node('button','复制英文'),edit=node('button','编辑词条'),another=node('button','＋ 新增释义');
  copy.onclick=()=>copyText(e.english[0]);edit.onclick=()=>openEntry(e);another.onclick=()=>openEntry({english:e.english,chinese:e.chinese});actions.append(copy,edit,another);top.append(title,actions);box.append(top);
  if(e.english.length>1||e.chinese.length>1){const aliases=node('div',undefined,'aliases');if(e.english.length>1)aliases.append(node('div','其他英文表达：'+e.english.slice(1).join(' · ')));if(e.chinese.length>1)aliases.append(node('div','其他中文译法：'+e.chinese.slice(1).join(' · ')));box.append(aliases);}
  const section=(heading,text)=>{const s=node('section');s.append(node('h3',heading),node('p',text));box.append(s);};
  section('专业释义 / MEANING',e.definition);if(e.usage)section('使用场景与近义词区别 / USAGE',e.usage);
  const examples=node('section');examples.append(node('h3','双语例句 / IN CONTEXT'));for(const example of e.examples){const item=node('div',undefined,'example'),copy=node('button','复制例句','text-button');copy.onclick=()=>copyText(example.en);item.append(node('p',example.en,'en'),node('p',example.zh,'zh'),copy);examples.append(item);}box.append(examples);
  if(e.tags.length){const tags=node('div',undefined,'tags');for(const t of e.tags)tags.append(node('span',t,'tag'));box.append(tags);}if(e.source)section('来源说明',e.source);
 }
 async function copyText(text){try{await navigator.clipboard.writeText(text);status('已复制');}catch{status('复制失败，请直接选中文字复制。',true);}}
 function openProject(isEdit=false){if(busy||blocked)return;editingProject=isEdit;$('project-form').reset();$('project-name').value=isEdit?project.name:'';$('project-description').value=isEdit?project.description:'';$('project-heading').textContent=isEdit?'Research 设置':'新建 Research';$('project-error').textContent='';dirty=false;$('project-dialog').showModal();}
 function openEntry(e={}){if(busy||blocked||!project)return;editing=e.id||null;$('entry-form').reset();$('entry-heading').textContent=editing?'编辑词条':'新增词条';for(const key of ['english','chinese'])$(key).value=(e[key]||[]).join('\n');for(const key of ['definition','usage','source'])$(key).value=e[key]||'';$('entry-tags').value=(e.tags||[]).join('\n');$('entry-status').value=e.status||'unverified';for(let i=1;i<=2;i++)for(const lang of ['en','zh'])$(lang+i).value=e.examples?.[i-1]?.[lang]||'';$('entry-error').textContent='';dirty=false;$('entry-dialog').showModal();}
 const lines=id=>$(id).value.split('\n').map(s=>s.trim()).filter(Boolean);
 $('project-form').onsubmit=event=>{event.preventDefault();task(async()=>{const name=$('project-name').value.trim(),description=$('project-description').value.trim();if(editingProject)await save(project.entries,name,description);else{const key='create',data={accountId:uid,id:pending?.key===key?pending.body.id:id(),name,description};pending={key,body:data};adopt(await api('/api/research','POST',data));pending=null;await refreshProjects();}dirty=false;$('project-dialog').close();status('Research 已保存');},'project-error');};
 $('entry-form').onsubmit=event=>{event.preventDefault();task(async()=>{
  const examples=[{en:$('en1').value,zh:$('zh1').value}];if($('en2').value.trim()||$('zh2').value.trim())examples.push({en:$('en2').value,zh:$('zh2').value});
  const e=F.entry({id:editing||pending?.entryId||id(),english:lines('english'),chinese:lines('chinese'),definition:$('definition').value,usage:$('usage').value,examples,tags:lines('entry-tags'),source:$('source').value,status:$('entry-status').value,manual:true});
  const others=project.entries.filter(p=>p.id!==editing),duplicate=others.find(p=>F.comparable(p)===F.comparable(e));if(duplicate)throw Error('已有完全相同的释义，请编辑现有词条。');
  const similar=others.some(p=>p.english.some(t=>e.english.some(s=>F.norm(s)===F.norm(t)))||p.chinese.some(t=>e.chinese.some(s=>F.norm(s)===F.norm(t))));
  if(similar&&!confirm('已有相同英文或中文表达。确认保留为独立释义？如需补充同一含义，请取消并编辑现有词条。'))return;
  const entries=editing?project.entries.map(p=>p.id===editing?e:p):[...project.entries,e];try{await save(entries);}catch(error){if(pending)pending.entryId=e.id;throw error;}selected=e.id;renderDetail();renderList();$('panels').classList.add('show-detail');dirty=false;$('entry-dialog').close();status('词条已保存');
 },'entry-error');};
 for(const dialog of document.querySelectorAll('dialog')){dialog.addEventListener('input',()=>{dirty=true;});dialog.addEventListener('cancel',event=>{if(busy||(dirty&&!confirm('放弃当前未保存的内容？')))event.preventDefault();else dirty=false;});}
 for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>{if(!busy&&(!dirty||confirm('放弃当前未保存的内容？'))){$(button.dataset.close).close();dirty=false;}};
 $('new-project').onclick=()=>openProject();$('edit-project').onclick=()=>openProject(true);$('add').onclick=()=>openEntry();$('search').oninput=renderList;$('clear-tags').onclick=()=>{filters.clear();renderList();};
 $('prompt').onclick=()=>download('research-ai-prompt.txt',F.prompt(project),'text/plain;charset=utf-8');
 $('export').onclick=()=>download('research-dictionary-'+project.id+'.json',JSON.stringify({format:F.FORMAT,research:{id:project.id,name:project.name,description:project.description},entries:project.entries}));
 $('sample').onclick=()=>download('research-example.json',JSON.stringify({...F.sample,research:{name:project.name,description:project.description}},null,2));
 function invalidate(){previewReady=false;documentImport=null;choices={};$('preview').replaceChildren();$('import-error').textContent='';updateControls();}
 $('import').onclick=()=>{invalidate();$('import-text').value='';$('file').value='';dirty=false;$('import-dialog').showModal();};
 $('import-text').oninput=invalidate;
 $('file').onchange=()=>task(async()=>{const f=$('file').files[0];if(!f)return;if(f.size>F.MAX_BYTES)throw Error('文件不能超过 3 MB');$('import-text').value=await f.text();dirty=true;invalidate();},'import-error');
 function showPreview(result){
  const box=$('preview');box.replaceChildren();const s=result.summary;box.append(node('p',`新增 ${s.added} · 合并/替换 ${s.merged} · 跳过 ${s.skipped} · 待处理 ${s.conflicts}`,'preview-summary'));
  for(const row of result.rows){const wrapper=node('details',undefined,'preview-row'),head=node('summary',`${row.incoming.english[0]} / ${row.incoming.chinese[0]} — ${row.reason}`);wrapper.append(head);
   const diff=node('div',undefined,'preview-diff'),before=node('div'),after=node('div');before.append(node('strong','已有释义'),node('pre',row.current?JSON.stringify(row.current,null,2):'无'));after.append(node('strong','导入内容'),node('pre',JSON.stringify(row.incoming,null,2)));diff.append(before,after);wrapper.append(diff);
   if(row.candidateCount>20)wrapper.append(node('p','匹配到 '+row.candidateCount+' 条记录，展示前 20 条；可跳过或新增，亦可在词库中定位后单独编辑。','hint'));
   if(row.candidates?.length){wrapper.open=row.action==='conflict';const select=node('select');select.setAttribute('aria-label','处理 '+row.incoming.english[0]);
    for(const [value,label]of [['','请选择处理方式'],['skip','保留原内容，跳过'],['new','新增独立释义']]){const o=node('option',label);o.value=value;select.append(o);}
    for(const candidate of row.candidates){for(const action of ['merge','replace']){const o=node('option',(action==='merge'?'合并补充（保留原释义）':'替换该释义（包含释义、译法及例句）')+'：'+candidate.english[0]+' / '+candidate.definition.slice(0,45));o.value=action+':'+candidate.id;if(action==='merge'&&!candidate.sameMeaning)o.disabled=true;select.append(o);}}
    const old=choices[String(row.index)];select.value=old?old.action+(old.targetId?':'+old.targetId:''):row.action==='merge'?'merge:'+row.current.id:'';
    select.onchange=()=>{const [action,targetId]=select.value.split(':');if(action)choices[String(row.index)]={action,...(targetId?{targetId}:{})};else delete choices[String(row.index)];previewReady=false;updateControls();$('import-error').textContent='处理方式已变化，请再次点击“解析并预览”。';};wrapper.append(select);
   }box.append(wrapper);
  }previewReady=s.conflicts===0;updateControls();
 }
 $('preview-button').onclick=()=>task(async()=>{documentImport=F.parse($('import-text').value);const result=await api('/api/research/'+project.id+'/import/preview','POST',{...base(),document:documentImport,choices});showPreview(result);$('import-error').textContent='';},'import-error');
 $('commit-import').onclick=()=>task(async()=>{if(!previewReady||!documentImport)throw Error('请重新预览');const p=await api('/api/research/'+project.id+'/import','POST',requestBody('import:'+project.id,{document:documentImport,choices}));pending=null;adopt(p);await refreshProjects();dirty=false;$('import-dialog').close();status('词库已导入，可在其他修改前撤销本次导入。');},'import-error');
 $('undo').onclick=()=>task(async()=>{if(!confirm('撤销上次导入，恢复导入前的词库？'))return;adopt(await api('/api/research/'+project.id+'/undo','POST',requestBody('undo:'+project.id,{})));pending=null;await refreshProjects();status('已撤销上次导入');});
 $('theme').onclick=()=>{const value=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=value;try{localStorage.setItem('garyhub-theme',value);}catch{}};
 window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}});
 document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!document.querySelector('dialog[open]')){e.preventDefault();$('search').focus();}});
 $('divider').onpointerdown=e=>{if(window.innerWidth<=700)return;e.preventDefault();$('divider').setPointerCapture(e.pointerId);$('divider').onpointermove=e=>{const rect=$('panels').getBoundingClientRect();$('panels').style.setProperty('--list-width',Math.max(23,Math.min(43,(e.clientX-rect.left)/rect.width*100))+'%');};};$('divider').onpointerup=$('divider').onpointercancel=()=>{$('divider').onpointermove=null;};
 $('divider').onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const current=$('sidebar').getBoundingClientRect().width/$('panels').getBoundingClientRect().width*100;$('panels').style.setProperty('--list-width',Math.max(23,Math.min(43,current+(e.key==='ArrowRight'?2:-2)))+'%');};
 document.addEventListener('visibilitychange',async()=>{if(document.hidden||!uid||blocked)return;try{const r=await fetch('/api/me',{cache:'no-store'}),v=await r.json();if(!r.ok||(v.user||v).id!==uid)block('登录账号已变化。当前草稿仍在页面中，请重新登录后刷新。');}catch{status('暂时无法核对账号，请检查连接。',true);}});
 (async()=>{try{const r=await fetch('/api/me',{cache:'no-store'}),me=await r.json();if(!r.ok){block('请登录后使用 Research Dictionary。');return;}const user=me.user||me;uid=user.id;$('account').textContent=user.username;csrf=(await(await fetch('/api/csrf',{cache:'no-store'})).json()).token;$('workspace').hidden=false;await refreshProjects();if(projects.length)await load(projects[0].id);else status('新建一个 Research，或准备好词库后开始导入。');}catch(e){status(e.message,true);}})();
})();
