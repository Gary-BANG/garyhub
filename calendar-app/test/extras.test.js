'use strict';
// v2.4.1.3: today summary, search, calendar subscription, push encryption and stock alerts.
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto'), express = require('express');
const {createSqliteAdapter} = require('./helpers/sqlite-adapter');
const todayApi = require('../today-api'), feed = require('../calendar-feed'), push = require('../push-api'), alerts = require('../stock-alerts');

async function fixture() {
  const db = createSqliteAdapter();
  await db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,role TEXT DEFAULT 'user',enabled INTEGER DEFAULT 1,timezone TEXT DEFAULT 'Etc/UTC',
      deletion_pending INTEGER DEFAULT 0,stock_vip INTEGER DEFAULT 0,account_tier TEXT DEFAULT 'subscriber');
    INSERT INTO users(id,username,timezone) VALUES(1,'alice','Asia/Shanghai'),(2,'bob','Etc/UTC'),(3,'off','Etc/UTC');
    UPDATE users SET enabled=0 WHERE id=3;
    CREATE TABLE categories(id TEXT PRIMARY KEY,user_id INTEGER,name TEXT,color TEXT);
    CREATE TABLE tasks(id TEXT PRIMARY KEY,user_id INTEGER,title TEXT,start_date TEXT,end_date TEXT,category_id TEXT,status TEXT DEFAULT 'todo',
      completed_at TEXT,reminder_enabled INTEGER DEFAULT 0,note TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE reminder_settings(task_id TEXT PRIMARY KEY,frequency INTEGER,time_1 TEXT,time_2 TEXT);
    CREATE TABLE notifications(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,type TEXT,title TEXT,body TEXT,action_url TEXT,dedupe_key TEXT,
      scope TEXT DEFAULT 'calendar',read_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,dedupe_key));
    CREATE TABLE todo_lists(user_id INTEGER PRIMARY KEY,revision INTEGER DEFAULT 0,state TEXT DEFAULT '[]');
    CREATE TABLE diary_entries(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,entry_date TEXT,title TEXT DEFAULT '',body TEXT DEFAULT '');
    CREATE TABLE ledger_entries(id TEXT PRIMARY KEY,user_id INTEGER,kind TEXT,currency TEXT,date TEXT,category_id TEXT,amount INTEGER,notes TEXT DEFAULT '');
    CREATE TABLE research_projects(id TEXT PRIMARY KEY,user_id INTEGER,name TEXT,entries TEXT DEFAULT '[]',updated_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
  await feed.migrate(db); await push.migrate(db); await alerts.migrate(db); await require('../preferences-api').migrate(db);
  return db;
}
async function serve(db, register) {
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { const id = Number(req.get('x-user')); req.session = {user: id ? {id} : null}; next(); });
  const requireLogin = (req, res, next) => req.session.user ? next() : res.status(401).json({message: '未登录'});
  register(app, requireLogin);
  app.use((e, req, res, next) => res.status(e.status || 500).json({message: e.message}));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = async (path, user = 1, method = 'GET', data) => {
    const r = await fetch(base + path, {method, headers: {'x-user': String(user), 'content-type': 'application/json'}, body: data ? JSON.stringify(data) : undefined});
    const type = r.headers.get('content-type') || '';
    return {status: r.status, headers: r.headers, data: type.includes('json') ? await r.json() : await r.text()};
  };
  return {call, close: () => new Promise(resolve => server.close(resolve))};
}

