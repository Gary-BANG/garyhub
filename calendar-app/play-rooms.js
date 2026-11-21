'use strict';
// Game rooms (v2.4.3.0): live rooms on games.garyhub.uk. A player creates a room for one game and shares its six-letter
// code; others join it, get ready, and the host starts. Everyone in the room sees every change at once over a WebSocket
// (play-socket.js) that Tools/Lab passes through from games.garyhub.uk/api/hub/play/socket.
//
// The room lives in this process while anyone uses it and is written to play_rooms after every change, so a restart
// or a dropped connection loses nothing: playing rooms come back paused and continue when every player is back.
// The server owns the clock (deadlines are server times; pages correct for their own clock). Each player receives only
// their own view of the game: a word or a secret that is not revealed yet never leaves the server for anyone else.
//
// Rules are in play-word.js and play-digits.js. Computer players (where a game has them) act through the same moves
// with a short, human-like delay and only see what their seat sees.
//
// v2.4.3.1 adds realtime games (play-car.js): while one is playing, the room steps it on a timer and sends a small
// frame to everyone many times a second. Controls arrive as 'in' messages (no reply, not saved, latest wins) and quick
// calls as 'say'; only moments the game marks as worth keeping are saved and sent in full.
const http = require('node:http');
const crypto = require('node:crypto');
const ws = require('./play-socket');
const {rateLimit} = require('./rate-limit');
const {channels, quiet} = require('./notify-channels');

const GAMES = {word: require('./play-word'), digits: require('./play-digits'), car: require('./play-car')};
const NAMES = {word: '词语默契', digits: '对战猜数字', car: '合作小车'};
const ORIGIN = 'https://games.garyhub.uk', SITE = ORIGIN + '/play/', SOCKET_PATH = '/api/hub/play/socket';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_ACTIVE = 3, MAX_SOCKETS = 4, MAX_INVITES = 10, MAX_MESSAGE = 2048;
const IDLE_LOBBY = 30 * 60_000, EVICT_AFTER = 10 * 60_000;
const STALE_DAYS = 7, KEEP_DAYS = 180, HEARTBEAT = 15_000, DEAD_AFTER = 45_000, REVALIDATE = 60_000;
// Timings that tests shorten; production uses these values.
const TUNING = {grace: 10_000, resumeMin: 5_000, botScale: 1};
const PLATFORM = new Set(['ready', 'start', 'settings', 'addBot', 'removeBot', 'kick', 'leave', 'rematch', 'invite']);

const fail = (status, message) => Object.assign(Error(message), {status});
const route = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const rng = () => crypto.randomInt(0x100000000) / 0x100000000;
const clean = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';

let db = null, pusher = null;
const rooms = new Map(), loading = new Map(), sockets = new Set();

async function migrate(database) {
  await database.run(`CREATE TABLE IF NOT EXISTS play_rooms(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT NOT NULL UNIQUE,game TEXT NOT NULL,
    user_id INTEGER NOT NULL,members TEXT NOT NULL DEFAULT ',',status TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,finished_at TEXT)`);
  await database.run('CREATE INDEX IF NOT EXISTS idx_play_rooms_host ON play_rooms(user_id,status)');
  await database.run('CREATE INDEX IF NOT EXISTS idx_play_rooms_status ON play_rooms(status,updated_at)');
}

// ---- Rooms in memory and on disk ---------------------------------------------------------------------------------
const members = room => ',' + room.seats.filter(s => s.user).map(s => s.user).join(',') + (room.seats.some(s => s.user) ? ',' : '');
const seatOf = (room, userId) => room.seats.findIndex(s => s.user === userId);
const humans = room => room.seats.filter(s => s.user);
const stamp = ms => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);

