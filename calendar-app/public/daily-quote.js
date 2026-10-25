(()=>{'use strict';const box=document.getElementById('daily-quote');if(!box)return;let data=null,request=0;
 const node=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
 function render(){if(!data)return;const en=document.documentElement.lang==='en',content=document.createElement('div');content.append(node('blockquote',en?data.en:data.zh),node('p',en?data.zh:data.en,'quote-translation'),node('cite',data.source+' · '+(en?'GaryHub translation / ':'GaryHub 译文 / ')+data.date));box.replaceChildren(node('span','“','quote-mark'),content);box.hidden=false;}
 async function refresh(){const ticket=++request;try{const r=await fetch('/api/daily-quote',{cache:'no-store'});if(ticket!==request)return;if(!r.ok){box.hidden=true;data=null;return;}data=await r.json();render();}catch{}}
 new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});setInterval(()=>{if(!document.hidden)refresh();},60000);refresh();
})();
