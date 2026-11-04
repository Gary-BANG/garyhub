/* Demo-only stand-in for /api/assistant/*, active with ?ai: a signed-in member whose assistant
   prepares an add card (plus a page link), a delete card for messages with 删/delete, a searched
   answer with sources for 新闻/news, and a busy error for 忙/busy. */
(() => {
  'use strict';
  if (!new URLSearchParams(location.search).has('ai')) return;
  window.GaryHubIdentity = {user:{id:2, username:'demo', role:'user', accountTier:'standard'}};
  const later = (value, ms = 500) => new Promise(resolve => setTimeout(() => resolve(value), ms));
  const quota = {chat:{used:3, limit:200}, data:{used:26, limit:30}, search:{used:1, limit:5}};
  let n = 0;
  const reply = (body, counted) => { for (const kind of counted) quota[kind].used++; return later({...body, counted, fallback:false, quota:structuredClone(quota)}); };
  window.GaryHubCompanionAssistant = {
    status:() => later({enabled:true, provider:'智谱 BigModel', model:'glm-4.7-flash', search:true, tier:'standard', memoryRounds:5, quota:structuredClone(quota)}, 50),
    chat:({message}) => {
      if (/忙|busy/i.test(message)) return new Promise((resolve, reject) => setTimeout(() => reject(Object.assign(Error('AI 服务暂时繁忙，请稍后再试（本次不计次数）'), {status:503, code:'busy'})), 500));
      if (/新闻|news/i.test(message)) return reply({reply:'据网络搜索，今天的主要新闻是计票仍在进行，结果预计本周公布。', pages:[], actions:[],
        sources:[{title:'Election update', url:'https://news.example/vote'}, {title:'Example Daily', url:'https://daily.example/a'}]}, ['chat', 'search']);
      if (/删|delete/i.test(message)) return reply({reply:'找到了“15:00 看牙”，确认删除吗？', pages:[], sources:[],
        actions:[{id:'demo-' + ++n, kind:'delete_task', summary:{title:'15:00 看牙', start_date:'2026-11-12', end_date:'2026-11-12'}}]}, ['chat', 'data']);
      return reply({reply:'帮你准备好了，确认后加到日程里。记账页也放在下面了。', pages:['ledger'], sources:[],
        actions:[{id:'demo-' + ++n, kind:'add_task', summary:{title:'15:00 看牙', start_date:'2026-11-12', end_date:'2026-11-13', category:'健康', reminder_time:'09:00', note:'带上医保卡'}}]}, ['chat', 'data']);
    },
    forget:() => later({ok:true}, 200),
    confirm:() => later({ok:true}, 300),
    cancel:() => later({ok:true}, 300)
  };
})();
