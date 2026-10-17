'use strict';
const fs=require('node:fs'),path=require('node:path');
// Run only against the reviewed homepage while building the new image. Private fragments stay outside public/.
function sanitize(html){
 const parts={};let counter=0;
 const extract=(pattern,key)=>{let count=0;html=html.replace(pattern,(full,...args)=>{count++;const id=`${key}-${counter++}`;parts[id]={key,html:full};const variant=full.startsWith('<h1')?'heading':full.startsWith('<p')?(full.includes('class="intro"')?'intro':'line'):full.startsWith('<a')?'link':full.startsWith('<footer')?'footer':'block';const caption='该部分已隐藏';return `<div data-profile-fragment="${id}" class="profile-placeholder mask-${variant}"><span>••••</span><small>${caption}</small></div>`;});if(!count)throw Error('Homepage structure differs: '+key);};
 // Academics have their own permission; keep their slot outside protected education fragments.
 html=html.replace(/<p data-academics[^>]*>[\s\S]*?<\/p>/g,'');
 extract(/<aside class="profile"[\s\S]*?<\/aside>/,'education');
 extract(/<section class="section" id="about">[\s\S]*?<\/section>/,'education');
 html=html.replace(/(<div class="wrap content">)/,'$1<section class="section profile-placeholder" data-academics-section><p data-academics>该部分已隐藏</p></section>');
 extract(/<section class="section" id="projects">[\s\S]*?<\/section>/,'projects');
 extract(/<section class="section">\s*<h2>\s*<span class="section-number">03 \/ TOOLKIT[\s\S]*?<\/section>/,'skills');
 extract(/<p class="eyebrow">[\s\S]*?<\/p>/,'education');
 extract(/<h1>[\s\S]*?<\/h1>/,'identity');
 extract(/<p class="intro">[\s\S]*?<\/p>/,'education');
 extract(/<p class="chinese"[\s\S]*?<\/p>/,'identity');
 extract(/<footer>[\s\S]*?<\/footer>/,'identity');
 extract(/<a href="https:\/\/github\.com\/Gary-BANG">[\s\S]*?<\/a>/,'identity');
 extract(/<a class="button" href="https:\/\/github\.com\/Gary-BANG">[\s\S]*?<\/a>/,'identity');
 html=html.replace(/<title>[\s\S]*?<\/title>/,'<title>Gary Hub · Personal Space</title>').replace(/<meta name="description"[^>]*>/,'<meta name="description" content="Gary Hub — personal tools and a privacy-controlled profile.">');
 // If an unrecognized personal section remains, refuse to build instead of publishing it.
 if(/ZJUI|Zhejiang|Urbana|2028|Multi-UAV|Intelligent Assistants/i.test(html))throw Error('Unprotected personal text remains in homepage');
 html=html.replace('</head>','<link rel="stylesheet" href="/profile-privacy.css"></head>').replace('<main id="main">','<main id="main"><div class="profile-controls wrap"><div><strong>个人资料访问</strong><p id="profileHint">正在确认资料访问权限…</p></div><div class="profile-actions"><button id="profileUnlock" type="button">查看完整资料</button><button id="profileLock" type="button" hidden>重新隐藏</button><a id="previewExit" href="/" hidden>退出访客预览</a></div></div>');
 html=html.replace('</body>','<dialog id="profileDialog"><form id="profileForm"><h2>查看完整资料</h2><p>请输入管理员提供的资料访问码。授权默认有效 24 小时。</p><label for="profileCode">资料访问码</label><input id="profileCode" type="password" autocomplete="off" minlength="8" maxlength="128" required><p id="profileError" role="status"></p><div class="profile-actions"><button type="button" id="profileCancel">取消</button><button type="submit">解锁资料</button></div></form></dialog><script src="/profile-privacy.js"></script></body>');
 return {html,parts};
}
function prepare(root){const file=path.join(root,'public/homepage.html'),p=path.join(root,'homepage-protected.json');if(fs.existsSync(p))throw Error('Homepage already protected');const result=sanitize(fs.readFileSync(file,'utf8'));fs.writeFileSync(p,JSON.stringify(result.parts),{mode:0o600});fs.writeFileSync(file,result.html);}
function createProfile({calendar,json,root=__dirname}){return async(req,res,url)=>{
 if(url.pathname!=='/api/hub/profile-content')return false;
 if(req.method!=='GET'){json(res,405,{message:'Method not allowed'});return true;}
 const upstream=await calendar(req,'/api/hub/profile-access'+(['guest','member','1'].includes(url.searchParams.get('preview'))?'?preview='+url.searchParams.get('preview'):''));
 if(!upstream.ok){json(res,upstream.status,{message:'无法确认资料访问权限'});return true;}
 const access=await upstream.json(),all=JSON.parse(fs.readFileSync(path.join(root,'homepage-protected.json'),'utf8')),fragments={};
 for(const [id,item] of Object.entries(all))if(access.allowed.includes(item.key))fragments[id]=item.html;
 let academics=null;if(access.allowed.includes('academics')){const p=JSON.parse(fs.readFileSync(path.join(root,'profile-private.json'),'utf8'));academics={gpa:p.gpa,rank:p.rank};}
 json(res,200,{access,fragments,academics});return true;
};}
if(require.main===module)prepare(process.argv[2]||__dirname);
module.exports={sanitize,prepare,createProfile};
