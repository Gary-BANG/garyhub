'use strict';
const release='garyhub-20261013-calendar-v1';
async function publish(db){
 await db.exec('BEGIN IMMEDIATE');
 try{
  // Also supports the last reviewed pre-shared-login image.
  const columns=await db.all('PRAGMA table_info(notifications)');
  if(!columns.some(c=>c.name==='scope'))await db.exec("ALTER TABLE notifications ADD COLUMN scope TEXT NOT NULL DEFAULT 'calendar'");
  await db.exec('CREATE TABLE IF NOT EXISTS hub_releases(version TEXT PRIMARY KEY,published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,recipients INTEGER NOT NULL)');
  const existing=await db.get('SELECT recipients FROM hub_releases WHERE version=?',[release]);
  if(existing){await db.exec('COMMIT');return {alreadyPublished:true,recipients:existing.recipients};}
  const users=await db.all('SELECT id FROM users WHERE enabled=1 ORDER BY id');
  for(const u of users)await db.run("INSERT INTO notifications(user_id,type,scope,title,body,action_url,dedupe_key)VALUES(?,'release','calendar',?,?,?,?)",[u.id,'Calendar、日记与健康记录焕新 · 2026-10-13','Calendar 新增冷色动态背景、日夜模式和五项横向功能栏；日记支持心情、日期翻页和标题筛选；健康记录独立成页；登录与注册改为独立暖色页面。原有记录继续保留。','https://calendar.garyhub.uk/',release+':0']);
  const count=(await db.get('SELECT COUNT(*) n FROM notifications WHERE dedupe_key=?',[release+':0'])).n;
  if(count!==users.length)throw Error('Notification recipient count mismatch');
  await db.run('INSERT INTO hub_releases(version,recipients)VALUES(?,?)',[release,users.length]);await db.exec('COMMIT');return {alreadyPublished:false,recipients:users.length};
 }catch(e){await db.exec('ROLLBACK');throw e;}
}
module.exports={publish};
if(require.main===module)publish(require('../db')).then(r=>{console.log(JSON.stringify(r));process.exit(0)}).catch(e=>{console.error('Update notice publication failed:',e.code||e.name);process.exit(1)});
