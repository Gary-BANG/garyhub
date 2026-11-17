'use strict';
// Browser push notifications (v2.4.1.3): Web Push message encryption (RFC 8291, aes128gcm) and VAPID (RFC 8292)
// with Node's own crypto, so no new production dependency is needed. Subscriptions belong to one account;
// messages go only to recognised push services, and a dead subscription is removed when the service says so.
const crypto = require('node:crypto');
const {rateLimit} = require('./rate-limit');
const {dueReminderSlots, localParts} = require('./reminder-utils');

const route = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const b64u = data => Buffer.from(data).toString('base64url');
const fromB64u = text => Buffer.from(String(text), 'base64url');
const SERVICES = /^(?:fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/;
const MAX_PER_USER = 10;
const CONTACT = 'https://garyhub.uk';

async function migrate(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS push_keys(id INTEGER PRIMARY KEY CHECK(id=1),public_key TEXT NOT NULL,private_key TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await db.run(`CREATE TABLE IF NOT EXISTS push_subscriptions(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,p256dh TEXT NOT NULL,auth TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_success_at TEXT,failures INTEGER NOT NULL DEFAULT 0)`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)');
  await db.run(`CREATE TABLE IF NOT EXISTS push_reminder_log(task_id TEXT NOT NULL,user_id INTEGER NOT NULL,local_date TEXT NOT NULL,
    local_time TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(task_id,local_date,local_time))`);
}

function generateKeys() {
  const {publicKey, privateKey} = crypto.generateKeyPairSync('ec', {namedCurve: 'prime256v1'});
  const jwk = publicKey.export({format: 'jwk'});
  return {publicKey: b64u(Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)])), privateKey: privateKey.export({format: 'jwk'}).d};
}
async function keys(db) {
  let row = await db.get('SELECT public_key,private_key FROM push_keys WHERE id=1');
  if (!row) {
    const made = generateKeys();
    await db.run('INSERT OR IGNORE INTO push_keys(id,public_key,private_key) VALUES(1,?,?)', [made.publicKey, made.privateKey]);
    row = await db.get('SELECT public_key,private_key FROM push_keys WHERE id=1');
  }
  return {publicKey: row.public_key, privateKey: row.private_key};
}
function signingKey(pair) {
  const point = fromB64u(pair.publicKey);
  return crypto.createPrivateKey({format: 'jwk', key: {kty: 'EC', crv: 'P-256', d: pair.privateKey, x: b64u(point.subarray(1, 33)), y: b64u(point.subarray(33, 65))}});
}
// VAPID: a short-lived ES256 token naming the push service origin; the public key travels with it.
function authorization(endpoint, pair, now = Date.now()) {
  const head = b64u(JSON.stringify({typ: 'JWT', alg: 'ES256'}));
  const claims = b64u(JSON.stringify({aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: CONTACT}));
  const signature = crypto.sign('sha256', Buffer.from(head + '.' + claims), {key: signingKey(pair), dsaEncoding: 'ieee-p1363'});
  return 'vapid t=' + head + '.' + claims + '.' + b64u(signature) + ', k=' + pair.publicKey;
}
// RFC 8291: ECDH with the browser's key, HKDF with its auth secret, then one aes128gcm record (RFC 8188).
function encrypt(plaintext, subscription, {salt = crypto.randomBytes(16), sender} = {}) {
  const receiver = fromB64u(subscription.p256dh), secret = fromB64u(subscription.auth);
  if (receiver.length !== 65 || receiver[0] !== 4 || secret.length !== 16) throw Error('Invalid push subscription keys');
  const ecdh = crypto.createECDH('prime256v1');
  if (sender) ecdh.setPrivateKey(sender); else ecdh.generateKeys();
  const local = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(receiver);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), receiver, local]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, secret, info, 32));
  const key = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = crypto.createCipheriv('aes-128-gcm', key, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(plaintext), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0); header.writeUInt32BE(4096, 16); header[20] = local.length;
  return Buffer.concat([header, local, body]);
}
function allowedEndpoint(value) {
  if (typeof value !== 'string' || value.length > 1000) return false;
  const test = process.env.GARYHUB_PUSH_TEST_ENDPOINT;
  if (test && value.startsWith(test)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && SERVICES.test(url.hostname);
  } catch { return false; }
}
function payload(message) {
  const text = (value, max) => String(value ?? '').slice(0, max);
  return JSON.stringify({title: text(message.title, 120) || 'Gary Hub', body: text(message.body, 400), url: text(message.url, 500) || 'https://calendar.garyhub.uk/',
    tag: text(message.tag, 80) || undefined});
}