function fromRow(row) {
  const data = JSON.parse(row.data);
  const room = {id: row.id, code: row.code, game: row.game, hostId: row.user_id, status: row.status, revision: row.revision,
    settings: data.settings, seats: data.seats, state: data.state ?? null, clock: data.clock || {deadline: null, remaining: null},
    paused: data.paused ?? null, result: data.result ?? null, tally: data.tally ?? null, matches: data.matches || 0, invites: data.invites || 0,
    net: data.net || {}, kicked: data.kicked || [], createdAt: row.created_at, finishedAt: row.finished_at || null, updatedAt: Date.now(),
    conns: new Map(), offline: new Map(), timer: null, botTimer: null, botPlan: null, graces: new Map(), saving: Promise.resolve(), seen: new Map()};
  // A game that was running when the server stopped comes back paused with the time it had left.
  if (room.status === 'playing' && !room.paused) {
    room.paused = {since: Date.now(), reason: 'restart'};
    if (room.clock.deadline) room.clock = {deadline: null, remaining: Math.max(TUNING.resumeMin, room.clock.deadline - (data.savedAt || Date.now()))};
  }
  for (const seat of room.seats) if (seat.user) room.offline.set(seat.user, Date.now());
  return room;
}
function data(room) {
  return JSON.stringify({settings: room.settings, seats: room.seats, state: room.state, clock: room.clock, paused: room.paused, result: room.result,
    tally: room.tally, matches: room.matches, invites: room.invites, net: room.net, kicked: room.kicked, savedAt: Date.now()});
}
async function load(code) {
  if (typeof code !== 'string' || !/^[A-Z2-9]{6}$/.test(code)) return null;
  if (rooms.has(code)) return rooms.get(code);
  if (!loading.has(code)) {
    loading.set(code, (async () => {
      const row = await db.get('SELECT * FROM play_rooms WHERE code=?', [code]);
      if (!row || !GAMES[row.game]) return null;
      if (!rooms.has(code)) rooms.set(code, fromRow(row));
      return rooms.get(code);
    })().finally(() => loading.delete(code)));
  }
  return loading.get(code);
}
function persist(room) {
  const values = [room.hostId, members(room), room.status, room.revision, data(room), room.finishedAt, room.id];
  room.saving = room.saving.then(() => db.run('UPDATE play_rooms SET user_id=?,members=?,status=?,revision=?,data=?,updated_at=CURRENT_TIMESTAMP,finished_at=? WHERE id=?', values))
    .then(result => { if (result && result.changes === 0) gone(room, 'removed'); })
    .catch(error => console.error('Room save failed:', error.code || error.name || 'error'));
  return room.saving;
}
// The room no longer exists (its host's account was deleted, or the sweep removed it): tell whoever is still in it.
function gone(room, reason) {
  clearTimeout(room.timer); clearTimeout(room.botTimer); clearInterval(room.loop); room.loop = null;
  for (const timer of room.graces.values()) clearTimeout(timer);
  for (const conn of room.conns.values()) { send(conn, {t: 'bye', reason}); conn.close(1000, reason); }
  room.conns.clear();
  if (rooms.get(room.code) === room) rooms.delete(room.code);
}

// ---- Views ------------------------------------------------------------------------------------------------------
function view(room, userId) {
  const seat = seatOf(room, userId), game = GAMES[room.game];
  return {
    code: room.code, game: room.game, status: room.status, revision: room.revision, now: Date.now(),
    you: seat < 0 ? null : seat, host: seatOf(room, room.hostId), isHost: room.hostId === userId, settings: room.settings,
    seats: room.seats.map(s => ({name: s.user ? s.name : null, bot: s.bot || null, ready: !!s.ready, empty: !s.user && !s.bot,
      online: s.bot ? true : room.conns.has(s.user), net: s.user ? room.net[s.user] || null : null})),
    paused: room.paused ? {since: room.paused.since, reason: room.paused.reason} : null,
    deadline: room.clock.deadline, remaining: room.clock.remaining,
    // Since when (server time) each player has been away during a game; null while connected.
    away: room.status === 'playing' ? room.seats.map(s => s.user && !room.conns.has(s.user) ? room.offline.get(s.user) || Date.now() : null) : null,
    state: room.state ? game.view(room.state, seat < 0 ? null : seat) : null,
    result: room.result, tally: room.tally, matches: room.matches, invitesLeft: MAX_INVITES - room.invites,
    rules: {seats: game.seats, bots: game.bots, maxActive: MAX_ACTIVE}
  };
}
function send(conn, message) { try { conn.send(JSON.stringify(message)); } catch {} }
function broadcast(room) { for (const [userId, conn] of room.conns) send(conn, {t: 'state', room: view(room, userId)}); }

