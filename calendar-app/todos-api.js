'use strict';
const crypto = require('node:crypto');
const {openConnection, queuedRoutes, transaction} = require('./sqlite-connection');
const imports = require('./public/todos/import-format');
const entitlement = require('./entitlements');
const MAX_BYTES = 1800000;
const fail = (message, status=400) => { throw Object.assign(Error(message), {status}); };
function validateTodos(todos) {
  if (!Array.isArray(todos) || todos.length > 300) fail('最多保存 300 条待办');
  const ids = new Set();
  const id = value => {
    if (typeof value !== 'string' || !/^[a-f0-9-]{36}$/.test(value) || ids.has(value)) fail('待办或子要点编号无效');
    ids.add(value); return value;
  };
  const text = (value, max) => {
    if (typeof value !== 'string' || !value.trim() || value.length > max) fail('请填写有效的标题或子要点');
    return value.trim();
  };
  const bool = value => { if (typeof value !== 'boolean') fail('完成状态无效'); return value; };
  const clean = todos.map(todo => {
    if (!todo || !Array.isArray(todo.points) || todo.points.length > 100) fail('每条待办最多 100 个子要点');
    return {id:id(todo.id), title:text(todo.title,160), done:bool(todo.done), points:todo.points.map(p => {
      if (!p) fail('子要点无效');
      return {id:id(p.id), text:text(p.text,1000), done:bool(p.done)};
    })};
  });
  if (Buffer.byteLength(JSON.stringify(clean)) > MAX_BYTES) fail('待办内容过大，请整理后再保存');
  return clean;
}
async function migrateTodos(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS todo_lists (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT '[]',
    request_id TEXT, request_hash TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}
function registerTodos(app, {requireLogin, db=openConnection()}) {
  const queued = queuedRoutes(db);
  const guard = (req,res,next) => {
    if (String(req.session.user.id) !== req.get('x-garyhub-user')) return res.status(409).json({message:'登录账号已变化，请刷新页面后继续。'});
    next();
  };
  const route = fn => [requireLogin, guard, queued(fn)];
  const read = uid => db.get('SELECT * FROM todo_lists WHERE user_id=?',[uid]);
  const output = (row,uid) => ({accountId:uid,revision:row?.revision||0,todos:row?JSON.parse(row.state):[],updatedAt:row?.updated_at||null});
  const currentUser = req => entitlement.currentUser(db,req);
  const importRequest = (req,commit) => {
    const v=req.body;
    if (!v || typeof v!=='object' || Array.isArray(v)) fail('导入请求无效，请重新预览');
    if (v.accountId!==req.session.user.id) fail('登录账号已变化，请刷新页面后继续。',409);
    if (!Number.isSafeInteger(v.revision) || v.revision<0) fail('导入请求无效，请重新预览');
    if (commit && (typeof v.requestId!=='string' || !/^[a-f0-9-]{36}$/.test(v.requestId))) fail('导入请求无效，请重新预览');
    const document=imports.parse(v.document),skipDuplicates=v.skipDuplicates===undefined?true:v.skipDuplicates;
    if (typeof skipDuplicates!=='boolean') throw new imports.TodoImportError('option');
    return {v,document,skipDuplicates};
  };
  const unchanged = (row,v) => {
    if ((row?.revision||0)!==v.revision) fail('清单已在另一页面更新，请保留导入内容，重新加载后再预览。',409);
  };
  app.get('/api/todos', ...route(async(req,res) => res.json({...output(await read(req.session.user.id),req.session.user.id),limits:entitlement.limits(await currentUser(req))})));
  app.post('/api/todos/import/preview', ...route(async(req,res) => {
    const {v,document,skipDuplicates}=importRequest(req,false),uid=req.session.user.id;
    const user=await currentUser(req);
    const row=await read(uid);unchanged(row,v);
    const plan=imports.plan(row?JSON.parse(row.state):[],document,skipDuplicates);
    const existing=row?JSON.parse(row.state):[];
    entitlement.checkTodos(user,existing,existing.concat(plan.additions.map(t=>imports.withIds(t,()=>crypto.randomUUID()))));
    res.json({accountId:uid,revision:row?.revision||0,summary:plan.summary,entries:plan.entries});
  }));
  app.post('/api/todos/import', ...route(async(req,res) => {
    const {v,document,skipDuplicates}=importRequest(req,true),uid=req.session.user.id;
    const hash=crypto.createHash('sha256').update(JSON.stringify({kind:'todo-import-v1',revision:v.revision,document,skipDuplicates})).digest('hex');
    const result=await transaction(db,async()=>{
      const user=await currentUser(req);
      const old=await read(uid);
      if (old?.request_id===v.requestId) {
        let receipt;try{receipt=JSON.parse(old.request_hash);}catch{}
        if (receipt?.kind!=='todo-import-v1' || receipt.hash!==hash) fail('保存请求编号已被使用',409);
        return {...output(old,uid),import:receipt.summary,duplicate:true};
      }
      unchanged(old,v);
      const existing=old?JSON.parse(old.state):[],plan=imports.plan(existing,document,skipDuplicates);
      const todos=validateTodos(existing.concat(plan.additions.map(t=>imports.withIds(t,()=>crypto.randomUUID()))));
      entitlement.checkTodos(user,existing,todos);
      const receipt=JSON.stringify({kind:'todo-import-v1',hash,summary:plan.summary});
      await db.run(`INSERT INTO todo_lists(user_id,revision,state,request_id,request_hash) VALUES(?,1,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET revision=todo_lists.revision+1,state=excluded.state,request_id=excluded.request_id,request_hash=excluded.request_hash,updated_at=CURRENT_TIMESTAMP`,[uid,JSON.stringify(todos),v.requestId,receipt]);
      return {...output(await read(uid),uid),import:plan.summary};
    });
    res.json(result);
  }));
  app.put('/api/todos', ...route(async(req,res) => {
    const uid=req.session.user.id, v=req.body;
    if (v.accountId !== uid) fail('登录账号已变化，请刷新页面后继续。',409);
    if (!Number.isSafeInteger(v.revision) || v.revision<0 || typeof v.requestId!=='string' || !/^[a-f0-9-]{36}$/.test(v.requestId)) fail('保存请求无效，请刷新后重试');
    const todos=validateTodos(v.todos), raw=JSON.stringify(todos), hash=crypto.createHash('sha256').update(raw).digest('hex');
    const result=await transaction(db,async()=>{
      const user=await currentUser(req);
      const old=await read(uid);
      if (old?.request_id===v.requestId) {
        if(old.request_hash!==hash) fail('保存请求编号已被使用',409);
        return {...output(old,uid),duplicate:true};
      }
      if ((old?.revision||0)!==v.revision) fail('另一页面已更新待办，请先下载当前草稿，再重新加载。',409);
      entitlement.checkTodos(user,old?JSON.parse(old.state):[],todos);
      await db.run(`INSERT INTO todo_lists(user_id,revision,state,request_id,request_hash) VALUES(?,1,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET revision=todo_lists.revision+1,state=excluded.state,request_id=excluded.request_id,request_hash=excluded.request_hash,updated_at=CURRENT_TIMESTAMP`,[uid,raw,v.requestId,hash]);
      return output(await read(uid),uid);
    });
    res.json(result);
  }));
}
module.exports={migrateTodos,registerTodos,validateTodos};
