'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),sqlite=require('sqlite3');
const {migrateLedger,registerLedger}=require('../ledger-api');
test('mixed-currency summaries include every original row and degrade to original totals without FX',async()=>{
 const raw=new sqlite.Database(':memory:'),db={run:(s,p=[])=>new Promise((y,n)=>raw.run(s,p,function(e){e?n(e):y(this);})),get:(s,p=[])=>new Promise((y,n)=>raw.get(s,p,(e,r)=>e?n(e):y(r))),all:(s,p=[])=>new Promise((y,n)=>raw.all(s,p,(e,r)=>e?n(e):y(r)))};let server;
 try{
  await db.run('CREATE TABLE users(id INTEGER PRIMARY KEY)');await db.run('INSERT INTO users VALUES(2)');await migrateLedger(db);
  const rows=[['a','expense','USD',10000,'food'],['b','expense','CNY',88800,'food'],['c','refund','USD',2000,'food'],['d','income','USD',4000,'salary']];for(const [id,kind,currency,amount,category]of rows)await db.run("INSERT INTO ledger_entries(id,user_id,kind,currency,date,category_id,amount,request_id)VALUES(?,2,?,?,'2026-10-01',?,?,?)",[id,kind,currency,category,amount,id]);
  let available=false;const app=express();registerLedger(app,{db,requireLogin:(req,res,next)=>{req.session={user:{id:2}};next();},fx:{get:async()=>({available,rate:7,date:'2026-10-16'})}});app.use((e,req,res,next)=>res.status(e.status||500).json({message:e.message}));server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
  const fetchSummary=async(currency,category='')=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/ledger/entries?from=2026-10-01&to=2026-10-10&currency=${currency}&category=${category}`,{headers:{'x-garyhub-user':'2'}});assert.equal(r.status,200);return r.json();};
  const noFX=await fetchSummary('USD');assert.equal(noFX.summary,null);assert.equal(noFX.total,4);assert.equal(noFX.rawTotals.CNY.expense,88800);assert.equal(noFX.rawTotals.USD.refund,2000);assert(noFX.items.every(x=>x.convertedAmount===null));
  available=true;const usd=await fetchSummary('USD');assert.equal(usd.total,4);assert.equal(usd.summary.consumption,20686);assert.equal(usd.summary.net,16686);assert.equal(usd.summary.averageConsumption,2068.6);assert.equal(usd.items.find(x=>x.id==='b').amount,'888.00');assert.equal(usd.items.find(x=>x.id==='b').convertedAmount,'126.86');const cny=await fetchSummary('CNY');assert.equal(cny.summary.consumption,144800);assert.equal(cny.summary.net,116800);assert.equal(cny.total,4);const food=await fetchSummary('USD','food');assert.equal(food.total,3);assert.equal(food.summary.income,0);assert.equal(food.summary.consumption,20686);
 }finally{if(server)await new Promise(r=>server.close(r));await new Promise(r=>raw.close(r));}
});