// ---- Changes ------------------------------------------------------------------------------------------------------
function changed(room, {save = true} = {}) {
  room.revision++; room.updatedAt = Date.now();
  if (save) persist(room);
  arm(room); armBot(room); loop(room); broadcast(room);
}
function finishRoom(room, result) {
  const game = GAMES[room.game];
  room.status = 'finished'; room.finishedAt = stamp(Date.now()); room.paused = null; room.clock = {deadline: null, remaining: null};
  // Each player's measured latency to the server is kept with the result (median and spread, in ms).
  const net = {};
  room.seats.forEach((s, i) => { if (s.user && room.net[s.user]) net[i] = room.net[s.user]; });
  room.result = {...result, at: Date.now(), net, players: room.seats.map(s => s.user ? s.name : s.bot ? '@' + s.bot : null)};
  room.tally = game.tally(room.tally, result); room.matches++;
  for (const s of room.seats) if (s.user) s.ready = false;
}
// Runs one change of the game against a copy of its state, so a refused move leaves nothing half applied.
function mutate(room, fn) {
  const game = GAMES[room.game], now = Date.now();
  const draft = structuredClone(room.state);
  let clock = {...room.clock}, finished = null;
  const ctx = {now, rng, setTimer: ms => { clock = {deadline: now + ms, remaining: null}; }, clearTimer: () => { clock = {deadline: null, remaining: null}; },
    finish: result => { finished = result; }, away: seat => { const s = room.seats[seat]; return s && s.user && !room.conns.has(s.user) ? now - (room.offline.get(s.user) || now) : 0; }};
  const output = fn(game, draft, ctx);
  room.state = draft; room.clock = clock;
  if (room.paused && room.clock.deadline) room.clock = {deadline: null, remaining: Math.max(TUNING.resumeMin, room.clock.deadline - now)};
  if (finished) finishRoom(room, finished);
  changed(room);
  return output;
}
function arm(room) {
  clearTimeout(room.timer); room.timer = null;
  const deadline = room.clock.deadline;
  if (room.status !== 'playing' || room.paused || !deadline) return;
  room.timer = setTimeout(() => {
    if (room.status !== 'playing' || room.paused || room.clock.deadline !== deadline) return;
    try { mutate(room, (game, state, ctx) => game.timeout(state, room.settings, ctx)); } catch (error) { console.error('Room timer failed:', error.message); }
  }, Math.max(0, deadline - Date.now()));
  room.timer.unref?.();
}
// A computer seat that has something to do acts after its delay; the plan is kept while the turn stays the same.
function armBot(room) {
  const game = GAMES[room.game];
  if (room.status !== 'playing' || room.paused || !game.bot) { clearTimeout(room.botTimer); room.botTimer = null; room.botPlan = null; return; }
  for (const [seat, s] of room.seats.entries()) {
    if (!s.bot) continue;
    const plan = game.bot(room.state, seat, s.bot, rng);
    if (!plan) continue;
    const key = seat + ':' + room.state.phase + ':' + room.state.round + ':' + plan.action;
    if (room.botPlan && room.botPlan.key === key && room.botTimer) return;
    clearTimeout(room.botTimer);
    room.botPlan = {key};
    room.botTimer = setTimeout(() => {
      room.botTimer = null; room.botPlan = null;
      if (room.status !== 'playing' || room.paused || !room.seats[seat]?.bot) return;
      const now = game.bot(room.state, seat, room.seats[seat].bot, rng);
      if (!now) return armBot(room);
      try { mutate(room, (g, state, ctx) => g.act(state, seat, now.action, now.data, room.settings, ctx)); } catch (error) { console.error('Computer move failed:', error.message); armBot(room); }
    }, plan.delay * TUNING.botScale);
    room.botTimer.unref?.();
    return;
  }
  clearTimeout(room.botTimer); room.botTimer = null; room.botPlan = null;
}
// Realtime games step on a timer while playing and not paused; every few steps the frame goes to everyone in the room.
function loop(room) {
  const game = GAMES[room.game], run = !!game.realtime && room.status === 'playing' && !room.paused && rooms.get(room.code) === room;
  if (!run) { if (room.loop) { clearInterval(room.loop); room.loop = null; } return; }
  if (room.loop) return;
  const every = Math.max(1, Math.round(game.realtime.hz / game.realtime.send));
  let last = Date.now(), n = 0;
  room.loop = setInterval(() => {
    if (room.status !== 'playing' || room.paused) { clearInterval(room.loop); room.loop = null; return; }
    const now = Date.now(), dt = Math.min(now - last, 250);
    last = now;
    let save = false, finished = null;
    try { game.step(room.state, dt, {now, rng, save: () => { save = true; }, finish: result => { finished = result; }}); }
    catch (error) { console.error('Room step failed:', error.message); return; }
    if (finished) { finishRoom(room, finished); changed(room); return; }
    if (save) changed(room);
    if (++n % every === 0 || save) {
      const text = JSON.stringify({t: 'f', s: now, d: game.frame(room.state)});
      for (const conn of room.conns.values()) { try { conn.send(text); } catch {} }
    }
  }, 1000 / game.realtime.hz);
  room.loop.unref?.();
}
function pause(room, reason) {
  if (room.status !== 'playing' || room.paused) return;
  room.paused = {since: Date.now(), reason};
  if (room.clock.deadline) room.clock = {deadline: null, remaining: Math.max(0, room.clock.deadline - Date.now())};
  changed(room);
}
function resume(room) {
  if (!room.paused || humans(room).some(s => !room.conns.has(s.user))) return;
  room.paused = null;
  GAMES[room.game].resume?.(room.state);
  if (room.clock.remaining != null) room.clock = {deadline: Date.now() + Math.max(TUNING.resumeMin, room.clock.remaining), remaining: null};
  changed(room);
}

