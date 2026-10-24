'use strict';
const crypto=require('node:crypto');
const {openConnection,queuedRoutes,transaction}=require('./sqlite-connection');
const format=require('./public/research/format');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
async function migrateResearch(db){
  await db.run(`CREATE TABLE IF NOT EXISTS research_projects(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 0,entries TEXT NOT NULL DEFAULT '[]',undo_state TEXT,undo_revision INTEGER,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await db.run('CREATE INDEX IF NOT EXISTS research_owner ON research_projects(user_id,updated_at)');
  await db.run(`CREATE TABLE IF NOT EXISTS research_receipts(project_id TEXT NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,request_id TEXT NOT NULL,hash TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(project_id,request_id))`);
}
function registerResearch(app,{requireLogin,db=openConnection()}){
  const queue=queuedRoutes(db);
  const route=fn=>[requireLogin,(req,res,next)=>String(req.session.user.id)===req.get('x-garyhub-user')?next():res.status(409).json({message:'登录账号已变化，请刷新后继续。'}),queue(fn)];
  const owner=async req=>{
    const user=await db.get('SELECT enabled,deletion_pending,auth_version FROM users WHERE id=?',[req.session.user.id]);
    if(!user||user.enabled!==1||user.deletion_pending||user.auth_version!==(req.session.authVersion||0))fail('登录已失效',401);
  };
  const read=async req=>{await owner(req);const row=await db.get('SELECT * FROM research_projects WHERE id=? AND user_id=?',[req.params.id,req.session.user.id]);if(!row)fail('Research 不存在',404);return row;};
  const output=(row,uid)=>({accountId:uid,id:row.id,name:row.name,description:row.description,revision:row.revision,entries:JSON.parse(row.entries),canUndo:row.undo_revision===row.revision&&!!row.undo_state,updatedAt:row.updated_at});
  const validate=(req)=>{const v=req.body;if(!v||v.accountId!==req.session.user.id)fail('登录账号已变化，请刷新后继续。',409);if(!Number.isSafeInteger(v.revision)||v.revision<0||!format.uuid(v.requestId))fail('请求无效，请重新加载');return v;};
  const unchanged=(row,v)=>{if(row.revision!==v.revision)fail('词库已在另一页面更新。请保留草稿，重新加载后再操作。',409);};
  const mutate=async(req,kind,fn)=>{
    const v=validate(req),hash=crypto.createHash('sha256').update(JSON.stringify({kind,body:v})).digest('hex');
    return transaction(db,async()=>{
      const row=await read(req),receipt=await db.get('SELECT * FROM research_receipts WHERE project_id=? AND request_id=?',[row.id,v.requestId]);
      if(receipt){if(receipt.hash!==hash)fail('请求编号已使用',409);return {...output(row,req.session.user.id),duplicate:true};}
      unchanged(row,v);const extra=await fn(row,v);
      await db.run('INSERT INTO research_receipts(project_id,request_id,hash,revision)VALUES(?,?,?,?)',[row.id,v.requestId,hash,row.revision+1]);
      await db.run('DELETE FROM research_receipts WHERE project_id=? AND revision<?',[row.id,row.revision-99]);
      return {...output(await read(req),req.session.user.id),...extra};
    });
  };
  app.get('/api/research',...route(async(req,res)=>{
    await owner(req);const rows=await db.all('SELECT id,name,description,revision,entries,updated_at FROM research_projects WHERE user_id=? ORDER BY updated_at DESC,id',[req.session.user.id]);
    res.json({accountId:req.session.user.id,projects:rows.map(r=>({id:r.id,name:r.name,description:r.description,revision:r.revision,entryCount:JSON.parse(r.entries).length,updatedAt:r.updated_at}))});
  }));
  app.post('/api/research',...route(async(req,res)=>{
    const v=req.body;if(!v||v.accountId!==req.session.user.id)fail('账号已变化',409);if(!format.uuid(v.id))fail('Research ID 无效');
    const name=format.text(v.name,100,true),description=format.text(v.description,4000);
    const result=await transaction(db,async()=>{
      await owner(req);const old=await db.get('SELECT * FROM research_projects WHERE id=?',[v.id]);
      if(old){if(old.user_id!==req.session.user.id||old.name!==name||old.description!==description)fail('Research ID 已使用',409);return output(old,req.session.user.id);}
      if((await db.get('SELECT COUNT(*) n FROM research_projects WHERE user_id=?',[req.session.user.id])).n>=50)fail('每个账号最多 50 个 Research');
      await db.run('INSERT INTO research_projects(id,user_id,name,description)VALUES(?,?,?,?)',[v.id,req.session.user.id,name,description]);
      return output(await db.get('SELECT * FROM research_projects WHERE id=?',[v.id]),req.session.user.id);
    });res.status(201).json(result);
  }));
  app.get('/api/research/:id',...route(async(req,res)=>res.json(output(await read(req),req.session.user.id))));
  app.put('/api/research/:id',...route(async(req,res)=>res.json(await mutate(req,'edit',async(row,v)=>{
    const name=format.text(v.name,100,true),description=format.text(v.description,4000),previous=JSON.parse(row.entries),entries=format.entries(v.entries,true).map(e=>{
      const old=previous.find(p=>p.id===e.id);return !old||format.comparable(old)!==format.comparable(e)||old.status!==e.status?{...e,manual:true}: {...e,manual:old.manual};
    });
    await db.run('UPDATE research_projects SET name=?,description=?,entries=?,revision=revision+1,undo_state=NULL,undo_revision=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?',[name,description,JSON.stringify(entries),row.id,req.session.user.id]);
  }))));
  app.post('/api/research/:id/import/preview',...route(async(req,res)=>{
    const v=validate(req),row=await read(req);unchanged(row,v);
    const document=format.parse(v.document),plan=format.plan(JSON.parse(row.entries),document,row.id,v.choices||{},()=>crypto.randomUUID());
    res.json({accountId:req.session.user.id,revision:row.revision,summary:plan.summary,rows:plan.rows});
  }));
  app.post('/api/research/:id/import',...route(async(req,res)=>res.json(await mutate(req,'import',async(row,v)=>{
    const plan=format.plan(JSON.parse(row.entries),format.parse(v.document),row.id,v.choices||{},()=>crypto.randomUUID());
    if(plan.summary.conflicts)fail('请先处理全部冲突，再确认导入',409);
    await db.run('UPDATE research_projects SET entries=?,undo_state=?,undo_revision=revision+1,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?',[JSON.stringify(plan.entries),row.entries,row.id,req.session.user.id]);return {summary:plan.summary};
  }))));
  app.post('/api/research/:id/undo',...route(async(req,res)=>res.json(await mutate(req,'undo',async(row)=>{
    if(!row.undo_state||row.undo_revision!==row.revision)fail('本次导入后已有其他修改，不能撤销',409);
    await db.run('UPDATE research_projects SET entries=undo_state,undo_state=NULL,undo_revision=NULL,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?',[row.id,req.session.user.id]);
  }))));
}
module.exports={migrateResearch,registerResearch};