test('today uses the account time zone and only its own open records', async () => {
  const db = await fixture();
  try {
    // 2026-11-16 20:30 UTC is already 2026-11-17 in Shanghai.
    const now = new Date('2026-11-16T20:30:00Z');
    await db.exec(`INSERT INTO categories VALUES('c1',1,'Study','#112233');
      INSERT INTO tasks(id,user_id,title,start_date,end_date,category_id,status) VALUES
        ('t1',1,'Today in Shanghai','2026-11-17','2026-11-17','c1','todo'),('t2',1,'Spans today','2026-11-10','2026-11-20',NULL,'doing'),
        ('t3',1,'Finished','2026-11-17','2026-11-17',NULL,'done'),('t4',1,'Overdue','2026-11-01','2026-11-16',NULL,'todo'),
        ('t5',1,'Tomorrow','2026-11-18','2026-11-18',NULL,'todo'),('t6',2,'Bob today','2026-11-16','2026-11-17',NULL,'todo');
      INSERT INTO todo_lists(user_id,state) VALUES(1,'${JSON.stringify([{id: 'a', title: 'Open', done: false, points: [{id: 'p', text: 'x', done: false}, {id: 'q', text: 'y', done: true}]}, {id: 'b', title: 'Closed', done: true, points: []}])}');
      INSERT INTO notifications(user_id,type,title,body) VALUES(1,'release','n','b'),(1,'release','read','b'),(2,'release','bob','b');
      UPDATE notifications SET read_at='x' WHERE title='read';
      INSERT INTO notifications(user_id,type,title,body,created_at) VALUES(1,'release','expired','b','2020-01-01 00:00:00');`);
    const mine = await todayApi.today(db, 1, now);
    assert.equal(mine.date, '2026-11-17');
    assert.deepEqual(mine.tasks.items.map(t => t.id), ['t1', 't2']);
    assert.equal(mine.tasks.items[0].color, '#112233');
    assert.equal(mine.overdue, 1);
    assert.deepEqual(mine.todos, {count: 1, items: [{id: 'a', title: 'Open', openPoints: 1}]});
    assert.equal(mine.unread, 1);
    const bob = await todayApi.today(db, 2, now);
    assert.equal(bob.date, '2026-11-16');
    assert.deepEqual(bob.tasks.items.map(t => t.id), ['t6']);
    assert.equal(bob.todos.count, 0);
    assert.equal(todayApi.localDate('Not/AZone', now), '2026-11-16');
  } finally { db.close(); }
});

test('search stays inside the account, escapes wildcards and reports where each hit lives', async () => {
  const db = await fixture();
  try {
    await db.exec(`INSERT INTO tasks(id,user_id,title,start_date,end_date,note) VALUES('t1',1,'Robot kinematics review','2026-11-17','2026-11-18',''),
        ('t2',1,'Groceries','2026-11-12','2026-11-12','buy 100% juice for the robot club'),('t3',2,'Robot secret of bob','2026-11-17','2026-11-17','');
      INSERT INTO todo_lists(user_id,state) VALUES(1,'${JSON.stringify([{id: 'a', title: 'Lab report', done: false, points: [{id: 'p', text: 'attach robot photos', done: false}]}])}'),
        (2,'${JSON.stringify([{id: 'b', title: 'robot of bob', done: false, points: []}])}');
      INSERT INTO diary_entries(user_id,entry_date,title,body) VALUES(1,'2026-11-01','Quiet day','Built a small robot arm.'),(2,'2026-11-01','bob','robot');
      INSERT INTO ledger_entries VALUES('e1',1,'expense','CNY','2026-11-03','fun',12345,'robot kit'),('e2',2,'expense','CNY','2026-11-03','fun',1,'robot');
      INSERT INTO research_projects(id,user_id,name,entries) VALUES('p1',1,'Robotics','${JSON.stringify([{english: ['manipulator'], chinese: ['机械臂'], definition: 'A robot arm with joints.'}, {english: ['gain'], chinese: ['增益'], definition: 'Ratio.'}])}'),
        ('p2',2,'Bob','${JSON.stringify([{english: ['robot'], chinese: ['机器人'], definition: 'x'}])}');`);
    const found = await todayApi.search(db, 1, '  robot ');
    assert.equal(found.q, 'robot');
    assert.deepEqual(found.groups.map(g => g.type), ['task', 'todo', 'diary', 'ledger', 'research']);
    const by = Object.fromEntries(found.groups.map(g => [g.type, g.items]));
    assert.deepEqual(by.task.map(t => t.title), ['Robot kinematics review', 'Groceries']);
    assert.equal(by.task[1].snippet.includes('robot club'), true);
    assert.equal(by.task[0].url, 'https://calendar.garyhub.uk/?date=2026-11-17');
    assert.equal(by.todo[0].snippet, 'attach robot photos');
    assert.equal(by.diary[0].url, 'https://calendar.garyhub.uk/journal/?date=2026-11-01');
    assert.deepEqual([by.ledger[0].title, by.ledger[0].url], ['CNY 123.45', 'https://calendar.garyhub.uk/ledger/?entry=e1&from=2026-11-03&to=2026-11-03']);
    assert.equal(by.research[0].title, 'manipulator · 机械臂');
    assert.equal(JSON.stringify(found).includes('bob'), false);
    // % and _ are literal characters, not wildcards.
    assert.deepEqual((await todayApi.search(db, 1, '100%')).groups.map(g => g.type), ['task']);
    assert.deepEqual((await todayApi.search(db, 1, '%')).groups.map(g => g.items.length), [1]);
    assert.deepEqual((await todayApi.search(db, 1, '_')).groups, []);
    assert.deepEqual((await todayApi.search(db, 1, '机械')).groups.map(g => g.type), ['research']);
    await assert.rejects(() => todayApi.search(db, 1, '   '), {status: 400});
    await assert.rejects(() => todayApi.search(db, 1, 'x'.repeat(81)), {status: 400});
    const http = await serve(db, (app, requireLogin) => todayApi.register(app, {db, requireLogin}));
    try {
      assert.equal((await http.call('/api/hub/today', 0)).status, 401);
      assert.equal((await http.call('/api/hub/search?q=robot', 0)).status, 401);
      assert.equal((await http.call('/api/hub/search?q=', 1)).status, 400);
      assert.equal((await http.call('/api/hub/search?q=robot', 2)).data.groups.every(g => g.items.every(i => !/Groceries|Quiet/.test(i.title))), true);
      assert.equal((await http.call('/api/hub/today', 1)).data.accountId, 1);
    } finally { await http.close(); }
  } finally { db.close(); }
});