// ---- Presence -----------------------------------------------------------------------------------------------------
function enter(room, conn) {
  const id = conn.userId, previous = room.conns.get(id);
  if (previous && previous !== conn) { send(previous, {t: 'bye', reason: 'elsewhere'}); previous.room = null; previous.close(1000, 'elsewhere'); }
  room.conns.set(id, conn); conn.room = room;
  room.offline.delete(id);
  clearTimeout(room.graces.get(id)); room.graces.delete(id);
  if (room.status === 'playing' && room.paused) resume(room);
  broadcast(room);
}
function detach(conn) {
  const room = conn.room;
  if (!room || room.conns.get(conn.userId) !== conn) return;
  room.conns.delete(conn.userId); conn.room = null;
  room.offline.set(conn.userId, Date.now());
  room.lastActive = Date.now();
  // A short drop (switching apps, a tunnel) does not stop the clock; ten seconds away (three in a realtime game) pauses
  // it. A realtime game lets go of the controls of whoever dropped out at once.
  const seat = seatOf(room, conn.userId), game = GAMES[room.game];
  if (room.status === 'playing' && seat >= 0) game.drop?.(room.state, seat);
  if (room.status === 'playing' && !room.paused && seat >= 0) {
    const timer = setTimeout(() => { room.graces.delete(conn.userId); if (!room.conns.has(conn.userId)) pause(room, 'away'); }, Math.min(TUNING.grace, game.grace ?? Infinity));
    timer.unref?.(); room.graces.set(conn.userId, timer);
  }
  broadcast(room);
}

// ---- Joining and platform moves -----------------------------------------------------------------------------------
async function activeCount(userId) {
  return (await db.get(`SELECT COUNT(*) AS n FROM play_rooms WHERE members LIKE ? AND status IN ('lobby','playing')`, ['%,' + userId + ',%'])).n;
}
async function join(conn, code) {
  const room = await load(typeof code === 'string' ? code.toUpperCase() : code);
  if (!room) throw fail(404, '找不到这个房间，请核对房间码');
  const seated = () => seatOf(room, conn.userId) >= 0;
  const open = () => {
    if (room.status === 'closed') throw fail(410, '这个房间已经关闭');
    if (seated()) return;
    if (room.kicked.includes(conn.userId)) throw fail(403, '房主请你离开了这个房间');
    if (room.status === 'playing') throw fail(409, '这一局已经开始，暂时不能加入');
    if (!room.seats.some(s => !s.user && !s.bot)) throw fail(409, '房间已满');
  };
  open();
  if (!seated()) {
    if (await activeCount(conn.userId) >= MAX_ACTIVE) throw fail(409, '同时最多参加 ' + MAX_ACTIVE + ' 个房间，请先结束或离开一个');
    open();  // the room may have changed while counting
    if (!seated()) {
      room.seats[room.seats.findIndex(s => !s.user && !s.bot)] = {user: conn.userId, name: conn.username, bot: null, ready: false};
      changed(room);
    }
  }
  if (conn.closed) return;
  if (conn.room && conn.room !== room) detach(conn);
  enter(room, conn);
}

