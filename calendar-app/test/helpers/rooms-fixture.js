'use strict';
// A Calendar-like app with sessions and the game rooms on a real HTTP server, and signed-in players with sockets (v2.4.3.1).
const assert = require('node:assert/strict'), express = require('express'), session = require('express-session');
const {createSqliteAdapter} = require('./sqlite-adapter');
const {migrateUnifiedCalendar} = require('../../migrations/unified-schema');
const {connect} = require('./ws-client');
const play = require('../../play-rooms');

async function fixture() {
  const db = createSqliteAdapter();
  await db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,password_hash TEXT,role TEXT,enabled INTEGER,created_at TEXT,auth_version INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE register_requests(id INTEGER PRIMARY KEY);
    CREATE TABLE events(id INTEGER PRIMARY KEY,user_id INTEGER);
    INSERT INTO users(id,username,password_hash,role,enabled,created_at) VALUES(1,'alice','h','admin',1,'2026-01-01'),(2,'bob','h','user',1,'2026-01-01'),(3,'carol','h','user',1,'2026-01-01');`);
  await migrateUnifiedCalendar(db);
  await require('../../hub-api').migrateHub(db);
  const columns = await db.all('PRAGMA table_info(users)');
  if (!columns.some(c => c.name === 'deletion_pending')) await db.run('ALTER TABLE users ADD COLUMN deletion_pending INTEGER NOT NULL DEFAULT 0');
  await require('../../preferences-api').migrate(db);
  await play.migrate(db);
  const app = express();
  app.use(express.json());
  app.use(session({secret: 'room-test-secret', resave: false, saveUninitialized: false}));
  app.post('/test/login/:id', async (req, res) => {
    const user = await db.get('SELECT id,username FROM users WHERE id=?', [Number(req.params.id)]);
    req.session.user = {id: user.id, username: user.username}; req.session.authVersion = 0; res.json({ok: true});
  });
  const requireLogin = (req, res, next) => req.session.user ? next() : res.status(401).json({message: '未登录'});
  play.register(app, {db, requireLogin, pusher: null});
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  play.attach(app, server);
  return {db, server, base: 'http://127.0.0.1:' + server.address().port};
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
    c.state = test => c.next(m => m.t === 'state' && (!c.room || m.room.code === c.room) && (!test || test(m.room))).then(m => m.room);
    c.hello = code => { c.room = code.toUpperCase(); c.send({t: 'hello', room: code}); return c.state(); };
    return c;
  };
  const post = (path, body) => fetch(base + path, {method: 'POST', headers: {cookie, 'content-type': 'application/json'}, body: JSON.stringify({accountId: id, ...body})});
  return {id, cookie, socket, post};
}
module.exports = {fixture, account};
