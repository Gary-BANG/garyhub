/* AI assistant logs for admins: a 24-hour summary, per-account use, every message's metadata and
   every provider or server error. The server never stores conversation text, so none is shown. */
(()=>{'use strict';const $=id=>document.getElementById(id),node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const OUTCOME={ok:['成功','good'],limited:['达到上限','warn'],error:['失败','bad']},KIND={chat:'对话',data:'日程',search:'搜索'},TIER={standard:'普通',subscriber:'订阅',admin:'管理员'};
 const SOURCE={chat:'模型调用',search:'联网搜索',test:'测试连接',confirm:'确认操作',cancel:'取消操作',status:'状态',memory:'清空记忆',admin:'管理设置'};
 const when=ms=>new Date(ms).toLocaleString(),num=n=>Number(n||0).toLocaleString();
 let calls=[],errors=[],busy=false;
 async function api(path){const r=await fetch(path,{cache:'no-store',credentials:'same-origin'});let d={};try{d=await r.json();}catch{}if(!r.ok)throw Error(d.message||'暂时无法读取（HTTP '+r.status+'）');return d;}
 function metric(title,value,note){const box=node('div',undefined,'metric');box.append(node('small',title),node('strong',value),node('p',note||''));return box;}
 // rows: arrays of cells; a cell is text or [text, className].
 function table(id,headers,rows,empty){const box=$(id);if(!rows.length){box.replaceChildren(node('p',empty,'muted'));return;}const t=node('table'),head=node('tr');for(const h of headers)head.append(node('th',h));const th=node('thead');th.append(head);const tb=node('tbody');
  for(const cells of rows){const tr=node('tr');for(const cell of cells){const [text,cls]=Array.isArray(cell)?cell:[cell];tr.append(node('td',String(text??'—'),cls));}tb.append(tr);}t.append(th,tb);box.replaceChildren(t);}
 const userName=u=>u?(u.username||'已删除账号 #'+u.id):'—';
 function renderCalls(){table('calls',['时间','用户','等级','结果','计次','工具','模型','备用','轮次','Tokens（入/出）','搜索','耗时','错误'],calls.map(c=>[when(c.at),userName(c.user),TIER[c.tier]||c.tier,OUTCOME[c.outcome]||[c.outcome],c.kinds.map(k=>KIND[k]||k).join('、')||'—',c.tools.join('、')||'—',c.model||'—',c.fallback?['已切换','warn']:'—',c.rounds,num(c.tokens.prompt)+' / '+num(c.tokens.completion),c.searches||'—',(c.ms/1000).toFixed(1)+' s',c.errors?[c.errors,'bad']:'—']),'暂无调用记录。');}
 function renderErrors(){table('errors',['时间','用户','来源','模型','HTTP','代码','说明','结果'],errors.map(e=>[when(e.at),userName(e.user),SOURCE[e.source]||e.source,e.model||'—',e.status??'—',e.code||'—',[e.message||'—','wrap-cell'],e.recovered?['已恢复','good']:['未恢复','bad']]),'暂无错误。');}
 async function loadCalls(more){const q=new URLSearchParams({limit:'100'});if($('outcome').value)q.set('outcome',$('outcome').value);if(more&&calls.length)q.set('before',String(calls.at(-1).at));const d=await api('/api/assistant/admin/calls?'+q);calls=more?[...calls,...d.calls]:d.calls;$('moreCalls').hidden=d.calls.length<100;renderCalls();return d;}
 async function loadErrors(more){const q=new URLSearchParams({limit:'100'});if($('source').value)q.set('source',$('source').value);if(more&&errors.length)q.set('before',String(errors.at(-1).at));const d=await api('/api/assistant/admin/errors?'+q);errors=more?[...errors,...d.errors]:d.errors;$('moreErrors').hidden=d.errors.length<100;renderErrors();}
 function summary(d){const s=d.summary;$('overview').replaceChildren(metric('消息',num(s.calls),'成功 '+num(s.ok)+' · 达到上限 '+num(s.limited)+' · 失败 '+num(s.failed)),metric('切换备用模型',num(s.fallbacks),'主模型失败后由备用模型完成'),metric('Tokens',num(s.prompt_tokens+s.completion_tokens),'输入 '+num(s.prompt_tokens)+' · 输出 '+num(s.completion_tokens)),metric('错误',num(s.errors),'联网搜索 '+num(s.searches)+' 次'));
  table('people',['用户','等级','消息','日程操作','联网搜索','未成功'],d.people.map(p=>[p.username||'已删除账号 #'+p.user_id,TIER[p.tier]||p.tier,p.calls,p.data,p.search,p.problems?[p.problems,'warn']:0]),'最近 24 小时没有人使用 AI。');}
 async function refresh(){if(busy)return;busy=true;try{const d=await loadCalls(false);summary(d);await loadErrors(false);$('content').hidden=false;$('message').textContent='最近 24 小时概况 · 更新于 '+new Date().toLocaleString();}catch(e){$('message').textContent=e.message;}finally{busy=false;}}
 const guard=fn=>async()=>{try{await fn();}catch(e){$('message').textContent=e.message;}};
 $('refresh').onclick=refresh;$('outcome').onchange=guard(()=>loadCalls(false));$('source').onchange=guard(()=>loadErrors(false));
 $('moreCalls').onclick=guard(()=>loadCalls(true));$('moreErrors').onclick=guard(()=>loadErrors(true));
 refresh();
})();