function createPusher(db, {request = fetch} = {}) {
  async function deliver(subscription, message, pair) {
    const response = await request(subscription.endpoint, {method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: {Authorization: authorization(subscription.endpoint, pair), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal'},
      body: encrypt(payload(message), subscription)});
    return response.status;
  }
  // Returns how many of the account's devices accepted the message. Never throws: a push is always best effort.
  async function notify(userId, message) {
    const result = {sent: 0, failed: 0, removed: 0};
    try {
      const subscriptions = await db.all('SELECT id,endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=?', [userId]);
      if (!subscriptions.length) return result;
      const pair = await keys(db);
      for (const subscription of subscriptions) {
        let status = 0;
        try { status = allowedEndpoint(subscription.endpoint) ? await deliver(subscription, message, pair) : 410; } catch { status = 0; }
        if (status >= 200 && status < 300) {
          result.sent++;
          await db.run('UPDATE push_subscriptions SET last_success_at=CURRENT_TIMESTAMP,failures=0 WHERE id=?', [subscription.id]);
        } else if (status === 404 || status === 410) {
          result.removed++;
          await db.run('DELETE FROM push_subscriptions WHERE id=?', [subscription.id]);
        } else {
          result.failed++;
          await db.run('UPDATE push_subscriptions SET failures=failures+1 WHERE id=?', [subscription.id]);
          await db.run('DELETE FROM push_subscriptions WHERE id=? AND failures>=20', [subscription.id]);
        }
      }
    } catch (error) { console.error('Push delivery failed:', error.code || error.name || 'error'); }
    return result;
  }
  return {notify};
}

// Task reminders as push: the same daily times as the e-mail reminder, for accounts with a subscribed browser.
async function runReminders({db, notify, now = new Date()}) {
  const rows = await db.all(`SELECT t.id,t.title,t.start_date,t.end_date,t.status,t.completed_at,t.user_id,u.timezone,
      r.frequency,r.time_1,r.time_2
    FROM tasks t JOIN users u ON u.id=t.user_id JOIN reminder_settings r ON r.task_id=t.id
    WHERE t.reminder_enabled=1 AND t.status<>'done' AND t.completed_at IS NULL AND u.enabled=1
      AND EXISTS(SELECT 1 FROM push_subscriptions s WHERE s.user_id=t.user_id)`);
  const minute = Math.floor(now.getTime() / 60000) * 60000;
  let sent = 0;
  for (const row of rows) {
    for (let offset = 4; offset >= 0; offset--) {
      const instant = new Date(minute - offset * 60000);
      let local;
      try { local = localParts(instant, row.timezone); } catch { continue; }
      const slots = dueReminderSlots({task: {reminderEnabled: true, completedAt: row.completed_at, status: row.status,
        startDate: row.start_date, endDate: row.end_date}, settings: {frequency: row.frequency, time1: row.time_1, time2: row.time_2},
        timeZone: row.timezone, now: instant});
      for (const time of slots) {
        const claim = await db.run('INSERT OR IGNORE INTO push_reminder_log(task_id,user_id,local_date,local_time) VALUES(?,?,?,?)',
          [row.id, row.user_id, local.date, time]);
        if (!claim.changes) continue;
        await notify(row.user_id, {title: 'Gary Hub 提醒：' + row.title, body: local.date + ' ' + time, url: 'https://calendar.garyhub.uk/', tag: 'task-' + row.id});
        sent++;
      }
    }
  }
  await db.run("DELETE FROM push_reminder_log WHERE julianday(created_at)<=julianday('now','-7 days')");
  return {sent};
}

function register(app, {db, requireLogin, pusher = createPusher(db)}) {
  const count = async userId => (await db.get('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id=?', [userId])).n;
  const same = (req, res) => {
    if (req.body?.accountId === req.session.user.id) return true;
    res.status(409).json({message: '登录账号已变化，请刷新页面'});
    return false;
  };
  app.get('/api/push/status', requireLogin, route(async (req, res) => {
    res.json({accountId: req.session.user.id, publicKey: (await keys(db)).publicKey, devices: await count(req.session.user.id)});
  }));
  app.post('/api/push/subscribe', requireLogin, rateLimit(30, 60 * 60_000), route(async (req, res) => {
    if (!same(req, res)) return;
    const sub = req.body.subscription || {}, p256dh = sub.keys?.p256dh, auth = sub.keys?.auth;
    const valid = allowedEndpoint(sub.endpoint) && typeof p256dh === 'string' && typeof auth === 'string' &&
      /^[A-Za-z0-9_-]{80,100}$/.test(p256dh) && /^[A-Za-z0-9_-]{20,30}$/.test(auth) &&
      fromB64u(p256dh).length === 65 && fromB64u(p256dh)[0] === 4 && fromB64u(auth).length === 16;
    if (!valid) return res.status(400).json({message: '此浏览器的推送订阅无效或不受支持'});
    const userId = req.session.user.id;
    // A browser that signs in to another account moves its subscription to that account.
    await db.run(`INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth) VALUES(?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET
      user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,failures=0`, [userId, sub.endpoint, p256dh, auth]);
    await db.run(`DELETE FROM push_subscriptions WHERE user_id=? AND id NOT IN
      (SELECT id FROM push_subscriptions WHERE user_id=? ORDER BY id DESC LIMIT ?)`, [userId, userId, MAX_PER_USER]);
    res.status(201).json({accountId: userId, devices: await count(userId)});
  }));
  app.post('/api/push/unsubscribe', requireLogin, route(async (req, res) => {
    if (!same(req, res)) return;
    if (typeof req.body.endpoint !== 'string') return res.status(400).json({message: '参数无效'});
    await db.run('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?', [req.session.user.id, req.body.endpoint]);
    res.json({accountId: req.session.user.id, devices: await count(req.session.user.id)});
  }));
  app.post('/api/push/test', requireLogin, rateLimit(6, 60_000), route(async (req, res) => {
    if (!same(req, res)) return;
    res.json(await pusher.notify(req.session.user.id, {title: 'Gary Hub', body: '推送提醒已开启。 / Push notifications are on.', tag: 'push-test'}));
  }));
  return pusher;
}

function start(db, pusher) {
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try { await runReminders({db, notify: pusher.notify}); }
    catch (error) { console.error('Push reminder scan failed:', error.code || error.name || 'error'); }
    finally { busy = false; }
  }, 60_000);
  timer.unref();
  return timer;
}

module.exports = {migrate, register, start, createPusher, runReminders, encrypt, authorization, generateKeys, allowedEndpoint, keys, payload};
