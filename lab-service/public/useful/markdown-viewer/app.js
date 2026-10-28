import {mountSections} from './sections.mjs';
import {studySelection, readStudyDocument} from './study-document.mjs';
import {readZip, relativeImagePath, decodeMarkdown, LIMITS} from './zip-reader.mjs';

(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const editor = $('editor'), preview = $('preview'), fileInput = $('fileInput');
  const status = $('status'), count = $('count'), fileInfo = $('fileInfo');
  const overlay = $('overlay'), drop = $('drop');
  let dragDepth = 0, formulas = [], archive=null, currentPath='', generation=0, missingImages=0;
  const urls=new Map(), drafts=new Map();
  let sections=null, selection=null, checking=false;
  function updateExpand(){ToolUI.text('expandBtn',sections?.allOpen()?'全部收起':'全部展开');$('expandBtn').disabled=!sections?.count;}
  $('expandBtn').addEventListener('click',()=>sections?.setAll(!sections.allOpen()));
  $('outlineBtn').addEventListener('click',()=>{const open=$('workspace').classList.toggle('outline-open');$('outlinePanel').hidden=!open;$('outlineBtn').setAttribute('aria-expanded',String(open));updateOutlineLabel();});
  function updateOutlineLabel(){const label=ToolUI.string($('workspace').classList.contains('outline-open')?'收起目录':'展开目录');$('outlineBtn').title=label;$('outlineBtn').setAttribute('aria-label',label);}
  function resetSections(){sections=null;$('outlineItems').replaceChildren();$('outlineEmpty').hidden=false;updateExpand();}

  const message=(source, values={})=>{delete status.dataset.errorSource;ToolUI.text(status,source,values);};
  function releaseImages(){for(const url of urls.values()) URL.revokeObjectURL(url);urls.clear();}
  function localImage(reference){
    if(!archive) return null;
    const path=relativeImagePath(reference,currentPath), image=archive.images.get(path);
    if(!image) return null;
    if(!urls.has(path)) urls.set(path,URL.createObjectURL(new Blob([image.bytes],{type:image.type})));
    return urls.get(path);
  }
  addEventListener('pagehide',releaseImages);
  addEventListener('pageshow',event=>{if(event.persisted)render();});

  const allowed = new Set(['P','BR','H1','H2','H3','H4','H5','H6','STRONG','B','EM','I','DEL','S','UL','OL','LI','BLOCKQUOTE','PRE','CODE','HR','A','IMG','TABLE','THEAD','TBODY','TR','TH','TD','INPUT','SUP','SUB','DETAILS','SUMMARY','DIV','SPAN']);
  const discard = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','FORM','SVG','MATH','META','LINK','BASE','TEMPLATE','VIDEO','AUDIO']);
  function safeURL(value, image = false) {
    const raw = (value || '').trim();
    if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) return null;
    if (image) return /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(raw) ? raw : localImage(raw);
    try {
      const url = new URL(raw, location.href);
      if (url.protocol === 'https:' || url.protocol === 'http:') return raw;
      if (!image && url.protocol === 'mailto:') return raw;
      if (url.protocol === 'file:' && !/^[a-z][a-z0-9+.-]*:/i.test(raw) && !raw.startsWith('//')) return raw;
    } catch (_) {}
    return null;
  }
  // Rebuild the parsed tree from a strict element and attribute allowlist.
  function sanitize(html) {
    const doc = document, template = document.createElement('template');
    template.innerHTML = html;
    const root = template.content;
    function walk(parent) {
      for (const node of Array.from(parent.childNodes)) {
        if (node.nodeType === Node.COMMENT_NODE) { node.remove(); continue; }
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const tag = node.tagName;
        if (discard.has(tag)) { node.remove(); continue; }
        const href = tag === 'A' ? safeURL(node.getAttribute('href')) : null;
        const src = tag === 'IMG' ? safeURL(node.getAttribute('src'), true) : null;
        if(tag==='IMG' && !src) missingImages++;
        const alt = tag === 'IMG' ? (node.getAttribute('alt') || '') : '';
        const title = node.getAttribute('title');
        const cls = tag === 'CODE' ? (node.getAttribute('class') || '') : '';
        const start = tag === 'OL' ? node.getAttribute('start') : null;
        const checked = tag === 'INPUT' && node.hasAttribute('checked');
        const type = tag === 'INPUT' ? node.getAttribute('type') : null;
        const colspan = tag === 'TD' || tag === 'TH' ? node.getAttribute('colspan') : null;
        const rowspan = tag === 'TD' || tag === 'TH' ? node.getAttribute('rowspan') : null;
        const mathId = (tag === 'DIV' || tag === 'SPAN') ? node.getAttribute('data-math-id') : null;
        walk(node);
        if (!allowed.has(tag) || (tag === 'INPUT' && type !== 'checkbox')) { node.replaceWith(...Array.from(node.childNodes)); continue; }
        for (const attr of Array.from(node.attributes)) node.removeAttribute(attr.name);
        if (tag === 'A' && href) { node.setAttribute('href',href); node.setAttribute('target','_blank'); node.setAttribute('rel','noopener noreferrer'); }
        if (tag === 'IMG') { if (src) node.setAttribute('src',src); node.setAttribute('alt',alt); node.setAttribute('loading','lazy'); }
        if (title && (tag === 'A' || tag === 'IMG')) node.setAttribute('title',title);
        if (tag === 'CODE' && /^language-[\w+-]{1,40}$/.test(cls)) node.className = cls;
        if (tag === 'OL' && /^\d{1,6}$/.test(start || '')) node.setAttribute('start',start);
        if (tag === 'INPUT') { node.setAttribute('type','checkbox'); node.disabled = true; if (checked) node.checked = true; }
        if (colspan && /^\d{1,2}$/.test(colspan)) node.setAttribute('colspan',colspan);
        if (rowspan && /^\d{1,2}$/.test(rowspan)) node.setAttribute('rowspan',rowspan);
        if (mathId && /^\d{1,6}$/.test(mathId)) node.setAttribute('data-math-id',mathId);
      }
    }
    walk(root);
    for (const table of Array.from(root.querySelectorAll('table'))) { const wrap = doc.createElement('div'); wrap.className = 'tablewrap'; table.replaceWith(wrap); wrap.append(table); }
    return template.innerHTML;
  }
  // Recognize Obsidian-style delimiters before Markdown interprets TeX backslashes.
  marked.use({extensions:[
    {name:'mathBlock',level:'block',start:s=>{const m=/(?:^|\n)[ \t]{0,3}(?:\$\$|\\\[)/.exec(s);return m?m.index+(m[0][0]==='\n'?1:0):-1;},tokenizer(s){
      let m=/^ {0,3}\$\$[ \t]*([\s\S]*?)[ \t]*\$\$[ \t]*(?:\n|$)/.exec(s);
      if(!m)m=/^ {0,3}\\\[[ \t]*([\s\S]*?)[ \t]*\\\][ \t]*(?:\n|$)/.exec(s);
      if(m && m[1].trim())return{type:'mathBlock',raw:m[0],text:m[1].trim()};
    },renderer(t){const i=formulas.push(t.text)-1;return '<div data-math-id="'+i+'"></div>\n';}},
    {name:'mathInline',level:'inline',start:s=>{const a=s.indexOf('$'),b=s.indexOf('\\(');return a<0?b:b<0?a:Math.min(a,b);},tokenizer(s){
      let m=/^\$(?!\$|\s)((?:\\.|[^$\\\n])+?)(?<!\s)\$(?!\$)/.exec(s);
      if(!m)m=/^\\\(([^\n]+?)\\\)/.exec(s);
      if(m)return{type:'mathInline',raw:m[0],text:m[1]};
    },renderer(t){const i=formulas.push(t.text)-1;return '<span data-math-id="'+i+'"></span>';}}
  ]});
  function renderMath(){
    for(const holder of preview.querySelectorAll('[data-math-id]')){
      const tex=formulas[Number(holder.getAttribute('data-math-id'))];
      if(tex===undefined)continue;
      const display=holder.tagName==='DIV';
      try{
        // KaTeX emits native MathML. No external CSS, fonts or network requests.
        holder.innerHTML=katex.renderToString(tex,{displayMode:display,output:'mathml',throwOnError:true,trust:false,strict:'ignore'});
        holder.className=display?'math-block':'math-inline';
      }catch(error){
        holder.textContent=(display?'$$':'$')+tex+(display?'$$':'$');
        holder.title='公式解析失败：'+error.message;
        holder.className='math-error';
      }
    }
  }
  function render() {
    const source=editor.value, previous=sections?.snapshot();
    ToolUI.text(count,'{count} 字符',{count:source.length.toLocaleString(GaryHubI18n.intlLocale)});
    if(new TextEncoder().encode(source).length>LIMITS.markdown){message('文件过大，Markdown 最多支持 4 MB');status.classList.add('error');return;}
    releaseImages();missingImages=0;
    if(!source.trim()) {resetSections();preview.replaceChildren();const p=document.createElement('p');p.className='empty';preview.append(p);ToolUI.text(p,'预览会显示在这里');message('预览已更新');return;}
    try {
      formulas=[];preview.innerHTML=sanitize(marked.parse(source,{gfm:true,breaks:false,async:false}));renderMath();
      sections=mountSections(preview,$('outlineItems'),previous,updateExpand);updateExpand();
      $('outlineEmpty').hidden=sections.count>0;
      message(missingImages?'预览已更新 · {count} 张图片缺失或不支持':'预览已更新',{count:missingImages});status.classList.remove('error');
    } catch(error) {resetSections();preview.textContent=ToolUI.string('渲染失败：{error}',{error:error.message});message('渲染失败：{error}',{error:error.message});status.classList.add('error');}
  }
  $('sourceBtn').addEventListener('click',()=>{
    const open=$('workspace').classList.toggle('source-open');ToolUI.text('sourceBtn',open?'收起源码':'展开源码');$('sourceBtn').setAttribute('aria-expanded',String(open));
  });
  function info(name,size,path){ToolUI.text(fileInfo,path?'{name} · {path}':'{name} · {size} KB',{name,size:(size/1024).toFixed(1),path});fileInfo.title=path||name;}
  function selectDocument(path){
    if(currentPath) drafts.set(currentPath,editor.value);
    resetSections();currentPath=path;editor.value=drafts.get(path)??archive.documents.get(path);
    $('documentSelect').value=path;info(archive.name,0,path);render();
  }
  $('documentSelect').addEventListener('change',e=>selectDocument(e.target.value));
  async function loadFile(file) {
    if(!file)return;
    const ticket=++generation;
    try {
      let nextArchive=null,value;
      if(/\.zip$/i.test(file.name)) {
        if(file.size>LIMITS.archive)throw Error('ZIP 文件最多支持 20 MB');
        message('正在读取 ZIP…');nextArchive=await readZip(await file.arrayBuffer());nextArchive.name=file.name;
      } else {
        if(!/\.(md|markdown|txt)$/i.test(file.name) && !['text/markdown','text/plain'].includes(file.type))throw Error('请选择 .md、.markdown、.txt 或 .zip 文件');
        if(file.size>LIMITS.markdown)throw Error('文件过大，Markdown 最多支持 4 MB');
        message('正在读取文档…');value=decodeMarkdown(new Uint8Array(await file.arrayBuffer()));
      }
      if(ticket!==generation)return;
      selection=null;releaseImages();resetSections();archive=nextArchive;drafts.clear();currentPath='';
      const select=$('documentSelect');select.replaceChildren();$('documentPicker').hidden=!archive;
      if(archive){
        const paths=[...archive.documents.keys()].sort((a,b)=>a.localeCompare(b,'en'));
        for(const path of paths){const option=document.createElement('option');option.dataset.userContent='';option.value=path;option.textContent=path;select.append(option);}
        const first=paths.find(path=>/(^|\/)readme\.(md|markdown)$/i.test(path))||paths.find(path=>/\.(md|markdown)$/i.test(path))||paths[0];
        selectDocument(first);
      } else {editor.value=value;info(file.name,file.size);render();}
      status.classList.remove('error');
    } catch(error) {
      if(ticket!==generation)return;
      // Leave the last successfully opened document and its image URLs available.
      message('读取文件失败：{error}',{error:ToolUI.string(error.message)});status.classList.add('error');
      status.dataset.errorSource=error.message;
    }
  }
  function clearStudy(error){
    ++generation;selection=null;releaseImages();resetSections();archive=null;drafts.clear();currentPath='';editor.value='';preview.replaceChildren();fileInfo.textContent='';fileInfo.removeAttribute('title');$('documentSelect').replaceChildren();$('documentPicker').hidden=true;ToolUI.text(count,'{count} 字符',{count:'0'});message(error);status.classList.add('error');
  }
  async function checkStudy(){
    if(!selection||checking||document.hidden)return;
    checking=true;
    try{const response=await fetch('/api/me',{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw Error('请使用原账号登录后重新打开讲义');const value=await response.json();if(value.user?.mustChangePassword||String(value.user?.id)!==selection?.account)throw Error('登录账号已变化，请从学习中心重新打开讲义');}
    catch(error){if(selection)clearStudy(error.message);}
    finally{checking=false;}
  }
  addEventListener('focus',checkStudy);document.addEventListener('visibilitychange',checkStudy);setInterval(checkStudy,10000);
  async function openStudy(){
    let chosen;
    try{chosen=studySelection(location.search);}catch(error){clearStudy(error.message);return;}
    if(!chosen)return;
    const ticket=++generation;selection=chosen;message('正在读取讲义…');
    try{const next=await readStudyDocument(chosen);if(ticket!==generation)return;archive=next;drafts.clear();resetSections();currentPath='';selectDocument(next.path);$('documentPicker').hidden=true;}
    catch(error){if(ticket===generation)clearStudy(error.message);}
  }
  updateOutlineLabel();updateExpand();openStudy();
  let timer;
  editor.addEventListener('input',()=>{
    clearTimeout(timer);
    if(new TextEncoder().encode(editor.value).length>LIMITS.markdown){message('文件过大，Markdown 最多支持 4 MB');status.classList.add('error');return;}
    timer=setTimeout(render,120);
  });
  document.addEventListener('garyhub:language',()=>{
    updateOutlineLabel();
    ToolUI.text(count,'{count} 字符',{count:editor.value.length.toLocaleString(GaryHubI18n.intlLocale)});
    if(status.classList.contains('error')&&status.dataset.errorSource){const source=status.dataset.errorSource;message('读取文件失败：{error}',{error:ToolUI.string(source)});status.dataset.errorSource=source;}
  });
  ToolUI.text(count,'{count} 字符',{count:'0'});
  ToolUI.text(preview.querySelector('.empty'),'拖入或选择文件后，预览会显示在这里');
  $('openBtn').addEventListener('click', () => fileInput.click());
  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  fileInput.addEventListener('change', () => { loadFile(fileInput.files[0]); fileInput.value = ''; });
  document.addEventListener('dragenter', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); dragDepth++; overlay.classList.add('visible'); drop.classList.add('drag'); } });
  document.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  document.addEventListener('dragleave', e => { e.preventDefault(); if (--dragDepth <= 0) { dragDepth=0; overlay.classList.remove('visible'); drop.classList.remove('drag'); } });
  document.addEventListener('drop', e => { e.preventDefault(); dragDepth=0; overlay.classList.remove('visible'); drop.classList.remove('drag'); loadFile(e.dataTransfer.files[0]); });
})();
