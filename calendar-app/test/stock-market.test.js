'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {market}=require('../stock-market');
test('Fuzzy suggestions normalize full-width codes, spaces and exchange prefixes; match name subsequences and pinyin',async()=>{
  const terms=[];
  const api=market({request:async url=>{
    const q=new URL(url).searchParams.get('input');terms.push(q);
    const rows=q==='平银'?[]:[
      {Code:'000001',Classify:'AStock',MktNum:'0',Name:'平安银行',PinYin:'PAYH'},
      {Code:'601318',Classify:'AStock',MktNum:'1',Name:'中国平安',PinYin:'ZGPA'},
      {Code:'000001',Classify:'Index',Name:'上证指数'},
      {Code:'00700',Classify:'HKStock',Name:'腾讯控股'}];
    return Response.json({QuotationCodeTable:{Status:0,Data:rows}});
  }});
  assert.deepEqual(await api.search('平银'),[{symbol:'sz000001',name:'平安银行'}]);
  assert.deepEqual(terms,['平银','平']);
  assert.deepEqual(await api.search(' PA YH '),[{symbol:'sz000001',name:'平安银行'}]);
  assert.deepEqual(await api.search('ＳＺ ０００００１'),[{symbol:'sz000001',name:'平安银行'}]);
  assert.deepEqual(await api.search('安银'),[{symbol:'sz000001',name:'平安银行'}]);
  assert.deepEqual(await api.search('1318'),[{symbol:'sh601318',name:'中国平安'}]);
  const count=terms.length;await api.search('payh');assert.equal(terms.length,count);
  for(const q of [[],null,'  ','x'.repeat(25)])assert.throws(()=>api.search(q),e=>e.status===400);
});
test('Fuzzy matching is bounded, deduplicated and does not retain suggestion candidates past idle expiry',async()=>{
  let now=1,calls=0;
  const api=market({clock:()=>now,request:async()=>{
    calls++;
    const rows=calls===1?[{Code:'000001',MktNum:'0',Classify:'AStock',Name:'平安银行',PinYin:'PAYH'}]:[];
    return Response.json({QuotationCodeTable:{Status:0,Data:rows}});
  }});
  assert.equal((await api.search('平安')).length,1);
  now+=21*60_000;
  assert.deepEqual(await api.search('平银'),[]);
  assert.equal(calls,3);
});
test('Search, quote cache, stale fallback, idle expiry, single-symbol K lines',async()=>{
  let now=1,calls=[],offline=false;
  const api=market({clock:()=>now,request:async input=>{
    const url=String(input);calls.push(url);
    if(offline)throw Error('offline');
    if(url.includes('/suggest/'))return Response.json({QuotationCodeTable:{Status:0,Data:[{Code:'300033',Classify:'AStock',MktNum:'0',Name:'同花顺'},{Code:'000001',Classify:'Index'}]}});
    if(url.includes('fqkline'))return Response.json({data:{sz300033:{qfqday:[['2026-11-06','1','2','3','1']]}}});
    const fields=Array(40).fill('0');Object.assign(fields,{1:'test',2:'300033',3:'123',30:'20261106150000'});
    return new Response('v_sz300033="'+fields.join('~')+'";');
  }});
  assert.deepEqual(await api.search('同花顺'),[{symbol:'sz300033',name:'同花顺'}]);assert.equal(calls.length,1);
  const [a,b]=await Promise.all([api.quote('sz300033'),api.quote('sz300033')]);
  assert.equal(a.price,123);assert.deepEqual(a,b);assert.match(calls[1],/q=sz300033$/);
  await api.quote('sz300033');assert.equal(calls.length,2);
  assert.deepEqual((await api.history('sz300033')).bars,[['2026-11-06',1,2,3,1]]);
  offline=true;now+=31_000;assert.equal((await api.quote('sz300033')).stale,true);
  now+=20*60_000;await assert.rejects(api.quote('sz300033'),e=>e.status===503);
});

test('Quote uses distinct bid/ask levels, lots and named valuation units; missing fields stay null',async()=>{
  const fields=Array(50).fill('');
  Object.assign(fields,{1:'fixture',2:'300033',3:'10.02',30:'20261106143000',38:'0.00',39:'-3.10',
    43:'2.30',44:'12.10',45:'12.80',46:'0.9',49:'0.75'});
  for(let i=0;i<5;i++){
    fields[9+2*i]=String(10-i/100);fields[10+2*i]=String(11+i);
    fields[19+2*i]=String(10.02+i/100);fields[20+2*i]=String(21+i);
  }
  fields[17]='0.00'; fields[18]='0';
  fields[25]='--';fields[26]='';
  const api=market({request:async()=>new Response('v_sz300033="'+fields.join('~')+'";')});
  const q=await api.quote('sz300033');
  assert.equal(q.peTtm,-3.1);assert.equal(q.pb,.9);assert.equal(q.turnover,0);
  assert.equal(q.volumeRatio,.75);assert.equal(q.amplitude,2.3);
  assert.equal(q.totalCapYi,12.8);assert.equal(q.floatCapYi,12.1);
  assert.equal(q.volume,null);assert.equal(q.amount,null);
  assert.equal(q.book.bids.length,5);assert.equal(q.book.asks.length,5);
  assert.deepEqual(q.book.bids[0],{price:10,lots:11});assert.deepEqual(q.book.asks[0],{price:10.02,lots:21});
  assert.deepEqual(q.book.bids[4],{price:null,lots:null});assert.deepEqual(q.book.asks[3],{price:null,lots:null});
});

