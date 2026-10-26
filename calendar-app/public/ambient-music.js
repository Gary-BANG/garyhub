(()=>{'use strict';if(!document.getElementById('sky'))return;const theme=document.querySelector('.theme,#theme');if(!theme||document.querySelector('.ambient-toggle'))return;
 const id=crypto.randomUUID(),key='gh-music-',audio=new Audio('/ambient.mp3');audio.loop=true;audio.volume=.16;audio.preload='metadata';
 const button=document.createElement('button');button.type='button';button.className='ambient-toggle';button.dataset.playing='false';button.setAttribute('aria-pressed','false');
 button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><g class="record"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="7" opacity=".45"/><circle cx="12" cy="12" r="3"/><path d="M6 9a7 7 0 0 1 3-3M15 18a7 7 0 0 0 3-3"/></g><g class="mute-mark"><path d="M13 7v8m0-7 4-1v3l-4 1"/><ellipse cx="11.5" cy="15.5" rx="2" ry="1.5"/><path d="m4 4 16 16" stroke-width="2"/></g></svg>';
 theme.before(button);
 const library=document.createElement('a');library.href='https://calendar.garyhub.uk/music/';library.className='ambient-library';library.textContent='♫';library.title='个人音乐库 / Music library';library.setAttribute('aria-label',library.title);button.before(library);
 let source='guest-default',refreshing=false,sourceReady=false,lastError=0;
 const get=name=>document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith(key+name+'='))?.slice((key+name+'=').length);
 function set(name,value){document.cookie=key+name+'='+value+'; Path=/; Max-Age=31536000; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'')+((location.hostname==='garyhub.uk'||location.hostname.endsWith('.garyhub.uk'))?'; Domain=.garyhub.uk':'');}
 const enabled=()=>get('enabled')!=='0';let trying=false,blocked=false,loaded=false;
 const lease=()=>{const raw=get('lease')||'',split=raw.lastIndexOf(':');return {id:raw.slice(0,split),until:Number(raw.slice(split+1))||0};};
 function state(){const playing=!audio.paused&&!audio.ended;button.dataset.playing=String(playing);button.setAttribute('aria-pressed',String(playing));const label=playing?'暂停背景音乐 / Pause music':blocked?'点击播放背景音乐 / Play music':'播放背景音乐 / Play music';button.title=label;button.setAttribute('aria-label',label);}
 function remember(){if(Number.isFinite(audio.currentTime))set('position-'+source,audio.currentTime.toFixed(2));}
 function stop(){remember();audio.pause();if(lease().id===id)set('lease',id+':0');state();}
 async function start(explicit=false){if(!sourceReady||trying||document.hidden||!enabled()||blocked&&!explicit)return;const owner=lease();if(owner.id&&owner.id!==id&&owner.until>Date.now()&&!explicit)return;trying=true;set('lease',id+':'+(Date.now()+3500));try{if(!loaded){const time=Number(get('position-'+source));if(time>=0&&time<3600)audio.currentTime=time;loaded=true;}await audio.play();blocked=false;}catch{blocked=true;if(lease().id===id)set('lease',id+':0');}finally{trying=false;state();}}
 button.onclick=()=>{if(!audio.paused){set('enabled','0');blocked=false;stop();}else{set('enabled','1');blocked=false;start(true);}};
 audio.addEventListener('play',state);audio.addEventListener('pause',state);audio.addEventListener('error',()=>{blocked=true;state();if(Date.now()-lastError>10000){lastError=Date.now();refreshSource(true);}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else{blocked=false;start();}});window.addEventListener('pagehide',stop);
 setInterval(()=>{if(document.hidden||!enabled()){if(!audio.paused)stop();return;}const owner=lease();if(!audio.paused){if(owner.id!==id&&owner.until>Date.now()){audio.pause();state();}else{set('lease',id+':'+(Date.now()+3500));remember();}}else start();},1000);
 async function refreshSource(force=false){if(refreshing)return;refreshing=true;try{const r=await fetch('/api/music/selected',{cache:'no-store'});const d=r.ok?await r.json():{accountId:'guest',id:null,url:'/ambient.mp3'};const next=d.accountId+'-'+(d.id||'default');if(next!==source||force&&d.id){stop();source=next;audio.src=d.url;loaded=false;blocked=false;audio.load();}sourceReady=true;start();}catch{sourceReady=true;start();}finally{refreshing=false;}}
 addEventListener('garyhub:music-changed',()=>refreshSource());addEventListener('focus',()=>refreshSource());document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshSource();});setInterval(()=>{if(!document.hidden)refreshSource();},10000);
 state();refreshSource();
})();
