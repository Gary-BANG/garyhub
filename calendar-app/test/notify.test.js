'use strict';
// v2.4.1.6: notification channels, quiet hours, release routing, the e-mail reminder hold (checked against the real
// reminder worker), the notification centre API with the device list, and the homepage budget card.
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto'), express = require('express');
const {createSqliteAdapter} = require('./helpers/sqlite-adapter');
const {migrateUnifiedCalendar} = require('../migrations/unified-schema');
const preferences = require('../preferences-api'), channels = require('../notify-channels'), notify = require('../notify-api');
const push = require('../push-api'), feed = require('../calendar-feed'), alerts = require('../stock-alerts'), todayApi = require('../today-api');

// The real Calendar schema (as the reminder worker sees it) plus the v2.4.1.3–v2.4.1.6 tables.
async function fixture() {
  const db = createSqliteAdapter();
  await db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,password_hash TEXT,role TEXT,enabled INTEGER,created_at TEXT);
    CREATE TABLE register_requests(id INTEGER PRIMARY KEY);
    CREATE TABLE events(id INTEGER PRIMARY KEY,user_id INTEGER);
    INSERT INTO users VALUES(1,'alice','h','user',1,'2026-01-01'),(2,'bob','h','user',1,'2026-01-01'),(3,'carol','h','user',1,'2026-01-01');`);
  await migrateUnifiedCalendar(db);
  await require('../hub-api').migrateHub(db);
  await db.exec(`UPDATE users SET email=username||'@example.com',email_normalized=username||'@example.com',email_verified_at='2026-09-01T00:00:00Z',timezone='Etc/UTC';
    UPDATE users SET timezone='Asia/Shanghai' WHERE id=1;
    CREATE TABLE IF NOT EXISTS ledger_entries(id TEXT PRIMARY KEY,user_id INTEGER,kind TEXT,currency TEXT,date TEXT,category_id TEXT,amount INTEGER,notes TEXT DEFAULT '');`);
  for (const module of [feed, push, alerts, preferences, notify]) await module.migrate(db);
  await notify.migrate(db); await push.migrate(db);
  return db;
}
const set = (db, userId, prefs) => preferences.write(db, userId, prefs);

test('channels: defaults keep the earlier behaviour, release notes always stay in-app, quiet hours cross midnight', async () => {
  const fresh = channels.fromPrefs({}, 'Etc/UTC');
  assert.deepEqual([fresh.updates, fresh.reminders, fresh.alerts], [{inApp: true, push: false, email: false}, {inApp: false, push: true, email: true}, {inApp: true, push: true, email: false}]);
  assert.equal(fresh.quiet, null);
  const chosen = channels.fromPrefs({'notify.updates.push': true, 'notify.reminders.email': false, 'notify.alerts.inApp': false, 'push.quietFrom': '22:00', 'push.quietTo': '07:30'}, 'Asia/Shanghai');
  assert.deepEqual([chosen.updates.push, chosen.updates.inApp, chosen.reminders.email, chosen.alerts.inApp], [true, true, false, false]);
  // Shanghai is UTC+8: 14:00 UTC = 22:00 (quiet), 23:29 UTC = 07:29 (quiet), 23:30 UTC = 07:30 (not), 12:00 UTC = 20:00 (not).
  for (const [iso, expected] of [['2026-11-17T14:00:00Z', true], ['2026-11-17T23:29:00Z', true], ['2026-11-17T23:30:00Z', false], ['2026-11-17T12:00:00Z', false]])
    assert.equal(channels.quiet(chosen, new Date(iso)), expected, iso);
  const day = channels.fromPrefs({'push.quietFrom': '12:00', 'push.quietTo': '14:00'}, 'Etc/UTC');
  assert.equal(channels.quiet(day, new Date('2026-11-17T13:59:00Z')), true);
  assert.equal(channels.quiet(day, new Date('2026-11-17T14:00:00Z')), false);
  assert.equal(channels.fromPrefs({'push.quietFrom': '12:00', 'push.quietTo': '12:00'}).quiet, null);
  const db = await fixture();
  try {
    await set(db, 2, {'notify.reminders.push': false});
    assert.equal((await channels.channels(db, 2)).reminders.push, false);
    assert.equal((await channels.channels(db, 3)).reminders.push, true);
    const sent = [];
    const mail = {mode: () => 'capture', sendMail: async message => { sent.push(message); }};
    assert.equal(await channels.email(db, 2, {subject: 's', text: 't'}, mail), true);
    await db.run('UPDATE users SET email_verified_at=NULL WHERE id=3');
    assert.equal(await channels.email(db, 3, {subject: 's', text: 't'}, mail), false);
    assert.equal(await channels.email(db, 2, {subject: 's', text: 't'}, {mode: () => 'disabled', sendMail: async () => { throw Error('no'); }}), false);
    assert.equal(await channels.email(db, 2, {subject: 's', text: 't'}, {mode: () => 'smtp', sendMail: async () => { throw Error('down'); }}), false);
    assert.deepEqual(sent, [{to: 'bob@example.com', subject: 's', text: 't'}]);
  } finally { db.close(); }
});

test('reminders: in-app when chosen, push skipped when off or in quiet hours, each slot once', async () => {
  const db = await fixture();
  try {
    await db.exec(`INSERT INTO tasks(id,user_id,title,start_date,end_date,reminder_enabled) VALUES('a',1,'Read','2026-11-17','2026-11-17',1),('b',2,'Gym','2026-11-17','2026-11-17',1),('c',3,'Plain','2026-11-17','2026-11-17',1);
      INSERT INTO reminder_settings(task_id,frequency,time_1) VALUES('a',1,'09:00'),('b',1,'01:00'),('c',1,'01:00');
      INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth) VALUES(1,'https://fcm.googleapis.com/a','k','a'),(3,'https://fcm.googleapis.com/c','k','a');`);
    // Alice: in-app on and push in quiet hours (08:00–10:00 Shanghai). Bob: no device, in-app on. Carol: defaults.
    await set(db, 1, {'notify.reminders.inApp': true, 'push.quietFrom': '08:00', 'push.quietTo': '10:00'});
    await set(db, 2, {'notify.reminders.inApp': true, 'notify.reminders.push': false});
    const seen = [], now = new Date('2026-11-17T01:00:10Z');
    const result = await push.runReminders({db, notify: async (user, message) => { seen.push([user, message.title]); }, now});
    assert.deepEqual(result, {sent: 1, inApp: 2});
    assert.deepEqual(seen, [[3, 'Gary Hub 提醒：Plain']]);
    const notes = await db.all("SELECT user_id,type,scope,title,body,action_url FROM notifications WHERE type='reminder' ORDER BY user_id");
    assert.deepEqual(notes.map(n => [n.user_id, n.scope, n.title, n.body]), [[1, 'calendar', '事项提醒：Read', '2026-11-17 09:00'], [2, 'calendar', '事项提醒：Gym', '2026-11-17 01:00']]);
    assert.equal(notes[0].action_url, 'https://calendar.garyhub.uk/?date=2026-11-17');
    assert.deepEqual(await push.runReminders({db, notify: async () => {}, now}), {sent: 0, inApp: 0});
  } finally { db.close(); }
});

test('price alerts follow the account channels: in-app off, push in quiet hours skipped, e-mail on', async () => {
  const db = await fixture();
  try {
    await db.exec(`INSERT INTO stock_alerts(id,user_id,symbol,name,direction,price) VALUES('x',1,'sh600000','浦发银行','above',8000),('y',2,'sh600000','浦发银行','above',8000)`);
    await set(db, 1, {'notify.alerts.inApp': false, 'notify.alerts.email': true, 'push.quietFrom': '09:00', 'push.quietTo': '11:00'});
    const pushed = [], mailed = [];
    // 02:00 UTC is 10:00 in Shanghai: trading hours, and inside Alice's quiet hours.
    const result = await alerts.checkAlerts({db, provider: {quote: async () => ({name: '浦发银行', price: 8.5})}, now: new Date('2026-11-16T02:00:00Z'),
      notify: async (user, message) => { pushed.push(user); }, email: async (user, message) => { mailed.push([user, message.subject]); return true; }});
    assert.deepEqual(result, {checked: 1, triggered: 2});
    assert.deepEqual(pushed, [2]);
    assert.deepEqual(mailed, [[1, 'Gary Hub 浦发银行 到价提醒']]);
    assert.deepEqual((await db.all("SELECT user_id FROM notifications WHERE type='stock-alert'")).map(r => r.user_id), [2]);
  } finally { db.close(); }
});

test('release notes: unread notes of the last day go once by push (after quiet hours) and by e-mail, with retries capped', async () => {
  const db = await fixture();
  try {
    const add = (user, key, title, created) => db.run(`INSERT INTO notifications(user_id,type,title,body,dedupe_key,scope,created_at) VALUES(?,'release',?,?,?,'home',?)`,
      [user, title, title + ' body', key, created]);
    for (const user of [1, 2, 3]) { await add(user, 'garyhub-2.4.1.6:0', 'Home', '2026-11-17 03:00:00'); await add(user, 'garyhub-2.4.1.6:1', 'Tools', '2026-11-17 03:00:00'); }
    await add(1, 'garyhub-2.4.1.4:0', 'Old', '2026-11-10 00:00:00');
    // Alice: push and e-mail, quiet 00:00–08:00 Shanghai. Bob: e-mail, but has read the notes. Carol: nothing chosen.
    await set(db, 1, {'notify.updates.push': true, 'notify.updates.email': true, 'push.quietFrom': '00:00', 'push.quietTo': '08:00'});
    await set(db, 2, {'notify.updates.email': true});
    await db.run("UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE user_id=2");
    const pushes = [], mails = [];
    let fail = true;
    const run = iso => notify.routeReleases({db, now: new Date(iso), notify: async (user, message) => { pushes.push([user, message.title, message.body]); return {sent: 1}; },
      sendEmail: async (user, message) => { mails.push([user, message.subject]); return !fail; }});
    // 04:00 UTC is 12:00 in Shanghai: push goes at once; the e-mail fails and is retried, three tries at most.
    assert.deepEqual(await run('2026-11-17T04:00:00Z'), {pushed: 1, mailed: 0});
    for (let i = 0; i < 3; i++) assert.deepEqual(await run('2026-11-17T04:0' + (i + 1) + ':00Z'), {pushed: 0, mailed: 0});
    assert.deepEqual(pushes, [[1, 'GaryHub v2.4.1.6 已更新', 'Home · Tools']]);
    assert.deepEqual(mails, Array(3).fill([1, 'GaryHub v2.4.1.6 更新说明']));
    // A release published during quiet hours (17:00 UTC = 01:00 Shanghai) is pushed once they end (00:30 UTC = 08:30).
    for (const user of [1, 3]) await add(user, 'garyhub-2.4.1.7:0', 'Next', '2026-11-17 16:30:00');
    fail = false;
    assert.deepEqual(await run('2026-11-17T17:00:00Z'), {pushed: 0, mailed: 1});
    assert.deepEqual(await run('2026-11-18T00:30:00Z'), {pushed: 1, mailed: 0});
    assert.deepEqual(await run('2026-11-18T00:31:00Z'), {pushed: 0, mailed: 0});
    // More than a day after publication nothing is routed any more.
    await add(1, 'garyhub-2.4.1.8:0', 'Late', '2026-11-16 00:00:00');
    assert.deepEqual(await run('2026-11-18T00:32:00Z'), {pushed: 0, mailed: 0});
    assert.equal(pushes.every(p => p[0] === 1) && mails.every(m => m[0] === 1), true, 'only Alice chose extra channels for unread notes');
  } finally { db.close(); }
});

test('e-mail reminders turned off are held for the real reminder worker, and come back when turned on', async () => {
  const db = await fixture();
  const dbFile = require.resolve('../db');
  require.cache[dbFile] = {id: dbFile, filename: dbFile, loaded: true, exports: db};
  delete require.cache[require.resolve('../reminder-worker')];
  const {runCycle} = require('../reminder-worker');
  try {
    await db.exec(`INSERT INTO tasks(id,user_id,title,start_date,end_date,reminder_enabled) VALUES('a',2,'Bob task','2026-11-17','2026-11-18',1),('b',3,'Carol task','2026-11-17','2026-11-17',1);
      INSERT INTO reminder_settings(task_id,frequency,time_1,time_2) VALUES('a',2,'09:00','09:10'),('b',1,'09:00',NULL);`);
    await set(db, 2, {'notify.reminders.email': false});
    const mails = [], sendMail = async message => { mails.push(message.to); };
    // 08:55 UTC: both of Bob's 09:00 and 09:10 slots fall within the next 15 minutes.
    assert.deepEqual(await notify.holdEmailReminders({db, now: new Date('2026-11-17T08:55:30Z')}), {held: 2, cancelled: 0});
    assert.deepEqual(await notify.holdEmailReminders({db, now: new Date('2026-11-17T08:56:00Z')}), {held: 0, cancelled: 0});
    for (const minute of ['09:00', '09:10']) await runCycle({db, sendMail, now: new Date('2026-11-17T' + minute + ':05Z')});
    assert.deepEqual(mails, ['carol@example.com']);
    // Turned back on: the next day's slots are no longer held and the worker sends them.
    await notify.holdEmailReminders({db, now: new Date('2026-11-18T08:50:00Z')});
    await set(db, 2, {'notify.reminders.email': true});
    assert.deepEqual(await notify.holdEmailReminders({db, now: new Date('2026-11-18T08:51:00Z')}), {held: 0, cancelled: 0});
    assert.equal((await db.get("SELECT COUNT(*) AS n FROM reminder_deliveries WHERE local_date='2026-11-18'")).n, 0);
    await runCycle({db, sendMail, now: new Date('2026-11-18T09:00:05Z')});
    assert.deepEqual(mails, ['carol@example.com', 'bob@example.com']);
    // A slot already queued by the worker is cancelled when e-mail is turned off.
    await set(db, 2, {'notify.reminders.email': false});
    await db.run(`INSERT INTO reminder_deliveries(id,task_id,user_id,scheduled_for_utc,local_date,local_time,status,attempt_count,next_retry_at)
      VALUES('retry','a',2,'2026-11-18T09:10:00.000Z','2026-11-18','09:10','failed',1,'2026-11-18T09:11:00.000Z')`);
    assert.equal((await notify.holdEmailReminders({db, now: new Date('2026-11-18T09:10:30Z')})).cancelled, 1);
    await runCycle({db, sendMail, now: new Date('2026-11-18T09:12:00Z')});
    assert.equal(mails.length, 2);
  } finally { delete require.cache[dbFile]; db.close(); }
});

test('notification centre: login, masked e-mail, labelled devices removable by their owner, subscription via settings', async () => {
  const db = await fixture();
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { const id = Number(req.get('x-user')); req.session = {user: id ? {id} : null}; next(); });
  const requireLogin = (req, res, next) => req.session.user ? next() : res.status(401).json({message: 'login'});
  const pusher = push.createPusher(db, {request: async () => ({status: 201})});
  push.register(app, {db, requireLogin, pusher});
  notify.register(app, {db, requireLogin, mail: {mode: () => 'graph'}});
  app.use((e, req, res, next) => res.status(500).json({message: e.message}));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const call = async (path, user = 1, method = 'GET', data, agent) => {
    const r = await fetch('http://127.0.0.1:' + server.address().port + path, {method, headers: {'x-user': String(user), 'content-type': 'application/json', ...(agent ? {'user-agent': agent} : {})}, body: data ? JSON.stringify(data) : undefined});
    return {status: r.status, data: await r.json()};
  };
  try {
    assert.equal((await call('/api/hub/notify', 0)).status, 401);
    let state = (await call('/api/hub/notify')).data;
    assert.deepEqual(state, {accountId: 1, email: {verified: true, address: 'a***@example.com'}, mail: true, devices: [], feed: {enabled: false, createdAt: null, lastUsedAt: null}});
    const browser = crypto.createECDH('prime256v1'); browser.generateKeys();
    const keys = {p256dh: browser.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url')};
    const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
    assert.equal((await call('/api/push/subscribe', 1, 'POST', {accountId: 1, subscription: {endpoint: 'https://fcm.googleapis.com/fcm/send/one', keys}}, chrome)).status, 201);
    assert.equal((await call('/api/push/subscribe', 1, 'POST', {accountId: 1, subscription: {endpoint: 'https://web.push.apple.com/two', keys}}, iphone)).status, 201);
    assert.equal((await call('/api/push/subscribe', 2, 'POST', {accountId: 2, subscription: {endpoint: 'https://fcm.googleapis.com/fcm/send/bob', keys}})).status, 201);
    state = (await call('/api/hub/notify')).data;
    assert.deepEqual(state.devices.map(d => [d.label, d.service, d.failing]), [['Chrome · Windows', 'fcm', false], ['Safari · iPhone', 'apple', false]]);
    const bobDevice = (await call('/api/hub/notify', 2)).data.devices[0];
    assert.equal((await call('/api/hub/notify/devices/' + state.devices[0].id + '/remove', 1, 'POST', {accountId: 2})).status, 409);
    assert.equal((await call('/api/hub/notify/devices/' + bobDevice.id + '/remove', 1, 'POST', {accountId: 1})).status, 404);
    assert.equal((await call('/api/hub/notify/devices/0/remove', 1, 'POST', {accountId: 1})).status, 400);
    const removed = await call('/api/hub/notify/devices/' + state.devices[0].id + '/remove', 1, 'POST', {accountId: 1});
    assert.equal(removed.status, 200);
    assert.deepEqual(removed.data.devices.map(d => d.label), ['Safari · iPhone']);
    assert.equal((await call('/api/hub/notify', 2)).data.devices.length, 1);
    // Calendar subscription from the settings page: the address is returned once.
    assert.equal((await call('/api/hub/notify/feed', 1, 'POST', {accountId: 1, action: 'rotate'})).status, 400);
    const created = await call('/api/hub/notify/feed', 1, 'POST', {accountId: 1, action: 'create'});
    assert.equal(created.status, 201);
    assert.match(created.data.feedUrl, /\/feed\/[A-Za-z0-9_-]{32}\.ics$/);
    assert.equal(created.data.feed.enabled, true);
    assert.equal((await call('/api/hub/notify')).data.feedUrl, undefined);
    assert.equal((await call('/api/hub/notify/feed', 1, 'POST', {accountId: 1, action: 'off'})).data.feed.enabled, false);
    for (const [agent, label] of [['Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0', 'Edge · Windows'],
      ['Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0', 'Firefox · Android'], ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 'Safari · macOS'],
      ['', null], ['curl/8', null]])
      assert.equal(push.deviceLabel(agent), label, agent);
    assert.equal(notify.mask('someone@example.org'), 's***@example.org');
  } finally { await new Promise(resolve => server.close(resolve)); db.close(); }
});

test('budget card: this month in the budget currency, refunds subtracted, other currencies via cached rates', async () => {
  const db = await fixture();
  try {
    await db.exec(`CREATE TABLE todo_lists(user_id INTEGER PRIMARY KEY,revision INTEGER DEFAULT 0,state TEXT DEFAULT '[]');
      CREATE TABLE ledger_budgets(user_id INTEGER NOT NULL,category_id TEXT NOT NULL,currency TEXT NOT NULL,amount INTEGER NOT NULL,updated_at TEXT,PRIMARY KEY(user_id,category_id));
      INSERT INTO ledger_budgets VALUES(1,'*','USD',100000,NULL),(1,'food','USD',2000,NULL);
      INSERT INTO ledger_entries(id,user_id,kind,currency,date,category_id,amount) VALUES
        ('1',1,'expense','USD','2026-11-02','food',5000),('2',1,'refund','USD','2026-11-03','food',1000),('3',1,'income','USD','2026-11-04','salary',99999),
        ('4',1,'expense','USD','2026-10-31','food',7000),('5',1,'expense','CNY','2026-11-05','food',7200),('6',2,'expense','USD','2026-11-05','food',100);`);
    const date = '2026-11-17', rates = async () => ({available: true, rates: {USD: 1, CNY: 7.2, CAD: 1.4, HKD: 7.8}});
    const card = await todayApi.budget(db, 1, date, rates);
    assert.deepEqual([card.month, card.currency, card.amount, card.spent], ['2026-11', 'USD', 100000, 5000]);
    assert.match(card.url, /\/ledger\/$/);
    assert.equal((await todayApi.budget(db, 1, date, async () => ({available: false}))).spent, null);
    assert.equal(await todayApi.budget(db, 2, date, rates), null);
    const summary = await todayApi.today(db, 1, new Date('2026-11-17T03:00:00Z'), {rates});
    assert.equal(summary.budget.spent, 5000);
  } finally { db.close(); }
});
