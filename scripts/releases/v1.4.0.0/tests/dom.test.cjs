'use strict';
/* DOM/spring-model checks, deliberately not a substitute for real visual QA. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_MODULE||'jsdom');
const root=path.resolve(__dirname,'../../../..'),pub=root+'/lab-service/public';
function fixture({touch=false,reduced=false,storage=false,variant=false,width=1040}={}){
  const file=variant?root+'/scripts/releases/v1.4.0.0/variant-overrides/1.3.4.1/lab-service/public/index.html':pub+'/index.html';
  const dom=new JSDOM(fs.readFileSync(file,'utf8'),{url:'https://tools.garyhub.uk',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document,queries=new Map(),queue=new Map();let next=0,time=0,animations=0;
  w.matchMedia=query=>{
    if(!queries.has(query))queries.set(query,{matches:query.includes('reduced')?reduced:!touch,handlers:[],addEventListener(_,fn){this.handlers.push(fn);}});
    return queries.get(query);
  };
  w.requestAnimationFrame=fn=>{queue.set(++next,fn);return next;};w.cancelAnimationFrame=id=>queue.delete(id);
  w.HTMLElement.prototype.scrollIntoView=function(){this.dataset.scrolled='true';};
  w.HTMLElement.prototype.animate=function(){animations++;return {cancel(){}};};
  const scroll=d.getElementById('dock-scroll');
  Object.defineProperty(scroll,'clientWidth',{get:()=>width});
  Object.defineProperty(scroll,'scrollWidth',{get:()=>d.getElementById('tool-browser').dataset.view==='dock'?d.querySelectorAll('[data-tool]:not([hidden])').length*126+88:width});
  scroll.scrollBy=({left})=>{scroll.scrollLeft=Math.min(Math.max(0,scroll.scrollLeft+left),scroll.scrollWidth-width);scroll.dispatchEvent(new w.Event('scroll'));};
  for(const link of d.querySelectorAll('.tool-link'))link.getBoundingClientRect=()=>{
    const items=[...d.querySelectorAll('[data-tool]:not([hidden])')],index=items.indexOf(link.parentElement),dock=d.getElementById('tool-browser').dataset.view==='dock';
    return {left:(dock?index:index%6)*126-scroll.scrollLeft,top:(dock?0:Math.floor(index/6)*140)+300,width:112,height:132};
  };
  if(storage)Object.defineProperty(w,'localStorage',{get(){throw Error('Synthetic denied storage');}});
  for(const name of ['i18n/dictionary.js','useful/tool-i18n.js','i18n/i18n.js','tools-catalog.js','tools-dock.js'])w.eval(fs.readFileSync(pub+'/'+name,'utf8'));
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  const flush=()=>{let frames=0;while(queue.size&&frames<300){const pending=[...queue.values()];queue.clear();time+=1000/60;for(const fn of pending)fn(time);frames++;}assert.ok(frames<300,'animation loop settles');return frames;};
  const pointer=(id,type='pointermove')=>{const link=d.querySelector(`[data-tool="${id}"] a`),box=link.getBoundingClientRect(),event=new w.Event(type,{bubbles:true});Object.assign(event,{pointerType:touch?'touch':'mouse',clientX:box.left+box.width/2,clientY:box.top+32});link.dispatchEvent(event);};
  const input=value=>{const node=d.getElementById('tool-search');node.value=value;node.dispatchEvent(new w.Event('input',{bubbles:true}));};
  const count=()=>d.querySelectorAll('[data-tool]:not([hidden])').length;
  return {w,d,queries,queue,flush,pointer,input,count,get animations(){return animations;},close:()=>w.close()};
}
test('search, translation and layout changes preserve the query and selected tool',()=>{
  const f=fixture();try{
    assert.equal(f.count(),12);assert.equal(f.d.getElementById('tools-controls').hidden,false);
    f.input('MD');assert.equal(f.count(),1);f.pointer('markdown');f.flush();
    assert.equal(f.d.getElementById('detail-title').textContent,'Markdown 预览');
    f.w.GaryHubI18n.setLanguage('en');assert.equal(f.d.getElementById('tool-search').value,'MD');
    assert.equal(f.d.getElementById('detail-title').textContent,'Markdown Viewer');
    assert.match(f.d.getElementById('detail-copy').textContent,/Preview Markdown/);
    f.d.querySelector('[data-view-button=dock]').click();assert.equal(f.d.getElementById('tool-browser').dataset.view,'dock');
    assert.equal(f.w.localStorage.getItem('garyhub.tools.view'),'dock');assert.equal(f.count(),1);
    f.w.GaryHubI18n.setLanguage('zh');assert.equal(f.d.getElementById('tool-count').textContent,'1 / 12 个工具');
    f.input('<img src=x onerror=alert(1)>');assert.equal(f.count(),0);assert.equal(f.d.getElementById('no-tools').hidden,false);assert.equal(f.d.getElementById('detail-title').hidden,true);
    assert.equal(f.d.querySelectorAll('img').length,0);f.d.getElementById('search-clear').click();assert.equal(f.count(),12);
    assert.equal(f.d.activeElement.id,'tool-search');
  }finally{f.close();}
});
test('rapid hover switches immediately, neighbours respond, and springs stop after settling',()=>{
  const f=fixture();try{
    f.pointer('grades');f.pointer('study');f.pointer('lab');const frames=f.flush();assert.ok(frames>1);
    assert.equal(f.d.getElementById('detail-title').textContent,'ECE 470 实验室');
    assert.match(f.d.querySelector('[data-tool=lab] .tool-glyph').style.transform,/scale\(1\.3000\)/);
    assert.ok(Number(f.d.querySelector('[data-tool=study] .tool-glyph').style.transform.match(/scale\(([^)]+)/)[1])>1.01);
    assert.equal(f.d.querySelectorAll('[data-active]').length,1);assert.equal(f.queue.size,0);
    f.d.getElementById('tool-list').dispatchEvent(new f.w.Event('pointerleave'));f.flush();
    for(const icon of f.d.querySelectorAll('.tool-glyph'))assert.equal(icon.style.transform,'');
    assert.equal(f.queue.size,0);
  }finally{f.close();}
});
test('keyboard navigation, single-row overflow and Escape stay usable without a mouse',()=>{
  const f=fixture({width:390});try{
    f.d.querySelector('[data-tool=grades] a').focus();f.flush();
    f.d.activeElement.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert.equal(f.d.activeElement.parentElement.dataset.tool,'status');
    f.d.activeElement.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert.equal(f.d.activeElement.parentElement.dataset.tool,'pdf');
    f.d.querySelector('[data-view-button=dock]').click();assert.equal(f.d.getElementById('dock-next').hidden,false);
    f.d.getElementById('dock-next').click();assert.ok(f.d.getElementById('dock-scroll').scrollLeft>0);assert.equal(f.d.getElementById('dock-prev').hidden,false);
    f.input('PDF');f.d.getElementById('tool-search').dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(f.count(),12);assert.equal(f.d.activeElement.id,'tool-search');
  }finally{f.close();}
});
test('reduced-motion and touch modes skip magnification; denied storage does not break tools',()=>{
  for(const options of [{reduced:true},{touch:true},{storage:true}]){
    const f=fixture(options);try{
      f.pointer('eraser');f.flush();
      if(options.reduced||options.touch){assert.equal(f.d.querySelector('[data-tool=eraser] .tool-glyph').style.transform,'');assert.equal(f.animations,0);}
      f.input('图片');assert.equal(f.count(),1);assert.equal(f.d.querySelector('[data-tool=eraser] a').getAttribute('href'),'/useful/image-eraser/');
      f.d.querySelector('[data-view-button=dock]').click();assert.equal(f.d.getElementById('tool-browser').dataset.view,'dock');
    }finally{f.close();}
  }
});
test('live reduced-motion changes stop pending animation and the no-TOTP variant stays searchable',()=>{
  const f=fixture({variant:true});try{
    assert.equal(f.count(),11);f.input('2fa');assert.equal(f.count(),0);f.input('');
    f.pointer('markdown');assert.ok(f.queue.size>0);
    const query=f.queries.get('(prefers-reduced-motion:reduce)');query.matches=true;for(const fn of query.handlers)fn();
    assert.equal(f.queue.size,0);for(const icon of f.d.querySelectorAll('.tool-glyph'))assert.equal(icon.style.transform,'');
    f.w.GaryHubI18n.setLanguage('en');assert.equal(f.d.getElementById('tool-count').textContent,'11 tools');
  }finally{f.close();}
});
