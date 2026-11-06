'use strict';

const symbolPattern = /^(sh(?:60|68)\d{4}|sz(?:00|30)\d{4}|bj(?:[48]\d{5}|92\d{4}))$/;
const fail = (status, message) => Object.assign(new Error(message), {status});
const DAY_COUNT = 22;
const HISTORY_COUNT = DAY_COUNT + 19;
const WINDOWS = [5, 10, 20];

function number(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function positive(value) {
  const n = number(value);
  return n !== null && n > 0 ? n : null;
}

function nonnegative(value) {
  const n = number(value);
  return n !== null && n >= 0 ? n : null;
}

function valid(symbol) {
  if (typeof symbol !== 'string' || !symbolPattern.test(symbol)) throw fail(400, '请选择有效的 A 股代码');
}

function parseQuote(raw, symbol) {
  const fields = raw.split('"')[1]?.split('~') || [];
  if (!raw.startsWith('v_'+symbol+'="') || fields[2] !== symbol.slice(2) || !/^\d{14}$/.test(fields[30]))
    throw Error('Unexpected quotation');

  // Tencent quotes pair each price (yuan) with an order size (lots), best first.
  function levels(start) {
    return Array.from({length:5}, (_,level) => {
      const offset = start + 2 * level;
      const price = positive(fields[offset]);
      return {price, lots:price === null ? null : nonnegative(fields[offset+1])};
    });
  }
  return {
    symbol, name:fields[1], time:fields[30], stale:false,
    price:positive(fields[3]), previous:positive(fields[4]), open:positive(fields[5]),
    high:positive(fields[33]), low:positive(fields[34]), change:number(fields[31]),
    percent:number(fields[32]), volume:nonnegative(fields[36]), amount:nonnegative(fields[37]),
    turnover:nonnegative(fields[38]), peTtm:number(fields[39]), amplitude:nonnegative(fields[43]),
    floatCapYi:nonnegative(fields[44]), totalCapYi:nonnegative(fields[45]),
    pb:number(fields[46]), volumeRatio:nonnegative(fields[49]),
    book:{bids:levels(9), asks:levels(19)}
  };
}

function dailyHistory(rows, source, adjust) {
  if (!Array.isArray(rows) || !rows.length) throw Error('No daily bars');
  const full = rows.slice(-HISTORY_COUNT).map(row => {
    const [date,opening,closing,high,low,volume] = row;
    const prices = [opening,closing,high,low].map(number);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || prices.includes(null)) throw Error('Malformed daily bar');
    return [date,...prices,nonnegative(volume)];
  });
  if (full.some((bar,i) => i > 0 && bar[0] <= full[i-1][0])) throw Error('Invalid daily order');
  const start = Math.max(0,full.length-DAY_COUNT);
  const visible = full.slice(start);
  const averages = {};
  for (const days of WINDOWS) {
    averages['ma'+days] = visible.map((_,i) => {
      const end = start+i+1;
      if (end < days) return null;
      const closes = full.slice(end-days,end);
      return closes.reduce((sum,bar)=>sum+bar[2],0) / days;
    });
  }
  return {source, adjust, bars:visible.map(bar=>bar.slice(0,5)), volumes:visible.map(bar=>bar[5]), averages};
}

