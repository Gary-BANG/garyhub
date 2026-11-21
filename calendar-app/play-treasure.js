'use strict';
// Game rooms (v2.4.3.2): "骰子抢宝箱 / Treasure Dash" for 2–4 players (computer players allowed).
// A 7×7 map with a base in each corner. On your turn roll one die and walk up to that many steps (up, down, left,
// right; walls block, quicksand stops you). Walk onto a chest to pick it up (one at a time; carrying it costs one step
// each roll) and bring it to your own base: only then is it opened and its gold counted. Ending your move on another
// player starts a duel (both roll; the defender wins ties and gets +1 on their own base): win and you take their chest,
// or two gold. Spikes knock a carried chest off; '?' tiles give an item (boots +3 steps, a hidden trap, a shield, a
// recall home). First to the goal (12 gold with two players, 15 with more) wins; otherwise the most gold after the last round.
//
// Hidden from the other players: what a chest holds (until it is opened at a base), traps (only their owner sees
// them) and which items a player holds (others see how many).

const fail = (status, message) => Object.assign(Error(message), {status});
const SIZE = 7;
// B base, # wall, c chest spawn, C centre spawn (richer chests), q quicksand, x spikes, ? item tile, . floor.
const MAP = ['B..?..B', '.#c.c#.', '.c.x.c.', '?.qCq.?', '.c.x.c.', '.#c.c#.', 'B..?..B'];
const BASES = [0, 48, 6, 42];  // corner tiles in seat order: two players sit opposite each other
const ITEMS = ['boots', 'trap', 'shield', 'recall'];
const CHESTS = {wood: [2, 4], silver: [4, 6], gold: [7, 9]};
const WORTH = {wood: 3, silver: 5, gold: 8};
const LIMITS = [0, 20, 40], ITEM_COOLDOWN = 3, MISSES = 2;
const kind = pos => MAP[Math.floor(pos / SIZE)][pos % SIZE];
const rc = pos => [Math.floor(pos / SIZE), pos % SIZE];
const neighbours = pos => { const [r, c] = rc(pos); return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([y, x]) => y >= 0 && y < SIZE && x >= 0 && x < SIZE).map(([y, x]) => y * SIZE + x).filter(p => kind(p) !== '#'); };
const SPAWNS = [...Array(SIZE * SIZE).keys()].filter(p => kind(p) === 'c' || kind(p) === 'C');
const ITEM_TILES = [...Array(SIZE * SIZE).keys()].filter(p => kind(p) === '?');
const die = rng => 1 + Math.floor(rng() * 6);

function settings(input = {}) {
  const players = input.players ?? 2, limit = input.limit ?? 20, rounds = input.rounds ?? 12;
  if (![2, 3, 4].includes(players)) throw fail(400, '玩家人数须为 2–4');
  if (!LIMITS.includes(limit)) throw fail(400, '每步限时只能是 20、40 秒或不限时');
  if (![8, 12, 16].includes(rounds)) throw fail(400, '回合数只能是 8、12 或 16');
  return {players, limit, rounds};
}
const seatCount = config => config.players;

// Steps away from pos, as far as `steps` allows: quicksand ends a walk (but you may leave the one you stand on).
function reach(pos, steps) {
  const dist = {[pos]: 0}, queue = [pos];
  while (queue.length) {
    const p = queue.shift();
    if (dist[p] >= steps || (p !== pos && kind(p) === 'q')) continue;
    for (const n of neighbours(p)) if (dist[n] == null) { dist[n] = dist[p] + 1; queue.push(n); }
  }
  return dist;
}
// Distance on the map ignoring quicksand (for planning).
function distances(from) {
  const dist = {[from]: 0}, queue = [from];
  while (queue.length) { const p = queue.shift(); for (const n of neighbours(p)) if (dist[n] == null) { dist[n] = dist[p] + 1; queue.push(n); } }
  return dist;
}
// The walk to `to`: fewest steps, and among those the fewest spikes (they matter while carrying).
function path(from, to, steps) {
  const best = {[from]: [0, 0]}, prev = {}, open = [[0, 0, from]];
  while (open.length) {
    open.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const [d, s, p] = open.shift();
    if (p === to) break;
    if (d >= steps || (p !== from && kind(p) === 'q')) continue;
    for (const n of neighbours(p)) {
      const cost = [d + 1, s + (kind(n) === 'x' ? 1 : 0)];
      if (!best[n] || cost[0] < best[n][0] || (cost[0] === best[n][0] && cost[1] < best[n][1])) { best[n] = cost; prev[n] = p; open.push([...cost, n]); }
    }
  }
  if (!best[to]) return null;
  const out = [to];
  while (out[0] !== from) out.unshift(prev[out[0]]);
  return out;
}

