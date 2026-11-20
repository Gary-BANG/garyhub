'use strict';
// Games (v2.4.2.0): "白日梦想家 / Daydreamer", played by two accounts on games.garyhub.uk, one move at a time.
//
// The host lists 10–20 prizes (amounts or gifts) that both players can see. The server shuffles them into numbered
// boxes with a secure random order and publishes only a SHA-256 commitment of that order: neither player can see what
// a box holds until it is opened. The player picks a box to keep; each round the player opens as many other boxes as
// the host asked for, then the host offers to buy the kept box. A deal, or a refused last offer, leads to the host
// opening the remaining boxes and finally the player's own. At the end the salt and the order are published, so
// anyone can check the commitment. The game only records outcomes; it never moves money.
//
// One row per game, with its own revision: each move is one conditional UPDATE, so two pages (or a double click)
// cannot both apply a move. The host is user_id (account deletion removes hosted games); games whose player account
// no longer exists are removed by the hourly sweep. No foreign keys to users.
const crypto = require('node:crypto');
const {rateLimit} = require('./rate-limit');
const {channels, quiet} = require('./notify-channels');

const route = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const fail = (status, message) => Object.assign(Error(message), {status});

const MIN_PRIZES = 10, MAX_PRIZES = 20, MAX_CENTS = 99_999_900, MAX_ACTIVE = 5, EXPIRE_DAYS = 30;
const CURRENCIES = ['CNY', 'USD', 'CAD', 'HKD'];
const ICONS = ['gift', 'cake', 'flower', 'book', 'game', 'coffee', 'ticket', 'star', 'heart', 'plane', 'camera', 'music', 'bag', 'watch', 'phone', 'food'];
// Whose move each live status waits for.
const TURN = {invited: 'player', opening: 'player', answering: 'player', offering: 'host', revealing: 'host'};
const ACTIVE = Object.keys(TURN);
const SITE = 'https://games.garyhub.uk/dream/';