const MOVES = {
  ready(room, seat, d) {
    if (room.status !== 'lobby') throw fail(409, '现在不能准备');
    if (typeof d.ready !== 'boolean') throw fail(400, '请选择是否准备');
    room.seats[seat].ready = d.ready;
  },
  settings(room, seat, d, host) {
    if (!host) throw fail(403, '只有房主可以修改设置');
    if (room.status !== 'lobby') throw fail(409, '开始后不能修改设置');
    room.settings = GAMES[room.game].settings(d.settings || {});
    for (const s of room.seats) if (s.user && s.user !== room.hostId) s.ready = false;
  },
  addBot(room, seat, d, host) {
    const game = GAMES[room.game];
    if (!host) throw fail(403, '只有房主可以添加电脑玩家');
    if (room.status !== 'lobby') throw fail(409, '开始后不能更换座位');
    if (!game.bots.includes(d.level)) throw fail(400, '这个游戏没有这一档电脑玩家');
    const target = room.seats.findIndex(s => !s.user && !s.bot);
    if (target < 0) throw fail(409, '没有空座位');
    room.seats[target] = {user: null, name: null, bot: d.level, ready: true};
  },
  removeBot(room, seat, d, host) {
    if (!host) throw fail(403, '只有房主可以移除电脑玩家');
    if (room.status !== 'lobby') throw fail(409, '开始后不能更换座位');
    if (!Number.isSafeInteger(d.seat) || !room.seats[d.seat]?.bot) throw fail(400, '这个座位不是电脑玩家');
    room.seats[d.seat] = {user: null, name: null, bot: null, ready: false};
  },
  kick(room, seat, d, host) {
    if (!host) throw fail(403, '只有房主可以请人离开');
    if (room.status === 'playing') throw fail(409, '对局中不能请人离开');
    const target = room.seats[d.seat];
    if (!Number.isSafeInteger(d.seat) || !target?.user || target.user === room.hostId) throw fail(400, '请选择一位其他玩家');
    const conn = room.conns.get(target.user);
    room.seats[d.seat] = {user: null, name: null, bot: null, ready: false};
    if (!room.kicked.includes(target.user)) room.kicked.push(target.user);
    delete room.net[target.user];
    if (conn) { room.conns.delete(target.user); conn.room = null; send(conn, {t: 'bye', reason: 'kicked'}); }
  },
  start(room, seat, d, host) {
    const game = GAMES[room.game];
    if (!host) throw fail(403, '只有房主可以开始');
    if (room.status !== 'lobby') throw fail(409, '已经开始了');
    if (room.seats.some(s => !s.user && !s.bot)) throw fail(409, '还有空座位');
    if (room.seats.some(s => s.user && s.user !== room.hostId && !s.ready)) throw fail(409, '还有玩家没有准备');
    if (humans(room).some(s => !room.conns.has(s.user))) throw fail(409, '还有玩家不在线');
    room.status = 'playing'; room.result = null; room.paused = null; room.finishedAt = null;
    room.seats[seatOf(room, room.hostId)].ready = true;
    let clock = {deadline: null, remaining: null};
    const now = Date.now();
    room.state = game.setup(room.settings, room.seats.length, {now, rng, setTimer: ms => { clock = {deadline: now + ms, remaining: null}; }, clearTimer: () => { clock = {deadline: null, remaining: null}; }});
    room.clock = clock;
  },
  rematch(room, seat, d, host) {
    if (!host) throw fail(403, '只有房主可以再来一局');
    if (room.status !== 'finished') throw fail(409, '这一局还没有结束');
    // A game that allows it starts again at once (the car: try again, or the next level), skipping the lobby.
    const game = GAMES[room.game], again = d.start === true && game.instantRematch;
    if (again) {
      if (room.seats.some(s => !s.user && !s.bot)) throw fail(409, '还有空座位，请回到大厅等人');
      if (humans(room).some(s => !room.conns.has(s.user))) throw fail(409, '还有玩家不在线');
      if (d.settings) room.settings = game.settings(d.settings);
      for (const s of room.seats) if (s.user) s.ready = true;
      room.status = 'lobby';
      return MOVES.start(room, seat, {}, host);
    }
    room.status = 'lobby'; room.state = null; room.clock = {deadline: null, remaining: null};
    for (const s of room.seats) if (s.user) s.ready = s.user === room.hostId;
  },
  leave(room, seat) {
    const game = GAMES[room.game], userId = room.seats[seat].user;
    if (room.status === 'playing') {
      const draft = structuredClone(room.state);
      let finished = null;
      game.leave(draft, seat, room.settings, {now: Date.now(), rng, setTimer() {}, clearTimer() {}, finish: result => { finished = result; }});
      room.state = draft;
      if (finished) finishRoom(room, finished);
    }
    room.seats[seat] = {user: null, name: null, bot: null, ready: false};
    delete room.net[userId];
    const conn = room.conns.get(userId);
    if (conn) { room.conns.delete(userId); conn.room = null; send(conn, {t: 'bye', reason: 'left'}); }
    if (room.hostId === userId) {
      const next = room.seats.find(s => s.user);
      if (next) room.hostId = next.user;
    }
    if (!room.seats.some(s => s.user)) { room.status = 'closed'; clearTimeout(room.timer); clearTimeout(room.botTimer); }
  }
};

async function invite(room, conn, d) {
  if (seatOf(room, conn.userId) < 0) throw fail(403, '只有房间里的玩家可以邀请');
  if (!['lobby', 'finished'].includes(room.status)) throw fail(409, '对局中不能邀请');
  if (room.invites >= MAX_INVITES) throw fail(429, '这个房间的邀请次数已用完');
  const username = clean(d.username, 64);
  const target = username && await db.get('SELECT id,username FROM users WHERE username=? AND enabled=1 AND COALESCE(deletion_pending,0)=0', [username]);
  if (!target) throw fail(404, '找不到这个账号，请输入对方的用户名');
  if (target.id === conn.userId) throw fail(400, '不能邀请自己');
  if (seatOf(room, target.id) >= 0) throw fail(409, '对方已经在房间里了');
  room.invites++;
  const name = NAMES[room.game];
  await tell(target.id, room.code, name + '：' + conn.username + ' 邀请你进房间', '房间码 ' + room.code + '，点开即可加入。');
  return {invited: target.username};
}
// Invitations use the in-app inbox, and push when the account's reminder channel allows one now.
async function tell(userId, code, title, body) {
  try {
    await db.run(`INSERT OR IGNORE INTO notifications(user_id,type,title,body,action_url,dedupe_key,scope) VALUES(?,'game',?,?,?,?,'home')`,
      [userId, title, body, SITE + '?room=' + code, 'play:' + code + ':' + userId]);
    if (pusher) {
      const settings = await channels(db, userId);
      if (settings.reminders.push && !quiet(settings)) await pusher.notify(userId, {title, body, url: SITE + '?room=' + code, tag: 'play-' + code});
    }
  } catch (error) { console.error('Room invitation failed:', error.code || error.name || 'error'); }
}

