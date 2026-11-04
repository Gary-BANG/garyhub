'use strict';
const {JSDOM}=require(process.env.JSDOM_MODULE||'jsdom');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../../..');let count=0;const eq=(a,b)=>{assert.deepEqual(a,b);count++;};
const load=p=>fs.readFileSync(path.join(root,p),'utf8');
const settle=()=>new Promise(r=>setTimeout(r,20));
function make(html,url){const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true});dom.window.matchMedia=()=>({matches:true,addEventListener(){}});return dom;}
(async()=>{
 const tools=make(load('lab-service/public/index.html'),'https://tools.garyhub.uk/'),w=tools.window;
 w.eval(load('lab-service/public/tools-catalog.js'));w.eval(load('lab-service/public/tools-dock.js'));
 for(const [user,visible,reading]of [[null,false,false],[{id:2,role:'user',accountTier:'standard'},false,false],[{id:3,role:'user',accountTier:'subscriber'},false,true],[{id:1,role:'admin'},true,true],[null,false,false]]){
  w.document.dispatchEvent(new w.CustomEvent('garyhub:identity',{detail:{user}}));eq(w.document.querySelector('#reading-help').hidden,!visible);eq(w.document.querySelector('[data-tool="reading"]').hidden,!reading);
 }
 const icons=['status','server-monitor','ai-logs'].map(id=>w.document.querySelector(`[data-tool="${id}"] use`).getAttribute('href'));eq(new Set(icons).size,3);for(const id of icons)eq(!!w.document.querySelector(id),true);
 w.document.querySelector('[data-view-button="dock"]').click();eq(w.document.querySelector('#tool-browser').dataset.view,'dock');w.document.querySelector('[data-view-button="grid"]').click();eq(w.document.querySelector('#tool-browser').dataset.view,'grid');tools.window.close();
 // Exercise the production notification renderer, both bulk buttons and their real request payloads.
 const dom=make('<div data-hub-account data-scope="all"></div>','https://garyhub.uk/'),v=dom.window,calls=[];
 let ordinary={id:1,type:'release',scope:'calendar',title:'ordinary',body:'test',created_at:'2026-11-04',read_at:null,required:0},required={id:2,type:'account',scope:'calendar',title:'required',body:'test',created_at:'2026-01-01',read_at:null,required:1},items=[ordinary,required];
 v.fetch=async(url,options={})=>{calls.push([url,options]);let data;
  if(url==='/api/hub/me')data={user:{id:2,username:'alice',role:'user'}};
  else if(url==='/api/csrf')data={token:'synthetic-token'};
  else if(url.includes('read-all')){ordinary.read_at='read';data={ok:true};}
  else if(url.includes('delete-all')){items=[required];data={ok:true};}
  else data={items,unread:items.filter(n=>!n.read_at).length,nextBefore:null};
  return {ok:true,status:200,json:async()=>data};
 };
 v.eval(load('lab-service/public/hub-account.js'));await settle();
 const button=label=>[...v.document.querySelectorAll('#gh-notices button')].find(x=>x.textContent===label);
 eq(!!button('一键已读'),true);button('一键已读').click();await settle();eq(required.read_at,null);
 const read=calls.find(([url])=>url.endsWith('read-all'));eq(JSON.parse(read[1].body),{scope:'all',userId:2});eq(read[1].headers['X-CSRF-Token'],'synthetic-token');
 button('一键删除').click();await settle();eq(v.document.querySelectorAll('.gh-notice').length,1);eq(v.document.querySelector('.gh-notice strong').textContent,'required');eq(v.document.querySelector('#gh-notices').textContent.includes('必要通知'),true);dom.window.close();
 // Calendar uses the same backend actions but limits them to Calendar's scope.
 const cal=make('<div id="unreadCount"></div><div id="notificationsPanel"></div>','https://calendar.garyhub.uk/'),x=cal.window,calCalls=[];
 x.state={me:{id:2},notifications:[]};x.$=id=>x.document.getElementById(id);x.escapeHtml=s=>s;
 x.api=async(url,options={})=>{calCalls.push([url,options]);return url==='/api/notifications'?[required]:{ok:true};};
 const source=load('calendar-app/public/unified.js');x.eval(source.slice(source.indexOf('function renderNotifications()'),source.indexOf('function clearUnifiedForm()')));
 x.eval('state.notifications='+JSON.stringify([ordinary,required])+';renderNotifications();');
 [...x.document.querySelectorAll('button')].find(n=>n.textContent==='一键删除').click();await settle();
 eq(JSON.parse(calCalls[0][1].body),{scope:'calendar',userId:2});eq(x.document.querySelector('#notificationsPanel').textContent.includes('required'),true);eq(x.document.querySelector('#notificationsPanel').textContent.includes('ordinary'),false);cal.window.close();
 console.log('DOM PASS: '+count+' assertions; role transitions, distinct symbols, grid/dock, both notification panels and CSRF request bodies. No visual layout engine.');
})().catch(e=>{console.error(e);process.exitCode=1;});
