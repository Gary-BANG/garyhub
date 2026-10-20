(()=>{'use strict';
 const $=id=>document.getElementById(id),tr=s=>window.GaryHubI18n?.t(s)||s;
 let user=null,todos=[],revision=0,dirty=false,blocked=false,saving=null,csrf=null,timer,editTarget=null,drag=null,epoch=0,importer=null;
 const open=new Set(),uuid=()=>crypto.randomUUID();
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const message=(text,error=false)=>{$('todo-status').textContent=tr(text);$('todo-status').classList.toggle('error',error);};
 const own=(tag,text,cls)=>{const n=el(tag,text,cls);n.dataset.i18nIgnore='';return n;};
 function button(text,action,label){const b=el('button',text);b.type='button';if(label)b.setAttribute('aria-label',tr(label));b.onclick=action;return b;}
 async function api(path,method='GET',body){
  if(blocked)throw Error(tr('登录或数据状态已变化，请下载草稿后重新加载。'));
  const headers={'X-GaryHub-User':String(user?.id||'')};
  if(method!=='GET'){if(!csrf){const r=await fetch('/api/csrf',{cache:'no-store'});if(!r.ok)throw Error(tr('请先登录'));csrf=(await r.json()).token;}headers['X-CSRF-Token']=csrf;headers['Content-Type']='application/json';}
  const r=await fetch(path,{method,headers,cache:'no-store',body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json();
  if(!r.ok){if([401,403,428].includes(r.status)){block();}if(r.status===409)blocked=true;throw Object.assign(Error(tr(d.message||'请求失败，请重试。')),{status:r.status,sourceMessage:d.message,code:d.code,path:d.path,details:d.details});}return d;
 }
 function block(){blocked=true;epoch++;importer?.clear();$('todo-app').hidden=true;$('todo-dialog').close();$('todo-edit-text').value='';$('todo-title').value='';$('todo-list').replaceChildren();message('登录账号已变化，请重新登录。',true);}
 function mark(){dirty=true;message('正在等待保存…');clearTimeout(timer);timer=setTimeout(()=>save().catch(e=>message(e.message,true)),500);}
 async function save(){
  clearTimeout(timer);if(saving){await saving;return dirty?save():true;}if(!dirty)return true;if(blocked)throw Error(tr('登录或数据状态已变化，请下载草稿后重新加载。'));
  const snapshot=JSON.stringify(todos),payload={accountId:user.id,revision,requestId:uuid(),todos:JSON.parse(snapshot)};dirty=false;message('正在保存…');
  saving=(async()=>{try{let result;try{result=await api('/api/todos','PUT',payload);}catch(e){if(blocked)throw e;result=await api('/api/todos','PUT',payload);}revision=result.revision;message('已保存到服务器');}catch(e){dirty=true;throw e;}})();
  try{await saving;}finally{saving=null;}if(dirty)return save();return true;
 }
 function check(done,label,action){const n=el('input');n.type='checkbox';n.checked=done;n.className='todo-check';n.setAttribute('aria-label',tr(label));n.onchange=()=>action(n.checked);return n;}
 function edit(todo,point){editTarget={todo,point};$('todo-edit-heading').textContent=tr(point?'编辑子要点':'编辑待办');$('todo-edit-text').maxLength=point?1000:160;$('todo-edit-text').value=point?point.text:todo.title;$('todo-dialog').showModal();$('todo-edit-text').focus();}
 function reorder(id,delta){const i=todos.findIndex(t=>t.id===id),j=i+delta;if(j<0||j>=todos.length)return;[todos[i],todos[j]]=[todos[j],todos[i]];mark();render();document.querySelector(`[data-todo-id="${id}"] .todo-handle`)?.focus();$('todo-live').textContent=tr('顺序已调整');}
 function render(){
  const list=$('todo-list'),drafts=new Map([...list.querySelectorAll('[data-todo-id]')].map(n=>[n.dataset.todoId,n.querySelector('.point-add textarea')?.value||'']));list.replaceChildren();$('todo-empty').hidden=!!todos.length;$('todo-count').textContent=todos.filter(t=>t.done).length+' / '+todos.length;
  for(const todo of todos){
   const card=el('article',undefined,'todo-card'+(todo.done?' done':''));card.dataset.todoId=todo.id;
   const row=el('div',undefined,'todo-heading'),handle=button('⠿',()=>{},'拖动排序；也可使用上下方向键');handle.className='todo-handle';handle.onkeydown=e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();reorder(todo.id,e.key==='ArrowUp'?-1:1);}};
   handle.onpointerdown=e=>{if(e.button!==0||blocked||drag)return;drag={id:todo.id,pointer:e.pointerId,handle,startY:e.clientY,moved:false};handle.setPointerCapture(e.pointerId);};
   handle.onpointermove=e=>{if(!drag||drag.pointer!==e.pointerId)return;if(Math.abs(e.clientY-drag.startY)>6)drag.moved=true;if(!drag.moved)return;e.preventDefault();card.classList.add('dragging');const over=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-todo-id]');if(over&&over!==card&&list.contains(over)){const rect=over.getBoundingClientRect();const reference=e.clientY<rect.top+rect.height/2?over:over.nextSibling;if(reference!==card&&card.nextSibling!==reference){list.insertBefore(card,reference);handle.setPointerCapture(e.pointerId);}}if(e.clientY<90)scrollBy(0,-12);else if(e.clientY>innerHeight-80)scrollBy(0,12);};
   handle.onpointerup=e=>{if(!drag||drag.pointer!==e.pointerId)return;const changed=drag.moved;drag=null;card.classList.remove('dragging');if(changed){const order=[...list.children].map(n=>n.dataset.todoId),byId=new Map(todos.map(t=>[t.id,t]));todos=order.map(id=>byId.get(id));mark();$('todo-live').textContent=tr('顺序已调整');}};
   handle.onpointercancel=()=>{drag=null;render();};
   row.append(handle,check(todo.done,'标记待办完成',done=>{todo.done=done;mark();render();}),own('span',todo.title,'todo-name'),el('span',todo.points.filter(p=>p.done).length+'/'+todo.points.length,'todo-meta'));
   const expand=button(open.has(todo.id)?'▾':'▸',()=>{if(open.has(todo.id))open.delete(todo.id);else open.add(todo.id);render();},open.has(todo.id)?'收起子要点':'展开子要点');expand.className='todo-expand';expand.setAttribute('aria-expanded',String(open.has(todo.id)));expand.setAttribute('aria-controls','points-'+todo.id);row.append(expand);
   const actions=el('div',undefined,'todo-actions');actions.append(button('↑',()=>reorder(todo.id,-1),'上移待办'),button('↓',()=>reorder(todo.id,1),'下移待办'),button(tr('编辑'),()=>edit(todo)),button(tr('删除'),()=>{if(confirm(tr('确定删除这条待办及其全部子要点？'))){todos=todos.filter(t=>t.id!==todo.id);open.delete(todo.id);mark();render();}}));row.append(actions);card.append(row);
   const points=el('div',undefined,'todo-points');points.id='points-'+todo.id;points.hidden=!open.has(todo.id);
   for(const point of todo.points){const pr=el('div',undefined,'todo-point'+(point.done?' done':''));pr.append(check(point.done,'标记子要点完成',done=>{point.done=done;mark();render();}),own('span',point.text,'point-text'));const pa=el('div',undefined,'todo-actions');pa.append(button(tr('编辑'),()=>edit(todo,point)),button(tr('删除'),()=>{if(confirm(tr('确定删除这个子要点？'))){todo.points=todo.points.filter(p=>p.id!==point.id);mark();render();}}));pr.append(pa);points.append(pr);}
   const form=el('form',undefined,'point-add'),input=el('textarea');input.rows=1;input.value=drafts.get(todo.id)||'';input.maxLength=1000;input.required=true;input.placeholder=tr('补充一个子要点…');input.setAttribute('aria-label',tr('新的子要点'));const add=el('button',tr('＋ 添加子要点'),'secondary compact-button');add.type='submit';form.append(input,add);form.onsubmit=e=>{e.preventDefault();if(!input.value.trim())return;if(todo.points.length>=100)return message('每条待办最多 100 个子要点',true);todo.points.push({id:uuid(),text:input.value.trim(),done:false});input.value='';mark();render();};points.append(form);card.append(points);list.append(card);
  }
 }
 $('todo-add').onsubmit=e=>{e.preventDefault();const title=$('todo-title').value.trim();if(!title||blocked)return;if(todos.length>=300)return message('最多保存 300 条待办',true);todos.push({id:uuid(),title,done:false,points:[]});$('todo-title').value='';mark();render();};
 $('todo-edit').onsubmit=e=>{e.preventDefault();const value=$('todo-edit-text').value.trim();if(!value||!editTarget||blocked)return;if(editTarget.point)editTarget.point.text=value;else editTarget.todo.title=value;$('todo-dialog').close();$('todo-edit-text').value='';editTarget=null;mark();render();};$('todo-edit-cancel').onclick=()=>{$('todo-dialog').close();$('todo-edit-text').value='';editTarget=null;};
 $('todo-download').onclick=()=>{const blob=new Blob([JSON.stringify({format:'garyhub-todos-v1',todos},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='garyhub-todos-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
 async function load(){const ticket=++epoch;const r=await fetch('/api/me',{cache:'no-store'});if(!r.ok){location.replace('/login/?next=%2Ftodos%2F');return;}const d=await r.json();if(d.user.mustChangePassword){location.replace('/change-password/');return;}if(user&&user.id!==d.user.id)importer?.clear();user=d.user;blocked=false;csrf=null;const data=await api('/api/todos');if(ticket!==epoch)return;todos=data.todos;revision=data.revision;dirty=false;open.clear();importer?.invalidate();$('todo-user').textContent=user.username;$('todo-app').hidden=false;render();message('已保存到服务器');}
 $('todo-reload').onclick=async()=>{if(dirty&&!confirm(tr('重新加载会放弃未保存的草稿，是否继续？')))return;try{if(saving)await saving;await load();}catch(e){message(e.message,true);}};
 $('todo-logout').onclick=async()=>{try{await save();await api('/api/logout','POST',{});block();location.replace('/login/?next=%2Ftodos%2F');}catch(e){message(e.message,true);}};
 let checking=false;async function identity(){if(checking||!user||document.hidden)return;checking=true;try{const r=await fetch('/api/me',{cache:'no-store'}),d=await r.json();if(!r.ok||d.user?.id!==user.id)block();}catch{}finally{checking=false;}}
 importer=window.GaryHubTodoImporter.create({api,save,message,getState:()=>({user,revision,epoch,blocked,count:todos.length}),applyResult(result){todos=result.todos;revision=result.revision;dirty=false;render();}});
 addEventListener('focus',identity);document.addEventListener('visibilitychange',()=>{if(!document.hidden)identity();});setInterval(identity,10000);addEventListener('beforeunload',e=>{if(dirty||saving||importer.hasDraft()||$('todo-title').value||$('todo-edit-text').value||[...document.querySelectorAll('.point-add textarea')].some(t=>t.value)){e.preventDefault();e.returnValue='';}});
 document.addEventListener('garyhub:language',()=>{render();importer.languageChanged();if(!dirty&&!saving&&!blocked)message('已保存到服务器');});load().catch(e=>message(e.message,true));
})();
