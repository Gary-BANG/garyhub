/* A-share price alerts (v2.4.1.3): set "notify me at or above / at or below" for the stock on screen.
   Alerts fire once, as an in-app notice (and a browser push when enabled in Calendar). */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const panel=$('alert-panel'),body=$('alert-body');if(!panel||!body)return;
const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null&&text!=='')n.textContent=text;return n;};
let current=null,data=null,busy=false;
async function call(route,method='GET',payload){
  const options={method,cache:'no-store',headers:{}};
  if(method!=='GET'){const token=(await (await fetch('/api/csrf',{cache:'no-store'})).json()).token;options.headers={'Content-Type':'application/json','x-csrf-token':token};options.body=JSON.stringify(payload);}
  const r=await fetch('/api/stocks/'+route,options);const value=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(value.message||'请求失败');return value;
}
const describe=a=>(a.direction==='above'?'≥ ':'≤ ')+a.price;
function render(message=''){
  body.replaceChildren();
  if(!data){body.append(make('p','meta',message||'正在读取提醒…'));return;}
  const active=data.alerts.filter(a=>!a.triggeredAt);
  body.append(make('p','meta',`同时最多 ${data.limit} 个未触发的提醒${data.vip?'（A 股 VIP）':''}；交易时段每分钟检查一次，触发后发送站内通知，并在 Calendar 开启浏览器推送后推送到设备。`));
  if(current){
    const form=make('form','alert-form');
    const direction=make('select');direction.setAttribute('aria-label','提醒条件');
    direction.append(new Option('涨到或高于','above'),new Option('跌到或低于','below'));
    const price=make('input');price.inputMode='decimal';price.required=true;price.maxLength=10;price.placeholder='价格';price.setAttribute('aria-label','提醒价格');price.pattern='\\d{1,6}(\\.\\d{1,3})?';
    const submit=make('button','',active.length>=data.limit?'已达上限':'添加提醒');submit.type='submit';submit.disabled=busy||active.length>=data.limit;
    form.append(make('span','alert-name',current.name||current.symbol),direction,price,submit);
    form.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;submit.disabled=true;
      try{data=await call('alerts','POST',{accountId:data.accountId,symbol:current.symbol,name:current.name,direction:direction.value,price:price.value.trim()});render('已添加提醒。');}
      catch(error){busy=false;render(error.message);return;}busy=false;render('已添加提醒。');};
    body.append(form);
  }
  if(message)body.append(make('p','alert-message',message));
  if(!data.alerts.length){body.append(make('p','meta','还没有提醒。'));return;}
  const list=make('ul','alert-list');
  for(const a of data.alerts){
    const row=make('li',a.triggeredAt?'alert-fired':'');
    const text=make('span','',`${a.name||a.symbol} ${describe(a)}`);
    const note=make('small','',a.triggeredAt?`已触发 · ${a.triggeredPrice} · ${new Date(a.triggeredAt).toLocaleString('zh-CN')}`:'等待触发');
    const remove=make('button','',a.triggeredAt?'清除':'取消');remove.type='button';
    remove.onclick=async()=>{remove.disabled=true;try{data=await call('alerts/'+encodeURIComponent(a.id),'DELETE',{accountId:data.accountId});render();}catch(error){render(error.message);}};
    row.append(text,note,remove);list.append(row);
  }
  body.append(list);
}
async function load(){try{data=await call('alerts');render();}catch(error){data=null;render(error.message);}}
document.addEventListener('stocks:open',e=>{current={symbol:e.detail.symbol,name:e.detail.name};if(data&&e.detail.accountId&&e.detail.accountId!==data.accountId){data=null;}render();if(!data)load();});
panel.addEventListener('toggle',()=>{if(panel.open)load();});
})();
