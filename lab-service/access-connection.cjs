const fs=require('node:fs');
function createConnections(store, runtimePath, origin) {
  function runtime() {
    try {
      const r=JSON.parse(fs.readFileSync(runtimePath,'utf8'));
      const age=Date.now()-Date.parse(r.updatedAt);
      if(r.ok!==true||!Number.isFinite(age)||age< -5000||age>90000) return null;
      if(r.host!=='vpn.garyhub.uk'||typeof r.wsPath!=='string'||!r.wsPath.startsWith('/')) return null;
      return r;
    } catch {return null;}
  }
  function ready(g,r) {return !!g&&!!r&&store.status(g.userId)?.active&&r.clients?.[String(g.userId)]===g.clientId;}
  function uri(g,r) {
    const q=new URLSearchParams({encryption:'none',security:'tls',sni:r.host,type:'ws',host:r.host,path:r.wsPath});
    return `vless://${g.clientId}@${r.host}:443?${q}#GaryHub-${g.userId}`;
  }
  function status(userId) {
    const g=store.privateGrant(userId), s=store.status(userId), r=runtime();
    if(!g) return null;
    const enabled=ready(g,r);
    return {...s,connectionStatus:!s.active?'inactive':enabled?'ready':'pending',
      subscriptionUrl:enabled?`${origin}/sub/${g.subscriptionToken}`:null,
      connectionUri:enabled?uri(g,r):null};
  }
  function subscription(token) {
    const g=store.byToken(token),r=runtime();
    if(!ready(g,r)) return null;
    return {body:Buffer.from(uri(g,r)+'\n').toString('base64'),expires:g.permanent?null:Math.floor(Date.parse(g.expiresAt)/1000)};
  }
  return {status,subscription,healthy:()=>!!runtime()};
}
module.exports={createConnections};
