const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream');
const { createAccessStore } = require('./access-store.cjs');
const { createConnections } = require('./access-connection.cjs');
const auth = require('./public/auth-redirect.js');
const ROOT = path.join(__dirname, 'public');
const DATA = process.env.LAB_DATA_DIR || '/data';
const CALENDAR = process.env.CALENDAR_URL || 'http://calendar-app:3000';
const ORIGIN = process.env.PUBLIC_ORIGIN || 'https://lab.garyhub.uk';
const TRUSTED = new Set(['https://garyhub.uk','https://tools.garyhub.uk','https://lab.garyhub.uk','https://calendar.garyhub.uk']);
const LIMIT = 24 * 1024 * 1024;
fs.mkdirSync(DATA, {recursive:true, mode:0o700});
const access = createAccessStore(DATA);
const connections=createConnections(access,process.env.ACCESS_RUNTIME_FILE||'/access-runtime/status.json',process.env.ACCESS_SUB_ORIGIN||ORIGIN);
function json(res, status, value) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(value)); }
async function calendar(req, route, method='GET', body) {
  return fetch(CALENDAR + route, {method, redirect:'manual', signal:AbortSignal.timeout(10000), headers:{
    cookie:req.headers.cookie || '', 'content-type':'application/json',
    'x-forwarded-proto':'https', origin:req.headers.origin||'', 'x-forwarded-for':(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',').at(-1).trim(), 'x-csrf-token':req.headers['x-csrf-token'] || ''
  }, body});
}
async function identity(req) {
  const r = await calendar(req, '/api/me');
  if (r.status === 401 || r.status === 403) return null;
  if (!r.ok) throw Error('Identity service unavailable');
  const {user} = await r.json();
  if (!user || !Number.isSafeInteger(user.id) || user.id < 1) throw Error('Invalid identity');
  if(fs.existsSync(path.join(DATA,'.deleting-user-'+user.id)))return null;
  if(user.mustChangePassword)throw Object.assign(Error('请先修改临时密码'),{status:428});
  return user;
}
async function body(req) {
  const maxSize=req.url.startsWith('/api/lab/distribution')||req.url.startsWith('/api/access/')||req.url.startsWith('/api/hub/totp')||req.url.startsWith('/api/password-reset/')?8192:LIMIT;
  let size=0; const chunks=[];
  for await (const chunk of req) { size+=chunk.length; if(size>maxSize) { const e=Error('Payload too large'); e.status=413; throw e; } chunks.push(chunk); }
  try {return JSON.parse(Buffer.concat(chunks).toString());} catch {const e=Error('Invalid JSON');e.status=400;throw e;}
}
async function validCsrf(req) {
  const csrf=await calendar(req,'/api/csrf');
  if(!csrf.ok) throw Error('CSRF service unavailable');
  const token=(await csrf.json()).token;
  const supplied=req.headers['x-csrf-token'];
  return typeof token==='string' && typeof supplied==='string' && /^[0-9a-f]{64}$/.test(token) && /^[0-9a-f]{64}$/.test(supplied) && crypto.timingSafeEqual(Buffer.from(token,'hex'),Buffer.from(supplied,'hex'));
}
function storeUrl() {
  try {const configured=access.settings().storeUrl;const url=new URL(configured===undefined?process.env.ACCESS_STORE_URL:configured);return url.protocol==='https:'?url.href:null;} catch {return null;}
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.zip':'application/zip','.md':'text/plain; charset=utf-8'};
const academic = require('./academic.cjs').createAcademic({DATA,identity,validCsrf,calendar,json});
const profileHandler=require("./homepage-privacy.cjs").createProfile({calendar,json});
const cleanup=require('./user-cleanup.cjs').createCleanup({DATA,CALENDAR,access,identity,validCsrf,calendar,json,body,runtimeFile:process.env.ACCESS_RUNTIME_FILE||'/access-runtime/status.json'});
const distribution=require('./lab-distribution.cjs').createDistribution({DATA,ROOT,identity,validCsrf,calendar,json,body});
const server = http.createServer(async (req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','same-origin');
  try {
    const url=new URL(req.url, 'http://localhost');
    const host=(req.headers.host||'').split(':')[0];
    const publicOrigin=['garyhub.uk','tools.garyhub.uk','lab.garyhub.uk'].includes(host)?'https://'+host:'https://tools.garyhub.uk';
    const redirectLogin=target=>{res.writeHead(302,{Location:auth.loginUrl(target,publicOrigin),'Cache-Control':'no-store'});res.end();};
    if(['/login','/login/','/login.html'].includes(url.pathname))return redirectLogin(url.searchParams.get('next')||(host==='garyhub.uk'?'/':'/lab/'));

    if(await profileHandler(req,res,url))return;
    if(await cleanup(req,res,url))return;
    if(await distribution(req,res,url))return;
    if(await academic(req,res,url))return;
    if(['/grades','/grades/','/study','/study/'].includes(url.pathname))url.pathname='/academic/index.html';
    url.pathname=decodeURIComponent(url.pathname);
    if(url.pathname==='/health') return json(res,200,{ok:true,service:'garyhub-lab',version:1,accessVersion:2,hubVersion:"1.4.0.1"});
    if(url.pathname.startsWith('/sub/')) {
      if(req.method!=='GET') return json(res,405,{message:'Method not allowed'});
      const sub=connections.subscription(url.pathname.slice(5));
      if(!sub)return json(res,404,{message:'订阅不可用、未开通或已到期'});
      res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','profile-update-interval':'1',...(sub.expires?{'subscription-userinfo':`expire=${sub.expires}`}:{})});
      return res.end(sub.body);
    }
    if(url.pathname.startsWith('/api/')) {
      res.setHeader('Cache-Control','no-store');
      if(!['GET','HEAD'].includes(req.method) && !TRUSTED.has(req.headers.origin)) return json(res,403,{message:'Origin check failed'});
      if(url.pathname==='/api/hub/academics' && req.method==='GET') {
        const upstream=await calendar(req,'/api/hub/profile-access');
        if(!upstream.ok)return json(res,upstream.status,{allowed:false});
        if(!(await upstream.json()).allowed.includes('academics'))return json(res,200,{allowed:false});
        const p=JSON.parse(fs.readFileSync(path.join(__dirname,'profile-private.json'),'utf8'));
        return json(res,200,{allowed:true,gpa:p.gpa,rank:p.rank});
      }
      const profileRoute=/^\/api\/hub\/(?:profile-access|profile-unlock|profile-lock|admin\/profile-privacy|admin\/profile-revoke)$/.test(url.pathname);
      const hubRoute=/^\/api\/hub\/(?:me|notifications(?:\/\d+\/read)?|admin\/users(?:\/\d+\/(?:academics|status|reset-password|deletion-preview|tier))?)$/.test(url.pathname);
      const registrationRoute=/^\/api\/admin\/register-requests(?:\/\d+\/(?:approve|reject))?$/.test(url.pathname);
      if(hubRoute||registrationRoute||profileRoute){
        if(!['GET','POST','PUT'].includes(req.method))return json(res,405,{message:'Method not allowed'});
        const payload=req.method==='GET'?undefined:JSON.stringify(await body(req));
        const upstream=await calendar(req,url.pathname+url.search,req.method,payload);
        const cookies=upstream.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
        return json(res,upstream.status,await upstream.json());
      }
      if(/^\/api\/password-reset\/(request|verify|complete)$/.test(url.pathname)&&req.method==='POST'){
        const payload=JSON.stringify(await body(req));const upstream=await calendar(req,url.pathname,'POST',payload);
        return json(res,upstream.status,await upstream.json());
      }
      const allowed={'/api/csrf':'GET','/api/me':'GET','/api/login':'POST','/api/logout':'POST'};
      if(allowed[url.pathname]===req.method) {
        const payload=req.method==='POST'?JSON.stringify(await body(req)):undefined;
        const upstream=await calendar(req,url.pathname,req.method,payload);
        const cookies=upstream.headers.getSetCookie();
        if(cookies.length) res.setHeader('Set-Cookie',cookies);
        return json(res,upstream.status,await upstream.json());
      }
      if(url.pathname.startsWith('/api/access/')) {
        const user=await identity(req);
        if(!user) return json(res,401,{message:'请使用 Calendar 账号登录'});
        if(url.pathname==='/api/access/status' && req.method==='GET') return json(res,200,{user:{id:user.id,username:user.username,role:user.role},grant:connections.status(user.id),storeUrl:storeUrl(),syncHealthy:connections.healthy()});
        if(url.pathname==='/api/access/redeem' && req.method==='POST') {
          if(!await validCsrf(req)) return json(res,403,{message:'请刷新登录校验后重试'});
          const input=await body(req);
          access.redeem(user.id,input.code);
          return json(res,200,{grant:connections.status(user.id)});
        }
        if(url.pathname==='/api/access/rotate'&&req.method==='POST') {
          if(!await validCsrf(req))return json(res,403,{message:'请刷新登录校验后重试'});
          access.rotate(user.id);return json(res,200,{ok:true});
        }
        if(['/api/access/admin/grants','/api/access/admin/revoke','/api/access/admin/settings'].includes(url.pathname)) {
          if(user.role!=='admin')return json(res,403,{message:'需要管理员权限'});
          if(req.method==='GET'&&url.pathname.endsWith('/grants'))return json(res,200,{grants:access.listGrants()});
          if(req.method==='GET'&&url.pathname.endsWith('/settings'))return json(res,200,{storeUrl:storeUrl()});
          if(req.method!=='POST')return json(res,405,{message:'Method not allowed'});
          if(!await validCsrf(req))return json(res,403,{message:'请刷新登录校验后重试'});
          const input=await body(req);
          if(url.pathname.endsWith('/revoke'))access.revoke(user.id,input.userId);
          else if(url.pathname.endsWith('/settings'))access.setStore(user.id,input.storeUrl);
          else return json(res,405,{message:'Method not allowed'});
          return json(res,200,{ok:true});
        }
        if(url.pathname==='/api/access/admin/codes' && ['GET','POST'].includes(req.method)) {
          if(user.role!=='admin') return json(res,403,{message:'需要管理员权限'});
          if(req.method==='GET') return json(res,200,{codes:access.listCodes()});
          if(!await validCsrf(req)) return json(res,403,{message:'请刷新登录校验后重试'});
          const input=await body(req);
          return json(res,201,{codes:access.createCodes(user.id,input.duration,input.count)});
        }
        return json(res,404,{message:'Not found'});
      }
      if(url.pathname!=='/api/lab/state' || !['GET','PUT'].includes(req.method)) return json(res,404,{message:'Not found'});
      const user=await identity(req);
      if(!user) return json(res,401,{message:'请重新登录；未保存的代码仍留在本机。'});
      const file=path.join(DATA,`user-${user.id}.json`);
      const current=()=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{revision:0,state:null};
      if(req.method==='GET') return json(res,200,{...current(),user});
      if(!await validCsrf(req)) return json(res,403,{message:'请刷新登录校验后重试'});
      const input=await body(req);
      if(input.accountId!==user.id)return json(res,409,{message:'当前登录账号已变化，请先导出本机备份，再重新加载页面'});
      if(!Number.isSafeInteger(input.revision)||input.revision<0||!input.state||!Array.isArray(input.state.custom)||!Array.isArray(input.state.instances)||!Array.isArray(input.state.history)||!input.state.images||typeof input.state.images!=='object') return json(res,400,{message:'Invalid workspace'});
      // Synchronous compare + durable replace keeps a single process's writes serialized.
      if(fs.existsSync(path.join(DATA,'.deleting-user-'+user.id)))return json(res,409,{message:'账号正在删除'});
      const old=current();
      if(input.revision!==old.revision) return json(res,409,{message:'另一页面或设备已更新进度。请先导出本机备份，再重新加载云端。'});
      const next={revision:old.revision+1,state:input.state,updatedAt:new Date().toISOString()};
      const tmp=file+'.tmp'; const fd=fs.openSync(tmp,'w',0o600);
      try {fs.writeFileSync(fd,JSON.stringify(next));fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
      fs.renameSync(tmp,file);
      return json(res,200,{revision:next.revision,updatedAt:next.updatedAt});
    }
    if(!['GET','HEAD'].includes(req.method)) return json(res,405,{message:'Method not allowed'});
    if(/^\/useful\/(image-eraser|markdown-viewer|pdf-gray)(?:\/|\/index.html)?$/.test(url.pathname)){
      if(!await identity(req))return redirectLogin(url.pathname+url.search);
      if(!url.pathname.endsWith('/')&&!url.pathname.endsWith('.html')){res.writeHead(302,{Location:url.pathname+'/'});return res.end();}
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'");
    }
    if(url.pathname==='/lab' || url.pathname==='/lab/' || url.pathname==='/lab/index.html' || url.pathname==='/access' || url.pathname==='/access/' || url.pathname==='/access/index.html') {
      if(!await identity(req)) {return redirectLogin(url.pathname+url.search);}
      if(url.pathname==='/lab') {res.writeHead(302,{Location:'/lab/'});return res.end();}
      if(url.pathname==='/access') {res.writeHead(302,{Location:'/access/'});return res.end();}
    }
    if(url.pathname==='/admin/' || url.pathname==='/admin' || url.pathname==='/admin.html' || url.pathname==='/admin/index.html') {
      const user=await identity(req);
      if(!user){return redirectLogin('/admin/'+url.search);}
      if(user.role!=='admin')return json(res,403,{message:'需要管理员权限'});
    }
    const isHome=(req.headers.host||'').split(':')[0]==='garyhub.uk';
    if(isHome&&!['/','/index.html','/hub-account.js','/auth-redirect.js','/hub-account.css','/profile-privacy.js','/profile-privacy.css','/login.html','/login.js','/password-reset.js','/password-reset.css','/hub.css','/i18n/dictionary.js','/i18n/i18n.js','/i18n/i18n.css'].includes(url.pathname))return json(res,404,{message:'Not found'});
    let name=decodeURIComponent(url.pathname); if(name.endsWith('/')) name+='index.html';
    if(isHome&&name==='/index.html')name='/homepage.html';
    if(['/admin','/admin/','/admin/index.html'].includes(name))name='/admin.html';
    const file=path.resolve(ROOT,'.'+name);
    if(!file.startsWith(ROOT+path.sep)) return json(res,404,{message:'Not found'});
    const stat=fs.statSync(file); if(!stat.isFile()) return json(res,404,{message:'Not found'});
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':name.includes('/vendor/')?'public, max-age=86400':'no-store'});
    if(req.method==='HEAD')return res.end();
    pipeline(fs.createReadStream(file),res,()=>{});
  } catch(e) {if(e.status===428&&!req.url.startsWith('/api/')){res.writeHead(302,{Location:'https://calendar.garyhub.uk/change-password/','Cache-Control':'no-store'});return res.end();}if(!res.headersSent)json(res,e.code==='ENOENT'?404:e.status||503,{message:e.code==='ENOENT'?'Not found':e.status?e.message:'服务暂时不可用，请稍后重试。'});else res.destroy();}
});
server.listen(Number(process.env.PORT||3000),'0.0.0.0');
