'use strict';
const path = require('node:path');
const {market, symbolPattern, fail} = require('./stock-market');
const {currentUser} = require('./entitlements');
const {rateLimit} = require('./rate-limit');
const schema = 'CREATE TABLE IF NOT EXISTS stock_lists (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, revision INTEGER NOT NULL, groups_json TEXT NOT NULL)';
function validate(groups) {
  const symbols = new Set(), names = new Set();
  if (!Array.isArray(groups) || groups.length > 3) throw fail(422,'最多创建 3 个分组');
  return groups.map(group => {
    const name = group?.name;
    if (typeof name !== 'string' || !name.trim() || name !== name.trim() || name.length > 20 || names.has(name)) throw fail(422,'组名须唯一，且为 1 至 20 个字符');
    names.add(name);
    if (!Array.isArray(group.symbols) || group.symbols.length > 5) throw fail(422,'每组最多 5 只股票');
    for (const symbol of group.symbols) {
      if (typeof symbol !== 'string' || !symbolPattern.test(symbol) || symbols.has(symbol)) throw fail(422,'代码无效或股票重复');
      symbols.add(symbol);
    }
    return {name,symbols:group.symbols};
  });
}
function register(app, db, provider = market()) {
  const wrap = fn => (req,res,next) => Promise.resolve().then(()=>fn(req,res,next)).catch(error => {
    if (!error.status) return next(error);
    res.status(error.status).json({message:error.message});
  });
  app.use(['/stocks','/api/stocks'], wrap(async(req,res,next) => {
    res.set('Cache-Control','private, no-store');
    if (!req.session.user) throw fail(401,'请先登录 GaryHub');
    const user = await currentUser(db,req);
    if (user.account_tier !== 'subscriber') throw fail(403,'此工具仅供订阅用户使用');
    req.stockUser = user.id;
    next();
  }));
  for (const [route,file] of [['/stocks/','index.html'],['/stocks/app.js','app.js'],['/stocks/style.css','style.css'],['/stocks/charts.js','charts.js']])
    app.get(route,(req,res)=>res.sendFile(path.join(__dirname,'stocks',file),{cacheControl:false}));
  app.use('/api/stocks',rateLimit(180,60_000));
  app.get('/api/stocks/status',wrap(async(req,res)=>{
    const user=await db.get('SELECT stock_vip FROM users WHERE id=?',[req.stockUser]);
    res.json({accountId:req.stockUser,vip:user.stock_vip===1});
  }));
  app.get('/api/stocks/groups',wrap(async(req,res)=>{
    const row = await db.get('SELECT revision,groups_json FROM stock_lists WHERE user_id=?',[req.stockUser]);
    res.json({accountId:req.stockUser,revision:row?.revision || 0,groups:row ? JSON.parse(row.groups_json) : []});
  }));
  app.put('/api/stocks/groups',wrap(async(req,res)=>{
    const {accountId, revision, groups} = req.body || {};
    if (accountId !== req.stockUser || !Number.isSafeInteger(revision) || revision < 0) throw fail(409,'账号或版本已变化，请刷新');
    const json = JSON.stringify(validate(groups));
    const result = revision === 0
      ? await db.run('INSERT OR IGNORE INTO stock_lists VALUES (?,1,?)',[accountId,json])
      : await db.run('UPDATE stock_lists SET groups_json=?,revision=revision+1 WHERE user_id=? AND revision=?',[json,accountId,revision]);
    if (result.changes !== 1) throw fail(409,'其他页面已修改收藏，请刷新');
    res.json({accountId,revision:revision+1,groups:JSON.parse(json)});
  }));
  for (const [route,arg] of [['search','q'],['quote','symbol'],['history','symbol'],['intraday','symbol'],['financials','symbol']])
    app.get('/api/stocks/'+route,wrap(async(req,res)=>res.json(await provider[route](req.query[arg]))));
}
module.exports = {register,schema,validate};