test('calendar feed is valid iCalendar text with folded, escaped all-day events', () => {
  const text = feed.calendar([{id: 'abc', title: 'Plan; trip, to 北京' + '长'.repeat(40), start_date: '2026-12-30', end_date: '2026-12-31', status: 'done',
    note: 'line one\nline two\\', category_name: 'Travel', updated_at: '2026-11-16 08:09:10'}]);
  assert.equal(text.endsWith('END:VCALENDAR\r\n'), true);
  assert.equal(/[^\r]\n/.test(text), false);
  for (const line of text.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
  const unfolded = text.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('UID:abc@calendar.garyhub.uk\r\nDTSTAMP:20261116T080910Z\r\nDTSTART;VALUE=DATE:20261230\r\nDTEND;VALUE=DATE:20270101\r\n'));
  assert.ok(unfolded.includes('SUMMARY:✓ Plan\\; trip\\, to 北京' + '长'.repeat(40) + '\r\n'));
  assert.ok(unfolded.includes('DESCRIPTION:line one\\nline two\\\\\r\nCATEGORIES:Travel\r\n'));
  assert.equal(feed.fold('é'.repeat(60)).split('\r\n ').every(part => Buffer.from(part).toString() === part && Buffer.byteLength(part) <= 75), true);
});

test('calendar subscription: secret address shown once, rotation and switching off stop the old address', async () => {
  const db = await fixture();
  await db.exec(`INSERT INTO tasks(id,user_id,title,start_date,end_date) VALUES('mine',1,'My exam','2099-01-02','2099-01-03'),('old',1,'Ancient','2001-01-01','2001-01-02'),('theirs',2,'Bob only','2099-01-02','2099-01-02')`);
  const http = await serve(db, (app, requireLogin) => feed.register(app, {db, requireLogin}));
  try {
    assert.equal((await http.call('/api/calendar-feed', 0)).status, 401);
    assert.deepEqual((await http.call('/api/calendar-feed')).data, {accountId: 1, enabled: false, createdAt: null, lastUsedAt: null});
    assert.equal((await http.call('/api/calendar-feed', 1, 'POST', {accountId: 2})).status, 409);
    const made = await http.call('/api/calendar-feed', 1, 'POST', {accountId: 1});
    assert.equal(made.status, 201);
    assert.match(made.data.url, /^https:\/\/calendar\.garyhub\.uk\/feed\/[A-Za-z0-9_-]{32}\.ics$/);
    const path = new URL(made.data.url).pathname;
    // Only a hash is stored, and the status call never repeats the address.
    assert.equal(JSON.stringify(await db.all('SELECT * FROM calendar_feeds')).includes(path.slice(6, 38)), false);
    assert.equal('url' in (await http.call('/api/calendar-feed')).data, false);
    const ics = await http.call(path, 0);
    assert.equal(ics.status, 200);
    assert.match(ics.headers.get('content-type'), /^text\/calendar/);
    assert.equal(ics.headers.get('cache-control'), 'private, no-store');
    assert.ok(ics.data.includes('SUMMARY:My exam') && !ics.data.includes('Bob only') && !ics.data.includes('Ancient'));
    assert.ok((await http.call('/api/calendar-feed')).data.lastUsedAt);
    for (const bad of ['/feed/' + 'A'.repeat(32) + '.ics', '/feed/short.ics', path.replace('.ics', '.txt'), path + 'x'])
      assert.equal((await http.call(bad, 0)).status, 404, bad);
    const rotated = await http.call('/api/calendar-feed', 1, 'POST', {accountId: 1});
    assert.notEqual(rotated.data.url, made.data.url);
    assert.equal((await http.call(path, 0)).status, 404);
    const next = new URL(rotated.data.url).pathname;
    assert.equal((await http.call(next, 0)).status, 200);
    await db.run('UPDATE users SET enabled=0 WHERE id=1');
    assert.equal((await http.call(next, 0)).status, 404);
    await db.run('UPDATE users SET enabled=1 WHERE id=1');
    assert.equal((await http.call('/api/calendar-feed', 1, 'DELETE', {accountId: 2})).status, 409);
    assert.equal((await http.call('/api/calendar-feed', 1, 'DELETE', {accountId: 1})).data.enabled, false);
    assert.equal((await http.call(next, 0)).status, 404);
  } finally { await http.close(); db.close(); }
});

