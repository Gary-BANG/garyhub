'use strict';
const assert = require('node:assert/strict');
const base = process.env.CHECK_CALENDAR || 'http://calendar-check:3000';
async function login(name, ip) {
  let cookie = '';
  const request = async (route, options={}) => {
    const r = await fetch(base+route, {...options,headers:{cookie,'x-forwarded-for':ip,...options.headers}});
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
  const appDir=process.env.APP_DIR || '/app';
  require('node:child_process').execFileSync(process.execPath,['--test',appDir+'/test/stock-market.test.js'],{stdio:'inherit'});
  console.log('STOCK HTTP PASS: subscriber gate, account isolation, limits, CSRF, origin, concurrent writes and removal');
})().catch(e=>{console.error(e);process.exit(1);});
