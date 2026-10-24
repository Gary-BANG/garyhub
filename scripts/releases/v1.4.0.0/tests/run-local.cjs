'use strict';
/* Keep fixture services and checks in one process tree/network namespace. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn,execFileSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../../..');
const CAL=process.env.FIXTURE_CALENDAR_SOURCE||ROOT+'/calendar-app';
const LAB=process.env.FIXTURE_LAB_SOURCE||ROOT+'/lab-service';
const data=fs.mkdtempSync(path.join(os.tmpdir(),'garyhub-dock-http-'));
const env={...process.env,APP_DIR:CAL,DATA_DIR:data+'/calendar',LAB_DATA_DIR:data+'/lab',
  CHECK_CALENDAR:'http://127.0.0.1:18951',CHECK_LAB:'http://127.0.0.1:18952',CHECK_VERSION:'1.4.0.0',
  CALENDAR_URL:'http://127.0.0.1:18951',SESSION_SECRET:'synthetic-isolated-check-long-enough',
  GARYHUB_TOTP_ENCRYPTION_KEY:Buffer.alloc(32,17).toString('base64'),NODE_ENV:'test',COOKIE_SECURE:'false'};
const children=[];let log='';
async function ready(base){for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error('Synthetic service did not become ready: '+base);}
function start(file,port){const p=spawn(process.execPath,[file],{env:{...env,PORT:String(port)},stdio:['ignore','pipe','pipe']});children.push(p);for(const s of [p.stdout,p.stderr])s.on('data',b=>{log=(log+b.toString()).slice(-5000);});return p;}
(async()=>{
  try{
    execFileSync(process.execPath,[ROOT+'/scripts/releases/v1.3.6.0/tests/seed.cjs'],{env,stdio:'inherit'});
    start(CAL+'/app.js',18951);start(LAB+'/server.cjs',18952);
    await Promise.all([ready(env.CHECK_CALENDAR),ready(env.CHECK_LAB)]);
    execFileSync(process.execPath,[path.join(__dirname,'local-http.cjs')],{env,stdio:'inherit'});
    console.log('LOCAL SERVICES PASS on '+process.version+'; synthetic data only.');
  }catch(error){console.error(log);throw error;}
  finally{for(const p of children)p.kill('SIGTERM');await Promise.all(children.map(p=>new Promise(r=>{if(p.exitCode!==null)r();else p.once('exit',r);})));fs.rmSync(data,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
