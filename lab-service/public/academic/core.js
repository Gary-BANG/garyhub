(function(root,factory){const x=factory();if(typeof module==='object')module.exports=x;else root.Academic=x;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const SCALE=[['A',93,4],['A-',90,3.67],['B+',87,3.33],['B',83,3],['B-',80,2.67],['C+',77,2.33],['C',73,2],['C-',70,1.67],['D+',67,1.33],['D',63,1],['D-',60,.67],['F',0,0]].map(([label,min,gpa])=>({label,min,gpa}));
const copy=x=>JSON.parse(JSON.stringify(x));
const empty=()=>({version:1,courses:[],settings:{scale:copy(SCALE),gradeMax:100,previousCredits:0,previousGpa:0,fontSize:18,lineHeight:1.85,readerWidth:900,theme:'auto'}});
const num=x=>typeof x==='number'&&Number.isFinite(x);
function validate(s){
 const fail=m=>{throw Error(m);};
 if(!s||s.version!==1||!Array.isArray(s.courses)||s.courses.length>100||!s.settings)fail('数据格式不正确（最多 100 门课程）');
 const ids=new Set();const id=x=>{if(typeof x!=='string'||!/^[-\w]{1,90}$/.test(x)||ids.has(x))fail('编号无效或重复');ids.add(x);};
 const text=(x,n)=>{if(typeof x!=='string'||x.length>n)fail('文字超过允许长度');};
 const range=(x,a,b)=>{if(!num(x)||x<a||x>b)fail('数字超出允许范围');};
 function scale(a,max){range(max,1,10000);if(!Array.isArray(a)||!a.length||a.length>30)fail('等第规则不完整');let prev=Infinity;const labels=new Set();for(const r of a){text(r.label,20);if(!r.label.trim()||labels.has(r.label)||!num(r.min)||r.min<0||r.min>max||r.min>=prev)fail('等第门槛需从高到低排列，且不能重复');range(r.gpa,0,10);labels.add(r.label);prev=r.min;}if(a.at(-1).min!==0)fail('最后一个等第门槛应为 0');}
 scale(s.settings.scale,s.settings.gradeMax);range(s.settings.previousCredits,0,10000);range(s.settings.previousGpa,0,10);range(s.settings.fontSize,14,28);range(s.settings.lineHeight,1.4,2.5);range(s.settings.readerWidth,600,1400);if(!['auto','light','dark'].includes(s.settings.theme))fail('主题无效');
 let assets=0;
 for(const c of s.courses){id(c.id);text(c.name,100);if(!c.name.trim())fail('课程名称不能为空');text(c.term,60);if(![1,2,3,4].includes(c.credits))fail('学分请选择 1–4');if(typeof c.includeGpa!=='boolean')fail('GPA 设置无效');scale(c.scale,c.gradeMax);
 if(!Array.isArray(c.categories)||c.categories.length>50||!Array.isArray(c.lectures)||c.lectures.length>500||!Array.isArray(c.assets)||c.assets.length>1000)fail('课程内容过多');
 for(const a of c.categories){id(a.id);text(a.name,100);range(a.weight,0,100);if(!['single','equal','points','custom'].includes(a.mode))fail('成绩计算方式无效');if(!Number.isInteger(a.expected)||a.expected<1||a.expected>300)fail('预计次数需为 1–300');range(a.pendingMax,1,100000);if(!Array.isArray(a.items)||!a.items.length||a.items.length>300||a.expected<a.items.length||(a.mode==='single'&&a.items.length!==1))fail('成绩子项数量无效');
 for(const it of a.items){id(it.id);text(it.name,100);range(it.max,0.01,100000);if(it.score!==null)range(it.score,0,it.max);if(it.sim!==null)range(it.sim,0,it.max);range(it.weight,0,100);}}
 const paths=new Set();for(const l of c.lectures){id(l.id);text(l.title,160);text(l.path,500);if(!safePath(l.path)||paths.has(l.path))fail('讲义路径重复或无效');paths.add(l.path);text(l.content,2000000);assets+=l.content.length;if(!['todo','doing','done'].includes(l.status))fail('学习状态无效');range(l.order,0,100000);range(l.scroll||0,0,10000000);}
 for(const a of c.assets){text(a.path,500);if(!safePath(a.path)||paths.has(a.path))fail('图片路径重复或无效');paths.add(a.path);if(!/^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(a.data)||a.data.length>7000000)fail('图片格式或大小不支持');assets+=a.data.length;}
 if(c.github){for(const k of ['owner','repo','branch','folder'])text(c.github[k]||'',500);}
 }
 if(assets>20*1024*1024)fail('个人讲义和图片合计不能超过 20 MB；请减少大图后重试');
 return s;
}
function safePath(p){return typeof p==='string'&&p.length>0&&!p.startsWith('/')&&!p.includes('\\')&&!p.split('/').some(x=>!x||x==='.'||x==='..')&&!/[\x00-\x1f]/.test(p);}
function units(course){const errors=[],rows=[];let sum=0;
 for(const cat of course.categories){sum+=cat.weight;const n=cat.mode==='single'?1:Math.max(cat.expected,cat.items.length);let denominator;
 if(cat.mode==='custom'){denominator=100;const total=cat.items.reduce((s,i)=>s+i.weight,0);if(Math.abs(total-100)>1e-7||n!==cat.items.length)errors.push(cat.name+'：自定义子项权重必须合计 100%，请列出全部待评分子项');}
 else if(cat.mode==='points')denominator=cat.items.reduce((s,i)=>s+i.max,0)+(n-cat.items.length)*cat.pendingMax;
 else denominator=n;
 for(let k=0;k<n;k++){const item=cat.items[k]||{id:cat.id+'-pending-'+k,name:'待评分 '+(k+1),score:null,sim:null,max:cat.pendingMax,weight:0};const fraction=cat.mode==='custom'?item.weight/100:cat.mode==='points'?item.max/denominator:1/denominator;rows.push({category:cat.name,item,weight:cat.weight*fraction});}}
 if(Math.abs(sum-100)>1e-7)errors.push('课程权重合计 '+Number(sum.toFixed(4))+'%，需要 100% 才能计算完整总评');
 return {rows,errors,weight:sum};
}
function grade(course,percent){if(percent===null)return null;return course.scale.find(r=>percent+1e-9>=r.min/course.gradeMax*100)||course.scale.at(-1);}
function calculate(course,simulation=false){const u=units(course);let earned=0,completed=0;for(const x of u.rows){const score=x.item.score!==null?x.item.score:simulation?x.item.sim:null;if(score!==null){earned+=x.weight*score/x.item.max;completed+=x.weight;}}
 const remaining=Math.max(0,u.weight-completed);const complete=u.errors.length===0&&remaining<1e-7;return {...u,earned,completed,remaining,current:completed?earned/completed*100:null,final:complete?earned:null,letter:complete?grade(course,earned):null};}
function target(course,label,simulation=false){const a=calculate(course,simulation),r=course.scale.find(x=>x.label===label);if(!r||a.errors.length)return {status:'invalid',errors:a.errors};const threshold=r.min/course.gradeMax*100;if(a.remaining<1e-7)return {status:a.earned+1e-9>=threshold?'achieved':'unreachable',required:null};const required=(threshold-a.earned)/a.remaining*100;return {status:required<=0?'achieved':required>100+1e-7?'unreachable':'possible',required:Math.max(0,required),remaining:a.remaining,rows:a.rows.filter(x=>x.item.score===null&&(!simulation||x.item.sim===null)).map(x=>({...x,needed:Math.max(0,required)*x.item.max/100}))};}
function gpa(courses,simulation=false){let points=0,credits=0;for(const c of courses){if(!c.includeGpa)continue;const a=calculate(c,simulation);if(a.letter){points+=c.credits*a.letter.gpa;credits+=c.credits;}}return {credits,points,value:credits?points/credits:null};}
function lectureSort(a,b){return a.order-b.order||a.path.localeCompare(b.path,undefined,{numeric:true,sensitivity:'base'});}
function lectureNumber(p){const m=p.match(/(?:lecture|lec|讲)[\s_\-]*(\d+)/i);return m?Number(m[1]):10000;}
return {SCALE,copy,empty,validate,safePath,units,grade,calculate,target,gpa,lectureSort,lectureNumber};
});