function market({request = fetch, clock = Date.now} = {}) {
  const cache = new Map(), pending = new Map();
  const idle = 20 * 60_000;
  function sweep() {
    for (const [key, entry] of cache) if (clock() - entry.used >= idle) cache.delete(key);
  }
  const timer = setInterval(sweep, 60_000);
  timer.unref();
  async function cached(key, ttl, load, allowStale=false) {
    sweep();
    const old = cache.get(key);
    if (old) {
      old.used = clock();
      if (clock() - old.at < ttl) return old.value;
    }
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 32) throw fail(429, '行情请求较多，请稍后再试');
    const task = load().then(value => {
      cache.delete(key);
      if (cache.size >= 512) cache.delete(cache.keys().next().value);
      cache.set(key, {at:clock(), used:clock(), value});
      return value;
    }).catch(() => {
      if (old && allowStale) return {...old.value, stale:true};
      throw fail(503, '数据源暂不可用，请稍后重试');
    }).finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  }
  async function get(url, encoding = 'utf-8') {
    const response = await request(url, {signal:AbortSignal.timeout(8000), redirect:'error'});
    if (!response.ok) throw Error('upstream');
    return new TextDecoder(encoding).decode(await response.arrayBuffer());
  }
  function search(input) {
    const q = typeof input === 'string' ? input.trim() : '';
    if (!q || q.length > 24) throw fail(400, '请输入股票简称或代码');
    return cached('search:'+q, 300_000, async () => {
      const url = new URL('https://searchapi.eastmoney.com/api/suggest/get');
      url.search = new URLSearchParams({input:q, type:'14', count:'15',token:'D43BF722C8E33BDC906FB84D85E326E8'});
      const table = JSON.parse(await get(url)).QuotationCodeTable;
      if (table.Status !== 0) throw Error('search');
      return (table.Data || []).filter(row => row.Classify === 'AStock' || row.SecurityTypeName === '京A').map(row => {
        const prefix = /^(?:[48]|92)/.test(row.Code) ? 'bj' : row.MktNum === '1' ? 'sh' : 'sz';
        return {symbol:prefix+row.Code, name:row.Name};
      }).filter(row => symbolPattern.test(row.symbol));
    });
  }
  function quote(symbol) {
    valid(symbol);
    return cached('quote:'+symbol, 30_000, async () => {
      const raw = await get('https://qt.gtimg.cn/q='+symbol,'gb18030');
      return parseQuote(raw,symbol);
    }, true);
  }
  async function tencentHistory(symbol) {
    const data = JSON.parse(await get('https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param='+symbol+',day,,,'+HISTORY_COUNT+',qfq')).data?.[symbol];
    const adjusted = data?.qfqday?.length > 0;
    return dailyHistory(adjusted ? data.qfqday : data?.day,'腾讯行情',adjusted ? '前复权' : '未复权');
  }
  async function eastmoneyHistory(symbol) {
    const url = new URL('https://push2his.eastmoney.com/api/qt/stock/kline/get');
    const code = symbol.slice(2);
    url.search = new URLSearchParams({
      secid:(symbol.startsWith('sh')?'1.':'0.')+code,klt:'101',fqt:'1',end:'20500101',lmt:String(HISTORY_COUNT),
      fields1:'f1,f2,f3,f4,f5,f6',fields2:'f51,f52,f53,f54,f55,f56,f57'
    });
    const {data} = JSON.parse(await get(url));
    if (data?.code !== code || !Array.isArray(data.klines)) throw Error('Unexpected security');
    return dailyHistory(data.klines.map(line=>line.split(',')),'东方财富','前复权');
  }
  function history(symbol) {
    valid(symbol);
    return cached('history:'+symbol, 300_000, async () => {
      // The Tencent Beijing feed sometimes serves only today's bar.
      if (symbol.startsWith('bj')) {
        try {return await eastmoneyHistory(symbol);} catch {return tencentHistory(symbol);}
      }
      try {return await tencentHistory(symbol);} catch {return eastmoneyHistory(symbol);}
    });
  }
  function intraday(symbol) {
    valid(symbol);
    return cached('intraday:'+symbol,30_000,async()=>{
      const url = 'https://web.ifzq.gtimg.cn/appstock/app/minute/query?code='+symbol;
      const stock = JSON.parse(await get(url)).data?.[symbol];
      const data = stock?.data;
      if (!/^\d{8}$/.test(data?.date) || !Array.isArray(data.data)) throw Error('No intraday session');
      const points = [];
      for (const line of data.data.slice(0,400)) {
        const [time,p] = String(line).trim().split(/\s+/);
        const price = positive(p);
        if (!/^(?:[01]\d|2[0-3])[0-5]\d$/.test(time) || price === null) continue;
        if (points.length && time <= points.at(-1)[0]) continue;
        points.push([time,price]);
      }
      const reference = stock.qt?.[symbol];
      const previous = reference?.[30]?.startsWith(data.date) ? positive(reference[4]) : null;
      return {date:data.date, points, previous, source:'腾讯行情', stale:false};
    },true);
  }
  function financials(symbol) {
    valid(symbol);
    return cached('financials:'+symbol,idle,async()=>{
      const secucode=symbol.slice(2)+'.'+symbol.slice(0,2).toUpperCase();
      const url=new URL('https://datacenter-web.eastmoney.com/api/data/v1/get');
      const columns=['SECUCODE','REPORT_DATE','REPORT_DATE_NAME','NOTICE_DATE','CURRENCY',
        'TOTALOPERATEREVE','TOTALOPERATEREVETZ','PARENTNETPROFIT','PARENTNETPROFITTZ','ROEJQ','NETCASH_OPERATE_PK'];
      url.search = new URLSearchParams({reportName:'RPT_F10_FINANCE_MAINFINADATA',columns:columns.join(','),
        filter:'(SECUCODE="'+secucode+'")', pageSize:'4',pageNumber:'1',
        sortColumns:'REPORT_DATE',sortTypes:'-1',source:'WEB',client:'WEB'});
      const data=JSON.parse(await get(url));
      if (!data.success && data.code !== 9201) throw Error('Financial report unavailable');
      const rows=data.success ? data.result?.data : [];
      if (!Array.isArray(rows)) throw Error('Unrecognized financial report');
      const reports=rows.slice(0,4).map(row=>{
        if (row.SECUCODE!==secucode || !/^\d{4}-\d{2}-\d{2}/.test(row.REPORT_DATE)) throw Error('Report mismatch');
        return {period:row.REPORT_DATE.slice(0,10),name:row.REPORT_DATE_NAME,announced:row.NOTICE_DATE?.slice(0,10) || null,
          currency:row.CURRENCY || null,revenue:number(row.TOTALOPERATEREVE),revenueYoY:number(row.TOTALOPERATEREVETZ),
          parentProfit:number(row.PARENTNETPROFIT),profitYoY:number(row.PARENTNETPROFITTZ),
          roe:number(row.ROEJQ),operatingCashFlow:number(row.NETCASH_OPERATE_PK)};
      });
      return {source:'东方财富 · 主要财务指标',reports};
    });
  }
  return {search, quote, history, intraday, financials};
}
module.exports = {market, symbolPattern, fail};
