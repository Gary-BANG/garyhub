'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const TRUSTED=new Set(['https://tools.garyhub.uk','https://lab.garyhub.uk']);
function createCleanup({DATA,CALENDAR,access,identity,validCsrf,calendar,json,body,runtimeFile}){
 const dir=path.join(DATA,'user-deletions');fs.mkdirSync(dir,{recursive:true,mode:0o700});let running=false;
 const idOK=id=>/^[0-9a-f-]{36}$/.test(id),file=id=>path.join(dir,id+'.json');
 function save(j,force=false){if(!force&&fs.existsSync(file(j.id))){const latest=JSON.parse(fs.readFileSync(file(j.id),'utf8'));if(latest.token&&j.token&&latest.token!==j.token)return;}const tmp=file(j.id)+'.tmp',fd=fs.openSync(tmp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(j));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file(j.id));}
 function readJobs(){return fs.readdirSync(dir).filter(x=>idOK(x.slice(0,-5))&&x.endsWith('.json')).map(x=>JSON.parse(fs.readFileSync(path.join(dir,x),'utf8')));}
 function runtime(){try{return JSON.parse(fs.readFileSync(runtimeFile,'utf8'));}catch{return null;}}
 function clearFiles(uid){
  const academic=path.join(DATA,'academic');
  for(const name of fs.readdirSync(DATA))if(name===`user-${uid}.json`||name.startsWith(`user-${uid}.json.`)){fs.unlinkSync(path.join(DATA,name));}
  if(fs.existsSync(academic))for(const name of fs.readdirSync(academic))if(name===`user-${uid}.json`||name.startsWith(`user-${uid}.json.`)||name.startsWith(`calendar-${uid}-`))fs.unlinkSync(path.join(academic,name));
 }
 async function tick(){if(running)return;running=true;try{for(const j of readJobs()){
  if(j.phase==='complete'||!j.token)continue;
  try{
   if(!Number.isSafeInteger(j.userId)||j.userId<1||!idOK(j.id))throw Error('Invalid deletion job');
   const marker=path.join(DATA,'.deleting-user-'+j.userId);if(!fs.existsSync(marker))fs.writeFileSync(marker,j.id,{mode:0o600,flag:'wx'});
   if(j.phase==='queued'){
    const g=access.privateGrant(j.userId),rt=runtime();j.needsNetwork=!!g||!!rt?.clients?.[j.userId];
    if(g)access.revoke(j.actorId,j.userId);
    j.revokedAt=new Date().toISOString();j.phase='network';j.error=null;save(j);
   }
   if(j.phase==='network'){
    if(j.needsNetwork){const rt=runtime();if(!rt?.ok||rt.error||!rt.clients||Date.parse(rt.updatedAt)<Date.parse(j.revokedAt)||!Number.isFinite(Date.parse(rt.updatedAt))||Date.now()-Date.parse(rt.updatedAt)>90000||Object.hasOwn(rt.clients,String(j.userId)))continue;}
    j.phase='data';save(j);
   }
   if(j.phase==='data'){
    clearFiles(j.userId);access.forgetUser(j.userId);
    const r=await fetch(CALENDAR+'/internal/user-deletions/'+j.id+'/complete',{method:'POST',headers:{'Content-Type':'application/json','X-Deletion-Token':j.token},body:'{}',redirect:'error',signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw Error('Calendar cleanup awaiting retry ('+r.status+')');
    clearFiles(j.userId);j.phase='complete';j.completedAt=new Date().toISOString();delete j.token;delete j.error;save(j);
   }
  }catch(e){j.error='清理尚未完成，后台将自动重试';save(j);}
 }}finally{running=false;}}
 const timer=setInterval(()=>tick().catch(()=>{}),2000);timer.unref();setImmediate(()=>tick().catch(()=>{}));
 return async(req,res,url)=>{
  const match=url.pathname.match(/^\/api\/hub\/admin\/users\/(\d+)\/delete$/),list=url.pathname==='/api/hub/admin/user-deletions';
  if(!match&&!list)return false;
  const user=await identity(req);if(!user){json(res,401,{message:'请先登录'});return true;}if(user.role!=='admin'){json(res,403,{message:'需要管理员权限'});return true;}
  if(list&&req.method==='GET'){
   const r=await calendar(req,url.pathname);if(!r.ok){json(res,r.status,{message:'无法读取删除进度'});return true;}
   const jobs=readJobs(),up=await r.json();json(res,200,{jobs:(Array.isArray(up)?up:up.jobs||[]).map(x=>{const j=jobs.find(j=>j.id===x.id);return {...x,phase:j?.phase||(x.status==='complete'?'complete':'awaiting-retry'),error:j?.error||null};})});return true;
  }
  if(!match||req.method!=='POST'){json(res,405,{message:'请求方法不支持'});return true;}
  if(!TRUSTED.has(req.headers.origin)||!await validCsrf(req)){json(res,403,{message:'页面校验失效，请刷新'});return true;}
  const input=await body(req);if(input.actorId!==user.id){json(res,409,{message:'当前登录账号已变化'});return true;}
  const r=await calendar(req,url.pathname.replace(/\/delete$/,'/delete-start'),'POST',JSON.stringify(input)),v=await r.json();
  if(!r.ok){json(res,r.status,v);return true;}
  if(!idOK(v.id)||!Number.isSafeInteger(v.userId)||!/^[a-f0-9]{64}$/.test(v.token))throw Error('Invalid cleanup ticket');
  const old=readJobs().find(j=>j.id===v.id);const job={...(old||{}),id:v.id,userId:v.userId,actorId:user.id,token:v.token,phase:old?.phase==='complete'?'data':old?.phase||'queued',createdAt:old?.createdAt||new Date().toISOString()};save(job,true);
  json(res,202,{id:v.id,userId:v.userId,message:'账号已停用，正在撤销网络授权并清理数据。可稍后刷新查看结果。'});setImmediate(()=>tick().catch(()=>{}));return true;
 };
}
module.exports={createCleanup};
