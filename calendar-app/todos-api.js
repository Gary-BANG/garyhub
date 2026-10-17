'use strict';
const crypto = require('node:crypto');
const {openConnection, queuedRoutes, transaction} = require('./sqlite-connection');
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
  app.get('/api/todos', ...route(async(req,res) => res.json(output(await read(req.session.user.id),req.session.user.id))));
  app.put('/api/todos', ...route(async(req,res) => {
    const uid=req.session.user.id, v=req.body;
    if (v.accountId !== uid) fail('登录账号已变化，请刷新页面后继续。',409);
    if (!Number.isSafeInteger(v.revision) || v.revision<0 || typeof v.requestId!=='string' || !/^[a-f0-9-]{36}$/.test(v.requestId)) fail('保存请求无效，请刷新后重试');
    const todos=validateTodos(v.todos), raw=JSON.stringify(todos), hash=crypto.createHash('sha256').update(raw).digest('hex');
    const result=await transaction(db,async()=>{
      const user=await db.get('SELECT enabled,deletion_pending,auth_version FROM users WHERE id=?',[uid]);
      if (!user || user.enabled!==1 || user.deletion_pending || user.auth_version!==(req.session.authVersion||0)) fail('登录已失效',401);
      const old=await read(uid);
      if (old?.request_id===v.requestId) {
        if(old.request_hash!==hash) fail('保存请求编号已被使用',409);
        return {...output(old,uid),duplicate:true};
      }
      if ((old?.revision||0)!==v.revision) fail('另一页面已更新待办，请先下载当前草稿，再重新加载。',409);
      await db.run(`INSERT INTO todo_lists(user_id,revision,state,request_id,request_hash) VALUES(?,1,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET revision=todo_lists.revision+1,state=excluded.state,request_id=excluded.request_id,request_hash=excluded.request_hash,updated_at=CURRENT_TIMESTAMP`,[uid,raw,v.requestId,hash]);
      return output(await read(uid),uid);
    });
    res.json(result);
  }));
}
module.exports={migrateTodos,registerTodos,validateTodos};