async function act(conn, message) {
  const room = conn.room, action = message.a, d = message.d && typeof message.d === 'object' ? message.d : {};
  if (!room || rooms.get(room.code) !== room) throw fail(409, '请先进入房间');
  const seat = seatOf(room, conn.userId);
  if (seat < 0) throw fail(403, '你不在这个房间里');
  if (action === 'invite') return invite(room, conn, d);
  if (PLATFORM.has(action)) {
    MOVES[action](room, seat, d, room.hostId === conn.userId);
    if (action === 'kick' || action === 'leave') room.lastActive = Date.now();
    changed(room);
    return null;
  }
  const game = GAMES[room.game];
  if (room.status !== 'playing') throw fail(409, room.status === 'finished' ? '这一局已经结束' : '还没有开始');
  if (room.paused && !game.pausedActions.includes(action)) throw fail(409, '游戏已暂停，等所有玩家回来');
  return mutate(room, (g, state, ctx) => g.act(state, seat, action, d, room.settings, ctx)) ?? null;
}

// ---- Connections --------------------------------------------------------------------------------------------------
function validNet(net) {
  if (!net || typeof net !== 'object') return null;
  const out = {};
  for (const key of ['median', 'jitter', 'min']) { const v = net[key]; if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 30000) return null; out[key] = Math.round(v); }
  if (!Number.isSafeInteger(net.n) || net.n < 1 || net.n > 1000) return null;
  return {...out, n: net.n, at: Date.now()};
}
// Controls and quick calls of a realtime game: no reply, nothing saved. Controls are ignored while paused, so the ones
// released for a player who dropped out stay released until that player sends new ones.
function realtime(conn, message, now) {
  const room = conn.room;
  if (!room || room.status !== 'playing' || rooms.get(room.code) !== room) return;
  const game = GAMES[room.game], seat = seatOf(room, conn.userId);
  if (seat < 0 || !game.realtime) return;
  if (message.t === 'in') { if (!room.paused) game.input(room.state, seat, message.k, message.q); return; }
  if (!game.calls.includes(message.c) || now - (conn.saidAt || 0) < 400) return;
  conn.saidAt = now;
  const text = JSON.stringify({t: 'said', seat, c: message.c, s: now});
  for (const other of room.conns.values()) { try { other.send(text); } catch {} }
}
function serve(conn) {
  let tokens = 20, refilled = Date.now(), fast = 60, fastAt = Date.now();
  conn.on('message', text => {
    const now = Date.now();
    if (text.length > MAX_MESSAGE) return conn.close(1009, 'too big');
    let message;
    try { message = JSON.parse(text); } catch { return conn.close(1007, 'invalid json'); }
    if (!message || typeof message !== 'object' || typeof message.t !== 'string') return conn.close(1007, 'invalid message');
    // Realtime controls have their own allowance (bursts of 60, 40 a second); extra ones are dropped, not punished.
    if (message.t === 'in' || message.t === 'say') {
      fast = Math.min(60, fast + (now - fastAt) / 25); fastAt = now;
      if (--fast < 0) return;
      return realtime(conn, message, now);
    }
    tokens = Math.min(20, tokens + (now - refilled) / 125); refilled = now;
    if (--tokens < 0) return conn.close(1008, 'too many messages');
    if (message.t === 'ping') {
      send(conn, {t: 'pong', c: message.c, s: now});
      const net = validNet(message.net), room = conn.room;
      if (net && room && seatOf(room, conn.userId) >= 0) {
        const before = room.net[conn.userId];
        room.net[conn.userId] = net;
        // Latency changes go to the room without a new revision; it is saved with the next change.
        if (!before || Math.abs(before.median - net.median) >= 5 || now - before.at > 10_000) for (const [userId, other] of room.conns) send(other, {t: 'net', seats: view(room, userId).seats});
      }
      return;
    }
    if (message.t === 'hello') {
      return join(conn, message.room).catch(error => { send(conn, {t: 'error', status: error.status || 500, message: error.status ? error.message : '服务暂时不可用，请稍后重试'}); if (!error.status) console.error('Room join failed:', error.message); });
    }
    if (message.t === 'act') {
      const id = typeof message.id === 'string' ? message.id.slice(0, 40) : null;
      // A repeated move id (a resend after reconnecting) is answered without applying it twice.
      const seen = conn.room?.seen;
      if (id && seen?.has(conn.userId + ':' + id)) return send(conn, {t: 'ack', id, ok: true, repeat: true});
      Promise.resolve().then(() => act(conn, message)).then(result => {
        if (id && conn.room?.seen) { conn.room.seen.set(conn.userId + ':' + id, now); if (conn.room.seen.size > 200) conn.room.seen.delete(conn.room.seen.keys().next().value); }
        send(conn, {t: 'ack', id, ok: true, result});
      }, error => {
        if (!error.status) console.error('Room move failed:', error.message);
        send(conn, {t: 'ack', id, ok: false, status: error.status || 500, message: error.status ? error.message : '服务暂时不可用，请稍后重试'});
      });
      return;
    }
    conn.close(1007, 'unknown message');
  });
  conn.on('close', () => { sockets.delete(conn); detach(conn); });
}

