'use strict';
// Account preferences (v2.4.1.4): one small record per account, read and written by the settings centre and by
// the quick switches on each page (day/night, language, companion, ledger currency, tools layout). Every key has a
// fixed set of values; null clears it back to the page's default. Time zone stays in users.timezone, where the
// reminders read it. No foreign key to users, so a rollback's account-deletion check is not blocked.
const {isValidTimeZone} = require('./reminder-utils');
const {rateLimit} = require('./rate-limit');

const SCHEMA = {
  'appearance.theme': ['system', 'light', 'dark'],
  'appearance.sky': ['full', 'calm', 'still'],
  // v2.4.1.5: accent colour and density for every page, and region / calendar formats.
  'appearance.accent': ['blue', 'violet', 'teal', 'brown'],
  'appearance.density': ['standard', 'compact'],
  'region.weekStart': ['monday', 'sunday'],
  'region.dateFormat': ['iso', 'zh', 'us', 'eu'],
  'calendar.view': ['month', 'week', 'list'],
  'language': ['zh', 'en'],
  'companion.char': ['milu', 'lili', 'pudding', 'pagey', 'navi'],
  'companion.mode': ['free', 'gravity'],
  'companion.open': ['on', 'min'],
  'companion.quiet': ['on', 'min'],
  'companion.off': [true, false],
  'ledger.currency': ['CNY', 'USD', 'CAD', 'HKD'],
  'tools.view': ['grid', 'dock'],
};
const KEYS = Object.keys(SCHEMA);
const route = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const fail = (status, message) => Object.assign(Error(message), {status});

async function migrate(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS user_preferences(user_id INTEGER PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0,
    prefs TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
}
function parse(text) {
  let value = {};
  try { value = JSON.parse(text || '{}'); } catch {}
  const out = {};
  for (const key of KEYS) out[key] = SCHEMA[key].includes(value?.[key]) ? value[key] : null;
  return out;
}
// Validates a patch {key: value|null}; unknown keys or values are refused as a whole.
function validate(set) {
  if (!set || typeof set !== 'object' || Array.isArray(set)) throw fail(400, '设置格式无效');
  const entries = Object.entries(set);
  if (!entries.length || entries.length > KEYS.length + 1) throw fail(400, '设置格式无效');
  const prefs = {};
  let timezone;
  for (const [key, value] of entries) {
    if (key === 'region.timezone') {
      if (typeof value !== 'string' || value.length > 64 || !isValidTimeZone(value)) throw fail(400, '时区无效，请使用 IANA 时区名，例如 Asia/Shanghai');
      timezone = value;
    } else if (!SCHEMA[key]) throw fail(400, '未知的设置项：' + String(key).slice(0, 40));
    else if (value !== null && !SCHEMA[key].includes(value)) throw fail(400, '设置值无效：' + key);
    else prefs[key] = value;
  }
  return {prefs, timezone};
}
async function read(db, userId) {
  const row = await db.get('SELECT revision,prefs FROM user_preferences WHERE user_id=?', [userId]);
  const user = await db.get('SELECT timezone FROM users WHERE id=?', [userId]);
  return {accountId: userId, revision: row?.revision || 0, prefs: parse(row?.prefs), timezone: user?.timezone || 'Etc/UTC'};
}
async function write(db, userId, set) {
  const {prefs, timezone} = validate(set);
  if (Object.keys(prefs).length) {
    // One statement, so two quick saves of different keys cannot overwrite each other. json_patch (RFC 7396)
    // merges the patch, and a null removes that key.
    await db.run(`INSERT INTO user_preferences(user_id,revision,prefs) VALUES(?1,1,json_patch('{}',?2)) ON CONFLICT(user_id) DO UPDATE SET
      prefs=json_patch(user_preferences.prefs,?2),revision=revision+1,updated_at=CURRENT_TIMESTAMP`, [userId, JSON.stringify(prefs)]);
  }
  if (timezone) await db.run('UPDATE users SET timezone=? WHERE id=?', [timezone, userId]);
  return read(db, userId);
}

function register(app, {db, requireLogin}) {
  app.get('/api/hub/preferences', requireLogin, route(async (req, res) => res.json(await read(db, req.session.user.id))));
  app.put('/api/hub/preferences', requireLogin, rateLimit(120, 60_000), route(async (req, res) => {
    try {
      if (req.body?.accountId !== req.session.user.id) throw fail(409, '登录账号已变化，请刷新页面');
      res.json(await write(db, req.session.user.id, req.body.set));
    } catch (error) {
      if (!error.status) throw error;
      res.status(error.status).json({message: error.message});
    }
  }));
}

module.exports = {migrate, register, read, write, validate, SCHEMA, KEYS};
