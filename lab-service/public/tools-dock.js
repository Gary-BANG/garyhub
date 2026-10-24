/* A small spring loop runs only while icon positions are changing. */
(() => {
  'use strict';
  const catalog = window.GaryHubTools;
  const browser = document.getElementById('tool-browser');
  if (!catalog || !browser) return;
  const $ = id => document.getElementById(id);
  const search = $('tool-search'), scroll = $('dock-scroll'), list = $('tool-list');
  const detail = $('detail-content'), title = $('detail-title'), copy = $('detail-copy');
  // Capabilities describe the primary device, not the mouse currently in use.
  // Use them for the initial hint only; real mouse events must always work.
  const hoverHint = matchMedia('(any-hover:hover)');
  const motion = matchMedia('(prefers-reduced-motion:reduce)');
  const entries = [...list.querySelectorAll('[data-tool]')].map(node => ({
    node, link:node.querySelector('a'), glyph:node.querySelector('.tool-glyph'),
    tool:catalog.tools.find(tool => tool.id === node.dataset.tool),
    scale:1, lift:0, shift:0, vs:0, vy:0, vx:0, box:null
  })).filter(entry => entry.tool);
  const strings = {
    zh:{eyebrow:'A PERSONAL COLLECTION / GARYHUB',headline:'一方小天地，',headlineAccent:'做更多事。',subtitle:'学习、创作与日常所需，在这里各就其位。',searchLabel:'搜索工具',placeholder:'搜索工具名称或用途…',clear:'清空搜索',view:'显示方式',grid:'多行图标',dock:'单行 Dock',toolbox:'你的工具箱',detailKicker:'为每一件小事，找到顺手的工具',hint:'移动到图标上查看介绍，点击即可进入。',touchHint:'点击图标即可进入工具。',footer:'学习 · 实践 · 记录',region:'工具导航',detail:'工具介绍',prev:'向前浏览工具',next:'向后浏览工具',empty:'没有找到匹配的工具，试试其他名称或用途。',count:(n,total,filtered) => filtered ? `${n} / ${total} 个工具` : `${total} 个工具`},
    en:{eyebrow:'A PERSONAL COLLECTION / GARYHUB',headline:'A little space.',headlineAccent:'For doing more.',subtitle:'Your everyday tools, all in one place.',searchLabel:'Search tools',placeholder:'Search tools or what you want to do…',clear:'Clear search',view:'Display layout',grid:'Icon grid',dock:'Single-row Dock',toolbox:'THE TOOLBOX',detailKicker:'A LITTLE HELP FOR EVERYDAY',hint:'Hover to explore. Click to open.',touchHint:'Tap an icon to open the tool.',footer:'STUDY · BUILD · KEEP TRACK',region:'Tools navigation',detail:'Tool description',prev:'Browse previous tools',next:'Browse next tools',empty:'No matching tools. Try another name or purpose.',count:(n,total,filtered) => filtered ? `${n} / ${total} tools` : `${total} tools`}
  };
  let lang = window.GaryHubI18n?.language === 'en' ? 'en' : 'zh';
  let current = null, pointer = null, focused = null, raf = 0, last = 0, leaveTimer = 0, descriptionAnimation;
  let input = hoverHint.matches ? 'mouse' : 'touch', lastTouch = -Infinity;
  let dirty = true, view = 'grid';
  try { if (localStorage.getItem('garyhub.tools.view') === 'dock') view = 'dock'; } catch {}
  const visible = () => entries.filter(entry => !entry.node.hidden);
  function measure() {
    for (const entry of visible()) entry.box = entry.link.getBoundingClientRect();
    dirty = false;
  }
  function arrows() {
    const overflow = view === 'dock' && scroll.scrollWidth > scroll.clientWidth + 2;
    $('dock-prev').hidden = !overflow || scroll.scrollLeft < 3;
    $('dock-next').hidden = !overflow || scroll.scrollLeft > scroll.scrollWidth - scroll.clientWidth - 3;
  }
  function resetIcons() {
    cancelAnimationFrame(raf); raf = 0; last = 0;
    for (const entry of entries) {
      entry.scale=1;entry.lift=entry.shift=entry.vs=entry.vx=entry.vy=0;
      entry.glyph.style.removeProperty('transform');
      entry.glyph.style.removeProperty('will-change');
    }
  }
  function frame(time) {
    raf = 0;
    if (document.hidden || motion.matches || input==='touch') {resetIcons();return;}
    if (dirty) measure();
    const dt = last ? Math.min((time-last)/1000, .032) : 1/60; last = time;
    let moving = false;
    for (const entry of entries) {
      let amount=0;
      if (!entry.node.hidden && entry.box) {
        if (pointer) {
          const dx=entry.box.left+entry.box.width/2-pointer.x;
          const dy=entry.box.top+32-pointer.y;
          const distance=Math.hypot(dx,dy*.8);
          amount=Math.max(0,1-distance/240);amount=amount*amount;
        } else if (focused === entry) amount=1;
      }
      const target=[1+amount*.30,-amount*10,0];
      if (pointer && amount && view==='dock') target[2]=(entry.box.left+entry.box.width/2 < pointer.x ? -1 : 1)*amount*4;
      for (const [key,velocity,to] of [['scale','vs',target[0]],['lift','vy',target[1]],['shift','vx',target[2]]]) {
        entry[velocity] += ((to-entry[key])*380-entry[velocity]*35)*dt;
        entry[key] += entry[velocity]*dt;
        if (Math.abs(to-entry[key]) < .001 && Math.abs(entry[velocity]) < .015) {entry[key]=to;entry[velocity]=0;}
        else moving=true;
      }
      if (amount || entry.scale!==1 || entry.lift!==0 || entry.shift!==0) {
        entry.glyph.style.willChange='transform';
        entry.glyph.style.transform=`translate3d(${entry.shift.toFixed(3)}px,${entry.lift.toFixed(3)}px,0) scale(${entry.scale.toFixed(4)})`;
      } else {entry.glyph.style.removeProperty('transform');entry.glyph.style.removeProperty('will-change');}
      if (!moving) entry.glyph.style.removeProperty('will-change');
    }
    if (moving) raf=requestAnimationFrame(frame);else last=0;
  }
  function animateIcons() {if (!raf && !motion.matches && input!=='touch' && !document.hidden) raf=requestAnimationFrame(frame);}
  function setInput(value) {input=value;browser.dataset.input=value;}
  function show(entry, animate=true) {
    const changed=current!==entry; current=entry;
    for (const item of entries) {
      item.node.toggleAttribute('data-selected',item===entry);
      item.link.toggleAttribute('data-active',item===entry);
      if (item===entry) item.link.setAttribute('aria-describedby','detail-copy');
      else item.link.removeAttribute('aria-describedby');
    }
    title.hidden=!entry;
    title.textContent=entry?entry.tool.name[lang]:'';
    copy.textContent=entry?entry.tool.description[lang]:(input==='touch'?strings[lang].touchHint:strings[lang].hint);
    copy.classList.toggle('detail-hint',!entry);
    if (changed && animate && !motion.matches && typeof detail.animate==='function') {
      const opacity=descriptionAnimation ? Number(getComputedStyle(detail).opacity) : .3;
      descriptionAnimation?.cancel();
      descriptionAnimation=detail.animate([{opacity:Math.max(.3,opacity),transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:170,easing:'cubic-bezier(.2,.7,.2,1)'});
      const running=descriptionAnimation;
      running.onfinish=()=>{if(descriptionAnimation===running)descriptionAnimation=undefined;};
    }
  }
  function filter() {
    for (const entry of entries) entry.node.hidden=!catalog.matches(entry.tool,search.value);
    if (current?.node.hidden) show(null);
    if (focused?.node.hidden) focused=null;
    pointer=null;dirty=true;resetIcons();
    const count=visible().length;
    $('tool-count').textContent=strings[lang].count(count,entries.length,!!catalog.normalize(search.value));
    $('no-tools').hidden=count!==0;$('no-tools').textContent=strings[lang].empty;
    $('search-clear').hidden=!search.value;
    scroll.scrollLeft=0;arrows();
  }
  function layout(value, save=true) {
    if (!['grid','dock'].includes(value)) return;
    view=value;browser.dataset.view=view;pointer=null;resetIcons();
    for (const button of document.querySelectorAll('[data-view-button]')) button.setAttribute('aria-pressed',String(button.dataset.viewButton===view));
    if (save) try {localStorage.setItem('garyhub.tools.view',view);} catch {}
    scroll.scrollLeft=0;dirty=true;arrows();
  }
  function language() {
    const s=strings[lang];
    for (const node of document.querySelectorAll('[data-copy]')) node.textContent=s[node.dataset.copy];
    search.placeholder=s.placeholder;search.setAttribute('aria-label',s.searchLabel);
    for (const [id,text] of [['search-clear',s.clear],['view-switch',s.view],['dock-prev',s.prev],['dock-next',s.next],['tool-browser',s.region],['tool-detail',s.detail]]) $(id).setAttribute('aria-label',text);
    for (const button of document.querySelectorAll('[data-view-button]')) {button.title=s[button.dataset.viewButton];button.setAttribute('aria-label',button.title);}
    for (const entry of entries) {
      entry.node.querySelector('.tool-name').textContent=entry.tool.name[lang];
      entry.node.querySelector('.tool-short').textContent=entry.tool.short[lang];
      entry.link.setAttribute('aria-label',entry.tool.name[lang]);
    }
    // Keep the query, layout, active description and scroll position when translating.
    $('tool-count').textContent=s.count(visible().length,entries.length,!!catalog.normalize(search.value));
    $('no-tools').textContent=s.empty;show(current,false);dirty=true;arrows();
  }
  search.addEventListener('input',filter);
  $('search-clear').addEventListener('click',()=>{search.value='';filter();search.focus();});
  for (const button of document.querySelectorAll('[data-view-button]')) button.addEventListener('click',()=>layout(button.dataset.viewButton));
  function touchInput() {
    lastTouch=performance.now();pointer=null;focused=null;setInput('touch');
    resetIcons();show(null,false);
  }
  function mouseInput(event) {
    if (event.pointerType==='touch') {touchInput();return;}
    if (event.pointerType==='pen' && event.buttons) return;
    // Ignore compatibility mouse events synthesized after a finger tap/scroll.
    if (event.sourceCapabilities?.firesTouchEvents ||
        (event.type.startsWith('mouse') && performance.now()-lastTouch<900)) return;
    clearTimeout(leaveTimer);setInput('mouse');
    pointer={x:event.clientX,y:event.clientY};
    const node=event.target.closest?.('[data-tool]');const entry=entries.find(entry=>entry.node===node);
    if (entry && current!==entry) show(entry);
    animateIcons();
  }
  // Entry must respond before a click and even if the pointer then stays still.
  for (const type of ['pointerover','pointermove','mouseover','mousemove']) list.addEventListener(type,mouseInput);
  list.addEventListener('pointerdown',event=>{if(event.pointerType==='touch')touchInput();},{passive:true});
  list.addEventListener('touchstart',touchInput,{passive:true});
  const leaveIcons=()=>{pointer=null;animateIcons();};
  list.addEventListener('pointerleave',leaveIcons);
  list.addEventListener('mouseleave',leaveIcons);
  for (const type of ['pointerenter','mouseenter']) browser.addEventListener(type,()=>clearTimeout(leaveTimer));
  for (const type of ['pointerleave','mouseleave']) browser.addEventListener(type,()=>{clearTimeout(leaveTimer);leaveTimer=setTimeout(()=>show(focused||null),180);});
  list.addEventListener('focusin',event=>{
    focused=entries.find(entry=>entry.link===event.target)||null;
    if (focused) {setInput('keyboard');pointer=null;focused.link.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});dirty=true;show(focused);animateIcons();}
  });
  list.addEventListener('focusout',event=>{if (!list.contains(event.relatedTarget)) {focused=null;animateIcons();if (!browser.contains(event.relatedTarget)) show(null);}});
  list.addEventListener('keydown',event=>{
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    const items=visible(),index=items.findIndex(entry=>entry.link===event.target);if(index<0)return;
    if (dirty) measure();
    let next=index;
    if(event.key==='Home')next=0;else if(event.key==='End')next=items.length-1;
    else if(event.key==='ArrowLeft')next=Math.max(0,index-1);else if(event.key==='ArrowRight')next=Math.min(items.length-1,index+1);
    else {
      const row=items.filter(entry=>Math.abs(entry.box.top-items[index].box.top)<4).length;
      next=Math.max(0,Math.min(items.length-1,index+(event.key==='ArrowDown'?row:-row)));
    }
    event.preventDefault();items[next].link.focus();
  });
  browser.addEventListener('keydown',event=>{if(event.key==='Escape'){search.value='';filter();show(null);search.focus();}});
  for (const [id,sign] of [['dock-prev',-1],['dock-next',1]]) $(id).addEventListener('click',()=>scroll.scrollBy({left:sign*Math.max(200,scroll.clientWidth*.7),behavior:motion.matches?'instant':'smooth'}));
  scroll.addEventListener('scroll',()=>{dirty=true;arrows();},{passive:true});
  const resize=()=>{dirty=true;arrows();};
  addEventListener('resize',resize,{passive:true});
  addEventListener('scroll',resize,{passive:true,capture:true});
  if(typeof ResizeObserver==='function')new ResizeObserver(resize).observe(scroll);
  document.addEventListener('garyhub:language',event=>{lang=event.detail.language==='en'?'en':'zh';language();});
  addEventListener('storage',event=>{if(event.key==='garyhub.tools.view')layout(event.newValue,false);});
  motion.addEventListener('change',()=>{descriptionAnimation?.cancel();descriptionAnimation=undefined;resetIcons();if(!motion.matches)animateIcons();});
  document.addEventListener('visibilitychange',()=>{pointer=null;resetIcons();});
  addEventListener('pagehide',()=>{clearTimeout(leaveTimer);resetIcons();descriptionAnimation?.cancel();});
  setInput(input);$('tools-controls').hidden=false;layout(view,false);language();filter();
})();
