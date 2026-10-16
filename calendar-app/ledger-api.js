'use strict';
const crypto=require('node:crypto');
const path=require('node:path');
const {createFx,convert}=require('./fx-rates');
const BUILTIN=[['food','🍜','餐饮'],['groceries','🛒','食品与日用品'],['transport','🚗','交通出行'],['housing','🏠','住房与水电'],['shopping','🛍️','服饰购物'],['education','📚','学习教育'],['fun','🎮','娱乐社交'],['health','💊','医疗健康'],['subscription','📱','通讯与订阅'],['travel','✈️','旅行'],['gifts','🎁','礼物与人情'],['other','📦','其他'],['salary','💼','工资兼职','income'],['scholarship','🎓','奖学金','income'],['allowance','👪','生活费','income'],['income-other','💰','其他收入','income']].map(([id,icon,name,type='expense'])=>({id,icon,name,type,active:1,builtin:true}));
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
function date(s){if(typeof s!=='string'||!/^\d{4}-\d\d-\d\d$/.test(s)||s<'1900-01-01'||s>'2199-12-31'||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)fail('日期应为有效的 YYYY-MM-DD（1900–2199）');return s;}
function money(s){if(typeof s!=='string'||!/^\d{1,8}(?:\.\d{1,2})?$/.test(s))fail('金额应为正数，最多两位小数');const [a,b='']=s.split('.'),n=Number(a)*100+Number(b.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n<=0||n>9999999999)fail('金额应大于 0，且不超过 99,999,999.99');return n;}
function connection(){const sqlite=require('sqlite3'),db=new sqlite.Database(path.join(require('./db').dataDir,'calendar.sqlite'));db.configure('busyTimeout',5000);return {run:(s,p=[])=>new Promise((y,n)=>db.run(s,p,function(e){e?n(e):y(this);})),get:(s,p=[])=>new Promise((y,n)=>db.get(s,p,(e,r)=>e?n(e):y(r))),all:(s,p=[])=>new Promise((y,n)=>db.all(s,p,(e,r)=>e?n(e):y(r)))};}
async function migrateLedger(db){
 await db.run(`CREATE TABLE IF NOT EXISTS ledger_categories(id TEXT NOT NULL,user_id INTEGER NOT NULL REFERENCES users(id),type TEXT NOT NULL CHECK(type IN('expense','income')),name TEXT NOT NULL,icon TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(user_id,id))`);
 await db.run(`CREATE TABLE IF NOT EXISTS ledger_entries(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN('expense','income','refund')),currency TEXT NOT NULL CHECK(currency IN('CNY','USD')),date TEXT NOT NULL,category_id TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),notes TEXT NOT NULL DEFAULT '',refund_of TEXT REFERENCES ledger_entries(id) ON DELETE RESTRICT,revision INTEGER NOT NULL DEFAULT 1,request_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,request_id))`);
 await db.run('CREATE INDEX IF NOT EXISTS idx_ledger_user_date ON ledger_entries(user_id,currency,date)');
 await db.run('CREATE INDEX IF NOT EXISTS idx_ledger_refund ON ledger_entries(refund_of)');
}
function registerLedger(app,{requireLogin,db=connection(),fx=createFx({dataDir:require('./db').dataDir})}){
 // Dedicated connection + serialized transactions keep refund checks atomic, without sharing transactions with Calendar.
 let queue=db.run('PRAGMA foreign_keys = ON');
 const route=fn=>[requireLogin,(req,res,next)=>{
  if(String(req.session.user.id)!==req.get('x-garyhub-user'))return res.status(409).json({message:'账号已变化，请刷新页面；当前草稿没有保存到其他账号'});
  const task=queue.then(()=>fn(req,res));queue=task.catch(()=>{});task.catch(next);
 }];
 async function categories(uid){const edits=await db.all('SELECT * FROM ledger_categories WHERE user_id=?',[uid]),map=new Map(BUILTIN.map(c=>[c.id,{...c}]));for(const c of edits)map.set(c.id,{...c,builtin:map.has(c.id)});return [...map.values()];}
 const fetchEntry=(uid,id)=>db.get('SELECT * FROM ledger_entries WHERE user_id=? AND id=?',[uid,id]);
 async function transaction(fn){await db.run('BEGIN IMMEDIATE');try{const value=await fn();await db.run('COMMIT');return value;}catch(e){await db.run('ROLLBACK');throw e;}}
 function output(row){return {...row,amount:(row.amount/100).toFixed(2)};}
 app.get('/api/ledger/fx',...route(async(req,res)=>res.json(await fx.get())));
 app.get('/api/ledger/categories',...route(async(req,res)=>res.json(await categories(req.session.user.id))));
 app.post('/api/ledger/categories',...route(async(req,res)=>{
  const uid=req.session.user.id,v=req.body;if(!['expense','income'].includes(v.type)||typeof v.name!=='string'||!v.name.trim()||v.name.trim().length>24||typeof v.icon!=='string'||!v.icon.trim()||[...v.icon].length>12)fail('请填写类别名称（最多24字）和图标');
  const id='custom-'+crypto.randomUUID();await db.run('INSERT INTO ledger_categories(id,user_id,type,name,icon) VALUES(?,?,?,?,?)',[id,uid,v.type,v.name.trim(),v.icon.trim()]);res.status(201).json({id});
 }));
 app.put('/api/ledger/categories/:id',...route(async(req,res)=>{
  const uid=req.session.user.id,c=(await categories(uid)).find(c=>c.id===req.params.id),v=req.body;if(!c)fail('类别不存在',404);
  if(typeof v.name!=='string'||!v.name.trim()||v.name.trim().length>24||typeof v.icon!=='string'||!v.icon.trim()||[...v.icon].length>12||typeof v.active!=='boolean')fail('类别设置无效');
  await db.run(`INSERT INTO ledger_categories(id,user_id,type,name,icon,active) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET name=excluded.name,icon=excluded.icon,active=excluded.active`,[c.id,uid,c.type,v.name.trim(),v.icon.trim(),Number(v.active)]);res.json({ok:true});
 }));
 function range(q){const from=date(q.from),to=date(q.to);if(to<from)fail('结束日期不能早于开始日期');if(!['CNY','USD'].includes(q.currency))fail('请选择人民币或美元');return {from,to,currency:q.currency,days:Math.round((Date.parse(to)-Date.parse(from))/86400000)+1};}
 app.get('/api/ledger/entries',...route(async(req,res)=>{
  const uid=req.session.user.id,r=range(req.query),category=typeof req.query.category==='string'?req.query.category:'',page=Number(req.query.page||1);if(!Number.isSafeInteger(page)||page<1||page>100000)fail('页码无效');
  const params=[uid,r.from,r.to,...(category?[category]:[])],where='user_id=? AND date BETWEEN ? AND ?'+(category?' AND category_id=?':'');
  const all=await db.all(`SELECT * FROM ledger_entries WHERE ${where} ORDER BY date DESC,created_at DESC,id DESC`,params);
  const rate=await fx.get(),rawTotals={USD:{expense:0,income:0,refund:0},CNY:{expense:0,income:0,refund:0}};
  let expense=0,income=0,refund=0;const byCategory={},daily={};
  for(const x of all){rawTotals[x.currency][x.kind]+=x.amount;if(!rate.available)continue;const value=convert(x.amount,x.currency,r.currency,rate.rate);if(x.kind==='income')income+=value;else if(x.kind==='refund')refund+=value;else expense+=value;const delta=x.kind==='expense'?value:x.kind==='refund'?-value:0;if(delta){byCategory[x.category_id]=(byCategory[x.category_id]||0)+delta;daily[x.date]=(daily[x.date]||0)+delta;}}
  const consumption=expense-refund,net=consumption-income;if(![expense,income,refund,consumption,net,...Object.values(rawTotals).flatMap(x=>Object.values(x))].every(Number.isSafeInteger))fail('统计金额超过安全范围');
  res.json({items:all.slice((page-1)*30,page*30).map(x=>({...output(x),convertedAmount:rate.available?(convert(x.amount,x.currency,r.currency,rate.rate)/100).toFixed(2):null,summaryCurrency:r.currency})),page,total:all.length,pages:Math.max(1,Math.ceil(all.length/30)),fx:rate,period:r,rawTotals,summary:rate.available?{...r,expense,income,refund,consumption,net,averageConsumption:consumption/r.days,averageNet:net/r.days,byCategory,daily}:null,categories:await categories(uid)});
 }));
 app.get('/api/ledger/expenses',...route(async(req,res)=>{
  const uid=req.session.user.id;const rows=await db.all(`SELECT e.*,e.amount-COALESCE((SELECT SUM(r.amount) FROM ledger_entries r WHERE r.user_id=e.user_id AND r.refund_of=e.id),0) AS remaining FROM ledger_entries e WHERE e.user_id=? AND e.kind='expense' ORDER BY e.date DESC,e.created_at DESC LIMIT 1000`,[uid]);res.json(rows.map(x=>({...output(x),remaining:(x.remaining/100).toFixed(2)})));
 }));
 async function validate(uid,v,old){
  if(!['expense','income','refund'].includes(v.kind)||!['CNY','USD'].includes(v.currency))fail('记录性质或币种无效');
  const x={kind:v.kind,currency:v.currency,date:date(v.date),category_id:v.categoryId,amount:money(v.amount),notes:v.notes??'',refund_of:v.refundOf||null};
  if(typeof x.notes!=='string'||x.notes.length>1000)fail('备注最多1000字');
  if(x.refund_of&&x.kind!=='refund')fail('只有退款可以关联原消费');
  if(x.refund_of){const parent=await fetchEntry(uid,x.refund_of);if(!parent||parent.kind!=='expense'||parent.id===old?.id)fail('原消费不存在或不属于当前账号');if(x.date<parent.date)fail('退款日期不能早于原消费');x.currency=parent.currency;x.category_id=parent.category_id;const used=await db.get('SELECT COALESCE(SUM(amount),0) AS n FROM ledger_entries WHERE user_id=? AND refund_of=? AND id!=?',[uid,parent.id,old?.id||'']);if(used.n+x.amount>parent.amount)fail('累计退款不能超过原消费金额');}
  const cs=await categories(uid),c=cs.find(c=>c.id===x.category_id);if(!c||c.type!==(x.kind==='income'?'income':'expense')||!c.active&&old?.category_id!==c.id&&!x.refund_of)fail('请选择有效的对应类别');
  if(old){const children=await db.all('SELECT * FROM ledger_entries WHERE user_id=? AND refund_of=?',[uid,old.id]);if(children.length&&(x.kind!=='expense'||x.currency!==old.currency||x.category_id!==old.category_id||children.some(r=>r.date<x.date)||children.reduce((s,r)=>s+r.amount,0)>x.amount))fail('此消费有关联退款；请先调整退款，再修改性质、币种、类别、日期或金额');}
  return x;
 }
 app.post('/api/ledger/entries',...route(async(req,res)=>{
  const uid=req.session.user.id,v=req.body;if(typeof v.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(v.requestId))fail('请求编号无效，请刷新后重试');
  const result=await transaction(async()=>{const old=await db.get('SELECT * FROM ledger_entries WHERE user_id=? AND request_id=?',[uid,v.requestId]);if(old)return {item:output(old),duplicate:true};const x=await validate(uid,v),id=crypto.randomUUID();await db.run('INSERT INTO ledger_entries(id,user_id,kind,currency,date,category_id,amount,notes,refund_of,request_id) VALUES(?,?,?,?,?,?,?,?,?,?)',[id,uid,x.kind,x.currency,x.date,x.category_id,x.amount,x.notes,x.refund_of,v.requestId]);return {item:output(await fetchEntry(uid,id))};});res.status(result.duplicate?200:201).json(result);
 }));
 app.put('/api/ledger/entries/:id',...route(async(req,res)=>{
  const uid=req.session.user.id,v=req.body;const item=await transaction(async()=>{const old=await fetchEntry(uid,req.params.id);if(!old)fail('记录不存在',404);if(v.revision!==old.revision)fail('记录已在另一页面修改，请刷新',409);const x=await validate(uid,v,old);await db.run(`UPDATE ledger_entries SET kind=?,currency=?,date=?,category_id=?,amount=?,notes=?,refund_of=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?`,[x.kind,x.currency,x.date,x.category_id,x.amount,x.notes,x.refund_of,uid,old.id]);return output(await fetchEntry(uid,old.id));});res.json({item});
 }));
 app.delete('/api/ledger/entries/:id',...route(async(req,res)=>{
  const uid=req.session.user.id;await transaction(async()=>{const old=await fetchEntry(uid,req.params.id);if(!old)fail('记录不存在',404);if(req.body.revision!==old.revision)fail('记录已变化，请刷新后重试',409);const children=await db.get('SELECT COUNT(*) AS n FROM ledger_entries WHERE user_id=? AND refund_of=?',[uid,old.id]);if(children.n)fail('请先删除或取消关联此消费的退款');await db.run('DELETE FROM ledger_entries WHERE user_id=? AND id=?',[uid,old.id]);});res.json({ok:true});
 }));
}
module.exports={registerLedger,migrateLedger,money,date,BUILTIN};
