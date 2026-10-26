'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const {createStorage}=require('../music-storage');
(async()=>{
 const cloud=createStorage();if(!cloud)throw Error('Not configured');
 const key='checks/'+crypto.randomUUID()+'.mp3',bytes=fs.readFileSync(require('node:path').join(__dirname,'../public/ambient.mp3'));
 try{await cloud.put(key,bytes);const response=await cloud.get(key);if(!Buffer.from(await response.arrayBuffer()).equals(bytes))throw Error('Round trip failed');}
 finally{await cloud.remove(key);}
 console.log('R2 CHECK PASS: private object write/read/delete verified.');
})().catch(()=>{console.error('R2 CHECK FAILED: verify bucket, account, object read/write permissions and server connectivity. No credentials were printed.');process.exit(1);});
