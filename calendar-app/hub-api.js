'use strict';
const SCOPES = new Set(['home','calendar','tools','access','lab']);
const route=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
async function migrateHub(db){
  await db.run(`CREATE TABLE IF NOT EXISTS hub_permissions(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,view_academics INTEGER NOT NULL DEFAULT 0 CHECK(view_academics IN(0,1)))`);
  const columns=await db.all('PRAGMA table_info(notifications)');
  if(!columns.some(c=>c.name==='scope'))await db.run("ALTER TABLE notifications ADD COLUMN scope TEXT NOT NULL DEFAULT 'calendar'");
  await db.run('CREATE INDEX IF NOT EXISTS idx_notifications_scope ON notifications(user_id,scope,id DESC)');
  await db.run(`CREATE TABLE IF NOT EXISTS hub_releases(version TEXT PRIMARY KEY,published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,recipients INTEGER NOT NULL)`);
}
function registerHubApi(app,{db,requireLogin,requireAdmin}){
  const {all,get,run}=db;
  app.get('/api/hub/me',route(async(req,res)=>{
    const user=req.session.user||null;
    const permission=user?await get('SELECT view_academics FROM hub_permissions WHERE user_id=?',[user.id]):null;
    res.json({user,canViewAcademics:!!user&&(user.role==='admin'||permission?.view_academics===1)});
  }));
  app.get('/api/hub/admin/users',requireAdmin,route(async(req,res)=>{
    res.json(await all(`SELECT u.id,u.username,u.role,u.enabled,COALESCE(p.view_academics,0) AS view_academics FROM users u LEFT JOIN hub_permissions p ON p.user_id=u.id ORDER BY u.id`));
  }));
  app.put('/api/hub/admin/users/:id/academics',requireAdmin,route(async(req,res)=>{
    const id=Number(req.params.id),allow=req.body.allowed;
    if(!Number.isSafeInteger(id)||id<1||typeof allow!=='boolean')return res.status(400).json({message:'参数无效'});
    const user=await get('SELECT id,role FROM users WHERE id=?',[id]);
    if(!user)return res.status(404).json({message:'用户不存在'});
    if(user.role==='admin')return res.status(400).json({message:'管理员始终拥有查看权限'});
    await run(`INSERT INTO hub_permissions(user_id,view_academics) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET view_academics=excluded.view_academics`,[id,Number(allow)]);
    res.json({ok:true});
  }));
  app.get('/api/hub/notifications',requireLogin,route(async(req,res)=>{
    const scope=req.query.scope||'all';
    if(scope!=='all'&&!SCOPES.has(scope))return res.status(400).json({message:'通知分类无效'});
    const filter=scope==='all'?'':' AND scope=?',params=[req.session.user.id,...(scope==='all'?[]:[scope])];
    const before=req.query.before?Number(req.query.before):null;
    if(before!==null&&(!Number.isSafeInteger(before)||before<1))return res.status(400).json({message:'分页参数无效'});
    const items=await all(`SELECT id,type,scope,title,body,read_at,created_at FROM notifications WHERE user_id=?${filter}${before?' AND id<?':''} ORDER BY id DESC LIMIT 51`,[...params,...(before?[before]:[])]);
    const count=await get(`SELECT COUNT(*) AS n FROM notifications WHERE user_id=?${filter} AND read_at IS NULL`,params);
    res.json({items:items.slice(0,50),unread:count.n,nextBefore:items.length>50?items[49].id:null});
  }));
  app.post('/api/hub/notifications/:id/read',requireLogin,route(async(req,res)=>{
    const id=Number(req.params.id);
    if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({message:'通知编号无效'});
    const result=await run('UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=? AND user_id=?',[id,req.session.user.id]);
    if(!result.changes)return res.status(404).json({message:'通知不存在'});
    res.json({ok:true});
  }));
}
// Invoked by the release command only, never on application startup.
async function publishRelease(db,release){
  if(!release||!/^garyhub-[a-zA-Z0-9.-]+$/.test(release.version)||!Array.isArray(release.notes)||!release.notes.length)throw Error('Invalid release');
  for(const n of release.notes)if(!SCOPES.has(n.scope)||typeof n.title!=='string'||!n.title||typeof n.body!=='string'||!n.body)throw Error('Invalid release note');
  await db.run('BEGIN IMMEDIATE');
  try{
    const existing=await db.get('SELECT recipients FROM hub_releases WHERE version=?',[release.version]);
    if(existing){await db.run('COMMIT');return {alreadyPublished:true,recipients:existing.recipients};}
    const users=await db.all('SELECT id FROM users WHERE enabled=1');
    for(const user of users)for(let i=0;i<release.notes.length;i++){
      const n=release.notes[i];
      await db.run(`INSERT OR IGNORE INTO notifications(user_id,type,title,body,dedupe_key,scope) VALUES(?,'release',?,?,?,?)`,[user.id,n.title,n.body,`${release.version}:${i}`,n.scope]);
    }
    await db.run('INSERT INTO hub_releases(version,recipients) VALUES(?,?)',[release.version,users.length]);
    const count=await db.get('SELECT COUNT(*) AS n FROM notifications WHERE dedupe_key LIKE ?',[release.version+':%']);
    if(count.n!==users.length*release.notes.length)throw Error('Notification recipient verification failed');
    await db.run('COMMIT');return {alreadyPublished:false,recipients:users.length,notifications:count.n};
  }catch(e){await db.run('ROLLBACK');throw e;}
}
module.exports={migrateHub,registerHubApi,publishRelease};
