'use strict';
// v2.4.3.0: live game rooms — the WebSocket layer, the rules of 词语默契 and 对战猜数字 (with the computer player),
// and whole rooms over real sockets: gates, seats, hidden words and secrets, the clock, pause and reconnect, invites,
// kicks, the room list and the sweep.
const test = require('node:test'), assert = require('node:assert/strict'), http = require('node:http'), net = require('node:net');
const express = require('express'), session = require('express-session');
const {createSqliteAdapter} = require('./helpers/sqlite-adapter');
const {migrateUnifiedCalendar} = require('../migrations/unified-schema');
const {connect, client} = require('./helpers/ws-client');
const ws = require('../play-socket'), word = require('../play-word'), digits = require('../play-digits'), play = require('../play-rooms');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; }; }
function fakeCtx(rng = seeded(7)) {
  const c = {now: 0, rng, timer: null, result: null, awayMs: 0};
  Object.assign(c, {setTimer: ms => { c.timer = ms; }, clearTimer: () => { c.timer = null; }, finish: r => { c.result = r; }, away: () => c.awayMs});
  return c;
}
const rejects = (fn, status, pattern) => assert.throws(fn, error => error.status === status && (!pattern || pattern.test(error.message)));

// ---- WebSocket layer ----------------------------------------------------------------------------------------------
// Half-open like the HTTP server's sockets, so a peer that only sends FIN is noticed by the socket layer itself.
async function echoServer() {
  let closes = 0;
  const server = net.createServer({allowHalfOpen: true}, socket => {
    let head = '';
    const onData = chunk => {
      head += chunk.toString('latin1');
      const end = head.indexOf('\r\n\r\n');
      if (end < 0) return;
      socket.off('data', onData);
      const req = {method: 'GET', headers: {upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': /sec-websocket-key: (\S+)/i.exec(head)[1]}};
      const conn = ws.accept(req, socket, Buffer.from(head.slice(end + 4), 'latin1'));
      conn.on('message', text => conn.send('echo:' + text));
      conn.on('close', () => closes++);
    };
    socket.on('data', onData);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  server.closes = () => closes;
  return server;
}
async function raw(port) {
  const socket = net.connect(port, '127.0.0.1');
  socket.write('GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n');
  const head = await new Promise(resolve => { let text = ''; socket.on('data', function on(chunk) { text += chunk.toString('latin1'); const end = text.indexOf('\r\n\r\n'); if (end >= 0) { socket.off('data', on); resolve(text); } }); });
  assert.match(head, /^HTTP\/1\.1 101 /); assert.match(head, /Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK\+xOo=/);
  const c = client(socket);
  c.texts = () => c.raw.filter(f => f.opcode === 1).map(f => f.payload.toString());
  return c;
}
async function plainStatus(url, headers) {
  return new Promise((resolve, reject) => { const req = http.request(url, {headers}, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); req.end(); });
}
const until = async (fn, ms = 2000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return; await sleep(10); } assert.fail('condition not met in time'); };

test('socket: handshake, masked and fragmented text, ping, and the closing codes', async () => {
  assert.equal(ws.acceptKey('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
  assert.equal(ws.handshakeKey({method: 'GET', headers: {upgrade: 'websocket', 'sec-websocket-version': '8', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ=='}}), null);
  assert.equal(ws.handshakeKey({method: 'POST', headers: {upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ=='}}), null);
  const server = await echoServer(), port = server.address().port;
  try {
    const c = await raw(port);
    c.frame(1, '你好'); await until(() => c.texts().includes('echo:你好'));
    c.frame(1, 'ab', {fin: false}); c.frame(0, 'cd'); await until(() => c.texts().includes('echo:abcd'));
    c.frame(9, 'hi'); await until(() => c.raw.some(f => f.opcode === 10 && f.payload.toString() === 'hi'));
    const big = 'x'.repeat(5000); c.frame(1, big); await until(() => c.texts().includes('echo:' + big));
    for (const [send, code] of [[x => x.frame(1, 'plain', {mask: false}), 1002], [x => x.frame(2, 'bin'), 1003],
      [x => x.frame(1, 'y'.repeat(9000)), 1009], [x => x.socket.write(Buffer.from([0x81, 0x82, 0, 0, 0, 0, 0xc3, 0x28])), 1007], [x => x.frame(0, 'stray'), 1002]]) {
      const bad = await raw(port); send(bad); await until(() => bad.closed != null); assert.equal(bad.closed, code);
    }
    c.close(); await until(() => c.closed != null);
    // A client that disappears without a close frame (FIN only) is dropped at once, not at the next heartbeat.
    const gone = await raw(port), before = server.closes(); gone.socket.end(); await until(() => server.closes() === before + 1);
  } finally { server.close(); }
});

// ---- 词语默契 rules -------------------------------------------------------------------------------------------------
test('word: hidden until both submit, reveal, review, used words, success', () => {
  const config = word.settings({limit: 60, cap: 10}), c = fakeCtx(), s = word.setup(config, 2, c);
  assert.equal(c.timer, 60_000); assert.equal(s.phase, 'submit');
  for (const bad of [{limit: 45}, {cap: 4}, {cap: 31}, {target: 1}, {cap: 6, target: 7}]) rejects(() => word.settings(bad), 400);
  word.act(s, 0, 'word', {text: '  水果 '}, config, c);
  assert.equal(word.view(s, 1).mine, null); assert.deepEqual(word.view(s, 1).submitted, [true, false]);
  assert.ok(!JSON.stringify(word.view(s, 1)).includes('水果'), 'the other word stays on the server');
  assert.equal(word.view(s, 0).mine, '水果');
  rejects(() => word.act(s, 0, 'word', {text: '天气'}, config, c), 409, /提交过/);
  for (const text of ['', '   ', 'x'.repeat(13), '！？', 42]) rejects(() => word.act(s, 1, 'word', {text}, config, c), 400);
  word.act(s, 1, 'word', {text: '天气'}, config, c);
  assert.equal(s.phase, 'review'); assert.equal(c.timer, word.REVIEW); assert.deepEqual(s.history[0].words, ['水果', '天气']);
  rejects(() => word.act(s, 0, 'word', {text: '夏天'}, config, c), 409);
  word.act(s, 0, 'review', {same: true}, config, c);
  assert.deepEqual(word.view(s, 1).review, {mine: null, other: 'same'});
  word.act(s, 1, 'review', {same: false}, config, c);
  assert.equal(s.round, 2); assert.equal(s.phase, 'submit'); assert.deepEqual(s.clue, ['水果', '天气']);
  rejects(() => word.act(s, 0, 'word', {text: '天 气!'}, config, c), 409, /出现过/);  // used by the other player, spacing and punctuation ignored
  word.act(s, 0, 'word', {text: 'Ｃｏｆｆｅｅ'}, config, c);
  word.act(s, 1, 'word', {text: 'coffee!'}, config, c);
  assert.equal(s.phase, 'finished'); assert.deepEqual(c.result, {result: 'success', reason: 'same', rounds: 2});
  assert.equal(word.normalize('夏天！'), word.normalize(' 夏天'));
});

test('word: agreed synonyms, cap, give up, leaving', () => {
  const config = word.settings({limit: 0, cap: 5});
  let c = fakeCtx(), s = word.setup(config, 2, c);
  assert.equal(c.timer, null);  // no clock
  word.act(s, 0, 'word', {text: '番茄'}, config, c); word.act(s, 1, 'word', {text: '西红柿'}, config, c);
  assert.equal(c.timer, null);
  word.act(s, 1, 'review', {same: true}, config, c); word.act(s, 0, 'review', {same: true}, config, c);
  assert.deepEqual(c.result, {result: 'success', reason: 'agreed', rounds: 1}); assert.equal(s.history[0].agreed, true);
  c = fakeCtx(); s = word.setup(config, 2, c);
  for (let round = 1; round <= 5; round++) {
    word.act(s, 0, 'word', {text: 'a' + round}, config, c); word.act(s, 1, 'word', {text: 'b' + round}, config, c);
    word.act(s, 0, 'review', {same: false}, config, c); word.act(s, 1, 'review', {same: false}, config, c);
  }
  assert.deepEqual(c.result, {result: 'fail', reason: 'cap', rounds: 5});
  c = fakeCtx(); s = word.setup(config, 2, c);
  word.act(s, 0, 'giveup', {on: true}, config, c); assert.equal(c.result, null); assert.deepEqual(word.view(s, 1).giveUp, [true, false]);
  word.act(s, 0, 'giveup', {on: false}, config, c); word.act(s, 1, 'giveup', {on: true}, config, c); word.act(s, 0, 'giveup', {on: true}, config, c);
  assert.equal(c.result.reason, 'giveup');
  c = fakeCtx(); s = word.setup(config, 2, c);
  word.leave(s, 1, config, c); assert.deepEqual(c.result, {result: 'aborted', reason: 'left', rounds: 1});
  assert.deepEqual(word.tally(word.tally(null, {result: 'success', rounds: 4}), {result: 'aborted', rounds: 1}), {played: 1, success: 1, best: 4});
});

test('word: the clock — last call, timed-out rounds, three in a row hold the game', () => {
  const config = word.settings({limit: 30, cap: 20}), c = fakeCtx(), s = word.setup(config, 2, c);
  word.act(s, 0, 'word', {text: '月亮'}, config, c);
  word.timeout(s, config, c);
  assert.equal(s.grace, true); assert.equal(c.timer, word.GRACE); assert.equal(word.view(s, 1).grace, true);
  word.timeout(s, config, c);
  assert.deepEqual(s.history[0].timeout, [false, true]); assert.equal(s.round, 2); assert.equal(s.clue, null); assert.equal(s.streak[1], 1);
  rejects(() => word.act(s, 1, 'word', {text: '月亮'}, config, c), 409, /出现过/);  // the revealed word counts as used
  for (let i = 0; i < 2; i++) { word.timeout(s, config, c); word.timeout(s, config, c); }
  assert.equal(s.phase, 'hold'); assert.equal(s.hold, 1); assert.equal(c.timer, null); assert.deepEqual(s.streak, [2, 3]); assert.equal(s.round, 4);
  rejects(() => word.act(s, 1, 'word', {text: '星星'}, config, c), 409);
  // Only the player who missed three rounds can start the clock again.
  rejects(() => word.act(s, 0, 'resume', {}, config, c), 409);
  word.act(s, 1, 'resume', {}, config, c); assert.equal(s.phase, 'submit'); assert.equal(c.timer, 30_000);
  word.act(s, 0, 'word', {text: '太阳'}, config, c); word.act(s, 1, 'word', {text: '星星'}, config, c);
  word.timeout(s, config, c);  // nobody decided in review: next round
  assert.equal(s.phase, 'submit'); assert.equal(s.round, 5); assert.deepEqual(s.clue, ['太阳', '星星']);
});

// ---- 对战猜数字 rules and the computer ------------------------------------------------------------------------------
test('digits: hints, simultaneous rounds, draws, misses, forfeits and claims', () => {
  assert.deepEqual(digits.score('1234', '4271'), {a: 1, b: 2}); assert.deepEqual(digits.score('1234', '1234'), {a: 4, b: 0}); assert.deepEqual(digits.score('5678', '1234'), {a: 0, b: 0});
  for (const code of ['1123', '123', '12345', 'abcd', 1234]) assert.equal(digits.valid(code), false);
  assert.equal(digits.valid('0123'), true);
  const config = digits.settings({limit: 30});
  rejects(() => digits.settings({limit: 45}), 400);
  let c = fakeCtx(), s = digits.setup(config, 2, c);
  assert.equal(c.timer, digits.SECRET_TIME);
  digits.act(s, 0, 'secret', {code: '1234'}, config, c);
  rejects(() => digits.act(s, 0, 'secret', {code: '5678'}, config, c), 409);
  rejects(() => digits.act(s, 1, 'secret', {code: '1123'}, config, c), 400);
  assert.equal(digits.view(s, 1).mySecret, null); assert.ok(!JSON.stringify(digits.view(s, 1)).includes('1234'));
  digits.timeout(s, config, c);  // seat 1 never chose: a random secret, said so to that player only
  assert.equal(s.phase, 'guess'); assert.ok(digits.valid(s.secrets[1])); assert.equal(digits.view(s, 1).randomSecret, true); assert.equal(digits.view(s, 0).randomSecret, false);
  s.secrets[1] = '5678';
  digits.act(s, 0, 'guess', {code: '5670'}, config, c);
  assert.deepEqual(digits.view(s, 1).guessed, [true, false]); assert.equal(digits.view(s, 1).myGuess, null); assert.equal(digits.view(s, 0).myGuess, '5670');
  digits.act(s, 1, 'guess', {code: '1243'}, config, c);
  assert.equal(s.round, 2); assert.deepEqual(s.history[0][0], {round: 1, guess: '5670', a: 3, b: 0}); assert.deepEqual(s.history[1][0], {round: 1, guess: '1243', a: 2, b: 2});
  assert.equal(digits.view(s, 0).secrets, null);
  digits.act(s, 0, 'guess', {code: '5678'}, config, c); digits.act(s, 1, 'guess', {code: '1234'}, config, c);
  assert.deepEqual(c.result, {winner: null, reason: 'both', rounds: 2}); assert.deepEqual(digits.view(s, 1).secrets, ['1234', '5678']);
  // Three missed rounds in a row lose.
  c = fakeCtx(); s = digits.setup(config, 2, c);
  digits.act(s, 0, 'secret', {code: '1234'}, config, c); digits.act(s, 1, 'secret', {code: '5678'}, config, c);
  for (let i = 0; i < 3; i++) { digits.act(s, 0, 'guess', {code: '9012'}, config, c); if (!c.result) digits.timeout(s, config, c); }
  assert.deepEqual(c.result, {winner: 0, reason: 'timeouts', rounds: 3}); assert.equal(s.history[1][0].timeout, true);
  c = fakeCtx(); s = digits.setup(config, 2, c);
  rejects(() => digits.act(s, 0, 'claim', {}, config, c), 409, /2 分钟/);
  c.awayMs = digits.AWAY; digits.act(s, 0, 'claim', {}, config, c); assert.deepEqual(c.result, {winner: 0, reason: 'away', rounds: 0});
  c = fakeCtx(); s = digits.setup(config, 2, c); digits.leave(s, 0, config, c); assert.equal(c.result.winner, 1);
  assert.deepEqual(digits.tally(digits.tally(null, {winner: 1}), {winner: null}), {wins: [0, 1], draws: 1});
});

test('digits: the computer only uses its own hints, and its three levels differ', () => {
  const rng = seeded(42), average = {};
  for (const level of ['easy', 'normal', 'smart']) {
    let total = 0, worst = 0;
    const games = level === 'smart' ? 25 : 60;
    for (let g = 0; g < games; g++) {
      const secret = digits.random(rng), history = [];
      for (let turn = 1; turn <= digits.MAX_ROUNDS; turn++) {
        const guess = digits.botGuess(history, level, rng);
        assert.ok(digits.valid(guess));
        assert.ok(!history.some(h => h.guess === guess), 'never the same guess twice');
        const s = digits.score(guess, secret);
        // A normal guess fits the last three hints it remembers.
        if (level === 'normal') for (const h of history.slice(-3)) { const again = digits.score(h.guess, guess); assert.ok(again.a === h.a && again.b === h.b); }
        history.push({round: turn, guess, ...s});
        if (s.a === 4) { total += turn; worst = Math.max(worst, turn); break; }
        if (turn === digits.MAX_ROUNDS) total += turn;
      }
    }
    average[level] = total / games;
    if (level === 'smart') assert.ok(worst <= 9, 'smart worst ' + worst);
  }
  assert.ok(average.smart <= 6.2, 'smart ' + average.smart);
  assert.ok(average.normal > 6 && average.normal < 9.5, 'normal ' + average.normal);
  assert.ok(average.easy > average.normal && average.easy < 12, 'easy ' + average.easy);
  // The computer's plan: a secret first, then guesses with a human-like delay.
  const c = fakeCtx(), config = digits.settings({}), s = digits.setup(config, 2, c);
  const first = digits.bot(s, 1, 'smart', rng); assert.equal(first.action, 'secret'); assert.ok(first.delay >= 1200);
  digits.act(s, 1, 'secret', first.data, config, c); digits.act(s, 0, 'secret', {code: '9876'}, config, c);
  const second = digits.bot(s, 1, 'smart', rng); assert.deepEqual([second.action, second.data.code], ['guess', '0123']); assert.ok(second.delay >= 2000);
  digits.act(s, 1, 'guess', second.data, config, c); assert.equal(digits.bot(s, 1, 'smart', rng), null);
});

// ---- Whole rooms over real sockets --------------------------------------------------------------------------------
async function fixture() {
  const db = createSqliteAdapter();
  await db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,password_hash TEXT,role TEXT,enabled INTEGER,created_at TEXT,auth_version INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE register_requests(id INTEGER PRIMARY KEY);
    CREATE TABLE events(id INTEGER PRIMARY KEY,user_id INTEGER);
    INSERT INTO users(id,username,password_hash,role,enabled,created_at) VALUES(1,'alice','h','admin',1,'2026-01-01'),(2,'bob','h','user',1,'2026-01-01'),(3,'carol','h','user',1,'2026-01-01'),(4,'dave','h','user',0,'2026-01-01');`);
  await migrateUnifiedCalendar(db);
  await require('../hub-api').migrateHub(db);
  const columns = await db.all('PRAGMA table_info(users)');
  if (!columns.some(c => c.name === 'deletion_pending')) await db.run('ALTER TABLE users ADD COLUMN deletion_pending INTEGER NOT NULL DEFAULT 0');
  await require('../preferences-api').migrate(db);
  await play.migrate(db);
  const app = express();
  app.use(express.json());
  app.use(session({secret: 'room-test-secret', resave: false, saveUninitialized: false}));
  app.post('/test/login/:id', async (req, res) => {
    const user = await db.get('SELECT id,username FROM users WHERE id=?', [Number(req.params.id)]);
    req.session.user = {id: user.id, username: user.username}; req.session.authVersion = 0; res.json({ok: true});
  });
  const requireLogin = (req, res, next) => req.session.user ? next() : res.status(401).json({message: '未登录'});
  const pushes = [];
  play.register(app, {db, requireLogin, pusher: {notify: async (userId, message) => { pushes.push({userId, ...message}); }}});
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  play.attach(app, server);
  const base = 'http://127.0.0.1:' + server.address().port;
  return {db, server, base, pushes};
}
async function account(base, id) {
  const r = await fetch(base + '/test/login/' + id, {method: 'POST'});
  const cookie = r.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
  const socket = async () => {
    const r = await connect(base + play.SOCKET_PATH, {cookie, origin: play.ORIGIN});
    assert.equal(r.status, 101);
    await r.client.next(m => m.t === 'welcome');
    const c = r.client;
    let n = 0;
    c.act = async (a, d = {}) => { const id = 'm' + (++n) + Math.random(); c.send({t: 'act', id, a, d}); return c.next(m => m.t === 'ack' && m.id === id); };
    // Only states of the room this connection last entered count (older ones may still be queued).
    c.state = test => c.next(m => m.t === 'state' && (!c.room || m.room.code === c.room) && (!test || test(m.room))).then(m => m.room);
    c.hello = code => { c.room = code.toUpperCase(); c.send({t: 'hello', room: code}); return c.state(); };
    return c;
  };
  const post = (path, body) => fetch(base + path, {method: 'POST', headers: {cookie, 'content-type': 'application/json'}, body: JSON.stringify({accountId: id, ...body})});
  const get = path => fetch(base + path, {headers: {cookie}});
  return {id, cookie, socket, post, get};
}

test('rooms: gates, seats, a hidden word round, review, success and the tally', async () => {
  const {db, server, base} = await fixture();
  Object.assign(play.TUNING, {grace: 200, resumeMin: 1000, botScale: 0.01});
  try {
    const alice = await account(base, 1), bob = await account(base, 2), carol = await account(base, 3);
    // The socket needs the games origin and a session; other paths are not upgraded.
    assert.equal((await connect(base + play.SOCKET_PATH, {cookie: alice.cookie, origin: 'https://evil.example'})).status, 403);
    assert.equal((await connect(base + play.SOCKET_PATH, {origin: play.ORIGIN})).status, 401);
    assert.equal((await connect(base + '/api/hub/other', {cookie: alice.cookie, origin: play.ORIGIN})).status, 404);
    assert.equal(await plainStatus(base + play.SOCKET_PATH, {cookie: alice.cookie, origin: play.ORIGIN}), 426);
    assert.equal((await alice.post('/api/hub/play', {game: 'chess'})).status, 400);
    assert.equal((await alice.post('/api/hub/play', {game: 'word', settings: {limit: 45}})).status, 400);
    assert.equal((await alice.post('/api/hub/play', {accountId: 2, game: 'word'})).status, 409);  // the page's account must be the session's
    const created = await (await alice.post('/api/hub/play', {game: 'word', settings: {limit: 30, cap: 6}})).json();
    assert.match(created.code, /^[A-HJ-NP-Z2-9]{6}$/);
    const a = await alice.socket(), b = await bob.socket();
    let view = await a.hello(created.code);
    assert.deepEqual([view.status, view.you, view.isHost, view.seats[1].empty], ['lobby', 0, true, true]);
    b.send({t: 'hello', room: 'NOPE22'}); assert.equal((await b.next(m => m.t === 'error')).status, 404);
    view = await b.hello(created.code.toLowerCase());
    assert.equal(view.you, 1); assert.equal(view.seats[0].name, 'alice');
    await a.state(r => r.seats[1].name === 'bob' && r.seats[1].online);
    let ack = await a.act('start'); assert.equal(ack.ok, false); assert.match(ack.message, /准备/);
    ack = await b.act('start'); assert.equal(ack.status, 403);
    assert.equal((await b.act('addBot', {level: 'easy'})).status, 403);
    assert.equal((await a.act('settings', {settings: {limit: 0, cap: 5}})).ok, true);
    assert.equal((await b.act('ready', {ready: true})).ok, true);
    assert.equal((await a.act('start')).ok, true);
    view = await b.state(r => r.status === 'playing');
    assert.equal(view.deadline, null); assert.deepEqual(view.settings, {limit: 0, cap: 5, target: 0});
    // A third account cannot take a seat once the game has started.
    const c = await carol.socket(); c.send({t: 'hello', room: created.code}); assert.equal((await c.next(m => m.t === 'error')).status, 409);
    assert.equal((await a.act('word', {text: '水果'})).ok, true);
    view = await b.state(r => r.state?.submitted[0]);
    assert.ok(!JSON.stringify(view).includes('水果'), 'bob cannot see alice\'s word before both submit');
    assert.equal((await a.act('word', {text: '水果'})).status, 409);
    assert.equal((await b.act('word', {text: '天气'})).ok, true);
    view = await a.state(r => r.state?.phase === 'review');
    assert.deepEqual(view.state.history[0].words, ['水果', '天气']);
    await a.act('review', {same: false}); await b.act('review', {same: false});
    view = await b.state(r => r.state?.round === 2);
    assert.deepEqual(view.state.clue, ['水果', '天气']);
    assert.equal((await b.act('word', {text: '天气'})).status, 409);
    await a.act('word', {text: '夏天'}); await b.act('word', {text: ' 夏天！'});
    view = await a.state(r => r.status === 'finished');
    assert.deepEqual([view.result.result, view.result.rounds, view.result.players], ['success', 2, ['alice', 'bob']]);
    assert.deepEqual(view.tally, {played: 1, success: 1, best: 2});
    const saved = JSON.parse((await db.get('SELECT data,status FROM play_rooms WHERE code=?', [created.code])).data);
    assert.equal(saved.tally.success, 1);
    // Latency reports reach the other player and are kept with later results.
    a.send({t: 'ping', c: 1, net: {median: 80, jitter: 12, min: 70, n: 10}});
    assert.equal((await a.next(m => m.t === 'pong')).c, 1);
    const netMessage = await b.next(m => m.t === 'net');
    assert.deepEqual([netMessage.seats[0].net.median, netMessage.seats[0].net.jitter], [80, 12]);
    a.send({t: 'ping', c: 2, net: {median: -5, jitter: 1, min: 1, n: 1}}); await a.next(m => m.t === 'pong' && m.c === 2);
    for (const conn of [a, b, c]) conn.close();
  } finally { play.stop(); server.close(); }
});

test('rooms: pause when a player drops, resume on return, replaced tabs, kicks, invites, list and sweep', async () => {
  const {db, server, base, pushes} = await fixture();
  Object.assign(play.TUNING, {grace: 200, resumeMin: 1000, botScale: 0.01});
  try {
    const alice = await account(base, 1), bob = await account(base, 2), carol = await account(base, 3);
    const {code} = await (await alice.post('/api/hub/play', {game: 'word', settings: {limit: 30}})).json();
    const a = await alice.socket(); let b = await bob.socket();
    await a.hello(code); await b.hello(code);
    // Invitations: by username, not oneself, not someone already in the room; the inbox gets one notice.
    assert.equal((await a.act('invite', {username: 'alice'})).status, 400);
    assert.equal((await a.act('invite', {username: 'bob'})).status, 409);
    assert.equal((await a.act('invite', {username: 'dave'})).status, 404);
    const invited = await b.act('invite', {username: 'carol'}); assert.deepEqual(invited.result, {invited: 'carol'});
    const notice = await db.get("SELECT title,action_url FROM notifications WHERE user_id=3 AND type='game'");
    assert.equal(notice.action_url, 'https://games.garyhub.uk/play/?room=' + code); assert.match(notice.title, /bob 邀请你/);
    await b.act('ready', {ready: true}); await a.act('start');
    let view = await a.state(r => r.status === 'playing');
    assert.ok(view.deadline > view.now);
    await a.act('word', {text: '月亮'});
    // Bob's phone drops off without a close frame (FIN only): after the grace period the clock stops.
    b.socket.end();
    view = await a.state(r => r.paused);
    assert.equal(view.paused.reason, 'away'); assert.equal(view.deadline, null); assert.ok(view.remaining > 0); assert.ok(view.away[1] > 0);
    assert.equal((await a.act('review', {same: true})).status, 409);  // only giving up works while paused
    // Back again: the same game, his round still open, alice's word still hidden, the clock running again.
    b = await bob.socket();
    view = await b.hello(code);
    assert.equal(view.paused, null); assert.equal(view.state.mine, null); assert.deepEqual(view.state.submitted, [true, false]);
    assert.ok(!JSON.stringify(view).includes('月亮')); assert.ok(view.deadline - view.now >= 900);
    // The same account in a second tab replaces the first.
    const b2 = await bob.socket(); await b2.hello(code);
    assert.equal((await b.next(m => m.t === 'bye')).reason, 'elsewhere');
    b = b2;
    // Leaving a started word game ends it as interrupted; the host can play again and remove a player in the lobby.
    await b.act('leave');
    view = await a.state(r => r.status === 'finished');
    assert.equal(view.result.result, 'aborted'); assert.equal(view.seats[1].empty, true); assert.deepEqual(view.tally, {played: 0, success: 0, best: null});
    b = await bob.socket(); await b.hello(code);
    await a.act('rematch'); view = await a.state(r => r.status === 'lobby');
    assert.equal((await a.act('kick', {seat: 0})).status, 400);
    assert.equal((await a.act('kick', {seat: 1})).ok, true);
    assert.equal((await b.next(m => m.t === 'bye')).reason, 'kicked');
    b.send({t: 'hello', room: code}); assert.equal((await b.next(m => m.t === 'error')).status, 403);
    // A computer player in 对战猜数字: it sets a secret and guesses on its own; its secret never reaches the page.
    const {code: duel} = await (await alice.post('/api/hub/play', {game: 'digits', settings: {limit: 0}})).json();
    await a.hello(duel);
    assert.equal((await a.act('addBot', {level: 'genius'})).status, 400);
    assert.equal((await a.act('addBot', {level: 'smart'})).ok, true);
    assert.equal((await a.act('start')).ok, true);
    await a.act('secret', {code: '1234'});
    view = await a.state(r => r.state?.phase === 'guess');
    const bot = play.rooms.get(duel).state.secrets[1];
    assert.ok(digits.valid(bot)); assert.equal(view.state.secrets, null);
    const mine = [];
    for (let round = 1; view.status === 'playing'; round++) {
      assert.ok(round <= 12, 'the duel ends');
      assert.equal((await a.act('guess', {code: digits.botGuess(mine, 'smart', Math.random)})).ok, true);
      view = await a.state(r => r.status === 'finished' || r.state?.round > round);
      mine.splice(0, mine.length, ...view.state.history[0]);
      if (view.status === 'playing') assert.equal(view.state.secrets, null);
    }
    assert.deepEqual(view.state.secrets, ['1234', bot]); assert.ok(['solved', 'both'].includes(view.result.reason));
    assert.ok(view.state.history[1].every(h => h.timeout || digits.valid(h.guess)));
    // Room list: both rooms, with the other players' names.
    const listed = await (await alice.get('/api/hub/play')).json();
    assert.equal(listed.accountId, 1); assert.deepEqual(listed.rooms.map(r => r.code).sort(), [code, duel].sort());
    assert.deepEqual(listed.recent, ['bob']); assert.equal(listed.games.digits.bots.length, 3);
    assert.ok(!JSON.stringify(listed).includes('"net"'));
    // At most three open rooms per account.
    for (let i = 0; i < 2; i++) assert.equal((await alice.post('/api/hub/play', {game: 'word'})).status, 200);
    assert.equal((await alice.post('/api/hub/play', {game: 'word'})).status, 409);
    // The sweep removes rooms of accounts that no longer exist and tells whoever is inside.
    await db.run('DELETE FROM users WHERE id=1');
    await play.sweep(db);
    assert.equal((await a.next(m => m.t === 'bye')).reason, 'removed');
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM play_rooms')).n, 0);
    assert.equal(pushes.filter(p => p.userId === 3).length, 1);
    a.close();
  } finally { play.stop(); server.close(); }
});

test('rooms: after a restart a running game comes back paused from play_rooms and resumes when both are back', async () => {
  const {db, server, base} = await fixture();
  Object.assign(play.TUNING, {grace: 200, resumeMin: 1000, botScale: 0.01});
  try {
    const alice = await account(base, 1), bob = await account(base, 2);
    const {code} = await (await alice.post('/api/hub/play', {game: 'word', settings: {limit: 60}})).json();
    let a = await alice.socket(), b = await bob.socket();
    await a.hello(code); await b.hello(code);
    await b.act('ready', {ready: true}); await a.act('start');
    await a.act('word', {text: '晚霞'});
    await b.state(r => r.state?.submitted[0]);
    const before = play.rooms.get(code);
    await before.saving;
    // The process goes away: nothing of the room is left in memory, only the row.
    play.rooms.delete(code); before.conns.clear(); clearTimeout(before.timer); clearTimeout(before.botTimer);
    a.socket.destroy(); b.socket.destroy();
    a = await alice.socket();
    let view = await a.hello(code);
    assert.equal(view.paused.reason, 'restart'); assert.equal(view.deadline, null); assert.ok(view.remaining > 50_000 && view.remaining <= 60_000);
    assert.equal(view.state.mine, '晚霞'); assert.deepEqual(view.state.submitted, [true, false]);
    b = await bob.socket();
    view = await b.hello(code);
    assert.equal(view.paused, null); assert.ok(view.deadline - view.now > 50_000); assert.ok(!JSON.stringify(view).includes('晚霞'));
    a.close(); b.close();
  } finally { play.stop(); server.close(); }
});