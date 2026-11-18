'use strict';
// Read-only calendar subscription (iCalendar, RFC 5545) for the account's own tasks (v2.4.1.3).
// The address carries a random token; only its SHA-256 is stored, so it is shown once and can be rotated or switched off.
const crypto = require('node:crypto');
const {rateLimit} = require('./rate-limit');

const BASE = () => (process.env.APP_BASE_URL || 'https://calendar.garyhub.uk').replace(/\/+$/, '');
const route = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const digest = token => crypto.createHash('sha256').update(token).digest('hex');
const FILE = /^([A-Za-z0-9_-]{32})\.ics$/;

async function migrate(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS calendar_feeds(user_id INTEGER PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_used_at TEXT)`);
}

const escapeText = value => String(value ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
// Lines are folded at 75 octets without splitting a UTF-8 character (RFC 5545 section 3.1).
function fold(line) {
  const out = [];
  let current = '', size = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char);
    if (size + bytes > (out.length ? 74 : 75)) { out.push(current); current = ''; size = 0; }
    current += char; size += bytes;
  }
  out.push(current);
  return out.join('\r\n ');
}
const compact = date => date.replace(/-/g, '');
function nextDay(date) {
  return new Date(Date.parse(date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
}
function stamp(value) {
  const time = Date.parse(/Z$|[+-]\d\d:\d\d$/.test(value || '') ? value : String(value || '').replace(' ', 'T') + 'Z');
  return new Date(Number.isFinite(time) ? time : 0).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
function calendar(tasks, name = 'GaryHub') {
  const host = new URL(BASE()).hostname;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GaryHub//Calendar//ZH', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + escapeText(name), 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  for (const task of tasks) {
    lines.push('BEGIN:VEVENT', 'UID:' + task.id + '@' + host, 'DTSTAMP:' + stamp(task.updated_at || task.created_at),
      'DTSTART;VALUE=DATE:' + compact(task.start_date), 'DTEND;VALUE=DATE:' + compact(nextDay(task.end_date)),
      'SUMMARY:' + escapeText((task.status === 'done' ? '✓ ' : '') + task.title));
    if (task.note) lines.push('DESCRIPTION:' + escapeText(task.note));
    if (task.category_name) lines.push('CATEGORIES:' + escapeText(task.category_name));
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

// Shared with the settings centre (notify-api.js, v2.4.1.6).
async function feedStatus(db, userId) {
  const row = await db.get('SELECT created_at,last_used_at FROM calendar_feeds WHERE user_id=?', [userId]);
  return {enabled: !!row, createdAt: row?.created_at || null, lastUsedAt: row?.last_used_at || null};
}
// Creating again replaces the address, so an address that leaked stops working at once.
async function createFeed(db, userId) {
  const token = crypto.randomBytes(24).toString('base64url');
  await db.run(`INSERT INTO calendar_feeds(user_id,token_hash) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET
    token_hash=excluded.token_hash,created_at=CURRENT_TIMESTAMP,last_used_at=NULL`, [userId, digest(token)]);
  return BASE() + '/feed/' + token + '.ics';
}
const removeFeed = (db, userId) => db.run('DELETE FROM calendar_feeds WHERE user_id=?', [userId]);

function register(app, {db, requireLogin}) {
  const status = async userId => ({accountId: userId, ...await feedStatus(db, userId)});
  const same = (req, res) => {
    if (req.body?.accountId === req.session.user.id) return true;
    res.status(409).json({message: '登录账号已变化，请刷新页面'});
    return false;
  };
  app.get('/api/calendar-feed', requireLogin, route(async (req, res) => res.json(await status(req.session.user.id))));
  app.post('/api/calendar-feed', requireLogin, rateLimit(20, 60 * 60_000), route(async (req, res) => {
    if (!same(req, res)) return;
    const url = await createFeed(db, req.session.user.id);
    res.status(201).json({...await status(req.session.user.id), url});
  }));
  app.delete('/api/calendar-feed', requireLogin, route(async (req, res) => {
    if (!same(req, res)) return;
    await removeFeed(db, req.session.user.id);
    res.json(await status(req.session.user.id));
  }));
  app.get('/feed/:file', rateLimit(120, 15 * 60_000), route(async (req, res) => {
    res.set({'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex'});
    const match = FILE.exec(req.params.file);
    const owner = match && await db.get(`SELECT f.user_id FROM calendar_feeds f JOIN users u ON u.id=f.user_id
      WHERE f.token_hash=? AND u.enabled=1 AND COALESCE(u.deletion_pending,0)=0`, [digest(match[1])]);
    if (!owner) return res.status(404).type('text/plain').send('Not found');
    const since = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10);
    const tasks = await db.all(`SELECT t.id,t.title,t.start_date,t.end_date,t.status,t.note,t.created_at,t.updated_at,c.name AS category_name
      FROM tasks t LEFT JOIN categories c ON c.id=t.category_id AND c.user_id=t.user_id
      WHERE t.user_id=? AND t.end_date>=? ORDER BY t.start_date,t.id LIMIT 3000`, [owner.user_id, since]);
    await db.run('UPDATE calendar_feeds SET last_used_at=CURRENT_TIMESTAMP WHERE user_id=?', [owner.user_id]);
    res.type('text/calendar; charset=utf-8').send(calendar(tasks));
  }));
}

module.exports = {migrate, register, calendar, fold, escapeText, digest, feedStatus, createFeed, removeFeed};
