'use strict';
// Reproduce the reported failure with primary hover=false and real mouse input.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_MODULE||'jsdom');
const root=path.resolve(__dirname,'../../../..'),pub=root+'/lab-service/public';
function fixture({reduced=false}={}){
  const dom=new JSDOM(fs.readFileSync(pub+'/index.html','utf8'),{url:'https://tools.garyhub.uk',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document,frames=new Map();let next=0,time=0,animations=0;
  // A touch-primary laptop, remote browser, or device emulation can report this.
  w.matchMedia=query=>({matches:query.includes('reduced')&&reduced,addEventListener(){}});
  w.requestAnimationFrame=fn=>{frames.set(++next,fn);return next;};w.cancelAnimationFrame=id=>frames.delete(id);
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLElement.prototype.animate=function(){animations++;return {cancel(){}};};
  for(const [i,link]of [...d.querySelectorAll('.tool-link')].entries())link.getBoundingClientRect=()=>({left:i%6*140,top:300+Math.floor(i/6)*140,width:120,height:132});
  for(const name of ['tools-catalog.js','tools-dock.js'])w.eval(fs.readFileSync(pub+'/'+name,'utf8'));
  function send(id,type,pointerType='mouse',touchGenerated=false){
    const link=d.querySelector(`[data-tool="${id}"] a`),box=link.getBoundingClientRect();
    const event=new w.MouseEvent(type,{bubbles:true,clientX:box.left+box.width/2,clientY:box.top+32});
    if(type.startsWith('pointer'))Object.defineProperty(event,'pointerType',{value:pointerType});
    if(touchGenerated)Object.defineProperty(event,'sourceCapabilities',{value:{firesTouchEvents:true}});
    link.dispatchEvent(event);
  }
  function settle(){let n=0;while(frames.size&&n++<240){const callbacks=[...frames.values()];frames.clear();time+=1000/60;for(const fn of callbacks)fn(time);}assert.ok(n<240,'spring settles');}
  const selected=()=>d.querySelector('[data-active]')?.parentElement.dataset.tool;
  const scale=id=>Number(d.querySelector(`[data-tool="${id}"] .tool-glyph`).style.transform.match(/scale\(([^)]+)/)?.[1]||1);
  return {w,d,send,settle,selected,scale,frames,get animations(){return animations;},close(){w.close();}};
}
test('pointer entry alone magnifies, colors and describes, despite hover/pointer media reporting false',()=>{
  const f=fixture();try{
    f.send('markdown','pointerover');f.settle();
    assert.equal(f.selected(),'markdown');assert.equal(f.d.getElementById('detail-title').hidden,false);
    assert.equal(f.d.getElementById('detail-title').textContent,'Markdown 预览');
    assert.ok(f.scale('markdown')>1.25);assert.equal(f.d.getElementById('tool-browser').dataset.input,'mouse');
    assert.equal(f.d.activeElement,f.d.body,'no click or keyboard focus was required');
  }finally{f.close();}
});
test('legacy mouse events work without PointerEvent delivery and switch to the latest tool',()=>{
  const f=fixture();try{
    for(const id of ['grades','study','eraser','pdf'])f.send(id,'mouseover');f.settle();
    assert.equal(f.selected(),'pdf');assert.ok(f.scale('pdf')>1.25);
    assert.match(f.d.getElementById('detail-copy').textContent,/PDF/);
    f.d.getElementById('tool-list').dispatchEvent(new f.w.Event('mouseleave'));f.settle();
    assert.equal(f.scale('pdf'),1);assert.equal(f.frames.size,0);
  }finally{f.close();}
});
test('reduced motion still provides hover color and description without magnification',()=>{
  const f=fixture({reduced:true});try{
    f.send('eraser','pointerover');f.settle();
    assert.equal(f.selected(),'eraser');assert.equal(f.scale('eraser'),1);assert.equal(f.animations,0);
    assert.match(f.d.getElementById('detail-copy').textContent,/修补/);
  }finally{f.close();}
});
test('finger input and synthesized mouse events do not activate hover, but a real mouse still does',()=>{
  const f=fixture();try{
    f.send('grades','pointerover');f.settle();assert.ok(f.scale('grades')>1);
    f.send('study','pointerdown','touch');f.send('study','pointermove','touch');
    f.send('study','mouseover','mouse',true);f.send('study','mousemove');f.settle();
    assert.equal(f.selected(),undefined);assert.equal(f.scale('grades'),1);assert.equal(f.scale('study'),1);
    f.send('study','pointerover','mouse');f.settle();assert.equal(f.selected(),'study');assert.ok(f.scale('study')>1.25);
  }finally{f.close();}
});
test('keyboard and language switching remain independent of the primary-device classification',()=>{
  const f=fixture();try{
    const link=f.d.querySelector('[data-tool=lab] a');link.focus();f.settle();
    assert.equal(f.selected(),'lab');assert.ok(f.scale('lab')>1.25);
    f.send('markdown','pointerover');f.settle();
    f.d.dispatchEvent(new f.w.CustomEvent('garyhub:language',{detail:{language:'en'}}));
    assert.equal(f.d.getElementById('detail-title').textContent,'Markdown Viewer');assert.equal(f.selected(),'markdown');
  }finally{f.close();}
});
