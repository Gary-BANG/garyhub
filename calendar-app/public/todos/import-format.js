/* Shared by the import dialog and the server. Imported identifiers are never reused. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.GaryHubTodoImport=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const FORMAT='garyhub-todos-v1';
 const limits=Object.freeze({todos:300,points:100,title:160,point:1000,bytes:1800000,inputBytes:2000000});
 const messages={
  json:['JSON 格式不正确，请检查引号、逗号和括号。','Invalid JSON. Check quotes, commas and brackets.'],
  empty:['请粘贴 JSON 或选择一个 JSON 文件。','Paste JSON or select a JSON file.'],
  inputSize:['导入内容超过 2 MB，请分批整理后导入。','The import exceeds 2 MB. Split it into smaller batches.'],
  format:['不支持此格式，请使用 garyhub-todos-v1。','Unsupported format. Use garyhub-todos-v1.'],
  document:['需要包含 todos 的 JSON 对象，或待办数组。','Use a JSON object containing todos, or an array of Todos.'],
  field:['存在不支持的字段，请按模板整理，避免遗漏内容。','Unsupported field. Follow the template so no content is silently lost.'],
  list:['todos 必须是数组，包含 1 至 300 条待办。','todos must be an array containing 1 to 300 Todos.'],
  todo:['每条待办必须是一个 JSON 对象。','Each Todo must be a JSON object.'],
  title:['标题必须是非空文本，最多 160 字符。','Titles must be nonempty text, up to 160 characters.'],
  points:['points 必须是数组，每条待办最多 100 个子要点。','points must be an array with up to 100 points per Todo.'],
  point:['每个子要点必须是一个 JSON 对象。','Each point must be a JSON object.'],
  text:['子要点必须是非空文本，最多 1,000 字符。','Points must be nonempty text, up to 1,000 characters.'],
  done:['done 必须为 true 或 false，也可以省略。','done must be true or false, or omitted.'],
  option:['跳过重复内容选项无效。','Invalid skip-duplicates option.'],
  capacity:['追加后将超过每账号 300 条待办的上限，请减少本批数量。','Appending this batch would exceed 300 Todos. Reduce the batch size.'],
  size:['追加后清单将超过 1.8 MB，请减少本批内容。','The combined list would exceed 1.8 MB. Reduce the batch size.']
 };
 class TodoImportError extends Error {
  constructor(code,path='',details={}){
   super((path?path+'：':'')+messages[code][0]);
   this.name='TodoImportError';this.status=400;this.code=code;this.path=path;this.details=details;
  }
 }
 const fail=(code,path,details)=>{throw new TodoImportError(code,path,details);};
 const bytes=value=>new TextEncoder().encode(value).byteLength;
 const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 function keys(value,allowed,path){
  for(const key of Object.keys(value))if(!allowed.includes(key))fail('field',path?path+'.'+key:key);
 }
 function text(value,max,code,path){
  if(typeof value!=='string'||!value.trim()||value.length>max)fail(code,path);
  return value.trim();
 }
 function done(value,path){
  if(value===undefined)return false;
  if(typeof value!=='boolean')fail('done',path);
  return value;
 }
 function parse(input){
  let value=input;
  if(typeof value==='string'){
   if(bytes(value)>limits.inputBytes)fail('inputSize');
   let raw=value.replace(/^\uFEFF/,'').trim();
   if(!raw)fail('empty');
   const fence=raw.match(/^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i);
   if(fence)raw=fence[1];
   try{value=JSON.parse(raw);}catch(e){
    const match=String(e.message).match(/position (\d+)/i),details={};
    if(match){const before=raw.slice(0,Number(match[1]));details.line=before.split('\n').length;details.column=before.length-before.lastIndexOf('\n');}
    fail('json','',details);
   }
  }
  let list;
  if(Array.isArray(value))list=value;
  else if(object(value)){
   keys(value,['format','todos'],'');
   if(value.format!==undefined&&value.format!==FORMAT)fail('format','format');
   list=value.todos;
  }else fail('document');
  if(!Array.isArray(list)||list.length<1||list.length>limits.todos)fail('list','todos');
  const todos=list.map((todo,i)=>{
   const path='todos['+i+']';
   if(!object(todo))fail('todo',path);
   keys(todo,['id','title','done','points'],path);
   const title=text(todo.title,limits.title,'title',path+'.title');
   const points=todo.points===undefined?[]:todo.points;
   if(!Array.isArray(points)||points.length>limits.points)fail('points',path+'.points');
   return {title,done:done(todo.done,path+'.done'),points:points.map((point,j)=>{
    const p=path+'.points['+j+']';
    if(!object(point))fail('point',p);
    keys(point,['id','text','done'],p);
    return {text:text(point.text,limits.point,'text',p+'.text'),done:done(point.done,p+'.done')};
   })};
  });
  const result={format:FORMAT,todos};
  if(bytes(JSON.stringify(result))>limits.inputBytes)fail('inputSize');
  return result;
 }
 const canonical=todo=>JSON.stringify({title:todo.title,done:todo.done,points:todo.points.map(p=>({text:p.text,done:p.done}))});
 function withIds(todo,id){return {id:id(),title:todo.title,done:todo.done,points:todo.points.map(p=>({id:id(),text:p.text,done:p.done}))};}
 function plan(existing,document,skipDuplicates=true){
  if(typeof skipDuplicates!=='boolean')fail('option');
  const seen=new Set(existing.map(canonical)),titles=new Set(existing.map(t=>t.title));
  const entries=[],additions=[];let skippedCount=0,sameTitleCount=0,pointCount=0;
  for(const [index,todo]of document.todos.entries()){
   const signature=canonical(todo),duplicate=seen.has(signature),skip=skipDuplicates&&duplicate;
   const sameTitle=!duplicate&&titles.has(todo.title);
   entries.push({index,todo,status:skip?'skip':'add',sameTitle});
   if(skip){skippedCount++;continue;}
   if(sameTitle)sameTitleCount++;
   seen.add(signature);titles.add(todo.title);additions.push(todo);pointCount+=todo.points.length;
  }
  if(existing.length+additions.length>limits.todos)fail('capacity','todos',{existing:existing.length,added:additions.length});
  // UUIDs have a fixed length; this has exactly the final persisted byte size.
  const combined=existing.concat(additions.map(t=>withIds(t,()=> '00000000-0000-0000-0000-000000000000')));
  if(bytes(JSON.stringify(combined))>limits.bytes)fail('size','todos');
  const summary={inputCount:document.todos.length,addedCount:additions.length,pointCount,skippedCount,sameTitleCount,totalCount:combined.length};
  return {summary,entries,additions};
 }
 function describeError(error,language='zh'){
  const en=language==='en',m=messages[error.code];
  if(!m)return error.message||String(error);
  let result=(error.path?error.path+(en?': ':'：'):'')+m[en?1:0];
  if(error.details?.line)result+=en?' (line '+error.details.line+', column '+error.details.column+')':'（第 '+error.details.line+' 行，第 '+error.details.column+' 列）';
  return result;
 }
 function prompt(language='zh',remaining=limits.todos,accountLimits=limits){
  const sample={format:FORMAT,todos:[{title:language==='en'?'Prepare a project update':'准备项目更新',done:false,points:[{text:language==='en'?'Review the requirements and list the changes to make.':'核对需求，列出需要完成的具体改动。',done:false}]}]};
  const example=JSON.stringify(sample,null,2),capacity=Math.max(0,Math.min(limits.todos,remaining));
  if(language==='en')return `Organize the material I provide into Todos that can be imported into GaryHub.

Rules:
1. Group related work into a short main Todo title and actionable points. Preserve important details, ordering, names, numbers and constraints. Do not invent requirements, dates or completion.
2. Output one valid JSON object using the example below. Use double quotes, no comments, no trailing commas, no Markdown code fences and no explanation around the JSON.
3. Use format "${FORMAT}" and a todos array. Each Todo uses title, done and points; each point uses text and done. Do not add fields such as id, accountId, revision, priority or dueDate. GaryHub creates identifiers automatically.
4. There can be at most ${accountLimits.todos} Todos in total and ${accountLimits.points} points per Todo. Titles must be nonempty and at most 160 characters; point text must be nonempty and at most 1,000 characters. Long material should be split into points without silently discarding details. The combined saved list is limited to 1.8 MB.
5. This account currently has room for ${capacity} new Todos. If the material cannot fit, ask me how to prioritize or divide it before producing the final JSON. Do not silently omit tasks.
6. Default done to false; only mark an item true if my material explicitly says it is complete. Main Todos and points have independent completion states. Use an empty points array when no points are needed. Preserve the material's original language.
7. Ask me about essential ambiguities before the final output. Once ready, output only the JSON.

Example (replace the example content with my actual material):
${example}

Material to organize:
[Paste my plan, notes, conversation or long text here]`;
  return `请把我提供的材料整理成能够导入 GaryHub 的待办清单。

规则：
1. 将相关工作归为简短的主待办标题，并拆成可执行的子要点。保留重要细节、顺序、名称、数字和限制，不擅自编造要求、日期或完成情况。
2. 按下方示例输出一个合法 JSON 对象。使用双引号，不要注释、尾随逗号、Markdown 代码块或 JSON 前后的解释。
3. format 固定为 "${FORMAT}"，todos 为数组。每条待办使用 title、done、points；每个子要点使用 text、done。不要增加 id、accountId、revision、priority、dueDate 等字段，编号由 GaryHub 自动生成。
4. 每个账号累计最多 ${accountLimits.todos} 条待办，每条最多 ${accountLimits.points} 个子要点。标题为非空文本，最多 160 字符；子要点为非空文本，每个最多 1,000 字符。长材料应拆分为多个子要点，不要静默丢弃细节。合并后的整份清单最多 1.8 MB。
5. 当前账号还可新增 ${capacity} 条待办。如果材料无法容纳，请在输出最终 JSON 前询问我如何取舍或分批，不要擅自删减任务。
6. done 默认 false，只有材料明确表示已完成时才填写 true。主待办与子要点独立标记；没有子要点时使用空数组。保留材料原有语言。
7. 关键内容不明确时先向我澄清；准备好以后只输出 JSON。

格式示例（请替换为我实际提供的内容）：
${example}

待整理材料：
【在这里粘贴计划、笔记、聊天记录或长文本】`;
 }
 return {FORMAT,limits,TodoImportError,parse,plan,withIds,canonical,describeError,prompt};
});
