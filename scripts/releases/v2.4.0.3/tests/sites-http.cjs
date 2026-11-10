'use strict';
// Real HTTP checks for the Elsewhere page as of v2.4.0.3: the sites.garyhub.uk host serves only the page
// and its assets with a strict CSP, other hosts never expose /sites/, and the homepage links to it.
// Since v2.4.0.3 the two site links and the homepage entry open in a new tab.
const assert=require('node:assert/strict'),http=require('node:http');
const LAB=process.env.CHECK_LAB||'http://lab-check:3000',VERSION=process.env.CHECK_VERSION,SITE='sites.garyhub.uk';
let count=0;const eq=(a,b)=>{assert.deepEqual(a,b);count++;};
// node:http lets the check send Host headers that fetch() would refuse.
function get(path,{host,method='GET'}={}){
 return new Promise((resolve,reject)=>{
  const url=new URL(LAB);
  const request=http.request({hostname:url.hostname,port:url.port,path,method,headers:host?{host}:{}},response=>{
   const chunks=[];response.on('data',chunk=>chunks.push(chunk));
   response.on('end',()=>{const bytes=Buffer.concat(chunks);resolve({status:response.statusCode,headers:response.headers,bytes,body:bytes.toString('utf8')});});
  });
  request.on('error',reject);request.end();
 });
}
(async()=>{
 assert.match(VERSION,/^\d+\.\d+\.\d+\.\d+$/);
 const page=await get('/',{host:SITE});
 eq(page.status,200);eq(/^text\/html/.test(page.headers['content-type']),true);
 eq(/^default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self';/.test(page.headers['content-security-policy']),true);
 eq(page.headers['x-frame-options'],'DENY');
 eq(page.body.includes('<script src="/sites.js?v='+VERSION+'" defer></script>'),true);
 eq(page.body.includes('<link rel="stylesheet" href="/sites.css?v='+VERSION+'">'),true);
 // No inline script, style attribute or third-party resource, so the CSP holds without exceptions.
 eq(/<script(?![^>]*\ssrc=)/i.test(page.body),false);eq(/\sstyle=/i.test(page.body),false);eq(/\s(?:src|href)="\/\//.test(page.body),false);
 const links=[...page.body.matchAll(/<a class="site" href="(https:\/\/[^"]+)" data-thumb="([^"]+)" target="_blank" rel="noopener">/g)];
 eq(page.body.split('<a class="site" ').length-1,links.length);
 eq(links.map(match=>match[1]),['https://gary-bang.github.io/ece470-course/','https://gary-bang.github.io/photography-course/']);
 eq((await get('/index.html',{host:SITE})).body,page.body);
 for(const [path,type] of [['/sites.css?v='+VERSION,/^text\/css/],['/sites.js?v='+VERSION,/javascript/],...links.map(match=>[match[2],/^image\/webp$/])]){
  const response=await get(path,{host:SITE});eq(response.status,200);eq(type.test(response.headers['content-type']),true);
  eq(response.headers['cache-control'],'public, max-age=86400');
 }
 const thumb=await get(links[0][2],{host:SITE});eq(thumb.bytes.subarray(0,4).toString('latin1'),'RIFF');eq(thumb.bytes.subarray(8,12).toString('latin1'),'WEBP');
 eq((await get('/sites.js',{host:SITE})).headers['cache-control'],'no-store');
 // Only the page and its assets exist on this host: not other services' files, APIs or path escapes.
 for(const path of ['/sites/index.html','/companion/boot.js','/tools-catalog.js','/admin.html','/admin/','/login','/health','/api/hub/me','/api/me','/lab/','/thumbs/%2e%2e/%2e%2e/server.cjs','/thumbs/..%2fsites.js','/THUMBS/ece470.webp','/thumbs/missing.webp'])eq((await get(path,{host:SITE})).status,404);
 eq((await get('/',{host:SITE,method:'POST'})).status,404);
 // Other hosts never serve the Elsewhere folder.
 for(const host of [undefined,'tools.garyhub.uk','lab.garyhub.uk','garyhub.uk'])for(const path of ['/sites/','/sites/index.html','/sites/sites.js','/Sites/sites.css'])eq((await get(path,{host})).status,404);
 const home=await get('/',{host:'garyhub.uk'});eq(home.status,200);eq(home.body.includes('<a href="https://sites.garyhub.uk/" target="_blank" rel="noopener"><strong>Elsewhere ↗</strong>'),true);
 console.log('SITES HTTP PASS: '+count+' assertions; page, CSP, versioned assets and previews on '+SITE+', 404 for everything else and for /sites/ on other hosts, homepage link, new-tab links.');
})().catch(error=>{console.error(error);process.exit(1);});
