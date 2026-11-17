/* Ledger budgets, six-month trend and CSV export (v2.4.1.3). Uses request(), categories, field() and currencyText()
   from ledger.js; the month follows the start date of the filter and amounts use the selected summary currency. */
(()=>{'use strict';
const panel=document.getElementById('budgetPanel');if(!panel)return;
const TEXT={
 zh:{title:'月度预算',total:'全部消费',none:'这个月还没有设置预算。',spent:(s,b)=>'已用 '+s+' / 预算 '+b,left:v=>'剩余 '+v,over:v=>'超出 '+v,
  noFx:'暂无有效汇率，预算按原币显示，暂不统计用量。',category:'类别',amount:'预算金额',currency:'币种',save:'保存预算',remove:'删除',saved:'预算已保存。',
  trend:'近六个月实际消费',export:'导出所选日期 CSV',exporting:'正在导出…',exported:'已导出。',month:m=>m+' 月份'},
 en:{title:'Monthly budget',total:'All spending',none:'No budget for this month yet.',spent:(s,b)=>s+' of '+b+' used',left:v=>v+' left',over:v=>v+' over',
  noFx:'Exchange rates are unavailable; budgets show in their own currency and usage is not counted.',category:'Category',amount:'Budget',currency:'Currency',save:'Save budget',remove:'Delete',saved:'Budget saved.',
  trend:'Spending over six months',export:'Export selected dates as CSV',exporting:'Exporting…',exported:'Exported.',month:m=>m}
};
const lang=()=>window.GaryHubI18n?.language==='en'?'en':'zh',t=()=>TEXT[lang()];
const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null&&text!=='')n.textContent=text;return n;};
let data=null,trend=null,message='',ticket=0,busy=false;
const month=()=>(field('from').value||personalToday()).slice(0,7),unit=()=>field('filterCurrency').value;
const name=id=>id==='*'?t().total:(()=>{const c=categories.find(x=>x.id===id);return c?label(c):id;})();
async function refresh(){
 const mine=++ticket;
 try{
  const q='month='+month()+'&currency='+unit();
  const [b,tr]=await Promise.all([request('budgets?'+q),request('trend?'+q+'&months=6')]);
  if(mine!==ticket)return;data=b;trend=tr;
 }catch(e){if(mine!==ticket)return;message=e.message;}
 render();
}
function render(){
 const x=t();panel.replaceChildren();panel.hidden=false;
 const head=make('div','budget-head');head.append(make('h2','',x.title+(data?' · '+data.month:'')));
 const exportButton=make('button','secondary compact-button',x.export);exportButton.type='button';exportButton.onclick=()=>download(exportButton);head.append(exportButton);
 panel.append(head);
 if(data&&!data.available)panel.append(make('p','small',x.noFx));
 const list=make('div','budget-list');
 for(const item of data?.items||[]){
  const row=make('div','budget-row'),top=make('div','budget-top');
  top.append(make('strong','',name(item.categoryId)));
  const remove=make('button','text-button',x.remove);remove.type='button';remove.onclick=async()=>{remove.disabled=true;try{await request('budgets/'+encodeURIComponent(item.categoryId),{method:'DELETE'});message='';await refresh();}catch(e){message=e.message;render();}};
  top.append(remove);row.append(top);
  if(item.budget===null){row.append(make('p','small',item.currency+' '+item.amount));}
  else{
   const ratio=item.budget?item.spent/item.budget:0,bar=make('div','budget-track'),fill=make('div','budget-fill'+(ratio>1?' over':ratio>.85?' near':''));
   fill.style.width=Math.max(0,Math.min(1,ratio))*100+'%';bar.append(fill);row.append(bar);
   const rest=item.budget-item.spent;
   row.append(make('p','small',x.spent(currencyText(item.spent),currencyText(item.budget))+' · '+(rest>=0?x.left(currencyText(rest)):x.over(currencyText(-rest)))+(item.currency!==data.currency?' · '+item.currency+' '+item.amount:'')));
  }
  list.append(row);
 }
 if(data&&!data.items.length)list.append(make('p','small',x.none));
 panel.append(list);
 const form=make('form','budget-form'),category=make('select'),amount=make('input'),currency=make('select'),save=make('button','primary compact-button',x.save);
 category.setAttribute('aria-label',x.category);amount.setAttribute('aria-label',x.amount);currency.setAttribute('aria-label',x.currency);
 category.add(new Option(x.total,'*'));for(const c of categories.filter(c=>c.type==='expense'&&c.active))category.add(new Option(label(c),c.id));
 amount.inputMode='decimal';amount.placeholder=x.amount;amount.required=true;amount.maxLength=11;amount.pattern='[0-9]+([.][0-9]{1,2})?';
 for(const c of ['CNY','USD','CAD','HKD'])currency.add(new Option(c,c));currency.value=unit();save.disabled=busy;
 form.append(category,amount,currency,save);
 form.onsubmit=async e=>{e.preventDefault();busy=true;save.disabled=true;try{await request('budgets/'+encodeURIComponent(category.value),{method:'PUT',body:JSON.stringify({amount:amount.value.trim(),currency:currency.value})});message=x.saved;}catch(error){message=error.message;}busy=false;await refresh();};
 panel.append(form);
 if(message){const note=make('p','small budget-message',message);note.setAttribute('role','status');panel.append(note);}
 if(trend?.available&&trend.months.length){
  const box=make('div','budget-trend');box.append(make('h3','',x.trend));
  const max=Math.max(1,...trend.months.map(m=>m.consumption)),bars=make('div','trend-bars');
  for(const m of trend.months){const col=make('div','trend-col'),bar=make('div','trend-bar');bar.style.height=Math.max(2,Math.max(0,m.consumption)/max*100)+'%';bar.title=m.month+' · '+currencyText(m.consumption);
   col.append(make('span','trend-value',currencyText(m.consumption)),bar,make('span','trend-label',m.month.slice(5)));bars.append(col);}
  box.append(bars);panel.append(box);
 }
}
async function download(button){
 const x=t();button.disabled=true;message=x.exporting;
 try{
  const from=field('from').value,to=field('to').value;
  const r=await fetch('/api/ledger/export?from='+from+'&to='+to,{cache:'no-store',credentials:'same-origin',headers:{'X-GaryHub-User':String(state.me.id)}});
  if(!r.ok){const v=await r.json().catch(()=>({}));throw Error(v.message||'导出失败');}
  const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='garyhub-ledger-'+from+'_'+to+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  message=x.exported;
 }catch(e){message=e.message;}
 button.disabled=false;render();
}
document.addEventListener('garyhub:language',()=>{if(data)render();});
window.GaryHubBudget={refresh};
})();
