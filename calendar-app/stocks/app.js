'use strict';
const el = id => document.getElementById(id);
const node = (tag,text) => Object.assign(document.createElement(tag),{textContent:text});
const notice = message => {el('notice').textContent=message;};
const handle = fn => async event => {try {await fn(event);} catch(e){notice(e.message);}};
const button = (text,fn) => {
  const b=node('button',text); b.type='button';b.onclick=handle(fn);return b;
};
let state, active=0, selected='', generation=0, searching=0, view=0, saving=false;
let lastQuote=null, locked=false;
const panelRequests=new Map();
const format=(n,digits=2)=>Number.isFinite(n)?n.toLocaleString('zh-CN',{maximumFractionDigits:digits}):'—';
const signed=n=>Number.isFinite(n)&&n>0?'+'+format(n):format(n);
const changeClass=n=>Number.isFinite(n) && n!==0 ? (n>0?'rise':'fall') : '';
const marketName=symbol=>({sh:'沪市',sz:'深市',bj:'北交所'})[symbol.slice(0,2)];
function lock(message){
  locked=true;selected='';view++;generation++;searching++;
  el('detail').hidden=true;el('list').replaceChildren();el('tabs').replaceChildren();el('results').replaceChildren();
  el('add').disabled=true;el('query').disabled=true;notice(message);
}
async function api(route,options) {
  const r=await fetch('/api/stocks/'+route,{cache:'no-store',...options});
  if (!r.ok) {
    const message=(await r.json().catch(()=>({}))).message || '请求失败';
    if([401,403,428].includes(r.status))lock(message);
    throw Error(message);
  }
  return r.json();
}
async function save(groups,index=active) {
  if (saving || locked) return;
  saving=true;
  try {
    const token=(await (await fetch('/api/csrf',{cache:'no-store'})).json()).token;
    state=await api('groups',{method:'PUT',headers:{'Content-Type':'application/json','x-csrf-token':token},body:JSON.stringify({...state,groups})});
    active=index;draw();notice('收藏分组已保存');
    if(selected)renderWatchControls();
  } finally {saving=false;}
}
function groupName(value='') {return prompt('分组名称（最多 20 个字符）',value)?.trim();}
el('add').onclick=handle(async()=>{
  const name=groupName(); if(name) await save([...state.groups,{name,symbols:[]}],state.groups.length);
});
function draw(){
  const version=++generation,groups=state.groups;
  active=Math.max(0,Math.min(active,groups.length-1));
  try{sessionStorage.setItem('stock-group-'+state.accountId,active);}catch{}
  el('add').disabled=groups.length>=3;
  el('tabs').replaceChildren(...groups.map((g,i)=>{
    const b=button(g.name+' · '+g.symbols.length+'/5',()=>{
      active=i;selected='';++view;el('detail').hidden=true;draw();
    });
    b.setAttribute('aria-pressed',i===active);return b;
  }));
  const list=el('list');list.replaceChildren();
  const g=groups[active];
  if(!g){list.textContent='搜索股票后，可将它加入自选分组。';return;}
  const actions=node('div','');actions.className='row group-actions';
  actions.append(button('重命名',()=>{const name=groupName(g.name);if(name)return save(groups.map((v,i)=>i===active?{...v,name}:v));}),
    button('删除分组',()=>{if(confirm('删除「'+g.name+'」及组内收藏？'))return save(groups.filter((_,i)=>i!==active));}));
  list.append(actions);
  for(const symbol of g.symbols){
    const row=node('div','');row.className='watch-row';
    const link=button(symbol.toUpperCase(),()=>show(symbol)),quote=node('span','读取中…');
    row.append(link,quote,button('移出',()=>save(groups.map((v,i)=>i===active?{...v,symbols:v.symbols.filter(s=>s!==symbol)}:v))));
    list.append(row);
    api('quote?symbol='+symbol).then(q=>{
      if(version!==generation)return;
      link.textContent=q.name+' '+symbol.slice(2);
      quote.textContent=format(q.price)+' 元 · '+signed(q.percent)+'% · '+stamp(q);
    }).catch(e=>{if(version===generation)quote.textContent=e.message;});
  }
}
function stamp(q){
  const t=q.time;
  return (q.stale?'上次行情 · ':'')+t.slice(0,4)+'-'+t.slice(4,6)+'-'+t.slice(6,8)+' '+t.slice(8,10)+':'+t.slice(10,12)+' 北京时间'+(t.slice(8,12)>='1500'?' · 已收盘':'');
}
function renderWatchControls(){
  const parent=el('watch-controls');
  parent.replaceChildren();
  if(!state || !selected)return;
  const symbol=selected,groups=state.groups,old=groups.find(g=>g.symbols.includes(symbol));
  if(old)parent.append(node('small','已收藏于「'+old.name+'」'));
  const select=document.createElement('select');select.setAttribute('aria-label','收藏到分组');
  groups.forEach((g,i)=>{const op=node('option',g.name+' · '+g.symbols.length+'/5');op.value=i;op.disabled=g===old||g.symbols.length>=5;select.append(op);});
  if(groups.length<3){const op=node('option','新建分组…');op.value='new';select.append(op);}
  const available=[...select.options].find(op=>!op.disabled);if(available)select.value=available.value;
  const add=button(old?'移动到分组':'加入分组',async()=>{
    const next=structuredClone(groups);let i=Number(select.value);
    if(select.value==='new'){const name=groupName();if(!name)return;i=next.length;next.push({name,symbols:[]});}
    next.forEach(g=>{g.symbols=g.symbols.filter(s=>s!==symbol);});
    next[i].symbols.push(symbol);await save(next,i);
  });
  add.disabled=!available;parent.append(select,add);
}
function metricGrid(items){
  const grid=node('dl','');grid.className='metrics';
  for(const [label,value] of items){
    const cell=node('div','');cell.append(node('dt',label),node('dd',value));grid.append(cell);
  }
  return grid;
}
function renderSnapshot(q){
  el('stock-name').textContent=q.name;
  el('quote-time').textContent='腾讯行情 · '+stamp(q);
  const headline=node('div','');headline.className='headline';
  const price=node('strong',format(q.price)),unit=node('span','元');
  const change=node('span',signed(q.change)+'　'+signed(q.percent)+'%');change.className='change '+changeClass(q.change);
  headline.append(price,unit,change);
  const data=[
    ['换手率（%）',q.turnover],['量比（倍）',q.volumeRatio],['振幅（%）',q.amplitude],
    ['市盈率（TTM）',q.peTtm],['市净率（倍）',q.pb],['总市值（亿元）',q.totalCapYi],
    ['流通市值（亿元）',q.floatCapYi],['今开（元）',q.open],['昨收（元）',q.previous],
    ['最高（元）',q.high],['最低（元）',q.low],['成交量（手）',q.volume],['成交额（万元）',q.amount]
  ];
  el('snapshot').replaceChildren(headline,metricGrid(data.map(([label,v])=>[label,format(v)])));
}
function renderBook(){
  const body=el('book-body');
  if(!lastQuote){body.textContent='暂无盘口快照';return;}
  const table=node('table','');table.className='book';
  const tr=table.createTHead().insertRow();
  for(const title of ['档位','买价（元）','买量（手）','卖价（元）','卖量（手）'])tr.append(node('th',title));
  const rows=table.createTBody();
  for(let i=0;i<5;i++){
    const row=rows.insertRow(),bid=lastQuote.book.bids[i],ask=lastQuote.book.asks[i];
    const level=node('th',String(i+1));level.scope='row';row.append(level);
    for(const v of [bid.price,bid.lots,ask.price,ask.lots])row.append(node('td',format(v)));
  }
  body.replaceChildren(table,node('small','腾讯行情 · '+stamp(lastQuote)));
}
function reportCard(data){
  const wrap=node('div','');
  if(!data.reports.length){wrap.textContent='暂未取得已披露的财务报告。';return wrap;}
  const select=document.createElement('select');select.id='report-period';
  const label=node('label','报告期 ');label.htmlFor=select.id;
  data.reports.forEach((r,i)=>{const op=node('option',r.name||r.period);op.value=i;select.append(op);});
  const content=node('div','');
  function drawReport(){
    const r=data.reports[Number(select.value)];
    const unit=r.currency==='CNY'?'亿元':r.currency?'亿 '+r.currency:'亿原币';
    const money=v=>Number.isFinite(v)?format(v/1e8):'—';
    const grid=metricGrid([
      ['营业总收入（'+unit+'）',money(r.revenue)],['营收同比（%）',signed(r.revenueYoY)],
      ['归母净利润（'+unit+'）',money(r.parentProfit)],['归母净利润同比（%）',signed(r.profitYoY)],
      ['加权 ROE（%）',format(r.roe)],['经营活动现金流量净额（'+unit+'）',money(r.operatingCashFlow)]
    ]);
    content.replaceChildren(grid,node('small',data.source+' · 年初至 '+r.period+' 累计 · 公告日 '+(r.announced||'—')));
  }
  select.onchange=drawReport;label.append(select);wrap.append(label,content);drawReport();return wrap;
}
const panels={
  minute:{route:'intraday',render:data=>StockCharts.intraday(data)},
  history:{route:'history',render:data=>StockCharts.daily(data)},
  finance:{route:'financials',render:reportCard}
};
async function loadPanel(key,refresh=false){
  const panel=el(key+'-panel'),body=el(key+'-body');
  if(!selected || !panel.open || panelRequests.has(key))return;
  const request=Symbol(key),seq=view;
  panelRequests.set(key,request);
  if(!refresh)body.textContent='读取中…';
  try{
    const data=await api(panels[key].route+'?symbol='+selected);
    if(seq===view && panel.open && panelRequests.get(key)===request)body.replaceChildren(panels[key].render(data));
  }catch(e){
    if(seq===view && panel.open && panelRequests.get(key)===request)
      body.replaceChildren(node('p',e.message),button('重试',()=>loadPanel(key)));
  }finally{if(panelRequests.get(key)===request)panelRequests.delete(key);}
}
for(const key of Object.keys(panels)){
  const panel=el(key+'-panel');
  panel.ontoggle=()=>{
    if(panel.open)loadPanel(key);
    else panelRequests.delete(key);
  };
}
el('book-panel').ontoggle=()=>{if(el('book-panel').open)renderBook();};
async function refreshQuote(seq){
  const symbol=selected;
  try {
    const quote=await api('quote?symbol='+symbol);
    if(seq!==view || symbol!==selected)return;
    lastQuote=quote;renderSnapshot(quote);
    if(el('book-panel').open)renderBook();
  }catch(e){
    if(seq!==view)return;
    if(lastQuote){lastQuote={...lastQuote,stale:true};renderSnapshot(lastQuote);if(el('book-panel').open)renderBook();}
    else el('snapshot').replaceChildren(node('p',e.message),button('重试行情',()=>refreshQuote(view)));
  }
}
function show(symbol,name){
  selected=symbol;lastQuote=null;const seq=++view;
  panelRequests.clear();
  for(const key of ['book',...Object.keys(panels)]){
    el(key+'-panel').open=false;el(key+'-body').replaceChildren();
  }
  el('detail').hidden=false;el('stock-name').textContent=name||symbol.toUpperCase();
  el('stock-code').textContent=marketName(symbol)+' · '+symbol.slice(2);
  el('quote-time').textContent='';el('snapshot').textContent='正在读取行情…';
  renderWatchControls();
  el('detail').scrollIntoView({block:'start'});
  return refreshQuote(seq);
}
el('search').onsubmit=handle(async e=>{
  e.preventDefault();if(locked)return;
  const seq=++searching;el('results').replaceChildren();notice('正在检索…');
  try{
    const rows=await api('search?q='+encodeURIComponent(el('query').value.trim()));
    if(seq!==searching)return;
    notice(rows.length?'':'未找到匹配的 A 股');
    el('results').replaceChildren(...rows.map(r=>button(r.name+' '+r.symbol.toUpperCase(),()=>show(r.symbol,r.name))));
  }catch(e){if(seq===searching)notice(e.message);}
});
(async()=>{
  state=await api('groups');try{active=Number(sessionStorage.getItem('stock-group-'+state.accountId))||0;}catch{}
  draw();
  setInterval(()=>{
    if(document.hidden || locked || saving)return;
    if(selected){refreshQuote(view);if(el('minute-panel').open)loadPanel('minute',true);}
    if(state.groups[active]?.symbols.length)draw();
  },60_000);
})().catch(e=>{notice(e.message);el('add').disabled=true;});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
