'use strict';
// Notification centre (v2.4.1.6). The settings page reads what preferences alone cannot tell it — the verified e-mail,
// the devices receiving push and the calendar subscription — and manages devices and the subscription here.
// Two minute jobs route notices by the account's channel choices:
//  - release notes still unread after publication also go by push (outside quiet hours) and/or e-mail, once per release;
//  - e-mail task reminders are held for accounts that turned them off. The reminder worker runs from its own image and
//    is never switched by the updater, so the hold works through the table it already uses: a 'cancelled' row for each
//    upcoming slot (unique per task, date and time) makes the worker's INSERT OR IGNORE skip that slot.
const crypto = require('node:crypto');
const mailer = require('./mailer');
const {rateLimit} = require('./rate-limit');
const {parse} = require('./preferences-api');
const {fromPrefs, quiet, email} = require('./notify-channels');
const {dueReminderSlots, localParts} = require('./reminder-utils');
const push = require('./push-api');
const feed = require('./calendar-feed');

const route = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const AHEAD = 15, HOLD = 'channel-off', SITE = 'https://garyhub.uk/', SETTINGS = 'https://tools.garyhub.uk/personalize/#notify';

async function migrate(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS notify_deliveries(user_id INTEGER NOT NULL,item TEXT NOT NULL,channel TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,sent_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item,channel))`);
}

const mask = address => { const [name, domain] = String(address).split('@'); return name.slice(0, 1) + '***@' + domain; };
async function state(db, userId, mail = mailer) {
  const user = await db.get('SELECT email,email_verified_at FROM users WHERE id=?', [userId]);
  let available = false;
  try { available = mail.mode() !== 'disabled'; } catch {}
  const verified = !!(user?.email && user.email_verified_at);
  return {accountId: userId, email: {verified, address: verified ? mask(user.email) : null}, mail: available,
    devices: await push.devices(db, userId), feed: await feed.feedStatus(db, userId)};
}

function register(app, {db, requireLogin, mail = mailer}) {
  const same = (req, res) => {
    if (req.body?.accountId === req.session.user.id) return true;
    res.status(409).json({message: '登录账号已变化，请刷新页面'});
    return false;
  };
  app.get('/api/hub/notify', requireLogin, route(async (req, res) => res.json(await state(db, req.session.user.id, mail))));
  app.post('/api/hub/notify/devices/:id/remove', requireLogin, rateLimit(60, 60_000), route(async (req, res) => {
    if (!same(req, res)) return;
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({message: '设备编号无效'});
    const result = await db.run('DELETE FROM push_subscriptions WHERE id=? AND user_id=?', [id, req.session.user.id]);
    if (!result.changes) return res.status(404).json({message: '设备不存在或已移除'});
    res.json(await state(db, req.session.user.id, mail));
  }));
  app.post('/api/hub/notify/feed', requireLogin, rateLimit(20, 60 * 60_000), route(async (req, res) => {
    if (!same(req, res)) return;
    const userId = req.session.user.id;
    if (req.body.action === 'create') {
      const url = await feed.createFeed(db, userId);
      return res.status(201).json({...await state(db, userId, mail), feedUrl: url});
    }
    if (req.body.action !== 'off') return res.status(400).json({message: '操作无效'});
    await feed.removeFeed(db, userId);
    res.json(await state(db, userId, mail));
  }));
}

// One delivery per account, release and channel; e-mail is tried at most three times.
async function claim(db, userId, item, channel) {
  await db.run('INSERT OR IGNORE INTO notify_deliveries(user_id,item,channel) VALUES(?,?,?)', [userId, item, channel]);
  const result = await db.run(`UPDATE notify_deliveries SET attempts=attempts+1 WHERE user_id=? AND item=? AND channel=?
    AND sent_at IS NULL AND attempts<3`, [userId, item, channel]);
  return result.changes > 0;
}
const delivered = (db, userId, item, channel) =>
  db.run('UPDATE notify_deliveries SET sent_at=CURRENT_TIMESTAMP WHERE user_id=? AND item=? AND channel=?', [userId, item, channel]);

async function routeReleases({db, notify, now = new Date(), sendEmail = (userId, message) => email(db, userId, message)}) {
  const users = await db.all(`SELECT p.user_id,p.prefs,u.timezone FROM user_preferences p JOIN users u ON u.id=p.user_id
    WHERE u.enabled=1 AND (json_extract(p.prefs,'$."notify.updates.push"')=1 OR json_extract(p.prefs,'$."notify.updates.email"')=1)`);
  let pushed = 0, mailed = 0;
  for (const user of users) {
    const settings = fromPrefs(parse(user.prefs), user.timezone);
    // Only notes still unread and published within the last day; reading them in the inbox makes the extra channels moot.
    const notes = await db.all(`SELECT title,body,dedupe_key FROM notifications WHERE user_id=? AND type='release' AND read_at IS NULL
      AND dedupe_key LIKE 'garyhub-%:%' AND julianday(created_at)>julianday(?,'-1 day') ORDER BY id`, [user.user_id, now.toISOString()]);
    const releases = new Map();
    for (const note of notes) {
      const version = note.dedupe_key.slice(0, note.dedupe_key.lastIndexOf(':'));
      if (!releases.has(version)) releases.set(version, []);
      releases.get(version).push(note);
    }
    for (const [version, items] of releases) {
      const name = 'GaryHub ' + version.replace(/^garyhub-/, 'v');
      if (settings.updates.push && !quiet(settings, now) && await claim(db, user.user_id, version, 'push')) {
        await notify(user.user_id, {title: name + ' 已更新', body: items.map(item => item.title).join(' · '), url: SITE, tag: 'release-' + version});
        await delivered(db, user.user_id, version, 'push');
        pushed++;
      }
      if (settings.updates.email && await claim(db, user.user_id, version, 'email')) {
        const text = items.map(item => item.title + '\n' + item.body).join('\n\n') +
          '\n\n在 GaryHub 查看：' + SITE + '\n不想再收到更新邮件，可在“设置 → 通知与提醒”中关闭：' + SETTINGS + '\n';
        if (await sendEmail(user.user_id, {subject: name + ' 更新说明', text})) { await delivered(db, user.user_id, version, 'email'); mailed++; }
      }
    }
  }
  await db.run("DELETE FROM notify_deliveries WHERE julianday(created_at)<=julianday('now','-30 days')");
  return {pushed, mailed};
}

async function holdEmailReminders({db, now = new Date()}) {
  const minute = Math.floor(now.getTime() / 60000) * 60000, start = new Date(minute).toISOString();
  const off = "SELECT user_id FROM user_preferences WHERE json_extract(prefs,'$.\"notify.reminders.email\"')=0";
  // Accounts that turned e-mail back on get their upcoming slots back.
  await db.run(`DELETE FROM reminder_deliveries WHERE status='cancelled' AND last_error=? AND scheduled_for_utc>=? AND user_id NOT IN (${off})`, [HOLD, start]);
  const rows = await db.all(`SELECT t.id,t.start_date,t.end_date,t.status,t.completed_at,t.user_id,u.timezone,r.frequency,r.time_1,r.time_2
    FROM tasks t JOIN users u ON u.id=t.user_id JOIN reminder_settings r ON r.task_id=t.id
    WHERE t.reminder_enabled=1 AND t.status<>'done' AND t.completed_at IS NULL AND t.user_id IN (${off})`);
  let held = 0;
  for (const row of rows) {
    for (let offset = 0; offset <= AHEAD; offset++) {
      const instant = new Date(minute + offset * 60000);
      let local;
      try { local = localParts(instant, row.timezone); } catch { continue; }
      const slots = dueReminderSlots({task: {reminderEnabled: true, completedAt: row.completed_at, status: row.status, startDate: row.start_date,
        endDate: row.end_date}, settings: {frequency: row.frequency, time1: row.time_1, time2: row.time_2}, timeZone: row.timezone, now: instant});
      for (const time of slots) {
        const result = await db.run(`INSERT OR IGNORE INTO reminder_deliveries(id,task_id,user_id,scheduled_for_utc,local_date,local_time,status,last_error)
          VALUES(?,?,?,?,?,?,'cancelled',?)`, [crypto.randomUUID(), row.id, row.user_id, instant.toISOString(), local.date, time, HOLD]);
        held += result.changes;
      }
    }
  }
  // A slot the worker queued but has not sent yet (a retry, or a choice made just now).
  const queued = await db.run(`UPDATE reminder_deliveries SET status='cancelled',last_error=?,updated_at=CURRENT_TIMESTAMP
    WHERE status IN ('pending','failed') AND user_id IN (${off})`, [HOLD]);
  return {held, cancelled: queued.changes};
}

function start(db, pusher) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await holdEmailReminders({db}); await routeReleases({db, notify: pusher.notify}); }
    catch (error) { console.error('Notification routing failed:', error.code || error.name || 'error'); }
    finally { busy = false; }
  };
  tick();
  const timer = setInterval(tick, 60_000);
  timer.unref();
  return timer;
}

module.exports = {migrate, register, start, state, routeReleases, holdEmailReminders, mask, AHEAD, HOLD};
