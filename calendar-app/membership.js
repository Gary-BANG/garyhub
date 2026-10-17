'use strict';
const crypto = require('node:crypto');
const {openConnection, queuedRoutes, transaction} = require('./sqlite-connection');
const TIERS = ['standard', 'subscriber'];
const fail = (message, status = 400) => { throw Object.assign(Error(message), {status}); };
async function migrateMembership(db) {
  const columns = await db.all('PRAGMA table_info(users)');
  if (!columns.some(c => c.name === 'account_tier')) await db.run("ALTER TABLE users ADD COLUMN account_tier TEXT NOT NULL DEFAULT 'standard' CHECK(account_tier IN ('standard','subscriber'))");
  if (!columns.some(c => c.name === 'tier_version')) await db.run('ALTER TABLE users ADD COLUMN tier_version INTEGER NOT NULL DEFAULT 0');
  await db.run('CREATE TABLE IF NOT EXISTS hub_migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  await transaction(db, async () => {
    if (await db.get('SELECT name FROM hub_migrations WHERE name=?', ['v1.3.4.2-subscriber-seed'])) return;
    // This is a one-time migration of existing identities, never a signup rule.
    await db.run("UPDATE users SET account_tier='subscriber',tier_version=tier_version+1 WHERE username IN (?,?) AND account_tier<>'subscriber'", ['Gary_BANG', 'zhouyoyo']);
    await db.run('INSERT INTO hub_migrations(name) VALUES(?)', ['v1.3.4.2-subscriber-seed']);
  });
}
function registerMembership(app, {requireAdmin, db = openConnection()}) {
  const route = queuedRoutes(db);
  app.put('/api/hub/admin/users/:id/tier', requireAdmin, route(async (req, res) => {
    const id = Number(req.params.id), v = req.body;
    if (!Number.isSafeInteger(id) || id < 1 || !TIERS.includes(v.accountTier) || !Number.isSafeInteger(v.expectedTierVersion)) fail('账号等级参数无效');
    await transaction(db, async () => {
      const actor = await db.get('SELECT * FROM users WHERE id=?', [req.session.user.id]);
      if (!actor || actor.role !== 'admin' || !actor.enabled || actor.deletion_pending || actor.must_change_password || actor.auth_version !== (req.session.authVersion || 0)) fail('管理员登录已失效', 401);
      if (v.actorId !== actor.id) fail('管理员账号已变化，请刷新页面', 409);
      const target = await db.get('SELECT id,account_tier,tier_version,deletion_pending FROM users WHERE id=?', [id]);
      if (!target) fail('用户不存在', 404);
      if (target.deletion_pending) fail('账号正在删除', 409);
      if (target.tier_version !== v.expectedTierVersion) fail('账号等级已变化，请刷新后重试', 409);
      if (target.account_tier === v.accountTier) return;
      await db.run('UPDATE users SET account_tier=?,tier_version=tier_version+1 WHERE id=?', [v.accountTier, id]);
      await db.run('INSERT INTO admin_operations(id,actor_id,target_id,action) VALUES(?,?,?,?)', [crypto.randomUUID(), actor.id, id, 'tier:' + v.accountTier]);
    });
    res.json({ok: true});
  }));
}
module.exports = {migrateMembership, registerMembership, TIERS};