// The worked example of RFC 8291, section 5 / appendix A.
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  senderPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  receiverPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  receiverPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'
};
// An independent receiver: what a browser does with the message body.
function receive(body, privateKey, auth) {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.setPrivateKey(privateKey);
  const salt = body.subarray(0, 16), size = body[20], sender = body.subarray(21, 21 + size), data = body.subarray(21 + size);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), sender]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', ecdh.computeSecret(sender), auth, info, 32));
  const key = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const decipher = crypto.createDecipheriv('aes-128-gcm', key, nonce);
  decipher.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]);
  assert.equal(plain[plain.length - 1], 2);
  return plain.subarray(0, plain.length - 1).toString();
}

test('push encryption reproduces the RFC 8291 example and decrypts with fresh keys', () => {
  const b = text => Buffer.from(text, 'base64url');
  const body = push.encrypt(RFC.plaintext, {p256dh: RFC.receiverPublic, auth: RFC.auth}, {salt: b(RFC.salt), sender: b(RFC.senderPrivate)});
  assert.equal(body.toString('base64url'), RFC.body);
  assert.equal(receive(body, b(RFC.receiverPrivate), b(RFC.auth)), RFC.plaintext);
  const browser = crypto.createECDH('prime256v1'); browser.generateKeys();
  const auth = crypto.randomBytes(16), message = push.payload({title: '提醒', body: '今天 09:00', url: 'https://calendar.garyhub.uk/'});
  const sub = {p256dh: browser.getPublicKey().toString('base64url'), auth: auth.toString('base64url')};
  const first = push.encrypt(message, sub), second = push.encrypt(message, sub);
  assert.notDeepEqual(first, second);
  assert.equal(first.readUInt32BE(16), 4096);
  assert.deepEqual(JSON.parse(receive(first, browser.getPrivateKey(), auth)), {title: '提醒', body: '今天 09:00', url: 'https://calendar.garyhub.uk/'});
  assert.throws(() => push.encrypt('x', {p256dh: 'AAAA', auth: sub.auth}));
});

