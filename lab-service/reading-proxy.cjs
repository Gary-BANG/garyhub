'use strict';
const http=require('node:http'),https=require('node:https'),crypto=require('node:crypto');
const {Transform,pipeline}=require('node:stream');
const HOP=new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade','set-cookie']);
function namespace(user){return `gh-r-${user.id}-${crypto.createHash('sha256').update(user.readingUsername).digest('hex').slice(0,12)}-`;}
function cookies(header,prefix){return String(header||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(prefix)).map(x=>x.slice(prefix.length)).join('; ');}
function setCookie(value,prefix){const parts=value.split(';');parts[0]=prefix+parts[0];return parts.filter(x=>!/^\s*(domain|path|samesite|secure|httponly)(=|\s*$)/i.test(x)).join(';')+'; Path=/; Secure; HttpOnly; SameSite=Lax';}
function createReadingProxy({calendar,json}){
 return async(req,res,url)=>{
  if((req.headers.host||'').split(':')[0]!=='rss.garyhub.uk')return false;
  res.setHeader('Cache-Control','no-store');
  const auth=await calendar(req,'/api/hub/tool-auth/reading');
  if(auth.status===401){res.writeHead(302,{Location:'https://calendar.garyhub.uk/login/?next=https%3A%2F%2Frss.garyhub.uk%2F'});res.end();return true;}
  if(!auth.ok){json(res,auth.status,{message:'Reading 需要有效的 GaryHub 订阅权限，或服务暂时不可用。'});return true;}
  const user=await auth.json(),prefix=namespace(user);
  if(!['GET','HEAD','POST','PUT','DELETE'].includes(req.method)){json(res,405,{message:'Method not allowed'});return true;}
  if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!=='https://rss.garyhub.uk'){json(res,403,{message:'Origin check failed'});return true;}
  // Public REST/integration credentials must never override the GaryHub identity.
  if(/^\/(?:v1|fever|google-reader)(?:\/|$)/.test(url.pathname)||url.pathname==='/login'&&req.method==='POST'){json(res,403,{message:'请通过 GaryHub 使用 Reading 网页。'});return true;}
  if(url.pathname==='/logout'){res.writeHead(302,{Location:'https://calendar.garyhub.uk/reading/'});res.end();return true;}
  const base=process.env.MINIFLUX_URL;
  if(!base){json(res,503,{message:'Reading 尚未配置'});return true;}
  const target=new URL(url.pathname+url.search,base),headers={};
  for(const [key,value]of Object.entries(req.headers))if(!HOP.has(key)&&!['host','cookie','authorization','x-auth-token','x-garyhub-user','x-forwarded-for','x-real-ip','x-forwarded-host','x-forwarded-proto'].includes(key))headers[key]=value;
  headers.host='rss.garyhub.uk';headers['x-forwarded-proto']='https';headers['x-forwarded-host']='rss.garyhub.uk';headers['x-garyhub-user']=user.readingUsername;headers.cookie=cookies(req.headers.cookie,prefix);
  const client=target.protocol==='https:'?https:http;
  await new Promise(resolve=>{
   const upstream=client.request(target,{method:req.method,headers,timeout:20000},response=>{
    for(const [key,value]of Object.entries(response.headers))if(!HOP.has(key)&&value!==undefined)res.setHeader(key,value);
    const loc=response.headers.location;
    if(loc){try{const u=new URL(loc,target);if(u.origin===new URL(base).origin)res.setHeader('Location','https://rss.garyhub.uk'+u.pathname+u.search+u.hash);}catch{}}
    if(response.headers['set-cookie'])res.setHeader('Set-Cookie',response.headers['set-cookie'].map(x=>setCookie(x,prefix)));
    res.setHeader('Cache-Control','no-store');res.writeHead(response.statusCode);
    pipeline(response,res,()=>resolve());
   });
   const stop=()=>{if(!res.headersSent)json(res,503,{message:'Reading 暂时不可用'});else res.destroy();resolve();};
   upstream.on('timeout',()=>upstream.destroy());upstream.on('error',stop);
   let size=0;const limiter=new Transform({transform(chunk,enc,cb){size+=chunk.length;if(size>4*1024*1024)cb(Error('Request too large'));else cb(null,chunk);}});
   pipeline(req,limiter,upstream,error=>{if(error)upstream.destroy();});
   res.on('close',()=>upstream.destroy());
  });return true;
 };
}
module.exports={createReadingProxy,namespace,cookies,setCookie};
