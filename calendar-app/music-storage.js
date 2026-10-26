'use strict';
// S3 SigV4 query authentication, using Node's built-in crypto/fetch only.
const crypto=require('node:crypto'),fs=require('node:fs');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const hmac=(key,s)=>crypto.createHmac('sha256',key).update(s).digest();
const encode=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
function configuration(env=process.env){
 const values={...env},file=env.MUSIC_CONFIG_FILE;
 if(file){try{for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){const m=/^(R2_ACCOUNT_ID|R2_BUCKET|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY)=([^\r\n]*)$/.exec(line);if(m)values[m[1]]=m[2];}}catch(e){if(e.code!=='ENOENT')throw Error('Music configuration is unreadable');}}
 const config={account:values.R2_ACCOUNT_ID,bucket:values.R2_BUCKET,accessKey:values.R2_ACCESS_KEY_ID,secret:values.R2_SECRET_ACCESS_KEY};
 if(!Object.values(config).some(Boolean))return null;
 if(!/^[a-f0-9]{32}$/.test(config.account||'')||!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.bucket||'')||!/^[a-f0-9]{32}$/.test(config.accessKey||'')||!/^[a-f0-9]{64}$/.test(config.secret||''))throw Error('Music configuration is incomplete or invalid');
 return config;
}
function presign(config,method,key,{now=new Date(),expires=300}={}){
 if(!['GET','PUT','DELETE'].includes(method)||!Number.isInteger(expires)||expires<1||expires>3600)throw Error('Invalid music storage request');
 if(!/^(?:music|checks)\/[a-zA-Z0-9/_-]+\.mp3$/.test(key))throw Error('Invalid music object key');
 const stamp=now.toISOString().replace(/[:-]|\.\d{3}/g,''),day=stamp.slice(0,8),scope=`${day}/auto/s3/aws4_request`;
 const host=`${config.account}.r2.cloudflarestorage.com`,pathname='/'+[config.bucket,...key.split('/')].map(encode).join('/');
 const params={'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Credential':config.accessKey+'/'+scope,'X-Amz-Date':stamp,'X-Amz-Expires':String(expires),'X-Amz-SignedHeaders':'host'};
 const query=Object.keys(params).sort().map(k=>encode(k)+'='+encode(params[k])).join('&');
 const canonical=[method,pathname,query,`host:${host}\n`,'host','UNSIGNED-PAYLOAD'].join('\n');
 const signing=hmac(hmac(hmac(hmac('AWS4'+config.secret,day),'auto'),'s3'),'aws4_request');
 const signature=hmac(signing,['AWS4-HMAC-SHA256',stamp,scope,hash(canonical)].join('\n')).toString('hex');
 return `https://${host}${pathname}?${query}&X-Amz-Signature=${signature}`;
}
function createStorage(config=configuration(),request=fetch){
 if(!config)return null;
 const call=async(method,key,body)=>{
  let r;try{r=await request(presign(config,method,key),{method,redirect:'error',signal:AbortSignal.timeout(45000),...(body?{headers:{'Content-Type':'audio/mpeg'},body}:{})});}catch{throw Error('Music storage is unavailable');}
  if(!r.ok&&!(method==='DELETE'&&r.status===404))throw Error('Music storage request failed');
  return r;
 };
 return {put:(key,bytes)=>call('PUT',key,bytes),remove:key=>call('DELETE',key),url:key=>presign(config,'GET',key),get:key=>call('GET',key)};
}
// Check ID3 bounds and consecutive MPEG Layer III frames; do not trust extensions
// or MIME types alone. The browser still has the final say on decoder support.
function isMp3(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<24)return false;
 let offset=0;
 if(bytes.subarray(0,3).toString()==='ID3'){
  if(bytes.length<10||bytes[3]<2||bytes[3]>4||[...bytes.subarray(6,10)].some(n=>n&128))return false;
  offset=10+((bytes[6]<<21)|(bytes[7]<<14)|(bytes[8]<<7)|bytes[9])+((bytes[3]===4&&bytes[5]&16)?10:0);
 }
 let frames=0;
 while(offset+4<=bytes.length&&frames<3){
  const a=bytes[offset],b=bytes[offset+1],c=bytes[offset+2];
  if(a!==255||(b&224)!==224||(b&6)!==2)return false;
  const version=(b>>3)&3,index=c>>4,rate=(c>>2)&3;
  if(version===1||index===0||index===15||rate===3)return false;
  const rates=[44100,48000,32000],bitrates=version===3?[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160];
  const hz=rates[rate]/(version===3?1:version===2?2:4),length=Math.floor((version===3?144000:72000)*bitrates[index]/hz)+((c>>1)&1);
  if(length<4||offset+length>bytes.length)return false;
  frames++;offset+=length;
 }
 return frames===3;
}
module.exports={configuration,presign,createStorage,isMp3};