function chest(rng, pos) {
  const roll = rng(), type = kind(pos) === 'C' ? (roll < 0.5 ? 'gold' : 'silver') : roll < 0.6 ? 'wood' : roll < 0.9 ? 'silver' : 'gold';
  const [lo, hi] = CHESTS[type];
  return {pos, type, value: lo + Math.floor(rng() * (hi - lo + 1))};
}
function spawn(state, rng) {
  const taken = new Set([...state.chests.map(c => c.pos), ...state.players.filter(p => !p.out).map(p => p.pos)]);
  const free = SPAWNS.filter(p => !taken.has(p));
  if (free.length) state.chests.push(chest(rng, free[Math.floor(rng() * free.length)]));
}

function setup(config, seats, ctx) {
  const state = {phase: 'roll', turn: 0, round: 1, maxRounds: config.rounds, goal: seats === 2 ? 12 : 15, roll: null, steps: 0, boots: false,
    players: Array.from({length: seats}, (_, seat) => ({seat, pos: BASES[seat], base: BASES[seat], gold: 0, banked: 0, carry: null, items: [], out: false, missed: 0})),
    chests: [], cooldown: {}, traps: [], seq: 0, last: null, log: [], outcome: null};
  for (let i = 0; i < (seats === 2 ? 2 : 3); i++) spawn(state, ctx.rng);
  if (config.limit) ctx.setTimer(config.limit * 1000);
  return state;
}

function note(state, entry) { state.log.push({seq: state.seq, ...entry}); if (state.log.length > 40) state.log.shift(); }
function finish(state, ctx, reason) {
  const ranking = state.players.filter(p => !p.out || reason !== 'left').map(p => ({seat: p.seat, gold: p.gold, banked: p.banked, out: p.out}))
    .sort((a, b) => (a.out - b.out) || b.gold - a.gold || b.banked - a.banked);
  const top = ranking[0], tie = ranking[1] && !ranking[1].out && ranking[1].gold === top.gold && ranking[1].banked === top.banked;
  state.phase = 'finished'; state.roll = null;
  state.outcome = {winner: tie ? null : top.seat, reason, rounds: state.round, ranking};
  ctx.clearTimer();
  ctx.finish({...state.outcome});
}
function active(state) { return state.players.filter(p => !p.out); }
function endTurn(state, config, ctx) {
  if (state.phase === 'finished') return;
  const order = state.players.map(p => p.seat);
  let next = state.turn;
  do { next = (next + 1) % order.length; } while (state.players[next].out && next !== state.turn);
  // A round is over when the turn comes back to the first player still in the game.
  if (next <= state.turn) state.round++;
  if (state.round > state.maxRounds) { state.round = state.maxRounds; return finish(state, ctx, 'rounds'); }
  state.turn = next; state.phase = 'roll'; state.roll = null; state.steps = 0; state.boots = false;
  for (const [pos, ready] of Object.entries(state.cooldown)) if (ready <= state.round) delete state.cooldown[pos];
  if (config.limit) ctx.setTimer(config.limit * 1000);
}
function bank(state, me, ctx) {
  if (!me.carry || me.pos !== me.base) return false;
  me.gold += me.carry.value; me.banked++;
  note(state, {kind: 'bank', seat: me.seat, type: me.carry.type, value: me.carry.value});
  me.carry = null;
  spawn(state, ctx.rng);
  return me.gold >= state.goal;
}
function drop(state, me, pos) {
  if (!me.carry) return;
  state.chests.push({...me.carry, pos});
  me.carry = null;
}

