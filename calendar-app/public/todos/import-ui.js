/* Import and prompt dialogs; list state remains owned by todos.js. */
(()=>{'use strict';
 window.GaryHubTodoImporter={create(options){
  const $=id=>document.getElementById(id),F=window.GaryHubTodoImport;
  const tr=s=>window.GaryHubI18n?.t(s)||s,language=()=>window.GaryHubI18n?.language||'zh';
  const dialog=$('todo-import-dialog'),promptDialog=$('todo-prompt-dialog'),input=$('todo-import-input');
  let generation=0,preview=null,pending=null,busy=false,lastStatus=null,promptStatus='';
  const node=(tag,text,cls,personal=false)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;if(personal)n.dataset.i18nIgnore='';return n;};
  function status(text,error=false,detail=null){lastStatus={text,error,detail};$('todo-import-message').textContent=detail?F.describeError(detail,language()):tr(text);$('todo-import-message').classList.toggle('error',error);}
  function setBusy(value){
   busy=value;dialog.setAttribute('aria-busy',String(value));
   for(const id of ['todo-import-input','todo-import-file','todo-import-file-open','todo-import-skip','todo-import-check','todo-import-close','todo-import-cancel'])$(id).disabled=value;
   $('todo-import-confirm').disabled=value||!preview||!preview.summary.addedCount||options.getState().blocked;
  }
  function invalidate(){generation++;preview=null;pending=null;$('todo-import-preview').hidden=true;$('todo-import-items').replaceChildren();$('todo-import-confirm').disabled=true;status('');}
  function clear(){
   invalidate();input.value='';$('todo-import-file').value='';$('todo-import-file-status').textContent='';$('todo-prompt-text').value='';promptStatus='';$('todo-prompt-message').textContent='';
   dialog.close();promptDialog.close();setBusy(false);
  }
  function valid(ticket,epoch){return ticket===generation&&epoch===options.getState().epoch;}
  function renderPreview(){
   if(!preview)return;
   const summary=$('todo-import-summary');summary.replaceChildren();
   for(const [label,key]of [['读取待办','inputCount'],['将新增','addedCount'],['新增子要点','pointCount'],['跳过重复','skippedCount']]){
    const item=node('span');item.append(node('span',tr(label)),node('strong',String(preview.summary[key])));summary.append(item);
   }
   $('todo-import-warning').textContent=preview.summary.sameTitleCount?tr('存在同名但内容不同的待办，将作为新待办追加；请检查下方预览。'):'';
   const items=$('todo-import-items');items.replaceChildren();
   for(const entry of preview.entries){
    const card=node('details',undefined,'todo-import-item'+(entry.status==='skip'?' skipped':''));
    const heading=node('summary');heading.append(node('span',entry.todo.title,'todo-import-title',true),node('span',tr(entry.status==='skip'?'跳过重复':'将新增'),'todo-import-badge'));
    card.append(heading,node('p',tr(entry.todo.done?'主待办已完成':'主待办未完成'),'small'));
    if(entry.sameTitle)card.append(node('p',tr('同名待办的内容不同，保留为独立待办。'),'small'));
    if(entry.todo.points.length){
     const list=node('ul',undefined,'todo-import-points');list.dataset.i18nIgnore='';
     for(const p of entry.todo.points)list.append(node('li',(p.done?'☑ ':'☐ ')+p.text,undefined,true));
     card.append(list);
    }else card.append(node('p',tr('没有子要点'),'small'));
    items.append(card);
   }
   $('todo-import-preview').hidden=false;
  }
  function showError(error){
   status(error.sourceMessage||error.message,true,error.code?error:null);
   if(options.getState().blocked)options.message(error.message,true);
  }
  $('todo-import-open').onclick=()=>{
   if(options.getState().blocked)return options.message(tr('登录或数据状态已变化，请下载草稿后重新加载。'),true);
   invalidate();setBusy(false);dialog.showModal();input.focus();
  };
  for(const id of ['todo-import-close','todo-import-cancel'])$(id).onclick=()=>{if(!busy)dialog.close();};
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  input.addEventListener('input',invalidate);$('todo-import-skip').addEventListener('change',invalidate);
  $('todo-import-file-open').onclick=()=>$('todo-import-file').click();
  $('todo-import-file').addEventListener('change',async()=>{
   const file=$('todo-import-file').files[0];if(!file)return;
   invalidate();const ticket=generation,epoch=options.getState().epoch;
   if(file.size>F.limits.inputBytes){showError(new F.TodoImportError('inputSize'));$('todo-import-file').value='';return;}
   setBusy(true);
   try{
    const raw=await file.text();if(!valid(ticket,epoch))return;
    input.value=raw;$('todo-import-file-status').textContent=file.name;$('todo-import-file-status').dataset.i18nIgnore='';
    status('文件已读取，请解析并预览。');
   }catch{if(valid(ticket,epoch))status('无法读取文件，请重新选择或粘贴内容。',true);}
   finally{if(valid(ticket,epoch))setBusy(false);}
  });
  $('todo-import-check').onclick=async()=>{
   if(busy)return;invalidate();const ticket=generation,epoch=options.getState().epoch;
   setBusy(true);status('正在解析并核对清单…');
   try{
    const document=F.parse(input.value);
    await options.save();if(!valid(ticket,epoch))return;
    const state=options.getState();
    const payload={accountId:state.user.id,revision:state.revision,document,skipDuplicates:$('todo-import-skip').checked};
    const result=await options.api('/api/todos/import/preview','POST',payload);if(!valid(ticket,epoch))return;
    preview={...result,payload};renderPreview();
    status(result.summary.addedCount?'预览已就绪，确认后追加到清单末尾。':'全部内容已存在，无需导入。');
   }catch(e){if(valid(ticket,epoch))showError(e);}
   finally{if(valid(ticket,epoch))setBusy(false);}
  };
  $('todo-import-confirm').onclick=async()=>{
   if(busy||!preview||!preview.summary.addedCount)return;
   const state=options.getState();
   if(state.blocked||state.revision!==preview.payload.revision){status('清单状态已变化，请重新加载后再预览。',true);$('todo-import-confirm').disabled=true;return;}
   const ticket=generation,epoch=state.epoch;
   pending=pending||{...preview.payload,requestId:crypto.randomUUID()};
   setBusy(true);status('正在导入并保存…');
   try{
    let result;
    try{result=await options.api('/api/todos/import','POST',pending);}catch(e){
     if(!valid(ticket,epoch)||options.getState().blocked||e.status&&e.status<500)throw e;
     // A lost response is retried with exactly the same request ID and revision.
     result=await options.api('/api/todos/import','POST',pending);
    }
    if(!valid(ticket,epoch))return;
    options.applyResult(result);const s=result.import;
    clear();options.message(language()==='en'?`Import complete: ${s.addedCount} Todos and ${s.pointCount} points added; ${s.skippedCount} duplicates skipped.`:`导入完成：新增 ${s.addedCount} 条待办、${s.pointCount} 个子要点，跳过 ${s.skippedCount} 条重复待办。`);
   }catch(e){if(valid(ticket,epoch))showError(e);}
   finally{if(valid(ticket,epoch))setBusy(false);}
  };
  function updatePrompt(){const state=options.getState();$('todo-prompt-text').value=F.prompt(language(),Math.max(0,state.limits.todos-state.count),state.limits);}
  $('todo-prompt-open').onclick=()=>{
   if(options.getState().blocked)return;
   updatePrompt();promptStatus='';$('todo-prompt-message').textContent='';promptDialog.showModal();$('todo-prompt-copy').focus();
  };
  for(const id of ['todo-prompt-close','todo-prompt-done'])$(id).onclick=()=>promptDialog.close();
  $('todo-prompt-copy').onclick=async()=>{
   const field=$('todo-prompt-text'),epoch=options.getState().epoch;
   try{await navigator.clipboard.writeText(field.value);if(epoch===options.getState().epoch){promptStatus='提示词已复制。';$('todo-prompt-message').textContent=tr(promptStatus);}}
   catch{if(epoch!==options.getState().epoch)return;field.focus();field.select();promptStatus='已选中提示词，请按 Ctrl+C 或使用系统复制。';$('todo-prompt-message').textContent=tr(promptStatus);}
  };
  return {clear,invalidate,hasDraft:()=>!!input.value||busy,languageChanged(){if(preview)renderPreview();if(lastStatus)status(lastStatus.text,lastStatus.error,lastStatus.detail);if(promptDialog.open)updatePrompt();if(promptStatus)$('todo-prompt-message').textContent=tr(promptStatus);}};
 }};
})();