function series(n) {
  return Array.from({length:n},(_,i)=>{
    const date=new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10);
    return [date,i+10,i+11,i+12,i+9,i===4?null:i*100];
  });
}
test('Visible daily bars retain the prior 19 closes; volume stays aligned with OHLC',async()=>{
  const rows=series(41),api=market({request:async url=>{
    assert.match(String(url),/sz300033,day,,,41,qfq$/);
    return Response.json({data:{sz300033:{qfqday:rows}}});
  }});
  const h=await api.history('sz300033');
  assert.equal(h.bars.length,22);assert.equal(h.bars[0][0],rows[19][0]);
  assert.deepEqual(h.volumes,rows.slice(-22).map(r=>r[5]));
  assert.equal(h.averages.ma20[0],20.5);assert.equal(h.averages.ma10[0],25.5);
  assert.equal(h.averages.ma5[0],28);assert.equal(h.averages.ma20.at(-1),41.5);
});
test('Beijing selects individual adjusted history, then falls back to available unadjusted bars',async()=>{
  const calls=[],stock='bj920185';
  const api=market({request:async url=>{
    const target=new URL(url);calls.push(target);
    if(target.hostname==='push2his.eastmoney.com')return new Response('',{status:503});
    return Response.json({data:{[stock]:{day:series(5)}}});
  }});
  const h=await api.history(stock);
  assert.equal(calls[0].searchParams.get('secid'),'0.920185');assert.equal(calls.length,2);
  assert.equal(h.adjust,'未复权');assert.equal(h.averages.ma5[4],13);
  assert.deepEqual(h.averages.ma20,[null,null,null,null,null]);assert.equal(h.volumes[4],null);
});
test('Intraday uses the reported session, skips placeholders and rejects a different day reference close',async()=>{
  let calls=0;
  const api=market({request:async url=>{
    calls++;assert.equal(new URL(url).searchParams.get('code'),'sh600000');
    const fields=[];fields[30]='20261106143000';fields[4]='9.50';
    return Response.json({data:{sh600000:{qt:{sh600000:fields},data:{date:'20261105',
      data:['0930 10 100','0931 0 0','0932 -- 300','1129 10.2 701','1129 10.2 701','1300 10.3 702']}}}});
  }});
  const [m]=await Promise.all([api.intraday('sh600000'),api.intraday('sh600000')]);
  assert.equal(calls,1);assert.equal(m.previous,null);assert.equal(m.date,'20261105');
  assert.deepEqual(m.points,[['0930',10],['1129',10.2],['1300',10.3]]);
});
test('Financials request one security with a report limit; total cash, zero, losses and missing values remain distinct',async()=>{
  let count=0;
  const api=market({request:async url=>{
    count++;
    const p=new URL(url).searchParams;
    assert.equal(p.get('reportName'),'RPT_F10_FINANCE_MAINFINADATA');
    assert.equal(p.get('filter'),'(SECUCODE="920185.BJ")');assert.equal(p.get('pageSize'),'4');
    return Response.json({success:true,result:{data:[{SECUCODE:'920185.BJ',REPORT_DATE:'2026-09-30 00:00:00',REPORT_DATE_NAME:'2026三季报',
      CURRENCY:'CNY',NOTICE_DATE:'2026-10-25 00:00:00',TOTALOPERATEREVE:'100000000',TOTALOPERATEREVETZ:0,
      PARENTNETPROFIT:-3200000,PARENTNETPROFITTZ:null,ROEJQ:'--',NETCASH_OPERATE_PK:-100500000,MGJYXJJE:-.23}] }});
  }});
  const f=await api.financials('bj920185');await api.financials('bj920185');assert.equal(count,1);
  assert.deepEqual(f.reports[0],{period:'2026-09-30',name:'2026三季报',announced:'2026-10-25',currency:'CNY',
    revenue:100000000,revenueYoY:0,parentProfit:-3200000,profitYoY:null,roe:null,operatingCashFlow:-100500000});
});
test('Each advanced endpoint validates securities before requesting and separates empty disclosures from failures',async()=>{
  let count=0;
  const api=market({request:async()=>{
    count++;
    if(count===1)return Response.json({success:false,code:9201,result:null});
    return Response.json({success:true,result:{data:[{SECUCODE:'600000.SH',REPORT_DATE:'2026-06-30'}]}});
  }});
  for(const method of ['quote','history','intraday','financials']){
    for(const input of ['sz300033,sh600000','http://example.invalid',['sh600000']])assert.throws(()=>api[method](input),e=>e.status===400);
  }
  assert.equal(count,0);assert.deepEqual((await api.financials('bj920185')).reports,[]);
  await assert.rejects(api.financials('sz300033'),e=>e.status===503);
});
