'use strict';
// v2.4.1.4: account preferences — fixed values per key, null resets, time zone in users, account isolation.
const test = require('node:test'), assert = require('node:assert/strict'), express = require('express');
const {createSqliteAdapter} = require('./helpers/sqlite-adapter');
const preferences = require('../preferences-api');

async function fixture() {
  const db = createSqliteAdapter();
  await db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,timezone TEXT DEFAULT 'Etc/UTC');INSERT INTO users(id,username) VALUES(1,'alice'),(2,'bob');`);
  await preferences.migrate(db); await preferences.migrate(db);
  return db;
}

test('validation accepts only known keys and values', () => {
  assert.deepEqual(preferences.validate({'appearance.theme': 'dark', 'companion.off': true, 'tools.view': null}).prefs, {'appearance.theme': 'dark', 'companion.off': true, 'tools.view': null});
  assert.equal(preferences.validate({'region.timezone': 'Asia/Shanghai'}).timezone, 'Asia/Shanghai');
  for (const bad of [null, [], {}, {'appearance.theme': 'blue'}, {'companion.off': 'yes'}, {'companion.char': 'garfield'}, {'ledger.currency': 'EUR'},
    {'unknown.key': 1}, {'region.timezone': 'Mars/Base'}, {'region.timezone': 7}, {'__proto__': 'x'}])
    assert.throws(() => preferences.validate(bad), {status: 400}, JSON.stringify(bad));
  // v2.4.1.5: accent, density, week start, date format and calendar view.
  assert.deepEqual(preferences.validate({'appearance.accent': 'teal', 'appearance.density': 'compact', 'region.weekStart': 'sunday', 'region.dateFormat': 'eu', 'calendar.view': 'list'}).prefs,
    {'appearance.accent': 'teal', 'appearance.density': 'compact', 'region.weekStart': 'sunday', 'region.dateFormat': 'eu', 'calendar.view': 'list'});
  for (const bad of [{'appearance.accent': 'red'}, {'appearance.density': 'tiny'}, {'region.weekStart': 'saturday'}, {'region.dateFormat': 'dd.mm'}, {'calendar.view': 'day'}])
    assert.throws(() => preferences.validate(bad), {status: 400}, JSON.stringify(bad));
  assert.equal(preferences.KEYS.length, 33);
});

test('v2.4.1.6: ordered lists from a fixed set, notification channels, quiet hours and the default reminder', async () => {
  const ok = {'home.cards': ['budget', 'schedule'], 'home.portals': ['study', 'tools', 'calendar', 'sites'], 'tools.pinned': ['totp', 'study'],
    'tools.hidden': [], 'tools.recent': ['pdf', 'markdown', 'eraser', 'totp', 'study', 'grades'], 'notify.updates.email': true, 'notify.reminders.email': false,
    'notify.alerts.inApp': false, 'push.quietFrom': '22:30', 'push.quietTo': '07:00', 'tasks.reminder': 'twice', 'tasks.reminderTime1': '08:00', 'tasks.reminderTime2': '20:30'};
  assert.deepEqual(preferences.validate(ok).prefs, ok);
  for (const bad of [{'home.cards': ['schedule', 'schedule']}, {'home.cards': ['weather']}, {'home.cards': 'schedule'}, {'home.portals': ['tools', 'tools']},
    {'tools.pinned': ['grades', 'study', 'lab', 'research', 'calendar', 'files', 'stocks', 'reading', 'status']}, {'tools.recent': ['pdf', 'markdown', 'eraser', 'totp', 'study', 'grades', 'lab']},
    {'tools.hidden': [1]}, {'tools.hidden': ['__proto__']}, {'notify.updates.push': 'yes'}, {'notify.updates.inApp': false}, {'push.quietFrom': '22:15'}, {'push.quietTo': '24:00'},
    {'tasks.reminder': 'always'}, {'tasks.reminderTime1': '9:00'}])
    assert.throws(() => preferences.validate(bad), {status: 400}, JSON.stringify(bad));
  assert.equal(preferences.HALF_HOURS.length, 48);
  const db = await fixture();
  try {
    const state = await preferences.write(db, 1, ok);
    assert.deepEqual(state.prefs['home.cards'], ['budget', 'schedule']);
    // A list replaces the stored one as a whole (merge patch), and null clears it.
    assert.deepEqual((await preferences.write(db, 1, {'tools.pinned': ['lab']})).prefs['tools.pinned'], ['lab']);
    assert.equal((await preferences.write(db, 1, {'tools.pinned': null})).prefs['tools.pinned'], null);
    // A stored list that is no longer valid reads back as unset.
    await db.run("UPDATE user_preferences SET prefs=json_set(prefs,'$.\"home.cards\"',json('[\"weather\"]')) WHERE user_id=1");
    assert.equal((await preferences.read(db, 1)).prefs['home.cards'], null);
  } finally { db.close(); }
});

test('reads defaults, merges patches, resets with null and keeps accounts apart', async () => {
  const db = await fixture();
  try {
    const empty = await preferences.read(db, 1);
    assert.equal(empty.revision, 0); assert.equal(empty.timezone, 'Etc/UTC');
    assert.deepEqual(Object.values(empty.prefs), Array(33).fill(null));
    let state = await preferences.write(db, 1, {'appearance.theme': 'dark', language: 'en', 'companion.char': 'pudding'});
    assert.equal(state.revision, 1);
    state = await preferences.write(db, 1, {'ledger.currency': 'USD', 'appearance.theme': null, 'region.timezone': 'America/Chicago'});
    assert.equal(state.revision, 2);
    assert.equal(state.prefs['appearance.theme'], null); assert.equal(state.prefs.language, 'en'); assert.equal(state.prefs['ledger.currency'], 'USD');
    assert.equal(state.timezone, 'America/Chicago');
    // Only the time zone: users changes, the preference revision does not.
    state = await preferences.write(db, 1, {'region.timezone': 'Asia/Shanghai'});
    assert.equal(state.revision, 2); assert.equal((await db.get('SELECT timezone FROM users WHERE id=1')).timezone, 'Asia/Shanghai');
    assert.deepEqual(JSON.parse((await db.get('SELECT prefs FROM user_preferences WHERE user_id=1')).prefs), {language: 'en', 'companion.char': 'pudding', 'ledger.currency': 'USD'});
    const bob = await preferences.read(db, 2);
    assert.equal(bob.revision, 0); assert.equal(bob.prefs.language, null); assert.equal(bob.timezone, 'Etc/UTC');
    // A stored value that is no longer valid reads back as unset.
    await db.run("UPDATE user_preferences SET prefs=? WHERE user_id=1", [JSON.stringify({'appearance.theme': 'neon', language: 'en'})]);
    assert.equal((await preferences.read(db, 1)).prefs['appearance.theme'], null);
    // No foreign key to users: the table can outlive a rollback without blocking account deletion.
    assert.deepEqual(await db.all('PRAGMA foreign_key_list(user_preferences)'), []);
  } finally { db.close(); }
});

test('HTTP: login required, account must match, bad values refused', async () => {
  const db = await fixture(), app = express();
  app.use(express.json());
  app.use((req, res, next) => { const id = Number(req.get('x-user')); req.session = {user: id ? {id} : null}; next(); });
  preferences.register(app, {db, requireLogin: (req, res, next) => req.session.user ? next() : res.status(401).json({message: 'login'})});
  app.use((e, req, res, next) => res.status(500).json({message: e.message}));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const call = async (user, method = 'GET', body) => {
    const r = await fetch('http://127.0.0.1:' + server.address().port + '/api/hub/preferences', {method, headers: {'x-user': String(user), 'content-type': 'application/json'}, body: body ? JSON.stringify(body) : undefined});
    return {status: r.status, data: await r.json()};
  };
  try {
    assert.equal((await call(0)).status, 401);
    assert.equal((await call(0, 'PUT', {accountId: 1, set: {language: 'en'}})).status, 401);
    assert.equal((await call(1, 'PUT', {accountId: 2, set: {language: 'en'}})).status, 409);
    assert.equal((await call(1, 'PUT', {accountId: 1, set: {language: 'fr'}})).status, 400);
    assert.equal((await call(1, 'PUT', {accountId: 1})).status, 400);
    const saved = await call(1, 'PUT', {accountId: 1, set: {'appearance.sky': 'still', 'tools.view': 'dock'}});
    assert.equal(saved.status, 200); assert.equal(saved.data.accountId, 1); assert.equal(saved.data.prefs['appearance.sky'], 'still');
    assert.equal((await call(2)).data.prefs['appearance.sky'], null);
    assert.equal((await call(1)).data.prefs['tools.view'], 'dock');
    // Saves of different keys at the same moment both survive.
    await Promise.all([call(1, 'PUT', {accountId: 1, set: {language: 'zh'}}), call(1, 'PUT', {accountId: 1, set: {'ledger.currency': 'HKD'}}), call(1, 'PUT', {accountId: 1, set: {'companion.mode': 'gravity'}})]);
    const merged = (await call(1)).data;
    assert.deepEqual([merged.prefs.language, merged.prefs['ledger.currency'], merged.prefs['companion.mode'], merged.prefs['tools.view']], ['zh', 'HKD', 'gravity', 'dock']);
    assert.equal(merged.revision, 4);
  } finally { await new Promise(resolve => server.close(resolve)); db.close(); }
});