async function migrate(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS dream_games(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,player_id INTEGER NOT NULL,
    status TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,title TEXT NOT NULL DEFAULT '',currency TEXT NOT NULL,prizes TEXT NOT NULL,
    layout TEXT NOT NULL,salt TEXT NOT NULL,commitment TEXT NOT NULL,play TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,finished_at TEXT)`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_dream_games_host ON dream_games(user_id,status)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_dream_games_player ON dream_games(player_id,status)');
}

// ---- Rules --------------------------------------------------------------------------------------------------------
const cents = value => Number.isSafeInteger(value) && value >= 1 && value <= MAX_CENTS;
const clean = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';

function validPrizes(input) {
  if (!Array.isArray(input) || input.length < MIN_PRIZES || input.length > MAX_PRIZES) throw fail(400, '请设置 10–20 个金额或礼品');
  return input.map(item => {
    if (item?.kind === 'money') {
      if (!cents(item.amount)) throw fail(400, '金额须在 0.01 到 999,999 之间');
      return {kind: 'money', amount: item.amount};
    }
    if (item?.kind === 'gift') {
      const name = clean(item.name, 30);
      if (!name || typeof item.name !== 'string' || item.name.trim().length > 30) throw fail(400, '礼品名称须为 1–30 个字');
      if (!ICONS.includes(item.icon)) throw fail(400, '礼品图标无效');
      if (item.value != null && !cents(item.value)) throw fail(400, '礼品估值须在 0.01 到 999,999 之间');
      return {kind: 'gift', name, icon: item.icon, value: item.value ?? null};
    }
    throw fail(400, '奖品格式无效');
  });
}
function shuffle(count) {
  const order = Array.from({length: count}, (_, i) => i);
  for (let i = count - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
}
// Anyone can recompute this at the end from the published salt and order (box 1 first).
const commit = (salt, layout) => crypto.createHash('sha256').update(salt + '|' + layout.join(',')).digest('hex');
const others = (game, play) => game.prizes.length - 1 - play.opened.length;
const box = (game, value) => Number.isSafeInteger(value) && value >= 0 && value < game.prizes.length;

// ---- Storage ------------------------------------------------------------------------------------------------------
function load(row) {
  if (!row) return null;
  return {...row, prizes: JSON.parse(row.prizes), layout: JSON.parse(row.layout), play: JSON.parse(row.play)};
}
async function names(db, ids) {
  const out = new Map();
  for (const id of new Set(ids)) out.set(id, (await db.get('SELECT username FROM users WHERE id=?', [id]))?.username || null);
  return out;
}
const turnOf = (game, userId) => {
  const side = TURN[game.status];
  if (!side) return null;
  return (side === 'host' ? game.user_id : game.player_id) === userId ? 'me' : 'them';
};

// What one participant may see: the prize list, opened boxes and the commitment; the order only once finished.
function view(game, userId, who) {
  const play = game.play, finished = game.status === 'finished';
  return {
    id: game.id, revision: game.revision, status: game.status, title: game.title, currency: game.currency,
    role: game.user_id === userId ? 'host' : 'player', turn: turnOf(game, userId),
    host: who.get(game.user_id) || null, player: who.get(game.player_id) || null,
    prizes: game.prizes.map((prize, index) => ({index, ...prize})), boxes: game.prizes.length,
    chosen: play.chosen, opened: play.opened.map(number => ({box: number, prize: game.layout[number]})),
    rounds: play.rounds.map(round => ({count: round.count, boxes: round.boxes, offer: round.offer, answer: round.answer, nextCount: round.nextCount})),
    // Before choosing, the player sees how many boxes the first round opens; afterwards, how many are left to open now.
    pending: ['invited', 'opening'].includes(game.status) ? play.pending : 0, deal: play.deal, honored: !!play.honored,
    remaining: others(game, play), commitment: game.commitment,
    reveal: finished ? {salt: game.salt, layout: game.layout, chosenPrize: game.layout[play.chosen]} : null,
    createdAt: game.created_at, updatedAt: game.updated_at, finishedAt: game.finished_at || null
  };
}
function summary(game, userId, who) {
  const play = game.play, role = game.user_id === userId ? 'host' : 'player';
  return {id: game.id, title: game.title, status: game.status, role, turn: turnOf(game, userId), currency: game.currency,
    opponent: who.get(role === 'host' ? game.player_id : game.user_id) || null, boxes: game.prizes.length,
    opened: play.opened.length, deal: play.deal, updatedAt: game.updated_at,
    result: game.status === 'finished' ? game.prizes[game.layout[play.chosen]] : null};
}

// ---- Notices ------------------------------------------------------------------------------------------------------
// The account whose move it now is gets an in-app notice, and a push when its reminder channel allows one now.
async function tell(db, pusher, userId, gameId, revision, title, body) {
  try {
    await db.run(`INSERT OR IGNORE INTO notifications(user_id,type,title,body,action_url,dedupe_key,scope) VALUES(?,'game',?,?,?,?,'home')`,
      [userId, title, body, SITE + '?id=' + gameId, 'dream:' + gameId + ':' + revision]);
    if (pusher) {
      const settings = await channels(db, userId);
      if (settings.reminders.push && !quiet(settings)) await pusher.notify(userId, {title, body, url: SITE + '?id=' + gameId, tag: 'dream-' + gameId});
    }
  } catch (error) { console.error('Game notice failed:', error.code || error.name || 'error'); }
}
const money = (currency, value) => currency + ' ' + (value / 100).toFixed(2);

// ---- Moves --------------------------------------------------------------------------------------------------------
// Each move checks who may make it in which status, changes play, and names who to tell.
const MOVES = {
  decline: {status: ['invited'], side: 'player', apply(game) { game.status = 'declined'; return {to: 'host', title: '白日梦想家：对方婉拒了邀请', body: '这一局已关闭。'}; }},
  cancel: {status: ['invited'], side: 'host', apply(game) { game.status = 'cancelled'; return {to: 'player', title: '白日梦想家：发起人取消了这一局', body: '这一局已关闭。'}; }},
  choose: {status: ['invited'], side: 'player', apply(game, input) {
    const play = game.play;
    if (!box(game, input.box)) throw fail(400, '请选择一个盒子');
    play.chosen = input.box;
    play.rounds.push({count: play.pending, boxes: [], offer: null, answer: null, nextCount: null});
    if (play.pending > 0) { game.status = 'opening'; return null; }
    game.status = 'offering';
    return {to: 'host', title: '白日梦想家：对方选好了盒子', body: '轮到你出价了。'};
  }},
  open: {status: ['opening'], side: 'player', apply(game, input) {
    const play = game.play, picked = input.boxes;
    if (!Array.isArray(picked) || picked.length !== play.pending || new Set(picked).size !== picked.length) throw fail(400, '请选择 ' + play.pending + ' 个盒子');
    for (const number of picked) if (!box(game, number) || number === play.chosen || play.opened.includes(number)) throw fail(400, '只能揭开尚未打开的其他盒子');
    play.opened.push(...picked);
    play.rounds.at(-1).boxes = picked.slice();
    play.pending = 0;
    game.status = 'offering';
    return {to: 'host', title: '白日梦想家：对方揭开了 ' + picked.length + ' 个盒子', body: '轮到你出价了。'};
  }},
  offer: {status: ['offering'], side: 'host', apply(game, input) {
    const play = game.play, left = others(game, play), round = play.rounds.at(-1);
    if (!cents(input.amount)) throw fail(400, '出价须在 0.01 到 999,999 之间');
    // A refused offer leads to another round only while at least one other box would still be closed after it.
    let next = null;
    if (left >= 2) {
      if (!Number.isSafeInteger(input.nextCount) || input.nextCount < 1 || input.nextCount > left - 1) throw fail(400, '下一轮揭开的盒子数须在 1 到 ' + (left - 1) + ' 之间');
      next = input.nextCount;
    } else if (input.nextCount != null && input.nextCount !== 0) throw fail(400, '这是最后一次出价');
    round.offer = {amount: input.amount, note: clean(input.note, 60)};
    round.nextCount = next;
    game.status = 'answering';
    return {to: 'player', title: '白日梦想家：发起人出价 ' + money(game.currency, input.amount), body: next ? '成交还是继续？' : '这是最后一次出价。'};
  }},
  answer: {status: ['answering'], side: 'player', apply(game, input) {
    const play = game.play, round = play.rounds.at(-1);
    if (typeof input.accept !== 'boolean') throw fail(400, '请选择成交或不卖');
    round.answer = input.accept ? 'accept' : 'decline';
    if (input.accept) {
      play.deal = round.offer.amount;
      game.status = 'revealing';
      return {to: 'host', title: '白日梦想家：成交！', body: '以 ' + money(game.currency, play.deal) + ' 成交，请揭开剩下的盒子。'};
    }
    if (round.nextCount) {
      play.pending = round.nextCount;
      play.rounds.push({count: round.nextCount, boxes: [], offer: null, answer: null, nextCount: null});
      game.status = 'opening';
      return null;
    }
    game.status = 'revealing';
    return {to: 'host', title: '白日梦想家：对方拒绝了最后的出价', body: '请揭开剩下的盒子。'};
  }},
  reveal: {status: ['revealing'], side: 'host', apply(game, input) {
    const play = game.play;
    if (others(game, play) > 0) {
      if (!box(game, input.box) || input.box === play.chosen || play.opened.includes(input.box)) throw fail(400, '请先揭开其他尚未打开的盒子');
      play.opened.push(input.box);
      return null;
    }
    if (input.box !== play.chosen) throw fail(400, '最后揭开对方的盒子');
    game.status = 'finished';
    game.finished_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const prize = game.prizes[game.layout[play.chosen]];
    const inside = prize.kind === 'money' ? money(game.currency, prize.amount) : prize.name;
    return {to: 'player', title: '白日梦想家：结果揭晓', body: '你的盒子里是 ' + inside + (play.deal != null ? '，成交价 ' + money(game.currency, play.deal) : '') + '。'};
  }},
  honor: {status: ['finished'], side: 'host', apply(game) {
    if (game.play.honored) throw fail(409, '已经标记过了');
    game.play.honored = true;
    return null;
  }}
};

async function move(db, pusher, userId, id, action, input) {
  const rule = MOVES[action];
  const game = load(await db.get('SELECT * FROM dream_games WHERE id=?', [id]));
  if (!rule || !game || (game.user_id !== userId && game.player_id !== userId)) throw fail(404, '找不到这一局');
  if (input.revision !== game.revision) throw fail(409, '这一局已经更新，请刷新后再操作');
  if ((rule.side === 'host' ? game.user_id : game.player_id) !== userId) throw fail(403, rule.side === 'host' ? '只有发起人可以这样做' : '只有参与人可以这样做');
  if (!rule.status.includes(game.status)) throw fail(409, '现在不能这样做');
  const notice = rule.apply(game, input);
  const changed = await db.run(`UPDATE dream_games SET status=?,play=?,finished_at=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=?`,
    [game.status, JSON.stringify(game.play), game.finished_at || null, id, game.revision]);
  if (!changed.changes) throw fail(409, '这一局已经更新，请刷新后再操作');
  if (notice) await tell(db, pusher, notice.to === 'host' ? game.user_id : game.player_id, id, game.revision + 1, notice.title, notice.body);
  return read(db, userId, id);
}
async function read(db, userId, id) {
  const game = load(await db.get('SELECT * FROM dream_games WHERE id=? AND (user_id=? OR player_id=?)', [id, userId, userId]));
  if (!game) throw fail(404, '找不到这一局');
  return view(game, userId, await names(db, [game.user_id, game.player_id]));
}

async function create(db, pusher, userId, input) {
  const prizes = validPrizes(input.prizes);
  if (!CURRENCIES.includes(input.currency)) throw fail(400, '币种无效');
  const first = input.firstCount;
  if (!Number.isSafeInteger(first) || first < 0 || first > prizes.length - 2) throw fail(400, '第一轮揭开的盒子数须在 0 到 ' + (prizes.length - 2) + ' 之间');
  const username = clean(input.player, 64);
  const player = username && await db.get('SELECT id FROM users WHERE username=? AND enabled=1 AND COALESCE(deletion_pending,0)=0', [username]);
  if (!player) throw fail(404, '找不到这个账号，请输入对方的用户名');
  if (player.id === userId) throw fail(400, '不能邀请自己');
  const active = await db.get(`SELECT COUNT(*) AS n FROM dream_games WHERE user_id=? AND status IN (${ACTIVE.map(() => '?').join(',')})`, [userId, ...ACTIVE]);
  if (active.n >= MAX_ACTIVE) throw fail(409, '同时最多发起 ' + MAX_ACTIVE + ' 局，请先完成或取消一局');
  const layout = shuffle(prizes.length), salt = crypto.randomBytes(16).toString('hex');
  const play = {chosen: null, opened: [], rounds: [], pending: first, deal: null, honored: false};
  const result = await db.run(`INSERT INTO dream_games(user_id,player_id,status,title,currency,prizes,layout,salt,commitment,play) VALUES(?,?,'invited',?,?,?,?,?,?,?)`,
    [userId, player.id, clean(input.title, 30), input.currency, JSON.stringify(prizes), JSON.stringify(layout), salt, commit(salt, layout), JSON.stringify(play)]);
  const id = Number(result.lastID ?? result.lastInsertRowid);
  const host = (await db.get('SELECT username FROM users WHERE id=?', [userId]))?.username || '';
  await tell(db, pusher, player.id, id, 0, '白日梦想家：' + host + ' 邀请你来一局', '共 ' + prizes.length + ' 个盒子，选一个属于你的。');
  return read(db, userId, id);
}

async function list(db, userId) {
  const rows = (await db.all('SELECT * FROM dream_games WHERE user_id=? OR player_id=? ORDER BY updated_at DESC, id DESC LIMIT 60', [userId, userId])).map(load);
  const who = await names(db, rows.flatMap(game => [game.user_id, game.player_id]));
  const games = rows.map(game => summary(game, userId, who));
  // Usernames this account already played with, so an invitation needs no account directory.
  const recent = [...new Set(games.map(game => game.opponent).filter(Boolean))].slice(0, 8);
  return {accountId: userId, games, recent, limits: {minPrizes: MIN_PRIZES, maxPrizes: MAX_PRIZES, maxActive: MAX_ACTIVE, currencies: CURRENCIES, icons: ICONS}};
}

// Hourly: quiet games expire after 30 days, and games whose player account is gone are removed.
async function sweep(db) {
  await db.run(`UPDATE dream_games SET status='expired',revision=revision+1,updated_at=CURRENT_TIMESTAMP
    WHERE status IN (${ACTIVE.map(() => '?').join(',')}) AND julianday(updated_at)<=julianday('now',?)`, [...ACTIVE, '-' + EXPIRE_DAYS + ' days']);
  await db.run('DELETE FROM dream_games WHERE player_id NOT IN (SELECT id FROM users) OR user_id NOT IN (SELECT id FROM users)');
}

function register(app, {db, requireLogin, pusher = null}) {
  const handle = fn => route(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.body?.accountId !== req.session.user.id) throw fail(409, '登录账号已变化，请刷新页面');
      res.json(await fn(req));
    } catch (error) {
      if (!error.status) throw error;
      res.status(error.status).json({message: error.message});
    }
  });
  const id = req => { const value = Number(req.params.id); if (!Number.isSafeInteger(value) || value < 1) throw fail(404, '找不到这一局'); return value; };
  app.get('/api/hub/games', requireLogin, handle(req => list(db, req.session.user.id)));
  app.post('/api/hub/games', requireLogin, rateLimit(20, 60 * 60_000), handle(req => create(db, pusher, req.session.user.id, req.body)));
  app.get('/api/hub/games/:id', requireLogin, handle(req => read(db, req.session.user.id, id(req))));
  app.post('/api/hub/games/:id/:action', requireLogin, rateLimit(240, 60_000), handle(req => move(db, pusher, req.session.user.id, id(req), req.params.action, req.body)));
}
function start(db) {
  const run = () => sweep(db).catch(error => console.error('Game sweep failed:', error.code || error.name || 'error'));
  run();
  const timer = setInterval(run, 60 * 60_000);
  timer.unref();
  return timer;
}

module.exports = {migrate, register, start, sweep, create, move, read, list, commit, validPrizes, MOVES, ICONS, CURRENCIES, MIN_PRIZES, MAX_PRIZES};
