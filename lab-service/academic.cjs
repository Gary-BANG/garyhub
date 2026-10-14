'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const A=require('./public/academic/core.js');
const RELEASE='v1.3.3.2';
const err=(status,message)=>Object.assign(Error(message),{status});
function atomic(file,value){const tmp=file+'.'+crypto.randomUUID()+'.tmp';const fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);}
async function readBody(req,max=24*1024*1024){let size=0;const parts=[];for await(const p of req){size+=p.length;if(size>max)throw err(413,'上传内容过大');parts.push(p);}try{return JSON.parse(Buffer.concat(parts).toString());}catch{throw err(400,'请求格式无效');}}
function makeStore(dir){fs.mkdirSync(dir,{recursive:true,mode:0o700});function file(uid){if(!Number.isSafeInteger(uid)||uid<1)throw err(401,'登录身份无效');return path.join(dir,'user-'+uid+'.json');}return {read(uid){const p=file(uid);return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):{revision:0,state:A.empty()};},save(uid,input){if(input.accountId!==uid)throw err(409,'登录账号已变化，请先导出未保存内容，再重新登录');try{A.validate(input.state);}catch(e){throw err(400,e.message);}const old=this.read(uid);if(!Number.isSafeInteger(input.revision)||input.revision!==old.revision)throw err(409,'另一页面已更新资料，请导出当前内容后重新加载，避免覆盖');const next={revision:old.revision+1,state:input.state,updatedAt:new Date().toISOString()};atomic(file(uid),next);return next;}};}
async function github(input,fetcher=fetch){
 const {owner,repo,branch,folder='',token=''}=input;
 if(!/^[A-Za-z0-9-]{1,100}$/.test(owner||'')||!/^[-\w.]{1,100}$/.test(repo||'')||typeof branch!=='string'||!branch||branch.length>200||typeof token!=='string'||token.length>1000||(folder&&!A.safePath(folder)))throw err(400,'仓库、分支或目录格式无效');
 const headers={Accept:'application/vnd.github+json','User-Agent':'GaryHub-Study',...(token?{Authorization:'Bearer '+token}:{})};
 async function api(suffix){const r=await fetcher('https://api.github.com/repos/'+encodeURIComponent(owner)+'/'+encodeURIComponent(repo)+suffix,{headers,redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw err(r.status===404?404:502,r.status===404?'仓库、分支不存在，或私有仓库尚未授权':r.status===403||r.status===429?'GitHub 访问受限，请稍后重试或使用只读令牌':'GitHub 读取失败（'+r.status+'）');const data=await r.text();if(data.length>10*1024*1024)throw err(413,'仓库目录过大，请选择更小的仓库');return JSON.parse(data);}
 const commit=await api('/commits/'+encodeURIComponent(branch));const tree=await api('/git/trees/'+commit.commit.tree.sha+'?recursive=1');if(tree.truncated)throw err(413,'仓库目录过大，暂无法完整读取；请上传课程文件夹');
 const prefix=folder?folder+'/':'';const entries=tree.tree.filter(x=>x.type==='blob'&&x.path.startsWith(prefix)&&/\.(md|markdown|png|jpe?g|webp|gif)$/i.test(x.path));
 if(entries.length>500||entries.reduce((s,x)=>s+(x.size||0),0)>12*1024*1024)throw err(413,'所选目录超过 500 个文件或 12 MB，请缩小目录');
 const files=[];let bytes=0;for(const x of entries){if(x.size>4*1024*1024)throw err(413,'单个文件超过 4 MB：'+x.path);const b=await api('/git/blobs/'+x.sha);if(b.encoding!=='base64')throw err(502,'GitHub 返回了不支持的文件编码');const data=Buffer.from(b.content,'base64');bytes+=data.length;if(bytes>12*1024*1024)throw err(413,'导入总量超过 12 MB');const relative=x.path.slice(prefix.length);if(!A.safePath(relative))continue;if(/\.(md|markdown)$/i.test(relative))files.push({path:relative,content:data.toString('utf8'),sha:x.sha});else{const ext=relative.split('.').pop().toLowerCase();files.push({path:relative,data:'data:image/'+(ext==='jpg'?'jpeg':ext)+';base64,'+data.toString('base64'),sha:x.sha});}}
 return {files,commit:commit.sha,source:{owner,repo,branch,folder},syncedAt:new Date().toISOString()};
}
function createAcademic({DATA,identity,validCsrf,calendar,json}){
 const dir=path.join(DATA,'academic'),store=makeStore(dir),busy=new Set(),lastGithub=new Map();
 const origins=new Set(['https://tools.garyhub.uk','https://lab.garyhub.uk']);if(process.env.ACADEMIC_TEST_ORIGIN)origins.add(process.env.ACADEMIC_TEST_ORIGIN);
 return async function(req,res,url){
 if(url.pathname==='/academic/release.json'){json(res,200,{version:RELEASE});return true;}
 if(!url.pathname.startsWith('/api/academic/'))return false;
 try{
 const route=url.pathname.slice('/api/academic/'.length),write=!['GET','HEAD'].includes(req.method);
 if(write&&!origins.has(req.headers.origin))throw err(403,'请求来源校验失败');
 // Authentication proxies reuse the same Calendar cookie and session.
 if(['login','logout','csrf'].includes(route)){
  const method=route==='csrf'?'GET':'POST';if(req.method!==method)throw err(405,'请求方法不支持');
  const data=method==='POST'?await readBody(req,8192):undefined;
  if(method==='POST'&&!await validCsrf(req))throw err(403,'登录校验已失效，请刷新');
  const r=await calendar(req,'/api/'+route,method,data?JSON.stringify(data):undefined);const cookies=r.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);json(res,r.status,await r.json());return true;
 }
 const user=await identity(req);if(!user)throw err(401,'请先登录 GaryHub');
 if(write&&!await validCsrf(req))throw err(403,'页面校验已失效，请刷新');
 if(route==='state'&&req.method==='GET'){const profile=await calendar(req,'/api/account/email');if(profile.ok){const info=await profile.json();if(typeof info.timezone==='string')user.timezone=info.timezone;}json(res,200,{...store.read(user.id),user});return true;}
 const input=write?await readBody(req,route==='state'?24*1024*1024:16000):null;
 if(write&&input.accountId!==user.id)throw err(409,'登录账号已变化，请重新加载后操作');
 if(route==='state'&&req.method==='PUT'){const next=store.save(user.id,input);json(res,200,{revision:next.revision,updatedAt:next.updatedAt});return true;}
 if(route==='github'&&req.method==='POST'){
  if(busy.has('gh-'+user.id)||Date.now()-(lastGithub.get(user.id)||0)<15000)throw err(429,'请等待当前导入结束，或 15 秒后重试');busy.add('gh-'+user.id);lastGithub.set(user.id,Date.now());try{json(res,200,await github(input));}finally{busy.delete('gh-'+user.id);}return true;
 }
 if(route==='calendar'&&req.method==='GET'){
  const [a,b,p]=await Promise.all([calendar(req,'/api/categories'),calendar(req,'/api/tasks'),calendar(req,'/api/account/email')]);if(!a.ok||!b.ok||!p.ok)throw err(502,'Calendar 暂不可用');const profile=await p.json();try{if(typeof profile.timezone!=='string'||!profile.timezone)throw Error('timezone');new Intl.DateTimeFormat('en',{timeZone:profile.timezone}).format();}catch{throw err(502,'账号时区无效，请先在 Calendar 设置');}user.timezone=profile.timezone;const tasks=(await b.json()).filter(t=>t.user_id===user.id);json(res,200,{categories:await a.json(),tasks,user});return true;
 }
 if(route==='calendar'&&req.method==='POST'){
  if(!/^[-\w]{10,90}$/.test(input.requestId||''))throw err(400,'事项请求编号无效');
  const state=store.read(user.id).state,c=state.courses.find(x=>x.id===input.courseId),l=c?.lectures.find(x=>x.id===input.lectureId);if(!l)throw err(404,'请先保存课程和讲义');
  const key=user.id+'-'+input.requestId,ledger=path.join(dir,'calendar-'+key+'.json');
  if(fs.existsSync(ledger)){const old=JSON.parse(fs.readFileSync(ledger));if(old.task){json(res,200,{task:old.task,reused:true});return true;}throw err(409,'这次请求的结果尚未确认。请在 Calendar 检查是否已创建，避免重复提交。');}
  if(busy.has(key))throw err(409,'正在创建事项，请稍候');
  const fields=input.task||{};const task={title:fields.title,start_date:fields.start_date,end_date:fields.end_date,note:fields.note,category_id:fields.category_id||null,reminder_enabled:fields.reminder_enabled===true,reminder:fields.reminder,status:'todo'};
  if(typeof task.title!=='string'||task.title.length>160||typeof task.note!=='string'||task.note.length>4000||!/^\d{4}-\d{2}-\d{2}$/.test(task.start_date)||!/^\d{4}-\d{2}-\d{2}$/.test(task.end_date)||task.end_date<task.start_date)throw err(400,'请检查事项标题及日期');
  busy.add(key);atomic(ledger,{courseId:c.id,lectureId:l.id,createdAt:new Date().toISOString(),status:'pending'});
  try{const r=await calendar(req,'/api/tasks','POST',JSON.stringify(task));const value=await r.json();if(!r.ok){if(r.status<500)fs.unlinkSync(ledger);throw err(r.status,value.message||'Calendar 保存失败');}atomic(ledger,{courseId:c.id,lectureId:l.id,task:value,status:'complete'});json(res,201,{task:value});}finally{busy.delete(key);}return true;
 }
 if(route==='links'&&req.method==='GET'){const result=[];for(const name of fs.readdirSync(dir)){if(name.startsWith('calendar-'+user.id+'-')&&name.endsWith('.json')){const x=JSON.parse(fs.readFileSync(path.join(dir,name)));if(x.task)result.push({courseId:x.courseId,lectureId:x.lectureId,taskId:x.task.id});}}json(res,200,{links:result});return true;}
 throw err(404,'接口不存在');
 }catch(e){json(res,e.status||503,{message:e.status?e.message:'服务暂不可用，请稍后重试'});return true;}
 };
}
module.exports={createAcademic,makeStore,github,RELEASE};
