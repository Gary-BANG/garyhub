'use strict';
const crypto = require('node:crypto');
const {CURRENCIES, convert} = require('./fx-rates');

async function migrateFixedExpenses(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS fixed_expenses (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0),
    currency TEXT NOT NULL CHECK(currency IN('CNY','USD','CAD','HKD')),
    period TEXT NOT NULL CHECK(period IN('monthly','yearly')), category_id TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
    revision INTEGER NOT NULL DEFAULT 1, request_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id,request_id))`);
  await db.run(`CREATE TABLE IF NOT EXISTS fixed_expense_posts (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
    fixed_id TEXT NOT NULL REFERENCES fixed_expenses(id) ON DELETE CASCADE,
    entry_id TEXT NOT NULL REFERENCES ledger_entries(id) ON DELETE CASCADE,
    date TEXT NOT NULL, request_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id,request_id), UNIQUE(user_id,fixed_id,date))`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_fixed_user ON fixed_expenses(user_id,active)');
}

function registerFixedExpenses(app, {db, route, categories, fx, transaction, output, fetchEntry, validate, money, date}) {
  const fail = (message, status=400) => {throw Object.assign(Error(message), {status});};
  const uuid = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
  const find = (uid, id) => db.get('SELECT * FROM fixed_expenses WHERE user_id=? AND id=?', [uid,id]);
  const revision = (v, old) => {if(v.revision !== old.revision) fail('固定开支已在另一页面修改，请刷新后重试',409);};
  async function fields(uid,v,old) {
    if(typeof v.name !== 'string' || !v.name.trim() || v.name.trim().length>80) fail('请填写固定开支名称（最多80字）');
    if(!CURRENCIES.includes(v.currency) || !['monthly','yearly'].includes(v.period) || typeof v.active !== 'boolean') fail('固定开支设置无效');
    const cs=await categories(uid), c=cs.find(c=>c.id===v.categoryId);
    if(!c || c.type!=='expense' || (!c.active && old?.category_id!==c.id)) fail('请选择有效的支出类别');
    if(typeof v.notes!=='string' || v.notes.length>800) fail('固定开支备注最多800字');
    return {name:v.name.trim(),amount:money(v.amount),currency:v.currency,period:v.period,category_id:c.id,notes:v.notes,active:Number(v.active)};
  }
  app.get('/api/ledger/fixed', ...route(async(req,res)=>{
    const uid=req.session.user.id, currency=req.query.currency||'CNY', category=req.query.category||'';
    if(!CURRENCIES.includes(currency)||typeof category!=='string') fail('请选择有效的汇总币种和类别');
    const items=await db.all(`SELECT f.*,
      (SELECT e.id FROM fixed_expense_posts p JOIN ledger_entries e ON e.id=p.entry_id WHERE p.user_id=f.user_id AND p.fixed_id=f.id ORDER BY p.created_at DESC,p.rowid DESC LIMIT 1) AS last_entry_id,
      (SELECT e.date FROM fixed_expense_posts p JOIN ledger_entries e ON e.id=p.entry_id WHERE p.user_id=f.user_id AND p.fixed_id=f.id ORDER BY p.created_at DESC,p.rowid DESC LIMIT 1) AS last_entry_date
      FROM fixed_expenses f WHERE f.user_id=? ${category?'AND f.category_id=?':''} ORDER BY f.active DESC,f.created_at DESC,f.id`,category?[uid,category]:[uid]);
    const rate=await fx.get(), rawTotals=Object.fromEntries(CURRENCIES.map(c=>[c,{annual:0,monthly:0}])), byCategory={};
    let annual=0,activeCount=0;
    for(const x of items) {
      if(!x.active)continue;activeCount++;
      const times=x.period==='monthly'?12:1;
      rawTotals[x.currency].annual+=x.amount*times;
      if(rate.available){const n=convert(x.amount,x.currency,currency,rate.rates||rate.rate)*times;annual+=n;byCategory[x.category_id]=(byCategory[x.category_id]||0)+n;}
    }
    for(const total of Object.values(rawTotals))total.monthly=total.annual/12;
    if(![annual,...Object.values(byCategory),...Object.values(rawTotals).map(x=>x.annual)].every(Number.isSafeInteger))fail('统计金额超过安全范围');
    res.json({items:items.map(output),categories:await categories(uid),fx:rate,rawTotals,activeCount,
      summary:rate.available?{currency,annual,monthly:annual/12,byCategory}:null});
  }));
  app.post('/api/ledger/fixed', ...route(async(req,res)=>{
    const uid=req.session.user.id,v=req.body;if(!uuid(v.requestId))fail('请求编号无效，请刷新后重试');
    const result=await transaction(async()=>{
      const old=await db.get('SELECT * FROM fixed_expenses WHERE user_id=? AND request_id=?',[uid,v.requestId]);
      if(old)return {item:output(old),duplicate:true};
      if((await db.get('SELECT COUNT(*) AS n FROM fixed_expenses WHERE user_id=?',[uid])).n>=300)fail('每账号最多保存300项固定开支');
      const x=await fields(uid,v),id=crypto.randomUUID();
      await db.run('INSERT INTO fixed_expenses(id,user_id,name,amount,currency,period,category_id,notes,active,request_id) VALUES(?,?,?,?,?,?,?,?,?,?)',[id,uid,x.name,x.amount,x.currency,x.period,x.category_id,x.notes,x.active,v.requestId]);
      return {item:output(await find(uid,id))};
    });res.status(result.duplicate?200:201).json(result);
  }));
  app.put('/api/ledger/fixed/:id', ...route(async(req,res)=>{
    const uid=req.session.user.id,v=req.body;
    const item=await transaction(async()=>{const old=await find(uid,req.params.id);if(!old)fail('固定开支不存在',404);revision(v,old);const x=await fields(uid,v,old);
      await db.run('UPDATE fixed_expenses SET name=?,amount=?,currency=?,period=?,category_id=?,notes=?,active=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?',[x.name,x.amount,x.currency,x.period,x.category_id,x.notes,x.active,uid,old.id]);
      return output(await find(uid,old.id));});res.json({item});
  }));
  app.delete('/api/ledger/fixed/:id', ...route(async(req,res)=>{
    const uid=req.session.user.id;await transaction(async()=>{const old=await find(uid,req.params.id);if(!old)fail('固定开支不存在',404);revision(req.body,old);await db.run('DELETE FROM fixed_expenses WHERE user_id=? AND id=?',[uid,old.id]);});res.json({ok:true});
  }));
  app.post('/api/ledger/fixed/:id/post', ...route(async(req,res)=>{
    const uid=req.session.user.id,v=req.body;if(!uuid(v.requestId))fail('请求编号无效，请刷新后重试');
    const result=await transaction(async()=>{
      const posted=await db.get('SELECT * FROM fixed_expense_posts WHERE user_id=? AND request_id=?',[uid,v.requestId]);
      if(posted){if(posted.fixed_id!==req.params.id)fail('请求编号已用于其他固定开支',409);return {item:output(await fetchEntry(uid,posted.entry_id)),duplicate:true};}
      const old=await find(uid,req.params.id);if(!old)fail('固定开支不存在',404);
      const paidDate=date(v.date),same=await db.get('SELECT * FROM fixed_expense_posts WHERE user_id=? AND fixed_id=? AND date=?',[uid,old.id,paidDate]);
      if(same)return {item:output(await fetchEntry(uid,same.entry_id)),duplicate:true};
      revision(v,old);if(!old.active)fail('请先启用这项固定开支再记入账本');
      if(await db.get('SELECT 1 FROM ledger_entries WHERE user_id=? AND request_id=?',[uid,v.requestId]))fail('请求编号已用于其他账目',409);
      const x=await validate(uid,{kind:'expense',currency:old.currency,date:paidDate,amount:v.amount===undefined?(old.amount/100).toFixed(2):v.amount,categoryId:old.category_id,notes:'固定开支：'+old.name+(old.notes?'\n'+old.notes:'')});
      const id=crypto.randomUUID();
      await db.run('INSERT INTO ledger_entries(id,user_id,kind,currency,date,category_id,amount,notes,refund_of,request_id) VALUES(?,?,?,?,?,?,?,?,?,?)',[id,uid,x.kind,x.currency,x.date,x.category_id,x.amount,x.notes,null,v.requestId]);
      await db.run('INSERT INTO fixed_expense_posts(id,user_id,fixed_id,entry_id,date,request_id) VALUES(?,?,?,?,?,?)',[crypto.randomUUID(),uid,old.id,id,paidDate,v.requestId]);
      return {item:output(await fetchEntry(uid,id)),duplicate:false};
    });res.status(result.duplicate?200:201).json(result);
  }));
}
module.exports={migrateFixedExpenses,registerFixedExpenses};