// The upgrade request goes through the Express app like any API request (session, account checks, 428 for a
// temporary password); this route then takes over the socket. Any other answer is written as a normal HTTP reply.
function upgradeRoute(req, res) {
  const up = req.playUpgrade;
  if (!up) return res.status(426).json({message: '需要 WebSocket 连接'});
  const user = req.session.user;
  if ([...sockets].filter(c => c.userId === user.id).length >= MAX_SOCKETS) return res.status(429).json({message: '打开的游戏页面太多了'});
  if (!ws.handshakeKey(req)) return res.status(400).json({message: 'WebSocket 握手无效'});
  res.detachSocket(up.socket);
  const conn = ws.accept(req, up.socket, up.head);
  conn.userId = user.id; conn.username = user.username; conn.authVersion = req.session.authVersion || 0; conn.room = null;
  sockets.add(conn);
  serve(conn);
  send(conn, {t: 'welcome', now: Date.now(), user: user.username});
}
function originGate(req, res, next) {
  if (req.get('origin') !== ORIGIN) return res.status(403).json({message: 'Origin check failed'});
  next();
}
function attach_(app, server) {
  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => socket.destroy());
    if (req.url.split('?')[0] !== SOCKET_PATH) { socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); return; }
    req.playUpgrade = {socket, head};
    const res = new http.ServerResponse(req);
    res.shouldKeepAlive = false;
    res.assignSocket(socket);
    res.on('finish', () => socket.end());
    app(req, res);
  });
}

