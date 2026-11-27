'use strict';

const { openConnection, queuedRoutes, transaction } = require('./sqlite-connection');
const ROOT = '/api/hub/site-navigator';
const PAGE = 'https://tools.garyhub.uk/useful/site-navigator/';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fields = 'id,name,kind,entry,url,revision';
const fail = (status, message) => {
  throw Object.assign(Error(message), { status });
};

async function migrate(db) {
  // No foreign key to users: the previous release must still be able to remove an account after rollback.
  await db.run(
    'CREATE TABLE IF NOT EXISTS site_bookmarks (user_id INTEGER NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, entry TEXT NOT NULL, url TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(user_id,id))'
  );
  await db.run(
    'CREATE TABLE IF NOT EXISTS site_permission_incidents (user_id INTEGER NOT NULL, site_id TEXT NOT NULL, device TEXT NOT NULL, PRIMARY KEY(user_id,site_id,device))'
  );
}
function metadata(input) {
  const { kind } = input;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 120 || /[\x00-\x1f\x7f]/.test(name)) fail(400, '网站名称无效');
  if (kind === 'url') {
    let url;
    try {
      url = new URL(input.url);
    } catch {
      fail(400, '请输入完整的 http 或 https 网址');
    }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.href.length > 2048)
      fail(400, '网址无效');
    return { name, kind, entry: '', url: url.href };
  }
  const entry = input.entry;
  if (
    !['html', 'zip', 'folder'].includes(kind) ||
    typeof entry !== 'string' ||
    entry.length > 1024 ||
    !/\.html?$/i.test(entry) ||
    /[\\:\x00-\x1f\x7f]/.test(entry) ||
    entry.split('/').some((s) => !s || s.startsWith('.'))
  ) {
    fail(400, '请选择网站内的 HTML 入口');
  }
  return { name, kind, entry, url: '' };
}
function register(app, { requireLogin, db = openConnection() }) {
  const queue = queuedRoutes(db);
  const write = (fn) => [
    requireLogin,
    queue(async (req, res) => {
      const uid = req.session.user.id;
      if (req.body?.accountId !== uid) fail(409, '登录账号已变化，请刷新页面');
      if (!uuid.test(req.body.id)) fail(400, '无效的网站编号');
      const value = await transaction(db, async () => {
        const user = await db.get('SELECT enabled,deletion_pending FROM users WHERE id=?', [uid]);
        if (!user?.enabled || user.deletion_pending) fail(401, '登录已失效');
        const item = await db.get('SELECT ' + fields + ' FROM site_bookmarks WHERE user_id=? AND id=?', [
          uid,
          req.body.id
        ]);
        return fn(uid, req.body, item);
      });
      res.json(value);
    })
  ];
  app.get(
    ROOT,
    requireLogin,
    queue(async (req, res) => {
      const uid = req.session.user.id;
      res.json({
        accountId: uid,
        sites: await db.all('SELECT ' + fields + ' FROM site_bookmarks WHERE user_id=? ORDER BY rowid DESC', [
          uid
        ])
      });
    })
  );
  app.post(
    ROOT,
    ...write(async (uid, input, item) => {
      const m = metadata(input);
      if (item) {
        if (Object.keys(m).every((k) => m[k] === item[k])) return { site: item };
        fail(409, '这条导航已经存在，请刷新');
      }
      if ((await db.get('SELECT count(*) AS n FROM site_bookmarks WHERE user_id=?', [uid])).n >= 500)
        fail(409, '个人导航最多保存 500 项');
      await db.run('INSERT INTO site_bookmarks(user_id,id,name,kind,entry,url) VALUES(?,?,?,?,?,?)', [
        uid,
        input.id,
        m.name,
        m.kind,
        m.entry,
        m.url
      ]);
      return { site: { id: input.id, ...m, revision: 1 } };
    })
  );
  app.post(
    ROOT + '/edit',
    ...write(async (uid, input, item) => {
      if (!item) fail(404, '网站已移除');
      if (input.revision !== item.revision) fail(409, '此网站已在其他窗口更新，请刷新');
      const m = metadata({ ...item, name: input.name });
      await db.run('UPDATE site_bookmarks SET name=?,revision=revision+1 WHERE user_id=? AND id=?', [
        m.name,
        uid,
        item.id
      ]);
      return { site: { ...item, name: m.name, revision: item.revision + 1 } };
    })
  );
  app.post(
    ROOT + '/remove',
    ...write(async (uid, input, item) => {
      if (item && input.revision !== item.revision) fail(409, '此网站已更新，请刷新');
      await db.run('DELETE FROM site_permission_incidents WHERE user_id=? AND site_id=?', [uid, input.id]);
      await db.run("DELETE FROM notifications WHERE user_id=? AND type='site_permission' AND action_url=?", [
        uid,
        PAGE + '?site=' + input.id
      ]);
      await db.run('DELETE FROM site_bookmarks WHERE user_id=? AND id=?', [uid, input.id]);
      return { ok: true };
    })
  );
  app.post(
    ROOT + '/permission',
    ...write(async (uid, input, item) => {
      if (!item || item.kind === 'url') fail(404, '本地网站不存在');
      if (!uuid.test(input.device) || !['attention', 'ready'].includes(input.state))
        fail(400, '文件授权状态无效');
      const args = [uid, item.id, input.device],
        key = 'site-permission:' + item.id + ':' + input.device;
      if (input.state === 'ready') {
        await db.run(
          'DELETE FROM site_permission_incidents WHERE user_id=? AND site_id=? AND device=?',
          args
        );
        await db.run('DELETE FROM notifications WHERE user_id=? AND dedupe_key=?', [uid, key]);
      } else {
        const r = await db.run(
          'INSERT OR IGNORE INTO site_permission_incidents(user_id,site_id,device) VALUES(?,?,?)',
          args
        );
        if (r.changes)
          await db.run(
            "INSERT OR IGNORE INTO notifications(user_id,type,scope,title,body,action_url,dedupe_key) VALUES(?,'site_permission','tools',?,?,?,?)",
            [
              uid,
              '个人网站需要重新授权',
              '请在原设备打开「' + item.name + '」，重新允许读取文件或关联文件。',
              PAGE + '?site=' + item.id,
              key
            ]
          );
      }
      return { ok: true };
    })
  );
}
module.exports = { migrate, register, metadata };