// Arrival: a duel with a player standing here, else a chest to pick up, an item tile, your base.
function arrive(state, me, ctx, stayed) {
  const others = state.players.filter(p => !p.out && p.seat !== me.seat && p.pos === me.pos);
  if (others.length && !stayed) {
    const rival = others.find(p => p.carry) || others[0];
    const a = die(ctx.rng), d = die(ctx.rng), bonus = rival.pos === rival.base ? 1 : 0, won = a > d + bonus;
    const duel = {kind: 'duel', seat: me.seat, rival: rival.seat, a, d, bonus, won, took: null};
    if (won) {
      if (rival.items.includes('shield')) { rival.items.splice(rival.items.indexOf('shield'), 1); duel.took = 'shield'; }
      else if (rival.carry) { if (me.carry) drop(state, rival, me.pos); else { me.carry = rival.carry; rival.carry = null; } duel.took = 'chest'; }
      else { const n = Math.min(2, rival.gold); rival.gold -= n; me.gold += n; duel.took = n; }
    } else { const n = Math.min(1, me.gold); me.gold -= n; rival.gold += n; duel.took = -n; }
    note(state, duel);
    state.last.duel = {a, d, bonus, won, rival: rival.seat};
    return;
  }
  const here = state.chests.findIndex(c => c.pos === me.pos);
  if (here >= 0 && !me.carry) { me.carry = state.chests.splice(here, 1)[0]; note(state, {kind: 'pick', seat: me.seat, type: me.carry.type}); }
  if (kind(me.pos) === '?' && state.cooldown[me.pos] == null && me.items.length < 2) {
    const item = ITEMS[Math.floor(ctx.rng() * ITEMS.length)];
    me.items.push(item); state.cooldown[me.pos] = state.round + ITEM_COOLDOWN;
    note(state, {kind: 'item', seat: me.seat});
  }
}

const ACTIONS = {
  roll(state, me, d, config, ctx) {
    if (state.phase !== 'roll') throw fail(409, '现在不能掷骰子');
    const roll = die(ctx.rng);
    state.roll = roll; state.steps = me.carry ? Math.max(1, roll - 1) : roll; state.phase = 'move';
    note(state, {kind: 'roll', seat: me.seat, roll, steps: state.steps});
  },
  move(state, me, d, config, ctx) {
    if (state.phase !== 'move') throw fail(409, '请先掷骰子');
    const to = d.to;
    if (!Number.isSafeInteger(to) || reach(me.pos, state.steps)[to] == null) throw fail(400, '走不到那一格');
    const walk = path(me.pos, to, state.steps);
    const trail = [walk[0]];
    let stopped = null;
    for (const p of walk.slice(1)) {
      trail.push(p);
      if (kind(p) === 'x' && me.carry) { drop(state, me, p); note(state, {kind: 'spike', seat: me.seat}); }
      const trap = state.traps.findIndex(t => t.pos === p && t.owner !== me.seat);
      if (trap >= 0) {
        const t = state.traps.splice(trap, 1)[0], owner = state.players[t.owner];
        if (me.items.includes('shield')) { me.items.splice(me.items.indexOf('shield'), 1); note(state, {kind: 'trap', seat: me.seat, owner: t.owner, blocked: true}); continue; }
        drop(state, me, p);
        const n = Math.min(2, me.gold); me.gold -= n; owner.gold += n;
        note(state, {kind: 'trap', seat: me.seat, owner: t.owner, paid: n});
        stopped = p; break;
      }
    }
    me.pos = stopped ?? to;
    state.last = {seq: state.seq + 1, seat: me.seat, roll: state.roll, path: trail, trapped: stopped != null};
    if (stopped == null) arrive(state, me, ctx, walk.length === 1);
    if (bank(state, me, ctx)) return finish(state, ctx, 'goal');
    endTurn(state, config, ctx);
  },
  item(state, me, d, config, ctx) {
    const item = d.item;
    if (!me.items.includes(item)) throw fail(400, '你没有这个道具');
    if (item === 'shield') throw fail(400, '护盾会在被抢或踩到暗夹时自动生效');
    if (item === 'recall') {
      if (state.phase !== 'roll') throw fail(409, '回城卷轴要在掷骰子前使用');
      me.items.splice(me.items.indexOf(item), 1);
      state.last = {seq: state.seq + 1, seat: me.seat, path: [me.pos, me.base], teleport: true};
      me.pos = me.base;
      note(state, {kind: 'use', seat: me.seat, item});
      if (bank(state, me, ctx)) return finish(state, ctx, 'goal');
      return endTurn(state, config, ctx);
    }
    if (item === 'boots') {
      if (state.phase !== 'move' || state.boots) throw fail(409, '疾风靴要在掷骰子后、移动前使用，每回合一次');
      me.items.splice(me.items.indexOf(item), 1);
      state.steps += 3; state.boots = true;
      return note(state, {kind: 'use', seat: me.seat, item});
    }
    // A trap goes on a free tile next to you; only you will see it.
    const at = d.at;
    if (!Number.isSafeInteger(at) || !neighbours(me.pos).includes(at) || ['B', '#'].includes(kind(at)) || state.traps.some(t => t.pos === at) || state.players.some(p => !p.out && p.pos === at))
      throw fail(400, '暗夹只能放在你旁边的空地上');
    if (!['roll', 'move'].includes(state.phase)) throw fail(409, '现在不能放暗夹');
    me.items.splice(me.items.indexOf(item), 1);
    state.traps.push({pos: at, owner: me.seat});
    note(state, {kind: 'use', seat: me.seat, item: 'trap'});
  }
};

