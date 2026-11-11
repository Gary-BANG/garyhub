/* GaryHub starfield: three parallax star layers, faint constellation lines near the pointer and
   occasional shooting stars. Pauses while the tab is hidden; draws one still frame for reduced motion.
   <canvas data-cosmos="full|calm"> — calm uses fewer stars and no shooting stars. */
(()=>{'use strict';
 const canvas=document.querySelector('canvas[data-cosmos]');if(!canvas||!canvas.getContext)return;
 const ctx=canvas.getContext('2d'),calm=canvas.dataset.cosmos==='calm';
 const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
 const TINTS=['255,255,255','214,226,255','190,210,255','255,236,214','220,205,255'];
 const LAYERS=[{depth:.15,size:[.35,.9],share:.55},{depth:.4,size:[.6,1.3],share:.32},{depth:.85,size:[.9,1.9],share:.13}];
 let w=0,h=0,dpr=1,stars=[],front=[],meteors=[],frame=0,last=0,nextMeteor=0;
 const pointer={x:.5,y:.5,tx:.5,ty:.5,px:-1e4,py:-1e4,active:false};
 const rand=(a,b)=>a+Math.random()*(b-a);
 function seed(){
  const area=w*h,base=Math.min(calm?260:620,Math.round(area/(calm?5200:2300)));
  stars=[];
  for(const layer of LAYERS){
   const n=Math.round(base*layer.share);
   for(let i=0;i<n;i++)stars.push({x:Math.random()*w,y:Math.random()*h,r:rand(...layer.size),depth:layer.depth,tint:TINTS[Math.random()<.7?0:1+Math.floor(Math.random()*4)],phase:Math.random()*Math.PI*2,speed:rand(.4,1.6),base:rand(.45,.95)});
  }
  front=stars.filter(s=>s.depth>.8);
 }
 function resize(){
  dpr=Math.min(window.devicePixelRatio||1,2);w=canvas.clientWidth;h=canvas.clientHeight;
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);seed();
  if(!running())draw(performance.now());
 }
 function spawnMeteor(now){
  const fromLeft=Math.random()<.5,angle=rand(.32,.62)*(fromLeft?1:-1)+(fromLeft?0:Math.PI);
  meteors.push({x:fromLeft?rand(-.1*w,.55*w):rand(.45*w,1.1*w),y:rand(-.05*h,.35*h),vx:Math.cos(angle)*rand(.75,1.15),vy:Math.abs(Math.sin(angle))*rand(.75,1.15),life:0,ttl:rand(900,1500),len:rand(110,220)});
  nextMeteor=now+rand(3800,9000);
 }
 function draw(now){
  const dt=Math.min(50,now-(last||now));last=now;
  pointer.x+=(pointer.tx-pointer.x)*.04;pointer.y+=(pointer.ty-pointer.y)*.04;
  const ox=(pointer.x-.5)*-46,oy=(pointer.y-.5)*-30-Math.min(window.scrollY,h)*.08;
  ctx.clearRect(0,0,w,h);
  const still=reduce.matches;
  for(const s of stars){
   let x=(s.x+ox*s.depth)%w,y=(s.y+oy*s.depth)%h;if(x<0)x+=w;if(y<0)y+=h;s.sx=x;s.sy=y;
   const a=still?s.base:s.base*(.62+.38*Math.sin(s.phase+now*.001*s.speed));
   ctx.fillStyle='rgba('+s.tint+','+a.toFixed(3)+')';
   if(s.r>1.4){ctx.shadowColor='rgba('+s.tint+',.9)';ctx.shadowBlur=6;}else ctx.shadowBlur=0;
   ctx.beginPath();ctx.arc(x,y,s.r,0,Math.PI*2);ctx.fill();
  }
  ctx.shadowBlur=0;
  // Constellation lines between bright stars near the pointer.
  if(pointer.active&&!still){
   const near=front.filter(s=>(s.sx-pointer.px)**2+(s.sy-pointer.py)**2<200*200);
   ctx.lineWidth=.6;
   for(let i=0;i<near.length;i++)for(let j=i+1;j<near.length;j++){
    const a=near[i],b=near[j],d=Math.hypot(a.sx-b.sx,a.sy-b.sy);
    if(d<150){ctx.strokeStyle='rgba(150,180,255,'+(.32*(1-d/150)).toFixed(3)+')';ctx.beginPath();ctx.moveTo(a.sx,a.sy);ctx.lineTo(b.sx,b.sy);ctx.stroke();}
   }
  }
  if(!calm&&!still){
   if(!nextMeteor)nextMeteor=now+rand(1500,4000);
   if(now>nextMeteor)spawnMeteor(now);
   meteors=meteors.filter(m=>{
    m.life+=dt;m.x+=m.vx*dt;m.y+=m.vy*dt;const t=m.life/m.ttl;if(t>=1)return false;
    const fade=t<.2?t/.2:1-(t-.2)/.8,speed=Math.hypot(m.vx,m.vy),tx=m.x-m.vx/speed*m.len,ty=m.y-m.vy/speed*m.len;
    const g=ctx.createLinearGradient(m.x,m.y,tx,ty);g.addColorStop(0,'rgba(255,255,255,'+(.95*fade).toFixed(3)+')');g.addColorStop(.25,'rgba(170,200,255,'+(.45*fade).toFixed(3)+')');g.addColorStop(1,'rgba(120,150,255,0)');
    ctx.strokeStyle=g;ctx.lineWidth=1.6;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(m.x,m.y);ctx.lineTo(tx,ty);ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,'+fade.toFixed(3)+')';ctx.beginPath();ctx.arc(m.x,m.y,1.6,0,Math.PI*2);ctx.fill();
    return true;
   });
  }
 }
 function loop(now){draw(now);frame=requestAnimationFrame(loop);}
 function running(){return frame!==0;}
 function start(){if(running()||reduce.matches||document.hidden)return;last=0;frame=requestAnimationFrame(loop);}
 function stop(){if(frame)cancelAnimationFrame(frame);frame=0;}
 addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;pointer.tx=e.clientX/Math.max(1,w);pointer.ty=e.clientY/Math.max(1,h);pointer.px=e.clientX;pointer.py=e.clientY;pointer.active=true;},{passive:true});
 document.addEventListener('pointerleave',()=>{pointer.active=false;pointer.tx=pointer.ty=.5;});
 document.addEventListener('visibilitychange',()=>{document.hidden?stop():start();});
 reduce.addEventListener?.('change',()=>{stop();meteors=[];start();if(!running())draw(performance.now());});
 let pending=0;addEventListener('resize',()=>{cancelAnimationFrame(pending);pending=requestAnimationFrame(resize);});
 resize();start();
})();
