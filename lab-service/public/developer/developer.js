/* Developer profile. The server returns only the sections this visitor may read; the page renders
   exactly those, numbered in order, and never marks or mentions anything else. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),view=$('devView');
 const requested=new URLSearchParams(location.search).get('preview');
 const preview=['member','subscriber'].includes(requested)?requested:['guest','visitor'].includes(requested)?'guest':null;
 const ORDER=['education','academics','projects','skills'];
 const TEXT={
  education:{zh:'教育背景',en:'Education'},academics:{zh:'学业成绩',en:'Academic Record'},projects:{zh:'研究与项目',en:'Research & Projects'},skills:{zh:'专业技能',en:'Technical Skills'},
  tagEducation:{zh:'EDUCATION',en:'EDUCATION'},tagAcademics:{zh:'ACADEMICS',en:'ACADEMICS'},tagProjects:{zh:'PROJECTS',en:'PROJECTS'},tagSkills:{zh:'SKILLS',en:'SKILLS'},
  kicker:{zh:'Developer Profile · 开发者档案',en:'Developer Profile'},plain:{zh:'开发者档案',en:'Developer Profile'},
  gpa:{zh:'GPA',en:'GPA'},rank:{zh:'专业排名',en:'Rank'},
  denied:{zh:'你无权访问',en:'You do not have access'},deniedNote:{zh:'开发者档案仅向获得授权的访问者开放。',en:'The developer profile is available to authorized visitors only.'},
  codeNote:{zh:'如已获得访问码，可在此输入。',en:'If you have an access code, enter it here.'},code:{zh:'输入访问码',en:'Enter access code'},
  failed:{zh:'暂时无法加载开发者档案，请稍后刷新页面。',en:'The developer profile could not be loaded. Please refresh later.'},
  until:{zh:'访问授权有效至 ',en:'Access granted until '},previewAs:{zh:'预览身份：',en:'Previewing as: '},
  guest:{zh:'路人',en:'Guest'},member:{zh:'普通用户',en:'Member'},subscriber:{zh:'订阅用户',en:'Subscriber'}
 };
 const lang=()=>window.GaryHubI18n?.language==='en'?'en':'zh';
 const pick=v=>v==null?'':typeof v==='string'||typeof v==='number'?String(v):String(v[lang()]??v.zh??v.en??'');
 const t=key=>pick(TEXT[key]);
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null&&text!=='')n.textContent=text;return n;};
 const list=v=>Array.isArray(v)?v:[];
 const safeUrl=u=>{try{const url=new URL(String(u));return url.protocol==='https:'?url.href:null;}catch{return null;}};
 let data=null,last='',busy=false,timer=0;

 function hero(identity){
  const card=el('section','dev-card dev-hero');
  const name=pick(identity.name),avatar=el('div','dev-avatar',[...name.trim()][0]||'G');avatar.setAttribute('aria-hidden','true');
  const body=el('div');body.append(el('span','dev-kicker',t('kicker')),el('h1','',name));
  if(pick(identity.altName))body.append(el('p','dev-alt',pick(identity.altName)));
  if(pick(identity.role))body.append(el('p','dev-role',pick(identity.role)));
  if(pick(identity.summary))body.append(el('p','dev-summary',pick(identity.summary)));
  const links=el('div','dev-links');
  for(const link of list(identity.links)){const href=safeUrl(link.url);if(!href)continue;const a=el('a','chip',pick(link.label));a.href=href;a.target='_blank';a.rel='noopener';links.append(a);}
  if(links.childElementCount)body.append(links);
  card.append(avatar,body);return card;
 }
 function fact(label,value,note){const box=el('div','dev-fact');box.append(el('small','',label),el('b','',value));if(note)box.append(el('span','',note));return box;}
 function entry(item,{summary='description'}={}){
  const box=el('article','dev-entry');box.append(el('h3','',pick(item.title)));
  if(pick(item.meta))box.append(el('p','dev-meta',pick(item.meta)));
  if(pick(item[summary]))box.append(el('p','',pick(item[summary])));
  const points=list(item.highlights).map(pick).filter(Boolean);
  if(points.length){const ul=el('ul');for(const p of points)ul.append(el('li','',p));box.append(ul);}
  const tags=list(item.tags).map(pick).filter(Boolean);
  if(tags.length){const row=el('div','dev-tags');for(const tag of tags)row.append(el('span','',tag));box.append(row);}
  return box;
 }
 function sectionBody(key,value){
  const body=el('div');
  if(key==='education'){
   const facts=list(value.facts);if(facts.length){const row=el('div','dev-facts');for(const f of facts)row.append(fact(pick(f.label),pick(f.value),pick(f.note)));body.append(row);}
   for(const item of list(value.entries))body.append(entry(item));
  }else if(key==='academics'){
   const row=el('div','dev-score');row.append(fact(t('gpa'),pick(value.gpa)),fact(t('rank'),pick(value.rank)));body.append(row);
  }else if(key==='projects'){
   for(const item of list(value.entries))body.append(entry(item,{summary:'summary'}));
  }else if(key==='skills'){
   const grid=el('div','dev-skills');
   for(const group of list(value.groups)){const box=el('div','dev-skill');box.append(el('h3','',pick(group.name)));const row=el('div','dev-tags');for(const item of list(group.items))row.append(el('span','',pick(item)));box.append(row);grid.append(box);}
   body.append(grid);
  }
  return body;
 }
 function denied(access){
  const card=el('section','dev-card dev-denied'),lock=el('div','dev-lock');
  lock.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.2"/></svg>';
  card.append(lock,el('h1','',t('denied')),el('p','',t('deniedNote')));
  if(access.hasCode&&!preview){card.append(el('p','',t('codeNote')));const b=el('button','chip primary',t('code'));b.type='button';b.onclick=openDialog;card.append(b);}
  return card;
 }
 function render(){
  if(!data)return;
  const {access,profile}=data,frag=document.createDocumentFragment();
  const present=ORDER.filter(k=>profile[k]);
  if(!profile.identity&&!present.length)frag.append(denied(access));
  else{
   if(profile.identity)frag.append(hero(profile.identity));
   else{const head=el('section','dev-card dev-plain');head.append(el('span','dev-kicker','Developer Profile'),el('h1','',t('plain')));frag.append(head);}
   present.forEach((key,i)=>{
    const section=el('section','dev-card dev-section'),title=el('h2');title.id='dev-'+key;section.setAttribute('aria-labelledby',title.id);
    title.append(el('span','dev-num',String(i+1).padStart(2,'0')+' / '+t('tag'+key[0].toUpperCase()+key.slice(1))),document.createTextNode(t(key)));
    section.append(title,sectionBody(key,profile[key]));frag.append(section);
   });
  }
  view.dataset.i18nIgnore='';view.replaceChildren(frag);
  // Toolbar: preview identity, active code grant, or the neutral access-code entry.
  const showUnlock=!preview&&!access.complete&&access.hasCode&&(profile.identity||present.length);
  $('devUnlock').hidden=!showUnlock;$('devLock').hidden=preview||!access.unlocked;$('devPreviewExit').hidden=!preview;
  $('devStatus').textContent=preview?t('previewAs')+t(preview):access.unlocked&&access.expiresAt?t('until')+new Date(access.expiresAt).toLocaleString(lang()==='en'?'en-US':'zh-CN'):'';
  $('devToolbar').hidden=$('devUnlock').hidden&&$('devLock').hidden&&$('devPreviewExit').hidden;
  clearTimeout(timer);if(access.expiresAt)timer=setTimeout(()=>refresh(true),Math.max(0,access.expiresAt-Date.now())+200);
 }
 function failed(){data=null;last='';$('devToolbar').hidden=true;const card=el('section','dev-card dev-denied');card.append(el('p','',t('failed')));view.replaceChildren(card);}
 async function api(url,options={}){const r=await fetch(url,{cache:'no-store',credentials:'same-origin',...options});let v={};try{v=await r.json();}catch{}if(!r.ok)throw Object.assign(Error(v.message||'请求失败'),{status:r.status});return v;}
 async function mutate(url,body={}){const {token}=await api('/api/csrf');return api(url,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:JSON.stringify(body)});}
 async function refresh(force){
  if(busy||document.hidden&&!force)return;busy=true;
  try{const d=await api('/api/hub/developer-profile'+(preview?'?preview='+preview:''));const key=JSON.stringify(d);if(force||key!==last){last=key;data=d;render();}}
  catch{failed();}
  finally{busy=false;}
 }
 function openDialog(){$('devCode').value='';$('devError').textContent='';$('devDialog').showModal();$('devCode').focus();}
 $('devUnlock').onclick=openDialog;
 $('devCancel').onclick=()=>{$('devDialog').close();$('devCode').value='';};
 $('devForm').onsubmit=async e=>{e.preventDefault();const submit=e.submitter;if(submit)submit.disabled=true;
  try{await mutate('/api/hub/profile-unlock',{code:$('devCode').value,audience:data?.access.audience});$('devCode').value='';$('devDialog').close();await refresh(true);}
  catch(error){$('devError').textContent=error.message;}finally{if(submit)submit.disabled=false;}};
 $('devLock').onclick=async()=>{try{await mutate('/api/hub/profile-lock');}catch{}await refresh(true);};
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
 addEventListener('focus',()=>refresh());addEventListener('pageshow',()=>refresh());setInterval(()=>refresh(),60000);
 document.addEventListener('garyhub:language',render);
 document.addEventListener('garyhub:identity',()=>refresh(true));
 refresh(true);
})();
