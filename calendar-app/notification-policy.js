'use strict';
// Account/security requirements survive both expiry and user bulk actions.
const PROTECTED_SQL = "type IN ('account','security','required')";
const ORDINARY_SQL = "COALESCE(type,'') NOT IN ('account','security','required')";
const VISIBLE_SQL = `(${PROTECTED_SQL} OR julianday(created_at)>julianday('now','-14 days'))`;
async function pruneNotifications(db) {
  return db.run(`DELETE FROM notifications WHERE ${ORDINARY_SQL} AND julianday(created_at)<=julianday('now','-14 days')`);
}
async function startNotificationCleanup(db) {
  await pruneNotifications(db);
  let busy=false;
  const timer=setInterval(async()=>{
    if(busy)return;
    busy=true;
    try { await pruneNotifications(db); }
    catch { console.error('Notification cleanup failed; will retry.'); }
    finally { busy=false; }
  },60000);
  timer.unref();
  return timer;
}
module.exports={PROTECTED_SQL,ORDINARY_SQL,VISIBLE_SQL,pruneNotifications,startNotificationCleanup};
