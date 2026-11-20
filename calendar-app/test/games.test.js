'use strict';
// v2.4.2.0: Daydreamer games — hidden boxes, who may move when, revisions, rounds, the commitment, notices and the sweep.
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto'), express = require('express');
const {createSqliteAdapter} = require('./helpers/sqlite-adapter');
const {migrateUnifiedCalendar} = require('../migrations/unified-schema');
const preferences = require('../preferences-api'), games = require('../games-api');

async function fixture() {
  const db = createSqliteAdapter();
  await db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,password_hash TEXT,role TEXT,enabled INTEGER,created_at TEXT);
    CREATE TABLE register_requests(id INTEGER PRIMARY KEY);
    CREATE TABLE events(id INTEGER PRIMARY KEY,user_id INTEGER);
    INSERT INTO users VALUES(1,'alice','h','admin',1,'2026-01-01'),(2,'bob','h','user',1,'2026-01-01'),(3,'carol','h','user',1,'2026-01-01'),(4,'dave','h','user',0,'2026-01-01');`);
  await migrateUnifiedCalendar(db);
  await require('../hub-api').migrateHub(db);
  const columns = await db.all('PRAGMA table_info(users)');
  if (!columns.some(c => c.name === 'deletion_pending')) await db.run('ALTER TABLE users ADD COLUMN deletion_pending INTEGER NOT NULL DEFAULT 0');
  await db.run("UPDATE users SET timezone='Etc/UTC'");
  await preferences.migrate(db);
  await games.migrate(db);
  return db;
}
const money = n => Array.from({length: n}, (_, i) => ({kind: 'money', amount: (i + 1) * 1000}));
const prizes = () => [...money(9), {kind: 'gift', name: '  机械键盘 ', icon: 'game', value: 59900}];
const pushes = [];
const pusher = {notify: async (userId, message) => { pushes.push({userId, ...message}); return {sent: 1}; }};
const newGame = (db, extra = {}) => games.create(db, pusher, 1, {title: '周末', currency: 'CNY', prizes: prizes(), player: 'bob', firstCount: 3, ...extra});
const act = (db, user, game, action, input = {}) => games.move(db, pusher, user, game.id, action, {revision: game.revision, ...input});
const rejects = (promise, status, pattern) => assert.rejects(promise, error => error.status === status && (!pattern || pattern.test(error.message)));
const secret = view => JSON.stringify(view).includes('"layout"') || JSON.stringify(view).includes('"salt"');

test('create: validated prizes, invited by username, commitment only, limits', async () => {
  const db = await fixture();
  try {
    const game = await newGame(db);
    assert.equal(game.status, 'invited'); assert.equal(game.role, 'host'); assert.equal(game.turn, 'them');
    assert.equal(game.boxes, 10); assert.equal(game.prizes[9].name, '机械键盘'); assert.equal(game.prizes[9].value, 59900);
    assert.match(game.commitment, /^[0-9a-f]{64}$/); assert.equal(game.reveal, null); assert.equal(secret(game), false);
    const bob = await games.read(db, 2, game.id);
    assert.equal(bob.role, 'player'); assert.equal(bob.turn, 'me'); assert.equal(bob.host, 'alice'); assert.equal(secret(bob), false);
    assert.equal(bob.pending, 3);  // the first round's size is known before choosing
    await rejects(games.read(db, 3, game.id), 404);
    const row = await db.get('SELECT layout,salt,commitment FROM dream_games WHERE id=?', [game.id]);
    const layout = JSON.parse(row.layout);
    assert.deepEqual([...layout].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.equal(crypto.createHash('sha256').update(row.salt + '|' + layout.join(',')).digest('hex'), row.commitment);
    for (const [input, pattern] of [[{prizes: money(9)}, /10–20/], [{prizes: money(21)}, /10–20/], [{prizes: [...money(9), {kind: 'money', amount: 0}]}, /金额/],
      [{prizes: [...money(9), {kind: 'money', amount: 1.5}]}, /金额/], [{prizes: [...money(9), {kind: 'gift', name: '', icon: 'gift'}]}, /名称/],
      [{prizes: [...money(9), {kind: 'gift', name: 'x', icon: 'rocket'}]}, /图标/], [{prizes: [...money(9), {kind: 'gift', name: 'x'.repeat(31), icon: 'gift'}]}, /名称/],
      [{currency: 'EUR'}, /币种/], [{firstCount: 9}, /0 到 8/], [{firstCount: -1}, /0 到 8/]])
      await rejects(newGame(db, input), 400, pattern);
    await rejects(newGame(db, {player: 'alice'}), 400, /自己/);
    await rejects(newGame(db, {player: 'nobody'}), 404);
    await rejects(newGame(db, {player: 'dave'}), 404);  // disabled account
    for (let i = 0; i < 4; i++) await newGame(db);
    await rejects(newGame(db), 409, /最多/);
    const listed = await games.list(db, 2);
    assert.equal(listed.games.length, 5); assert.deepEqual(listed.recent, ['alice']); assert.ok(listed.games.every(g => g.turn === 'me'));
    // The invitation reached bob's inbox once per game, and by push (his default reminder channel).
    assert.equal((await db.get("SELECT COUNT(*) AS n FROM notifications WHERE user_id=2 AND type='game' AND scope='home'")).n, 5);
    assert.ok(pushes.some(p => p.userId === 2 && p.url.startsWith('https://games.garyhub.uk/dream/?id=')));
  } finally { db.close(); }
});

test('play: rounds chosen by host, boxes chosen by player, nothing hidden leaks, commitment checks out', async () => {
  const db = await fixture();
  try {
    let game = await newGame(db);
    const bob = () => games.read(db, 2, game.id);
    await rejects(act(db, 1, game, 'choose', {box: 0}), 403);
    await rejects(act(db, 2, {...game, revision: game.revision + 1}, 'choose', {box: 0}), 409);
    await rejects(act(db, 2, game, 'choose', {box: 10}), 400);
    await rejects(act(db, 2, game, 'nonsense'), 404);
    game = await act(db, 2, game, 'choose', {box: 4});
    assert.equal(game.status, 'opening'); assert.equal(game.pending, 3); assert.equal(game.chosen, 4); assert.equal(game.turn, 'me');
    await rejects(act(db, 2, game, 'open', {boxes: [1, 2]}), 400, /3 个/);
    await rejects(act(db, 2, game, 'open', {boxes: [1, 2, 4]}), 400);
    await rejects(act(db, 2, game, 'open', {boxes: [1, 1, 2]}), 400);
    game = await act(db, 2, game, 'open', {boxes: [0, 1, 2]});
    assert.equal(game.status, 'offering'); assert.equal(game.opened.length, 3); assert.equal(game.remaining, 6);
    assert.ok(game.opened.every(o => Number.isInteger(o.prize))); assert.equal(secret(game), false);
    // Only opened boxes carry their prize; the kept box stays hidden from both sides.
    const host = await games.read(db, 1, game.id);
    assert.equal(secret(host), false); assert.equal(JSON.stringify(host.opened), JSON.stringify(game.opened));
    await rejects(act(db, 2, game, 'offer', {amount: 100, nextCount: 2}), 403);
    await rejects(act(db, 1, host, 'offer', {amount: 100, nextCount: 6}), 400, /1 到 5/);
    await rejects(act(db, 1, host, 'offer', {amount: 100}), 400);
    await rejects(act(db, 1, host, 'offer', {amount: 0, nextCount: 2}), 400);
    game = await act(db, 1, host, 'offer', {amount: 4500, note: '  考虑一下\u0007 ', nextCount: 4});
    assert.equal(game.status, 'answering'); assert.deepEqual(game.rounds.at(-1).offer, {amount: 4500, note: '考虑一下'});
    game = await act(db, 2, await bob(), 'answer', {accept: false});
    assert.equal(game.status, 'opening'); assert.equal(game.pending, 4); assert.equal(game.rounds.length, 2);
    game = await act(db, 2, game, 'open', {boxes: [3, 5, 6, 7]});
    assert.equal(game.remaining, 2);
    game = await act(db, 1, await games.read(db, 1, game.id), 'offer', {amount: 5000, nextCount: 1});
    game = await act(db, 2, await bob(), 'answer', {accept: false});
    game = await act(db, 2, game, 'open', {boxes: [8]});
    assert.equal(game.remaining, 1);
    // One other box left: this is the last offer, so no further round can be asked for.
    await rejects(act(db, 1, await games.read(db, 1, game.id), 'offer', {amount: 5200, nextCount: 1}), 400, /最后/);
    game = await act(db, 1, await games.read(db, 1, game.id), 'offer', {amount: 5200});
    assert.equal(game.rounds.at(-1).nextCount, null);
    game = await act(db, 2, await bob(), 'answer', {accept: false});
    assert.equal(game.status, 'revealing'); assert.equal(game.deal, null); assert.equal(game.turn, 'them');
    let host2 = await games.read(db, 1, game.id);
    await rejects(act(db, 1, host2, 'reveal', {box: 4}), 400, /其他/);
    host2 = await act(db, 1, host2, 'reveal', {box: 9});
    assert.equal(host2.status, 'revealing'); assert.equal(host2.remaining, 0); assert.equal(secret(host2), false);
    await rejects(act(db, 1, host2, 'reveal', {box: 9}), 400, /对方/);
    const done = await act(db, 1, host2, 'reveal', {box: 4});
    assert.equal(done.status, 'finished'); assert.ok(done.finishedAt);
    assert.equal(crypto.createHash('sha256').update(done.reveal.salt + '|' + done.reveal.layout.join(',')).digest('hex'), done.commitment);
    assert.equal(done.reveal.chosenPrize, done.reveal.layout[4]);
    // Every box opened during play showed the prize the published order puts there.
    for (const o of done.opened) assert.equal(o.prize, done.reveal.layout[o.box]);
    const summary = (await games.list(db, 2)).games[0];
    const {index, ...inside} = done.prizes[done.reveal.chosenPrize];
    assert.equal(summary.status, 'finished'); assert.equal(index, done.reveal.chosenPrize); assert.deepEqual(summary.result, inside);
    await rejects(act(db, 2, done, 'honor'), 403);
    const honored = await act(db, 1, done, 'honor');
    assert.equal(honored.honored, true);
    await rejects(act(db, 1, honored, 'honor'), 409);
  } finally { db.close(); }
});

test('play: direct offer, a deal, cancel and decline, and only one of two racing moves', async () => {
  const db = await fixture();
  try {
    let game = await newGame(db, {firstCount: 0});
    game = await act(db, 2, game, 'choose', {box: 0});
    assert.equal(game.status, 'offering'); assert.equal(game.rounds[0].count, 0);
    game = await act(db, 1, await games.read(db, 1, game.id), 'offer', {amount: 3000, nextCount: 8});
    game = await act(db, 2, await games.read(db, 2, game.id), 'answer', {accept: true});
    assert.equal(game.status, 'revealing'); assert.equal(game.deal, 3000);
    let host = await games.read(db, 1, game.id);
    const results = await Promise.allSettled([act(db, 1, host, 'reveal', {box: 1}), act(db, 1, host, 'reveal', {box: 2})]);
    assert.deepEqual(results.map(r => r.status).sort(), ['fulfilled', 'rejected']);
    assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
    host = await games.read(db, 1, game.id);
    for (let b = 1; b < 10; b++) if (!host.opened.some(o => o.box === b)) host = await act(db, 1, host, 'reveal', {box: b});
    host = await act(db, 1, host, 'reveal', {box: 0});
    assert.equal(host.status, 'finished'); assert.equal(host.deal, 3000);

    const cancelled = await newGame(db);
    await rejects(act(db, 2, cancelled, 'cancel'), 403);
    assert.equal((await act(db, 1, cancelled, 'cancel')).status, 'cancelled');
    const declined = await newGame(db);
    assert.equal((await act(db, 2, declined, 'decline')).status, 'declined');
    await rejects(act(db, 2, await games.read(db, 2, declined.id), 'choose', {box: 1}), 409);
    // The host heard about the invitation answers and the deal; bob about the offers and the result.
    const titles = (await db.all("SELECT user_id,title FROM notifications WHERE type='game' ORDER BY id")).map(r => r.user_id + ':' + r.title);
    assert.ok(titles.includes('1:白日梦想家：成交！')); assert.ok(titles.includes('1:白日梦想家：对方婉拒了邀请'));
    assert.ok(titles.includes('2:白日梦想家：结果揭晓')); assert.ok(titles.includes('2:白日梦想家：发起人取消了这一局'));
  } finally { db.close(); }
});

test('notices follow the reminder push channel; the sweep expires quiet games and removes orphans', async () => {
  const db = await fixture();
  try {
    pushes.length = 0;
    await preferences.write(db, 2, {'notify.reminders.push': false});
    const game = await newGame(db);
    assert.equal(pushes.filter(p => p.userId === 2).length, 0);
    assert.equal((await db.get("SELECT COUNT(*) AS n FROM notifications WHERE user_id=2 AND type='game'")).n, 1);
    const other = await games.create(db, pusher, 1, {currency: 'USD', prizes: prizes(), player: 'carol', firstCount: 1});
    await db.run("UPDATE dream_games SET updated_at=datetime('now','-31 days') WHERE id=?", [game.id]);
    await games.sweep(db);
    assert.equal((await games.read(db, 1, game.id)).status, 'expired');
    assert.equal((await games.read(db, 1, other.id)).status, 'invited');
    await db.run('DELETE FROM users WHERE id=3');
    await games.sweep(db);
    assert.equal(await db.get('SELECT id FROM dream_games WHERE id=?', [other.id]), undefined);
  } finally { db.close(); }
});

test('http: login, account check and errors as JSON', async () => {
  const db = await fixture();
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { const id = Number(req.get('x-user')); req.session = {user: id ? {id} : null}; next(); });
  const requireLogin = (req, res, next) => req.session.user ? next() : res.status(401).json({message: 'login'});
  games.register(app, {db, requireLogin, pusher});
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const call = async (user, path, data) => {
    const r = await fetch('http://127.0.0.1:' + server.address().port + path, {method: data ? 'POST' : 'GET', headers: {'x-user': String(user), 'content-type': 'application/json'}, body: data ? JSON.stringify(data) : undefined});
    return {status: r.status, data: await r.json()};
  };
  try {
    assert.equal((await call(0, '/api/hub/games')).status, 401);
    const made = await call(1, '/api/hub/games', {accountId: 1, currency: 'CNY', prizes: prizes(), player: 'bob', firstCount: 2});
    assert.equal(made.status, 200); assert.equal(made.data.status, 'invited');
    assert.equal((await call(1, '/api/hub/games', {accountId: 2, currency: 'CNY', prizes: prizes(), player: 'bob', firstCount: 2})).status, 409);
    assert.equal((await call(3, '/api/hub/games/' + made.data.id)).status, 404);
    assert.equal((await call(2, '/api/hub/games/abc')).status, 404);
    const chose = await call(2, '/api/hub/games/' + made.data.id + '/choose', {accountId: 2, revision: 0, box: 3});
    assert.equal(chose.status, 200); assert.equal(chose.data.status, 'opening');
    const stale = await call(2, '/api/hub/games/' + made.data.id + '/open', {accountId: 2, revision: 0, boxes: [0, 1]});
    assert.equal(stale.status, 409); assert.match(stale.data.message, /刷新/);
    const listed = await call(1, '/api/hub/games');
    assert.equal(listed.data.accountId, 1); assert.equal(listed.data.games[0].opponent, 'bob'); assert.deepEqual(listed.data.limits.currencies, ['CNY', 'USD', 'CAD', 'HKD']);
  } finally { server.close(); db.close(); }
});
