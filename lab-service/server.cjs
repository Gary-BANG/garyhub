const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream');
const ROOT = path.join(__dirname, 'public');
const DATA = process.env.LAB_DATA_DIR || '/data';
const CALENDAR = process.env.CALENDAR_URL || 'http://calendar-app:3000';
const ORIGIN = process.env.PUBLIC_ORIGIN || 'https://lab.garyhub.uk';
const LIMIT = 24 * 1024 * 1024;
fs.mkdirSync(DATA, {recursive:true, mode:0o700});
function json(res, status, value) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(value)); }
async function calendar(req, route, method='GET', body) {
  return fetch(CALENDAR + route, {method, redirect:'manual', signal:AbortSignal.timeout(10000), headers:{
    cookie:req.headers.cookie || '', 'content-type':'application/json',
    'x-forwarded-proto':'https', 'x-csrf-token':req.headers['x-csrf-token'] || ''
  }, body});
}
async function identity(req) {
  const r = await calendar(req, '/api/me');
  if (r.status === 401 || r.status === 403) return null;
  if (!r.ok) throw Error('Identity service unavailable');
  const {user} = await r.json();
  if (!user || !Number.isSafeInteger(user.id) || user.id < 1) throw Error('Invalid identity');
  return user;
}
async function body(req) {
  let size=0; const chunks=[];
  for await (const chunk of req) { size+=chunk.length; if(size>LIMIT) { const e=Error('Payload too large'); e.status=413; throw e; } chunks.push(chunk); }
  try {return JSON.parse(Buffer.concat(chunks).toString());} catch {const e=Error('Invalid JSON');e.status=400;throw e;}
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.zip':'application/zip','.md':'text/plain; charset=utf-8'};
const server = http.createServer(async (req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','same-origin');
  try {
    const url=new URL(req.url, 'http://localhost');
    if(url.pathname==='/health') return json(res,200,{ok:true,service:'garyhub-lab',version:1});
    if(url.pathname.startsWith('/api/')) {
      res.setHeader('Cache-Control','no-store');
      if(!['GET','HEAD'].includes(req.method) && req.headers.origin!==ORIGIN) return json(res,403,{message:'Origin check failed'});
      const allowed={'/api/csrf':'GET','/api/me':'GET','/api/login':'POST','/api/logout':'POST'};
      if(allowed[url.pathname]===req.method) {
        const payload=req.method==='POST'?JSON.stringify(await body(req)):undefined;
        const upstream=await calendar(req,url.pathname,req.method,payload);
        const cookies=upstream.headers.getSetCookie();
        if(cookies.length) res.setHeader('Set-Cookie',cookies);
        return json(res,upstream.status,await upstream.json());
      }
      if(url.pathname!=='/api/lab/state' || !['GET','PUT'].includes(req.method)) return json(res,404,{message:'Not found'});
      const user=await identity(req);
      if(!user) return json(res,401,{message:'请重新登录；未保存的代码仍留在本机。'});
      const file=path.join(DATA,`user-${user.id}.json`);
      const current=()=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{revision:0,state:null};
      if(req.method==='GET') return json(res,200,{...current(),user});
      const csrf=await calendar(req,'/api/csrf');
      if(!csrf.ok) throw Error('CSRF service unavailable');
      const token=(await csrf.json()).token;
      const supplied=req.headers['x-csrf-token'];
      if(typeof token!=='string'||typeof supplied!=='string'||token.length!==supplied.length||!crypto.timingSafeEqual(Buffer.from(token),Buffer.from(supplied))) return json(res,403,{message:'请刷新登录校验后重试'});
      const input=await body(req);
      if(!Number.isSafeInteger(input.revision)||input.revision<0||!input.state||!Array.isArray(input.state.custom)||!Array.isArray(input.state.instances)||!Array.isArray(input.state.history)||!input.state.images||typeof input.state.images!=='object') return json(res,400,{message:'Invalid workspace'});
      // Synchronous compare + durable replace keeps a single process's writes serialized.
      const old=current();
      if(input.revision!==old.revision) return json(res,409,{message:'另一页面或设备已更新进度。请先导出本机备份，再重新加载云端。'});
      const next={revision:old.revision+1,state:input.state,updatedAt:new Date().toISOString()};
      const tmp=file+'.tmp'; const fd=fs.openSync(tmp,'w',0o600);
      try {fs.writeFileSync(fd,JSON.stringify(next));fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
      fs.renameSync(tmp,file);
      return json(res,200,{revision:next.revision,updatedAt:next.updatedAt});
    }
    if(!['GET','HEAD'].includes(req.method)) return json(res,405,{message:'Method not allowed'});
    if(url.pathname==='/lab' || url.pathname==='/lab/' || url.pathname==='/lab/index.html') {
      if(!await identity(req)) {res.writeHead(302,{Location:'/login.html','Cache-Control':'no-store'});return res.end();}
      if(url.pathname==='/lab') {res.writeHead(302,{Location:'/lab/'});return res.end();}
    }
    let name=decodeURIComponent(url.pathname); if(name.endsWith('/')) name+='index.html';
    const file=path.resolve(ROOT,'.'+name);
    if(!file.startsWith(ROOT+path.sep)) return json(res,404,{message:'Not found'});
    const stat=fs.statSync(file); if(!stat.isFile()) return json(res,404,{message:'Not found'});
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':name.includes('/vendor/')?'public, max-age=86400':'no-store'});
    if(req.method==='HEAD')return res.end();
    pipeline(fs.createReadStream(file),res,()=>{});
  } catch(e) {if(!res.headersSent)json(res,e.code==='ENOENT'?404:e.status||503,{message:e.code==='ENOENT'?'Not found':e.status?e.message:'服务暂时不可用，请稍后重试。'});else res.destroy();}
});
server.listen(Number(process.env.PORT||3000),'0.0.0.0');
