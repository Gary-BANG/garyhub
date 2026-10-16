'use strict';
const fs=require('node:fs'),path=require('node:path');
const URL='https://api.frankfurter.dev/v2/rate/usd/cny';
function scaled(rate){if(typeof rate!=='number'||!Number.isFinite(rate)||rate<0.01||rate>1000)throw Error('Invalid rate');return BigInt(Math.round(rate*1e8));}
function convert(cents,from,to,rate){if(!Number.isSafeInteger(cents)||cents<0||!['USD','CNY'].includes(from)||!['USD','CNY'].includes(to))throw Error('Invalid money');if(from===to)return cents;const n=scaled(rate),d=100000000n,a=BigInt(cents),numerator=from==='USD'?a*n:a*d,denominator=from==='USD'?d:n;const value=(numerator+denominator/2n)/denominator;if(value>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Converted amount too large');return Number(value);}
function createFx({dataDir,fetcher=fetch,clock=Date.now,endpoint=process.env.NODE_ENV==='test'&&process.env.FX_TEST_URL||URL}){
 const file=path.join(dataDir,'fx-current.json');let cached=null,pending=null,nextTry=0,lastError=false;
 function valid(v){if(v?.base!=='USD'||v?.quote!=='CNY'||!/^\d{4}-\d\d-\d\d$/.test(v.date)||v.date>new Date(clock()).toISOString().slice(0,10)||!Number.isFinite(Date.parse(v.date+'T00:00:00Z'))||new Date(v.date+'T00:00:00Z').toISOString().slice(0,10)!==v.date)throw Error('Invalid rate date');return {...v,rate:Number(scaled(v.rate))/1e8};}
 try{cached=valid(JSON.parse(fs.readFileSync(file,'utf8')));}catch{}
 function output(error){return cached?{available:true,rate:cached.rate,date:cached.date,base:'USD',quote:'CNY',source:'Frankfurter · 官方参考汇率汇总',sourceUrl:'https://frankfurter.dev/',fetchedAt:cached.fetchedAt,stale:cached.date!==new Date(clock()).toISOString().slice(0,10),refreshError:!!error}:{available:false,source:'Frankfurter',error:'暂时无法获取有效汇率；仍可记录和查看原币账目'};}
 async function refresh(){try{const r=await fetcher(endpoint,{signal:AbortSignal.timeout(6000),redirect:'error'});if(!r.ok)throw Error('Rate service');const text=await r.text();if(text.length>12000)throw Error('Rate response too large');const v=valid(JSON.parse(text));cached={base:'USD',quote:'CNY',rate:v.rate,date:v.date,fetchedAt:new Date(clock()).toISOString()};fs.mkdirSync(dataDir,{recursive:true,mode:0o700});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(cached),{mode:0o600});fs.renameSync(tmp,file);lastError=false;return output(false);}catch{lastError=true;nextTry=clock()+60000;return output(true);}finally{pending=null;}}
 return {async get(){const today=new Date(clock()).toISOString().slice(0,10);if(cached?.date===today)return output(false);if(pending)return pending;if(clock()<nextTry)return output(lastError||!cached);nextTry=clock()+3600000;pending=refresh();return pending;}};
}
module.exports={createFx,convert,scaled,URL};
