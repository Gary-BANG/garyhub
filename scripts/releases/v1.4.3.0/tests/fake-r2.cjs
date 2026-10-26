'use strict';
// Loaded via NODE_OPTIONS only in the isolated synthetic test containers.
// No fake storage switch exists in the production application.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const real=global.fetch,root=path.join(process.env.DATA_DIR,'synthetic-r2');fs.mkdirSync(root,{recursive:true});
global.fetch=async(url,options={})=>{
 const u=new URL(url);if(u.hostname!=='a'.repeat(32)+'.r2.cloudflarestorage.com')return real(url,options);
 if(!u.searchParams.has('X-Amz-Signature'))return new Response('',{status:403});
 const file=path.join(root,crypto.createHash('sha256').update(u.pathname).digest('hex'));
 if(options.method==='PUT'){fs.writeFileSync(file,options.body);return new Response('',{status:fs.existsSync(path.join(root,'fail-put'))?503:200});}
 if(options.method==='DELETE'){if(fs.existsSync(path.join(root,'fail-delete')))return new Response('',{status:503});fs.rmSync(file,{force:true});return new Response(null,{status:204});}
 if(!fs.existsSync(file))return new Response(null,{status:404});return new Response(fs.readFileSync(file),{status:200});
};