function act(state, seat, action, data, config, ctx) {
  const rule = ACTIONS[action];
  if (!rule) throw fail(400, '未知操作');
  if (state.phase === 'finished') throw fail(409, '这一局已经结束');
  if (seat !== state.turn) throw fail(409, '还没轮到你');
  const me = state.players[seat];
  rule(state, me, data || {}, config, ctx);
  me.missed = 0;
  state.seq++;
  // The same player goes on (rolled, used an item): a fresh clock for the next step.
  if (state.phase !== 'finished' && state.turn === seat && config.limit) ctx.setTimer(config.limit * 1000);
}

// Time is up: the computer makes the move for that player; two missed in a row hand the seat to the computer (托管).
function timeout(state, config, ctx) {
  if (state.phase === 'finished') return;
  const seat = state.turn, me = state.players[seat];
  const plan = bot(state, seat, 'normal', ctx.rng);
  if (plan) { ACTIONS[plan.action](state, me, plan.data, config, ctx); state.seq++; }
  me.missed++;
  if (me.missed >= MISSES) ctx.auto(seat);
  if (state.phase !== 'finished' && state.turn === seat && config.limit) ctx.setTimer(config.limit * 1000);
}
function leave(state, seat, config, ctx) {
  const me = state.players[seat];
  if (!me || me.out || state.phase === 'finished') return;
  drop(state, me, me.pos);
  me.out = true;
  state.traps = state.traps.filter(t => t.owner !== seat);
  note(state, {kind: 'left', seat});
  if (active(state).length < 2) return finish(state, ctx, 'left');
  if (state.turn === seat) endTurn(state, config, ctx);
  state.seq++;
}

function view(state, seat) {
  return {
    map: MAP, size: SIZE, phase: state.phase, turn: state.turn, round: state.round, maxRounds: state.maxRounds, goal: state.goal,
    roll: state.roll, steps: state.steps, boots: state.boots,
    reach: state.phase === 'move' ? Object.keys(reach(state.players[state.turn].pos, state.steps)).map(Number) : null,
    players: state.players.map(p => ({seat: p.seat, pos: p.pos, base: p.base, gold: p.gold, banked: p.banked, carry: p.carry ? p.carry.type : null, out: p.out,
      items: p.seat === seat ? p.items.slice() : p.items.length, missed: p.missed})),
    // What a chest holds stays secret until it is opened at a base.
    chests: state.chests.map(c => ({pos: c.pos, type: c.type})),
    items: ITEM_TILES.filter(p => state.cooldown[p] == null),
    traps: state.traps.filter(t => t.owner === seat).map(t => t.pos),
    last: state.last, log: state.log.slice(-12), seq: state.seq, outcome: state.outcome
  };
}

