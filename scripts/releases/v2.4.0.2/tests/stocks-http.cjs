'use strict';
const assert = require('node:assert/strict');
const base = process.env.CHECK_CALENDAR || 'http://calendar-check:3000';
async function login(name, ip) {
  let cookie = '';
  const request = async (route, options={}, target=base) => {
    const r = await fetch(target+route, {...options,headers:{cookie,'x-forwarded-for':ip,...options.headers}});
    const updated = r.headers.getSetCookie();
    if(updated.length) cookie = updated.map(v=>v.split(';')[0]).join('; ');
    return r;
  };
  const token=(await (await request('/api/csrf')).json()).token;
  const headers={origin:'https://calendar.garyhub.uk','content-type':'application/json','x-csrf-token':token};
  assert.equal((await request('/api/login',{method:'POST',headers,body:JSON.stringify({username:'check_'+name,password:'Synthetic-Only-2026!'})})).status,200);
  headers['x-csrf-token']=(await (await request('/api/csrf')).json()).token;
  return {request,headers};
}
(async()=>{
  assert.equal((await fetch(base+'/stocks/')).status,401);
  const standard=await login('alice','192.0.2.183');
  for(const route of ['/stocks/','/api/stocks/groups','/api/stocks/search?q=300033','/api/stocks/history?symbol=sz300033','/api/stocks/financials?symbol=sz300033','/api/stocks/intraday?symbol=sz300033','/stocks/charts.js'])
    assert.equal((await standard.request(route)).status,403);
  const {request,headers}=await login('bob','192.0.2.184');
  const hashes=require('./asset-checks.json').stock_asset_sha256;
  const crypto=require('node:crypto');
  for(const [file,hash] of Object.entries(hashes)){
    const response=await request(file==='index.html'?'/stocks/':'/stocks/'+file);
    assert.equal(response.status,200);
    assert.equal(crypto.createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),hash);
  }
  const get=async()=> (await request('/api/stocks/groups')).json();
  const state=await get();
  const write=(groups,extra={},h=headers)=>request('/api/stocks/groups',{method:'PUT',headers:h,body:JSON.stringify({...state,groups,...extra})});
  const group={name:'行情',symbols:['sz300033']};
  assert.equal((await write([group],{accountId:2})).status,409);
  assert.equal((await write([group],{},{...headers,'x-csrf-token':'0'.repeat(64)})).status,403);
  assert.equal((await write([group],{},{...headers,origin:'https://example.org'})).status,403);
  for(const groups of [Array.from({length:4},(_,i)=>({name:String(i),symbols:[]})),
    [{name:'多',symbols:Array.from({length:6},(_,i)=>'sh60000'+i)}],[group,{...group,name:'重复'}]])
    assert.equal((await write(groups)).status,422);
  const winners=await Promise.all([write([group]),write([group])]);
  assert.deepEqual(winners.map(r=>r.status).sort(),[200,409]);
  const saved=await get();assert.deepEqual(saved.groups,[group]);
  assert.equal((await write([],{revision:saved.revision})).status,200);
  for(const route of ['quote','history','intraday','financials']){
    assert.equal((await request('/api/stocks/'+route+'?symbol=INVALID')).status,400);
    assert.equal((await fetch(base+'/api/stocks/'+route+'?symbol=sz300033')).status,401);
  }
  // VIP is a separately revised entitlement; exercise the actual Tools proxy.
  const admin=await login('admin','192.0.2.185'),otherAdmin=await login('otheradmin','192.0.2.186');
  const LAB=process.env.CHECK_LAB || 'http://lab-check:3000';
  const users=await (await admin.request('/api/hub/admin/users')).json();
  const bob=users.find(u=>u.id===3),alice=users.find(u=>u.id===2);
  assert.equal(bob.stock_vip,0);assert.equal(bob.stock_vip_version,0);
  assert.equal((await (await request('/api/stocks/status')).json()).vip,false);
  const route='/api/hub/admin/users/3/stock-vip';
  const value={actorId:1,expectedVersion:bob.auth_version,expectedStockVipVersion:bob.stock_vip_version,vip:true};
  const put=(data=value,h=admin.headers,who=admin,path=route,target=LAB)=>who.request(path,{method:'PUT',headers:h,body:JSON.stringify(data)},target);
  assert.equal((await put(value,headers,{request})).status,403);
  assert.equal((await put({...value,actorId:4})).status,409);
  assert.equal((await put({...value,vip:'yes'})).status,400);
  assert.equal((await put({...value,expectedStockVipVersion:-1})).status,400);
  assert.equal((await put(value,{...admin.headers,'x-csrf-token':'0'.repeat(64)})).status,403);
  assert.equal((await put(value,{...admin.headers,origin:'https://example.org'})).status,403);
  assert.equal((await put({...value,expectedVersion:-1})).status,409);
  const grants=await Promise.all([put(),put({...value,actorId:4},otherAdmin.headers,otherAdmin)]);
  assert.deepEqual(grants.map(r=>r.status).sort(),[200,409]);
  assert.equal((await (await request('/api/stocks/status')).json()).vip,true);
  const updated=(await (await admin.request('/api/hub/admin/users')).json()).find(u=>u.id===3);
  assert.equal(updated.stock_vip_version,1);assert.equal(updated.account_tier,'subscriber');
  assert.equal((await put({...value,vip:false})).status,409);
  assert.equal((await put({...value,vip:false,expectedStockVipVersion:1})).status,200);
  assert.equal((await (await request('/api/stocks/status')).json()).vip,false);
  // Enabling VIP alone does not change account tier or bypass the subscriber gate.
  const aliceValue={actorId:1,expectedVersion:alice.auth_version,expectedStockVipVersion:0,vip:true};
  assert.equal((await put(aliceValue,admin.headers,admin,'/api/hub/admin/users/2/stock-vip')).status,200);
  assert.equal((await standard.request('/api/stocks/status')).status,403);
  assert.equal((await (await request('/api/stocks/status')).json()).accountId,3);
  assert.deepEqual((await get()).groups,[]);
  assert.equal((await put({...value,expectedStockVipVersion:2},admin.headers,admin,'/api/hub/admin/users/999999/stock-vip')).status,404);
  const aliceAfter=(await (await admin.request('/api/hub/admin/users')).json()).find(u=>u.id===2);
  assert.equal((await put({...aliceValue,vip:false,expectedStockVipVersion:aliceAfter.stock_vip_version},admin.headers,admin,'/api/hub/admin/users/2/stock-vip')).status,200);
  const preview=await admin.request('/api/hub/admin/users/3/deletion-preview');
  assert.equal(preview.status,200);assert.equal((await preview.json()).counts.stock_lists,1);
  // Disabling the current account revokes stock reads immediately; enabling it
  // does not lose the separately stored VIP and watch-list records.
  const fresh=(await (await admin.request('/api/hub/admin/users')).json()).find(u=>u.id===3);
  const statusWrite=(enabled,expectedVersion)=>admin.request('/api/hub/admin/users/3/status',{method:'PUT',headers:admin.headers,body:JSON.stringify({actorId:1,enabled,expectedVersion})});
  assert.equal((await statusWrite(false,fresh.auth_version)).status,200);
  assert.equal((await request('/api/stocks/status')).status,401);
  assert.equal((await request('/api/stocks/groups')).status,401);
  assert.equal((await statusWrite(true,fresh.auth_version+1)).status,200);
  const restored=await login('bob','192.0.2.187');
  assert.equal((await (await restored.request('/api/stocks/status')).json()).vip,false);
  assert.deepEqual((await (await restored.request('/api/stocks/groups')).json()).groups,[]);
  const appDir=process.env.APP_DIR || '/app';
  require('node:child_process').execFileSync(process.execPath,['--test',appDir+'/test/stock-market.test.js'],{stdio:'inherit'});
  console.log('STOCK HTTP PASS: subscriber gate, account isolation, limits, CSRF, origin, concurrent writes, VIP grant/revoke, admin identity, Tools proxy, independent tier and removal');
})().catch(e=>{console.error(e);process.exit(1);});
