const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function setupDistribution({prepare,user}) {
  if(user.role!=='admin')return;
  const button=document.createElement('button');button.id='distribute-open';button.textContent='分发题库';
  document.querySelector('#cloud-bar').append(button);
  const dialog=document.createElement('dialog');dialog.id='distribution-dialog';
  dialog.innerHTML=`<div class="distribution-head"><div><span class="eyebrow">ADMIN / QUESTION BANK</span><h2>向用户分发题库</h2></div><button id="distribute-close" aria-label="关闭分发窗口">关闭</button></div><div class="distribution-body"><p>选择自己的作业分组，向指定用户追加独立副本。原有题库与练习记录保留，相同题目自动跳过。</p><label for="distribute-group">选择作业 / Assignment</label><select id="distribute-group"></select><fieldset><legend>接收用户 / Recipients</legend><input type="search" id="distribute-search" placeholder="搜索用户名" aria-label="搜索接收用户"><div id="distribute-users"></div></fieldset><div id="distribute-preview"></div><p id="distribute-status" role="status" aria-live="polite"></p></div><div class="distribution-actions"><button id="distribute-preview-button">预览分发</button><button class="primary" id="distribute-send" disabled>确认分发</button></div>`;
  document.body.append(dialog);
  const $=id=>dialog.querySelector('#'+id);let options,preview=null,busy=false,complete=false;
  const message=s=>$('distribute-status').textContent=s;
  async function api(route,value){
    const opts={credentials:'same-origin',cache:'no-store'};
    if(value){const c=await fetch('/api/csrf',opts);if(!c.ok)throw Error('请重新登录');const {token}=await c.json();Object.assign(opts,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:JSON.stringify(value)});}
    const r=await fetch('/api/lab/distribution/'+route,opts);const v=await r.json();if(!r.ok)throw Error(v.message||'请求失败');return v;
  }
  function controls(){for(const el of dialog.querySelectorAll('select,input,button'))el.disabled=busy; $('distribute-send').disabled=busy||!preview||complete||!preview.results.some(r=>r.added);$('distribute-preview-button').disabled=busy||!options?.groups.length;}
  function invalidate(){preview=null;complete=false;$('distribute-preview').replaceChildren();message('选择作业及接收人后，先预览。');controls();}
  function input(){return {accountId:options.accountId,sourceRevision:options.sourceRevision,assignment:$('distribute-group').value,recipientIds:[...dialog.querySelectorAll('[data-recipient]:checked')].map(e=>Number(e.value))};}
  function results(rows){$('distribute-preview').innerHTML=`<table><thead><tr><th>用户</th><th>新增</th><th>跳过</th><th>结果</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.username)}</td><td>${r.added}</td><td>${r.skipped}</td><td>${r.status==='failed'?'保存未确认':r.status==='complete'?'已完成':r.renamed?'同编号题将另存副本':'待确认'}</td></tr>`).join('')}</tbody></table>`;}
  button.onclick=async()=>{
    dialog.showModal();options=null;preview=null;complete=false;busy=true;controls();$('distribute-group').replaceChildren();$('distribute-users').replaceChildren();$('distribute-preview').replaceChildren();$('distribute-search').value='';message('正在保存当前进度并读取题库…');
    try{await prepare();options=await api('options');if(options.accountId!==user.id)throw Error('登录账号已变化，请刷新页面');
      $('distribute-group').innerHTML=options.groups.map(g=>`<option value="${esc(g.assignment)}">${esc(g.assignment)} · ${g.count} 题</option>`).join('');
      $('distribute-users').innerHTML=options.users.map(u=>`<label><input type="checkbox" data-recipient value="${u.id}"><span>${esc(u.username)}${u.role==='admin'?' · 管理员':''}</span></label>`).join('');
      message(!options.groups.length?'你的作业题库为空，请先上传作业题包。':!options.users.length?'暂无其他可接收题库的启用账号。':'选择一个作业分组和接收用户，然后预览。');
    }catch(e){options=null;message(e.message);}finally{busy=false;controls();}
  };
  $('distribute-group').onchange=invalidate;$('distribute-users').onchange=invalidate;
  $('distribute-search').oninput=()=>{const q=$('distribute-search').value.toLowerCase();for(const label of $('distribute-users').children)label.hidden=!label.textContent.toLowerCase().includes(q);};
  $('distribute-preview-button').onclick=async()=>{preview=null;complete=false;busy=true;controls();message('正在预览…');try{preview=await api('preview',input());results(preview.results);message(preview.results.some(r=>r.added)?`将分发 ${preview.count} 道题。确认后，接收用户刷新 Lab 即可查看。`:'所选用户已拥有这些题目，无需重复分发。');}catch(e){message(e.message);}finally{busy=false;controls();}};
  $('distribute-send').onclick=async()=>{if(!preview||busy)return;busy=true;controls();message('正在分发…');try{const r=await api('send',{...input(),previewId:preview.previewId});results(r.results);complete=r.complete;message(r.complete?'分发完成。接收用户刷新页面，或保存当前进度后加载云端题库。':'部分用户保存未确认。请重新预览后重试；已成功的相同题目会跳过。');}catch(e){message(e.message+'。如果网络中断，请重新预览，已保存的相同题目会自动跳过。');}finally{preview=null;busy=false;controls();}};
  $('distribute-close').onclick=()=>dialog.close();dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
}