// ---- Upkeep -------------------------------------------------------------------------------------------------------
// Every 15 s: drop dead connections, ping live ones, re-check signed-in accounts each minute, and let idle rooms go.
let lastCheck = 0;
async function upkeep() {
  const now = Date.now();
  for (const conn of sockets) { if (now - conn.lastSeen > DEAD_AFTER) conn.destroy(); else conn.ping(); }
  if (now - lastCheck >= REVALIDATE) {
    lastCheck = now;
    const ids = [...new Set([...sockets].map(c => c.userId))];
    for (const id of ids) {
      const user = await db.get('SELECT enabled,auth_version,deletion_pending FROM users WHERE id=?', [id]);
      for (const conn of [...sockets].filter(c => c.userId === id))
        if (!user || user.enabled !== 1 || user.deletion_pending || conn.authVersion !== user.auth_version) { send(conn, {t: 'bye', reason: 'auth'}); conn.close(1008, 'signed out'); }
    }
  }
  for (const room of [...rooms.values()]) {
    if (room.conns.size) continue;
    const idle = now - (room.lastActive || room.updatedAt);
    if (room.status === 'lobby' && now - room.updatedAt >= IDLE_LOBBY && idle >= IDLE_LOBBY) { room.status = 'closed'; changed(room); }
    if (idle >= EVICT_AFTER && !room.botTimer) { await room.saving; if (!room.conns.size) { clearTimeout(room.timer); rooms.delete(room.code); } }
  }
}
// Hourly: close abandoned lobbies and stale games, delete old rooms and rooms of accounts that no longer exist.
async function sweep(database = db) {
  const live = new Set([...rooms.values()].filter(r => r.conns.size).map(r => r.id));
  const quietLobbies = await database.all(`SELECT id FROM play_rooms WHERE status='lobby' AND julianday(updated_at)<=julianday('now','-30 minutes')`);
  for (const row of quietLobbies) if (!live.has(row.id)) await database.run(`UPDATE play_rooms SET status='closed',revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='lobby'`, [row.id]);
  const stale = await database.all(`SELECT id FROM play_rooms WHERE status='playing' AND julianday(updated_at)<=julianday('now',?)`, ['-' + STALE_DAYS + ' days']);
  for (const row of stale) if (!live.has(row.id)) await database.run(`UPDATE play_rooms SET status='closed',revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [row.id]);
  await database.run(`DELETE FROM play_rooms WHERE status IN ('finished','closed') AND julianday(updated_at)<=julianday('now',?)`, ['-' + KEEP_DAYS + ' days']);
  const users = new Set((await database.all('SELECT id FROM users')).map(u => u.id));
  for (const row of await database.all('SELECT id,members,user_id FROM play_rooms')) {
    const ids = row.members.split(',').filter(Boolean).map(Number);
    if (!users.has(row.user_id) || ids.some(id => !users.has(id))) await database.run('DELETE FROM play_rooms WHERE id=?', [row.id]);
  }
  // Rooms held in memory follow what is on disk.
  const kept = new Map((await database.all('SELECT id,status FROM play_rooms')).map(r => [r.id, r.status]));
  for (const room of [...rooms.values()]) {
    if (!kept.has(room.id)) gone(room, 'removed');
    else if (kept.get(room.id) === 'closed' && room.status !== 'closed') { room.status = 'closed'; gone(room, 'closed'); }
  }
}

// ---- HTTP: my rooms and a new room --------------------------------------------------------------------------------
function summary(room, userId, updated) {
  const seat = seatOf(room, userId), result = room.result ? {...room.result} : null;
  if (result) delete result.net;
  return {code: room.code, game: room.game, status: room.status, paused: !!room.paused, host: room.hostId === userId, you: seat < 0 ? null : seat,
    players: room.seats.map(s => s.user ? s.name : s.bot ? '@' + s.bot : null), matches: room.matches, result, tally: room.tally, updated};
}
async function list(userId, username) {
  const rows = await db.all(`SELECT * FROM play_rooms WHERE members LIKE ? ORDER BY updated_at DESC, id DESC LIMIT 30`, ['%,' + userId + ',%']);
  const out = rows.map(row => summary(rooms.get(row.code) || fromRow(row), userId, row.updated_at));
  // People this account played with recently (seated now or in the last result), so an invitation needs no directory.
  const recent = [...new Set(rows.flatMap(row => { const d = JSON.parse(row.data); return [...d.seats.filter(s => s.user).map(s => s.name), ...(d.result?.players || [])]; })
    .filter(name => name && !name.startsWith('@') && name !== username))].slice(0, 8);
  const games = Object.fromEntries(Object.entries(GAMES).map(([id, g]) => [id, {seats: g.seats, bots: g.bots}]));
  return {accountId: userId, rooms: out.filter(r => r.status !== 'closed'), recent, games, maxActive: MAX_ACTIVE};
}
async function create(userId, username, input) {
  const game = GAMES[input.game];
  if (!game) throw fail(400, '请选择一个游戏');
  const config = game.settings(input.settings || {});
  if (await activeCount(userId) >= MAX_ACTIVE) throw fail(409, '同时最多参加 ' + MAX_ACTIVE + ' 个房间，请先结束或离开一个');
  const seats = Array.from({length: game.seats}, (_, i) => i === 0 ? {user: userId, name: username, bot: null, ready: true} : {user: null, name: null, bot: null, ready: false});
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = Array.from({length: 6}, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
    const room = {settings: config, seats, state: null, clock: {deadline: null, remaining: null}, paused: null, result: null, tally: null, matches: 0, invites: 0, net: {}, kicked: []};
    try {
      await db.run('INSERT INTO play_rooms(code,game,user_id,members,status,data) VALUES(?,?,?,?,?,?)',
        [code, input.game, userId, ',' + userId + ',', 'lobby', JSON.stringify({...room, savedAt: Date.now()})]);
      return {code, game: input.game};
    } catch (error) {
      if (!/UNIQUE/i.test(String(error.message))) throw error;
    }
  }
  throw fail(503, '房间码暂时不够用，请稍后再试');
}

function register(app, {db: database, requireLogin, pusher: push = null}) {
  db = database; pusher = push;
  const handle = fn => route(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.body?.accountId !== req.session.user.id) throw fail(409, '登录账号已变化，请刷新页面');
      res.json(await fn(req));
    } catch (error) {
      if (!error.status) throw error;
      res.status(error.status).json({message: error.message});
    }
  });
  app.get('/api/hub/play', requireLogin, handle(req => list(req.session.user.id, req.session.user.username)));
  app.post('/api/hub/play', requireLogin, rateLimit(30, 60 * 60_000), handle(req => create(req.session.user.id, req.session.user.username, req.body || {})));
  app.get(SOCKET_PATH, originGate, requireLogin, upgradeRoute);
}
let timers = [];
function start(database) {
  db = db || database;
  const run = () => sweep(database).catch(error => console.error('Room sweep failed:', error.code || error.name || 'error'));
  run();
  const keep = setInterval(() => upkeep().catch(error => console.error('Room upkeep failed:', error.code || error.name || 'error')), HEARTBEAT);
  const hourly = setInterval(run, 60 * 60_000);
  keep.unref(); hourly.unref();
  timers = [keep, hourly];
  return timers;
}
function stop() { for (const timer of timers) clearInterval(timer); for (const room of rooms.values()) gone(room, 'shutdown'); for (const conn of sockets) conn.destroy(); }

module.exports = {migrate, register, attach: attach_, start, stop, sweep, upkeep, list, create, view, rooms, sockets, GAMES, TUNING, SOCKET_PATH, ORIGIN, MAX_ACTIVE};