// ---- Computer player ---------------------------------------------------------------------------------------------
const LEVELS = {easy: {wander: 0.3, items: false}, normal: {wander: 0, items: true}, smart: {wander: 0, items: true, careful: true}};
function bot(state, seat, level, rng) {
  if (state.phase === 'finished' || state.turn !== seat) return null;
  const me = state.players[seat], cfg = LEVELS[level] || LEVELS.normal, home = distances(me.base);
  const delay = 700 + rng() * 700;
  if (state.phase === 'roll') {
    if (cfg.items && me.carry && me.items.includes('recall') && home[me.pos] > 4) return {action: 'item', data: {item: 'recall'}, delay};
    if (cfg.items && me.items.includes('trap')) {
      const rivals = active(state).filter(p => p.seat !== seat), mine = distances(me.pos);
      const near = rivals.filter(p => mine[p.pos] <= 4).sort((a, b) => mine[a.pos] - mine[b.pos])[0];
      if (near) {
        const theirs = distances(near.pos);
        const spot = neighbours(me.pos).filter(p => !['B', '#'].includes(kind(p)) && !state.traps.some(t => t.pos === p) && !state.players.some(o => !o.out && o.pos === p))
          .sort((a, b) => theirs[a] - theirs[b])[0];
        if (spot != null) return {action: 'item', data: {item: 'trap', at: spot}, delay};
      }
    }
    return {action: 'roll', data: {}, delay};
  }
  const options = reach(me.pos, state.steps), tiles = Object.keys(options).map(Number);
  // Boots when three more steps reach home with a chest, or reach a chest.
  if (cfg.items && !state.boots && me.items.includes('boots')) {
    const more = reach(me.pos, state.steps + 3);
    const useful = me.carry ? more[me.base] != null && options[me.base] == null : state.chests.some(c => more[c.pos] != null && options[c.pos] == null);
    if (useful) return {action: 'item', data: {item: 'boots'}, delay};
  }
  if (rng() < cfg.wander) return {action: 'move', data: {to: tiles[Math.floor(rng() * tiles.length)]}, delay};
  const rivals = active(state).filter(p => p.seat !== seat);
  const score = to => {
    let s = 0;
    if (me.carry) {
      if (to === me.base) return 1000;
      s -= home[to] * 10;
      if (cfg.careful) for (const r of rivals) if (!r.carry && distances(r.pos)[to] <= 4) s -= 6;
    } else {
      const there = state.chests.find(c => c.pos === to);
      if (there) s += 100 + WORTH[there.type] * 10;
      else for (const c of state.chests) s = Math.max(s, WORTH[c.type] * 6 - distances(to)[c.pos] * 4);
      const target = rivals.find(r => r.pos === to);
      if (target) s += target.carry ? 60 * (target.pos === target.base ? 0.28 : 0.42) * WORTH[target.carry.type] / 3 : target.gold >= 2 ? 15 : -10;
    }
    if (kind(to) === '?' && state.cooldown[to] == null && me.items.length < 2) s += 12;
    if (kind(to) === 'q') s -= 4;
    if (me.carry && path(me.pos, to, state.steps)?.some(p => kind(p) === 'x')) s -= 40;
    if (state.traps.some(t => t.pos === to && t.owner === seat)) s -= 50;
    return s;
  };
  const best = tiles.sort((a, b) => score(b) - score(a) || a - b)[0];
  return {action: 'move', data: {to: best}, delay};
}
const botKey = (state, seat, plan) => state.seq + ':' + plan.action;

function tally(previous, result) {
  const t = previous || {wins: {}, draws: 0, games: 0};
  const next = {wins: {...t.wins}, draws: t.draws, games: t.games + 1};
  if (result.winner == null) next.draws++; else next.wins[result.winner] = (next.wins[result.winner] || 0) + 1;
  return next;
}

module.exports = {id: 'treasure', seats: 2, seatCount, bots: ['easy', 'normal', 'smart'], away: 'autoplay', pausedActions: [], settings, setup, act, timeout, leave, view, bot, botKey, tally,
  reach, path, distances, MAP, SIZE, BASES, ITEMS, kind, LIMITS};
