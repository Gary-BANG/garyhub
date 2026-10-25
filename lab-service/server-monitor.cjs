'use strict';
const fs=require('node:fs');
function createMonitor({identity,calendar,json}){
 return async(req,res,url)=>{
  if(url.pathname!=='/api/server-monitor')return false;
  const user=await identity(req);if(!user){json(res,401,{message:'请先登录'});return true;}if(user.role!=='admin'){json(res,403,{message:'需要管理员权限'});return true;}
  if(req.method!=='GET'){json(res,405,{message:'Method not allowed'});return true;}
  try{
   const file=process.env.SERVER_METRICS_FILE||'/server-metrics/status.json',stat=fs.statSync(file);if(stat.size>3*1024*1024)throw Error('Snapshot too large');
   const data=JSON.parse(fs.readFileSync(file,'utf8'));if(data.schema!==1||(!Number.isFinite(Date.parse(data.generatedAt))||Date.parse(data.generatedAt)>Date.now()+5000))throw Error('Invalid metrics');
   const upstream=await calendar(req,'/api/hub/admin/users');if(!upstream.ok)throw Error('Identity check failed');
   const names=new Map((await upstream.json()).map(u=>[u.id,u.username]));
   if(data.vpn?.users)data.vpn.users=data.vpn.users.map(u=>({...u,username:names.get(u.userId)||`User #${u.userId}`}));
   data.stale=Date.now()-Date.parse(data.generatedAt)>120000;json(res,200,data);
  }catch{json(res,503,{message:'监控采集尚未就绪。请检查本机采集服务；这里不会显示模拟数据。'});}return true;
 };
}
module.exports={createMonitor};
