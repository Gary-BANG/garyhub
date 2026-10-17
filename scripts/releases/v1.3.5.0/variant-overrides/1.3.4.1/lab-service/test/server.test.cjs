const {test}=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {spawn}=require('node:child_process');
test('authenticated storage, isolation, CSRF, conflicts and durable restart',async t=>{
const data=fs.mkdtempSync(path.join(os.tmpdir(),'garyhub-lab-test-'));const token='a'.repeat(64);
const auth=http.createServer((req,res)=>{const id=Number((req.headers.cookie||'').replace('id=',''));res.setHeader('Content-Type','application/json');if(req.url==='/api/csrf')return res.end(JSON.stringify({token}));if(![1,2].includes(id)){res.writeHead(401);return res.end('{}');}res.end(JSON.stringify({user:{id,username:'user'+id,role:'user'}}));});await new Promise(r=>auth.listen(0,'127.0.0.1',r));
const free=http.createServer();await new Promise(r=>free.listen(0,'127.0.0.1',r));const port=free.address().port;await new Promise(r=>free.close(r));
let proc;async function start(){proc=spawn(process.execPath,[path.join(__dirname,'../server.cjs')],{env:{...process.env,PORT:String(port),LAB_DATA_DIR:data,CALENDAR_URL:`http://127.0.0.1:${auth.address().port}`,PUBLIC_ORIGIN:'https://lab.garyhub.uk'},stdio:'ignore'});for(let i=0;i<80;i++){try{if((await fetch(`http://127.0.0.1:${port}/health`)).ok)return;}catch{}await new Promise(r=>setTimeout(r,25));}throw Error('Server did not start');}
t.after(async()=>{proc?.kill();await new Promise(r=>auth.close(r));fs.rmSync(data,{recursive:true,force:true});});await start();
const call=(route,id,method='GET',value,extra={})=>fetch(`http://127.0.0.1:${port}${route}`,{method,redirect:'manual',headers:{cookie:id?`id=${id}`:'',origin:'https://lab.garyhub.uk','x-csrf-token':token,'content-type':'application/json',...extra},body:value?JSON.stringify(value):undefined});
assert.equal((await call('/api/lab/state')).status,401);assert.equal((await call('/lab/')).status,302);assert.equal((await call('/api/admin/users',1)).status,404);
const state={custom:[],instances:[],history:[{secret:'private user one'}],images:{},current:null};
assert.equal((await call('/api/lab/state',1,'PUT',{revision:0,state},{origin:'https://evil.example'})).status,403);
assert.equal((await call('/api/lab/state',1,'PUT',{revision:0,state},{'x-csrf-token':'b'.repeat(64)})).status,403);
assert.equal((await call('/api/lab/state',1,'PUT',{revision:0,state})).status,200);
assert.equal((await call('/api/lab/state',1,'PUT',{revision:0,state})).status,409);
assert.equal((await (await call('/api/lab/state',2)).json()).state,null);
assert.equal((await (await call('/api/lab/state?userId=1',2)).json()).state,null);
assert.equal((await (await call('/api/lab/state',1)).json()).state.history[0].secret,'private user one');
assert.equal((await call('/api/lab/state',2,'PUT',{revision:0,state:{}})).status,400);
const concurrent=await Promise.all([call('/api/lab/state',1,'PUT',{revision:1,state}),call('/api/lab/state',1,'PUT',{revision:1,state})]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
await new Promise(r=>{proc.once('exit',r);proc.kill();});await start();assert.equal((await (await call('/api/lab/state',1)).json()).revision,2);
});
