/* Demo-only stand-in for /api/assistant/*, active with ?ai: a signed-in member whose assistant
   prepares an add card (plus a page link) or, for messages with 删/delete, a delete card. */
(() => {
  'use strict';
  if (!new URLSearchParams(location.search).has('ai')) return;
  window.GaryHubIdentity = {user:{id:2, username:'demo', role:'user', accountTier:'standard'}};
  const later = (value, ms = 500) => new Promise(resolve => setTimeout(() => resolve(value), ms));
  let n = 0;
  window.GaryHubCompanionAssistant = {
    status:() => later({enabled:true, provider:'智谱 BigModel', model:'glm-4.7-flash', limit:40, used:3}, 50),
    chat:({message}) => /删|delete/i.test(message)
      ? later({reply:'找到了“15:00 看牙”，确认删除吗？', pages:[], remaining:4,
          actions:[{id:'demo-' + ++n, kind:'delete_task', summary:{title:'15:00 看牙', start_date:'2026-11-12', end_date:'2026-11-12'}}]})
      : later({reply:'帮你准备好了，确认后加到日程里。记账页也放在下面了。', pages:['ledger'], remaining:12,
          actions:[{id:'demo-' + ++n, kind:'add_task', summary:{title:'15:00 看牙', start_date:'2026-11-12', end_date:'2026-11-13', category:'健康', reminder_time:'09:00', note:'带上医保卡'}}]}),
    confirm:() => later({ok:true}, 300),
    cancel:() => later({ok:true}, 300)
  };
})();