test('VAPID token is a verifiable ES256 JWT for the push service origin', () => {
  const pair = push.generateKeys(), now = Date.parse('2026-11-16T00:00:00Z');
  const header = push.authorization('https://fcm.googleapis.com/fcm/send/abc', pair, now);
  const match = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header);
  assert.ok(match);
  assert.equal(match[4], pair.publicKey);
  assert.deepEqual(JSON.parse(Buffer.from(match[1], 'base64url')), {typ: 'JWT', alg: 'ES256'});
  assert.deepEqual(JSON.parse(Buffer.from(match[2], 'base64url')), {aud: 'https://fcm.googleapis.com', exp: now / 1000 + 43200, sub: 'https://garyhub.uk'});
  const point = Buffer.from(pair.publicKey, 'base64url');
  assert.equal(point.length, 65);
  const key = crypto.createPublicKey({format: 'jwk', key: {kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url')}});
  assert.equal(crypto.verify('sha256', Buffer.from(match[1] + '.' + match[2]), {key, dsaEncoding: 'ieee-p1363'}, Buffer.from(match[3], 'base64url')), true);
});

test('push subscriptions: only known push services, per-account, dead ones removed', async () => {
  const db = await fixture();
  for (const [url, ok] of [['https://fcm.googleapis.com/fcm/send/x', true], ['https://updates.push.services.mozilla.com/wpush/v2/x', true],
    ['https://web.push.apple.com/x', true], ['https://db5p.notify.windows.com/w/?token=x', true], ['http://fcm.googleapis.com/x', false],
    ['https://fcm.googleapis.com.evil.example/x', false], ['https://127.0.0.1/x', false], ['https://fcm.googleapis.com:8443/x', false],
    ['https://user@fcm.googleapis.com/x', false], ['x', false], [null, false]]) assert.equal(push.allowedEndpoint(url), ok, String(url));
  const browser = crypto.createECDH('prime256v1'); browser.generateKeys();
  const keys = {p256dh: browser.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url')};
  const sent = [];
  let reply = 201;
  const pusher = push.createPusher(db, {request: async (url, options) => { sent.push({url, options}); return {status: reply}; }});
  const http = await serve(db, (app, requireLogin) => push.register(app, {db, requireLogin, pusher}));
  try {
    assert.equal((await http.call('/api/push/status', 0)).status, 401);
    const status = (await http.call('/api/push/status')).data;
    assert.equal(Buffer.from(status.publicKey, 'base64url').length, 65);
    assert.equal(status.devices, 0);
    assert.equal((await http.call('/api/push/status', 2)).data.publicKey, status.publicKey);
    const endpoint = 'https://fcm.googleapis.com/fcm/send/device-1';
    assert.equal((await http.call('/api/push/subscribe', 1, 'POST', {accountId: 2, subscription: {endpoint, keys}})).status, 409);
    for (const bad of [{endpoint: 'https://example.com/x', keys}, {endpoint, keys: {p256dh: keys.p256dh, auth: 'short'}}, {endpoint, keys: {p256dh: 'A'.repeat(87), auth: keys.auth}}, {endpoint}])
      assert.equal((await http.call('/api/push/subscribe', 1, 'POST', {accountId: 1, subscription: bad})).status, 400);
    assert.equal((await http.call('/api/push/subscribe', 1, 'POST', {accountId: 1, subscription: {endpoint, keys}})).data.devices, 1);
    assert.equal((await http.call('/api/push/subscribe', 1, 'POST', {accountId: 1, subscription: {endpoint, keys}})).data.devices, 1);
    // The same browser signing in as another account moves over; the first account no longer receives its pushes.
    assert.equal((await http.call('/api/push/subscribe', 2, 'POST', {accountId: 2, subscription: {endpoint, keys}})).data.devices, 1);
    assert.equal((await http.call('/api/push/status', 1)).data.devices, 0);
    assert.deepEqual((await http.call('/api/push/test', 1, 'POST', {accountId: 1})).data, {sent: 0, failed: 0, removed: 0});
    assert.deepEqual((await http.call('/api/push/test', 2, 'POST', {accountId: 2})).data, {sent: 1, failed: 0, removed: 0});
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, endpoint);
    assert.equal(sent[0].options.headers['Content-Encoding'], 'aes128gcm');
    assert.match(sent[0].options.headers.Authorization, /^vapid t=/);
    assert.equal(JSON.parse(receive(sent[0].options.body, browser.getPrivateKey(), Buffer.from(keys.auth, 'base64url'))).title, 'Gary Hub');
    reply = 500;
    assert.deepEqual(await pusher.notify(2, {title: 't'}), {sent: 0, failed: 1, removed: 0});
    assert.equal((await db.get('SELECT failures FROM push_subscriptions')).failures, 1);
    reply = 410;
    assert.deepEqual(await pusher.notify(2, {title: 't'}), {sent: 0, failed: 0, removed: 1});
    assert.equal((await http.call('/api/push/status', 2)).data.devices, 0);
    await http.call('/api/push/subscribe', 1, 'POST', {accountId: 1, subscription: {endpoint, keys}});
    assert.equal((await http.call('/api/push/unsubscribe', 2, 'POST', {accountId: 2, endpoint})).data.devices, 0);
    assert.equal((await http.call('/api/push/status', 1)).data.devices, 1);
    assert.equal((await http.call('/api/push/unsubscribe', 1, 'POST', {accountId: 1, endpoint})).data.devices, 0);
  } finally { await http.close(); db.close(); }
});

test('push reminders fire once per slot for accounts with a subscribed browser', async () => {
  const db = await fixture();
  try {
    await db.exec(`INSERT INTO tasks(id,user_id,title,start_date,end_date,reminder_enabled) VALUES('t1',1,'Review','2026-11-17','2026-11-17',1),('t2',2,'No device','2026-11-16','2026-11-17',1),('t3',1,'Done','2026-11-17','2026-11-17',1);
      UPDATE tasks SET status='done' WHERE id='t3';
      INSERT INTO reminder_settings VALUES('t1',1,'09:00',NULL),('t2',1,'01:00',NULL),('t3',1,'09:00',NULL);
      INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth) VALUES(1,'https://fcm.googleapis.com/x','k','a');`);
    const seen = [], notify = async (user, message) => { seen.push([user, message.title, message.body]); };
    // 01:00 UTC is 09:00 in Shanghai on the task's day.
    assert.deepEqual(await push.runReminders({db, notify, now: new Date('2026-11-17T01:00:20Z')}), {sent: 1, inApp: 0});
    assert.deepEqual(seen, [[1, 'Gary Hub 提醒：Review', '2026-11-17 09:00']]);
    assert.deepEqual(await push.runReminders({db, notify, now: new Date('2026-11-17T01:02:00Z')}), {sent: 0, inApp: 0});
    assert.deepEqual(await push.runReminders({db, notify, now: new Date('2026-11-17T05:00:00Z')}), {sent: 0, inApp: 0});
    assert.equal(seen.length, 1);
  } finally { db.close(); }
});

test('stock alerts: limits, one-shot trigger, notification and account isolation', async () => {
  const db = await fixture();
  await db.run('UPDATE users SET stock_vip=1 WHERE id=2');
  assert.equal(alerts.parsePrice('12.5'), 12500);
  assert.equal(alerts.showPrice(12500), '12.50');
  assert.equal(alerts.showPrice(1234), '1.234');
  for (const bad of ['0', '-1', '1.2345', 'abc', 12, '']) assert.throws(() => alerts.parsePrice(bad), {status: 422});
  // 2026-11-16 is a Monday.
  for (const [iso, open] of [['2026-11-16T01:30:00Z', true], ['2026-11-16T03:30:00Z', true], ['2026-11-16T03:31:00Z', false], ['2026-11-16T05:00:00Z', true],
    ['2026-11-16T07:00:00Z', true], ['2026-11-16T07:01:00Z', false], ['2026-11-16T01:29:00Z', false], ['2026-11-14T02:00:00Z', false], ['2026-11-15T02:00:00Z', false]])
    assert.equal(alerts.trading(new Date(iso)), open, iso);
  const http = await serve(db, (app) => { app.use('/api/stocks', (req, res, next) => { if (!req.session.user) return res.status(401).json({message: 'login'}); req.stockUser = req.session.user.id; next(); }); alerts.register(app, {db}); });
  try {
    assert.equal((await http.call('/api/stocks/alerts', 0)).status, 401);
    assert.deepEqual((await http.call('/api/stocks/alerts')).data, {accountId: 1, vip: false, limit: 3, alerts: []});
    const add = (user, body) => http.call('/api/stocks/alerts', user, 'POST', {accountId: user, symbol: 'sz300033', name: '同花顺', direction: 'above', price: '100', ...body});
    assert.equal((await add(1, {accountId: 2})).status, 409);
    for (const bad of [{symbol: 'us000001'}, {direction: 'up'}, {price: 'x'}, {price: 100}]) assert.equal((await add(1, bad)).status, 422);
    assert.equal((await add(1)).status, 201);
    assert.equal((await add(1)).status, 409);
    assert.equal((await add(1, {direction: 'below', price: '90.5'})).status, 201);
    assert.equal((await add(1, {symbol: 'sh600000', name: '浦发银行', price: '8.888'})).status, 201);
    const full = await add(1, {price: '101'});
    assert.equal(full.status, 422);
    assert.match(full.data.message, /VIP/);
    for (let i = 0; i < 20; i++) assert.equal((await add(2, {price: String(200 + i)})).status, 201);
    assert.equal((await add(2, {price: '300'})).status, 422);
    const mine = (await http.call('/api/stocks/alerts')).data.alerts;
    assert.deepEqual(mine.map(a => a.price).sort(), ['100.00', '8.888', '90.50']);
    assert.equal((await http.call('/api/stocks/alerts/' + mine[0].id, 2, 'DELETE', {accountId: 2})).status, 404);

    const quotes = {sz300033: {name: '同花顺', price: 99.5}, sh600000: {name: '浦发银行', price: 8.9}}, asked = [], pushed = [];
    const provider = {quote: async symbol => { asked.push(symbol); if (!quotes[symbol]) throw Error('down'); return quotes[symbol]; }};
    const notify = async (user, message) => { pushed.push([user, message.title]); };
    const closed = new Date('2026-11-14T02:00:00Z'), open = new Date('2026-11-16T02:00:00Z');
    assert.deepEqual(await alerts.checkAlerts({db, provider, notify, now: closed}), {checked: 0, triggered: 0});
    assert.deepEqual(await alerts.checkAlerts({db, provider, notify, now: open}), {checked: 2, triggered: 1});
    assert.deepEqual(pushed, [[1, '浦发银行 到价提醒']]);
    quotes.sz300033.price = 100;
    assert.deepEqual(await alerts.checkAlerts({db, provider, notify, now: open}), {checked: 1, triggered: 1});
    quotes.sz300033.price = 90.5;
    assert.deepEqual(await alerts.checkAlerts({db, provider, notify, now: open}), {checked: 1, triggered: 1});
    assert.deepEqual(await alerts.checkAlerts({db, provider, notify, now: open}), {checked: 1, triggered: 0});
    quotes.sz300033 = {name: 'x', price: 500, stale: true};
    assert.deepEqual(await alerts.checkAlerts({db, provider, notify, now: open}), {checked: 1, triggered: 0});
    const notes = await db.all("SELECT user_id,type,scope,title,body,action_url FROM notifications WHERE type='stock-alert' ORDER BY id");
    assert.equal(notes.length, 3);
    assert.equal(notes.every(n => n.user_id === 1 && n.scope === 'tools' && n.action_url === 'https://calendar.garyhub.uk/stocks/'), true);
    assert.equal(notes[0].body, '浦发银行（600000）现价 8.90，已达到或高于你设定的 8.888。');
    const after = (await http.call('/api/stocks/alerts')).data.alerts;
    assert.equal(after.every(a => a.triggeredAt), true);
    assert.equal(after.find(a => a.symbol === 'sh600000').triggeredPrice, '8.90');
    // Fired alerts no longer count towards the limit, and deleting is limited to the owner.
    assert.equal((await add(1, {price: '120'})).status, 201);
    assert.equal((await http.call('/api/stocks/alerts/' + after[0].id, 1, 'DELETE', {accountId: 1})).status, 200);
    assert.equal((await http.call('/api/stocks/alerts', 2)).data.alerts.length, 20);
  } finally { await http.close(); db.close(); }
});
