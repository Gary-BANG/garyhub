/* GaryHub homepage host: the "More" menu and the pointer glow on entry cards. */
(()=>{'use strict';
 const menus=[...document.querySelectorAll('.dropdown')];
 const setOpen=(menu,open)=>{menu.querySelector('button').setAttribute('aria-expanded',String(open));menu.querySelector('.panel').hidden=!open;};
 const closeAll=except=>menus.forEach(menu=>{if(menu!==except)setOpen(menu,false);});
 for(const menu of menus){
  const button=menu.querySelector('button');
  button.addEventListener('click',()=>{const open=button.getAttribute('aria-expanded')!=='true';closeAll(menu);setOpen(menu,open);});
  menu.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'){closeAll(menu);setOpen(menu,true);}});
  menu.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'&&!menu.contains(document.activeElement))setOpen(menu,false);});
  menu.addEventListener('focusout',()=>setTimeout(()=>{if(!menu.contains(document.activeElement))setOpen(menu,false);},0));
  menu.addEventListener('keydown',e=>{
   if(e.key==='Escape'){setOpen(menu,false);button.focus();}
   if(e.key==='ArrowDown'&&e.target===button){e.preventDefault();closeAll(menu);setOpen(menu,true);menu.querySelector('.panel a').focus();}
  });
  menu.querySelectorAll('.panel a').forEach(link=>link.addEventListener('click',()=>setOpen(menu,false)));
 }
 document.addEventListener('click',e=>{if(!e.target.closest('.dropdown'))closeAll();});
 for(const card of document.querySelectorAll('.portal')){
  card.addEventListener('pointermove',e=>{const r=card.getBoundingClientRect();card.style.setProperty('--mx',(e.clientX-r.left)+'px');card.style.setProperty('--my',(e.clientY-r.top)+'px');});
 }
})();
