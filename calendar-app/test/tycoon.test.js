'use strict';
// v2.4.3.3: 大富翁 — three ways to play (rounds, classic, a time limit), auctions, trades with counter-offers, the computer
// trading, bidding and building with its reasons in the log, the asset history, the animation list, and games saved by
// v2.4.3.2 going on under their old rules.
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../play-monopoly');
const queue = values => { const list = values.slice(); return () => list.length ? list.shift() : 0.5; };
const die = n => (n - 1) / 6 + 0.01;
function ctx(rng = queue([]), now = 0) { const c = {rng, now, timer: null, result: null, autos: []}; Object.assign(c, {setTimer: ms => { c.timer = ms; }, clearTimer: () => { c.timer = null; }, finish: r => { c.result = r; }, auto: s => c.autos.push(s)}); return c; }
const rejects = (fn, status, pattern) => assert.throws(fn, e => e.status === status && (!pattern || pattern.test(e.message)));
function game(players = 3, extra = {}) { const config = M.settings({players, limit: 45, auction: 1, trade: 1, ...extra}), c = ctx(queue([0])); const s = M.setup(config, players, c); s.turn = 0; s.first = 0; return {config, c, s}; }
const roll = (s, config, c, a, b) => { c.rng = queue([die(a), die(b)]); M.act(s, s.turn, 'roll', {}, config, c); };
const asBot = c => ({...c, bot: true});

test('tycoon modes: settings, classic, a time limit, the asset history and old saved games', () => {
  assert.deepEqual(M.settings({mode: 'classic', auction: true, trade: false}), {players: 4, rounds: 20, limit: 45, mode: 'classic', minutes: 60, auction: 1, trade: 0});
  for (const bad of [{mode: 'sprint'}, {minutes: 45}, {auction: 2}, {trade: 'yes'}]) assert.throws(() => M.settings(bad), e => e.status === 400);
  // Classic: no last round; the game stops at the hundredth round at the latest.
  let {config, c, s} = game(3, {mode: 'classic'});
  assert.equal(s.maxRounds, null); assert.equal(s.history.length, 1); assert.deepEqual(s.history[0], [M.START, M.START, M.START]);
  for (const seat of [0, 1, 2]) { s.phase = 'manage'; M.act(s, seat, 'end', {}, config, c); }
  assert.equal(s.round, 2); assert.equal(s.history.length, 2);
  // Rents grow in a classic game from round 25: ×1.5, then ×2 from round 35 …
  s.owner[5] = 1;
  assert.equal(M.rent(s, 5), 80);
  s.round = 25; assert.equal(M.rent(s, 5), 120); assert.equal(M.view(s).growth, 1.5);
  s.round = 35; assert.equal(M.rent(s, 5), 160);
  delete s.owner[5];
  s.round = 60; s.turn = 2; s.phase = 'manage'; M.act(s, 2, 'end', {}, config, c);
  assert.equal(c.result, null, 'classic goes on past 30 rounds');
  s.round = M.CAP; s.turn = 2; s.phase = 'manage'; M.act(s, 2, 'end', {}, config, c);
  assert.equal(c.result.reason, 'cap'); assert.equal(s.history.length, 4);
  // A time limit: the turn during which the time runs out is the last one; a pause moves the end along.
  ({config, c, s} = game(3, {mode: 'time', minutes: 30}));
  assert.equal(s.endsAt, 30 * 60000);
  s.owner[5] = 1; s.round = 40; assert.equal(M.rent(s, 5), 80, 'only classic rents grow'); delete s.owner[5]; s.round = 1;
  M.resume(s, {pausedFor: 5000}); assert.equal(s.endsAt, 30 * 60000 + 5000);
  c.now = 30 * 60000; s.phase = 'manage'; M.act(s, 0, 'end', {}, config, c);
  assert.equal(c.result, null);
  c.now = 30 * 60000 + 5000; s.phase = 'manage'; M.act(s, 1, 'end', {}, config, c);
  assert.equal(c.result.reason, 'time'); assert.equal(s.phase, 'finished');
  // A game saved by v2.4.3.2 (no new fields) goes on with its old rules: no auction, no trading.
  ({config, c, s} = game(3));
  for (const key of ['mode', 'cap', 'endsAt', 'rules', 'trade', 'auction', 'proposed', 'memo', 'history', 'fx', 'fxId', 'anim', 'why']) delete s[key];
  const old = {players: 3, rounds: 20, limit: 45};
  c.rng = queue([die(1), die(4)]); M.act(s, 0, 'roll', {}, old, c);
  M.act(s, 0, 'pass', {}, old, c);
  assert.equal(s.phase, 'manage', 'no auction in an old game');
  rejects(() => M.act(s, 0, 'proposeTrade', {to: 1, give: {cash: 100}, get: {tiles: [5]}}, old, c), 409, /没有开启交易/);
  assert.equal(M.view(s).mode, 'rounds'); assert.deepEqual(M.view(s).rules, {trade: false, auction: false});
});

test('tycoon auctions: bidding in turn, minimum raises, folding, broke bidders, timeouts and leaving', () => {
  let {config, c, s} = game(3);
  roll(s, config, c, 1, 4);  // 5: 兰州, 1,000
  M.act(s, 0, 'pass', {}, config, c);
  assert.equal(s.phase, 'auction'); assert.deepEqual(s.auction.order, [1, 2, 0]); assert.equal(M.actor(s), 1);
  rejects(() => M.act(s, 0, 'bid', {amount: 200}, config, c), 409, /轮到/);
  rejects(() => M.act(s, 1, 'bid', {amount: 50}, config, c), 409, /至少/);
  rejects(() => M.act(s, 1, 'bid', {amount: 105}, config, c), 400);
  rejects(() => M.act(s, 1, 'end', {}, config, c), 409);
  M.act(s, 1, 'bid', {amount: 300}, config, c); assert.equal(M.actor(s), 2);
  M.act(s, 2, 'fold', {}, config, c); assert.equal(M.actor(s), 0);
  M.act(s, 0, 'bid', {amount: 400}, config, c); assert.equal(M.actor(s), 1);
  M.act(s, 1, 'fold', {}, config, c);
  assert.deepEqual([s.owner[5], s.players[0].cash, s.phase, s.auction], [0, M.START - 400, 'manage', null]);
  assert.deepEqual(s.log.at(-1), {...s.log.at(-1), kind: 'won', seat: 0, tile: 5, price: 400});
  assert.ok(s.fx.some(f => f.t === 'coins' && f.from === 0 && f.to === -1 && f.amount === 400));
  // Nobody bids: the land stays with the bank. Someone who cannot raise is out at once; a silent bidder folds.
  ({config, c, s} = game(3));
  s.players[2].cash = 50;
  roll(s, config, c, 1, 4); M.act(s, 0, 'pass', {}, config, c);
  assert.ok(s.auction.out.includes(2) || M.actor(s) === 1);
  M.timeout(s, config, c); assert.equal(s.players[1].missed, 1);
  assert.equal(M.actor(s), 0, 'seat 2 cannot raise and is skipped');
  assert.ok(s.auction.trail.some(e => e.seat === 2 && e.broke));
  M.act(s, 0, 'fold', {}, config, c);
  assert.equal(s.owner[5], undefined); assert.equal(s.log.at(-1).kind, 'unsold'); assert.equal(s.phase, 'manage');
  // The leader leaves: the bid no longer counts and the auction goes on.
  ({config, c, s} = game(3));
  roll(s, config, c, 1, 4); M.act(s, 0, 'pass', {}, config, c);
  M.act(s, 1, 'bid', {amount: 500}, config, c);
  M.leave(s, 1, config, c);
  assert.deepEqual([s.auction.leader, s.auction.bid, M.actor(s)], [null, 0, 2]);
  M.act(s, 2, 'bid', {amount: 100}, config, c); M.act(s, 0, 'fold', {}, config, c);
  assert.equal(s.owner[5], 2);
});

test('tycoon trades: proposing, checks, counter-offers, accepting, refusing, withdrawing and limits', () => {
  let {config, c, s} = game(3, {trade: 0});
  s.owner[1] = 0; s.owner[3] = 1;
  rejects(() => M.act(s, 0, 'proposeTrade', {to: 1, give: {cash: 1000}, get: {tiles: [3]}}, M.settings({players: 3}), c), 409, /没有开启交易/);
  ({config, c, s} = game(3));
  s.owner[1] = 0; s.owner[3] = 1; s.owner[5] = 2; s.owner[6] = 2; s.owner[7] = 2; s.houses[5] = 1;
  const propose = (d, seat = 0) => M.act(s, seat, 'proposeTrade', {to: 1, ...d}, config, c);
  rejects(() => propose({give: {cash: 1000}, get: {tiles: [1]}}), 400, /属于/);
  rejects(() => propose({give: {cash: 100}, get: {cash: 100, tiles: [3]}}), 400, /一方/);
  rejects(() => propose({give: {cash: 100}, get: {}}), 400, /一块地/);
  rejects(() => propose({give: {cash: 99990}, get: {tiles: [3]}}), 409, /现金/);
  rejects(() => propose({give: {cash: 105}, get: {tiles: [3]}}), 400, /10/);
  rejects(() => M.act(s, 0, 'proposeTrade', {to: 2, give: {cash: 100}, get: {tiles: [5]}}, config, c), 409, /房子/);
  rejects(() => M.act(s, 0, 'proposeTrade', {to: 0, give: {cash: 100}, get: {tiles: [1]}}, config, c), 400);
  propose({give: {tiles: [], cash: 1000}, get: {tiles: [3]}});
  assert.deepEqual(M.view(s).trade, {id: s.trade.id, from: 0, to: 1, give: {tiles: [], cash: 1000}, get: {tiles: [3], cash: 0}, counters: 0});
  assert.equal(M.actor(s), 1);
  rejects(() => M.act(s, 0, 'roll', {}, config, c), 409, /等对方/);
  rejects(() => M.act(s, 2, 'acceptTrade', {}, config, c), 409);
  // Seat 1 asks for more; seat 0 accepts the counter-offer.
  M.act(s, 1, 'counterTrade', {give: {tiles: [3]}, get: {cash: 1800}}, config, c);
  assert.deepEqual([s.trade.from, s.trade.to, s.trade.counters, M.actor(s)], [1, 0, 1, 0]);
  M.act(s, 0, 'acceptTrade', {}, config, c);
  assert.deepEqual([s.owner[3], s.players[0].cash, s.players[1].cash, s.trade], [0, M.START - 1800, M.START + 1800, null]);
  assert.equal(s.log.at(-1).kind, 'trade');
  assert.ok(s.fx.some(f => f.t === 'trade') && s.fx.some(f => f.t === 'coins' && f.from === 0 && f.to === 1 && f.amount === 1800));
  // The whole group is hers now: she may build.
  s.phase = 'manage'; M.act(s, 0, 'build', {tile: 1}, config, c); assert.equal(s.houses[1], 1);
  // Withdrawing, refusing, three counter-offers at most, three proposals a turn.
  s.owner[9] = 1; s.owner[11] = 1;
  propose({give: {cash: 500}, get: {tiles: [9]}});
  rejects(() => M.act(s, 1, 'cancelTrade', {}, config, c), 409);
  M.act(s, 0, 'cancelTrade', {}, config, c); assert.equal(s.trade, null); assert.equal(s.log.at(-1).kind, 'cancel');
  propose({give: {cash: 500}, get: {tiles: [9]}});
  M.act(s, 1, 'rejectTrade', {}, config, c); assert.equal(s.log.at(-1).kind, 'reject');
  rejects(() => propose({give: {cash: 500}, get: {tiles: [11]}}), 409, /3 次/);
  M.act(s, 0, 'end', {}, config, c);
  s.turn = 0; s.phase = 'manage';
  propose({give: {cash: 500}, get: {tiles: [9]}});
  M.act(s, 1, 'counterTrade', {give: {tiles: [9]}, get: {cash: 900}}, config, c);
  M.act(s, 0, 'counterTrade', {give: {cash: 700}, get: {tiles: [9]}}, config, c);
  M.act(s, 1, 'counterTrade', {give: {tiles: [9]}, get: {cash: 800}}, config, c);
  rejects(() => M.act(s, 0, 'counterTrade', {give: {cash: 750}, get: {tiles: [9]}}, config, c), 409, /3 次/);
  // Nobody answers in time: refused, and that counts as a missed step.
  M.timeout(s, config, c);
  assert.deepEqual([s.trade, s.log.at(-1).kind, s.log.at(-1).late, s.players[0].missed], [null, 'reject', true, 1]);
});

test('tycoon computer: trading for a group, swaps, counter-offers, reasons, bidding, building where opponents land, 托管', () => {
  // A regular computer asks for the last city of a group, for cash at a premium.
  let {config, c, s} = game(3);
  s.owner[5] = 1; s.owner[6] = 1; s.owner[7] = 0; s.turn = 1; s.phase = 'manage';
  let plan = M.bot(s, 1, 'normal', queue([]));
  assert.equal(plan.action, 'proposeTrade');
  assert.deepEqual(plan.data, {to: 0, give: {tiles: [], cash: 1800}, get: {tiles: [7], cash: 0}, aim: 2, why: {c: 'want', g: 2, s: 0}});
  M.act(s, 1, plan.action, plan.data, config, asBot(c));
  assert.deepEqual(s.log.at(-1).why, {c: 'want', g: 2, s: 0, by: 1});
  // She asks for more than it is worth to it: it offers the difference (up to what completing a group is worth).
  M.act(s, 0, 'counterTrade', {give: {tiles: [7]}, get: {cash: 3500}}, config, c);
  plan = M.bot(s, 1, 'normal', queue([]));
  // 3,500 for a city worth 1,200 × 2.5 = 3,000 to it: 500 short; it offers 3,500 − 500 × 1.05 (rounded up to tens).
  assert.equal(plan.action, 'counterTrade'); assert.equal(plan.data.give.cash, 2970); assert.deepEqual(plan.data.get, {tiles: [7], cash: 0});
  M.act(s, 1, plan.action, plan.data, config, asBot(c));
  M.act(s, 0, 'rejectTrade', {}, config, c);
  // Turned down: it does not ask her for that group again for three rounds.
  s.proposed = 0;
  assert.equal(M.bot(s, 1, 'normal', queue([])).action, 'end');
  s.round += 3;
  assert.equal(M.bot(s, 1, 'normal', queue([])).action, 'proposeTrade');
  // Selling her the city that completes her group: a regular computer wants twice its price, a sharp one refuses.
  ({config, c, s} = game(3));
  s.owner[5] = 0; s.owner[6] = 0; s.owner[7] = 1;
  M.act(s, 0, 'proposeTrade', {to: 1, give: {cash: 1800}, get: {tiles: [7]}}, config, c);
  plan = M.bot(s, 1, 'normal', queue([]));
  assert.equal(plan.action, 'counterTrade'); assert.equal(plan.data.get.cash, 2430); assert.deepEqual(plan.data.why, {c: 'ask', n: 2430});
  assert.deepEqual(M.bot(s, 1, 'smart', queue([])).data.why, {c: 'gift', g: 2, s: 0});
  assert.equal(M.bot(s, 1, 'normal', queue([]), {auto: true}).action, 'rejectTrade', '托管 never trades');
  M.act(s, 1, plan.action, plan.data, config, asBot(c));
  M.act(s, 0, 'acceptTrade', {}, config, c);
  assert.equal(s.owner[7], 0);
  // A sharp computer offers a swap that completes a group for each side.
  ({config, c, s} = game(3));
  s.owner[5] = 1; s.owner[6] = 1; s.owner[3] = 1; s.owner[7] = 0; s.owner[1] = 0; s.turn = 1; s.phase = 'manage';
  plan = M.bot(s, 1, 'smart', queue([]));
  assert.deepEqual(plan.data, {to: 0, give: {tiles: [3], cash: 500}, get: {tiles: [7], cash: 0}, aim: 2, why: {c: 'swap', g: 2, s: 0, t: 3}});
  M.act(s, 1, plan.action, plan.data, config, asBot(c));
  // For her it completes 西北's neighbour group 1 and hands the computer group 2.
  const value = M.tradeValue(s, 0, s.trade, M.LEVELS.normal);
  assert.deepEqual(value.gains, [1]); assert.deepEqual(value.gifts, [2]);
  // Building: on the group opponents are most likely to land on next, with the reason.
  ({config, c, s} = game(3));
  for (const i of [5, 6, 7, 9, 11, 12]) s.owner[i] = 1;
  // Seat 0 stands 6, 8 and 9 squares before group 3 (and 2–4 before group 2); seat 2 is far from both.
  s.players[0].pos = 3; s.players[2].pos = 20; s.turn = 1; s.phase = 'manage';
  plan = M.bot(s, 1, 'normal', queue([]));
  assert.equal(plan.action, 'build'); assert.equal(M.TILES[plan.data.tile].group, 3);
  assert.deepEqual(plan.data.why, {c: 'ahead', s: 0, n: 6, g: 3, t: plan.data.tile});
  M.act(s, 1, plan.action, plan.data, config, asBot(c));
  assert.equal(s.log.at(-1).why.c, 'ahead');
  // Reasons only come from the computer.
  M.act(s, 1, 'build', {tile: 11, why: {c: 'complete', g: 7}}, config, c);
  assert.equal(s.log.at(-1).why, undefined);
  // Bidding: more for land that completes its group; 托管 folds.
  ({config, c, s} = game(3));
  s.owner[1] = 1;
  roll(s, config, c, 1, 2); M.act(s, 0, 'pass', {}, config, c);  // 3: 西宁, 700
  plan = M.bot(s, 1, 'normal', queue([]));
  assert.equal(plan.action, 'bid'); assert.deepEqual(plan.data.why, {c: 'complete', g: 1, t: 3});
  assert.equal(M.bot(s, 1, 'normal', queue([]), {auto: true}).action, 'fold');
  // A timed-out step taken by the computer still writes its reason; buying records why.
  ({config, c, s} = game(3));
  c.rng = queue([0.5, 0.5, die(1), die(4)]); M.timeout(s, config, c);
  c.rng = queue([0.5, 0.5, 0.5]); M.timeout(s, config, c);
  assert.equal(s.log.find(e => e.kind === 'buy' || e.kind === 'pass')?.why?.by, 0);
});

test('tycoon computer-only tables in every mode finish with consistent books, trading and bidding', () => {
  let seed = 41; const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const levels = ['smart', 'normal', 'easy', 'normal', 'smart'];
  const seen = {trade: 0, counter: 0, won: 0, unsold: 0, propose: 0, why: 0};
  for (const [players, mode] of [[2, 'classic'], [3, 'rounds'], [4, 'time'], [5, 'classic'], [4, 'rounds'], [3, 'classic']]) {
    const config = M.settings({players, limit: 45, auction: 1, trade: 1, mode, rounds: 15, minutes: 30}), c = ctx(rng, 0);
    const s = M.setup(config, players, c);
    let steps = 0;
    for (; steps < 40000 && !c.result; steps++) {
      const seat = M.actor(s), plan = M.bot(s, seat, levels[seat], rng);
      assert.ok(plan, 'a plan in ' + s.phase);
      M.act(s, seat, plan.action, plan.data, config, asBot(c));
      c.now += 900;
      assert.ok(s.players.every(p => p.cash >= 0), 'no negative cash');
      for (const [i, h] of Object.entries(s.houses)) assert.ok(h >= 1 && h <= 4 && !s.mortgaged[i] && s.owner[i] != null);
      for (const o of Object.values(s.owner)) assert.equal(s.players[o].out, false);
      if (s.trade) assert.ok(!s.players[s.trade.from].out && !s.players[s.trade.to].out);
      assert.ok(s.fx.length <= 40 && s.fx.every((f, k) => !k || f.id > s.fx[k - 1].id), 'effects in order');
      for (const e of s.log.filter(x => x.seq === s.seq - 1)) { if (e.kind in seen) seen[e.kind]++; if (e.why) seen.why++; }
    }
    assert.ok(c.result, players + ' players, ' + mode + ': finished after ' + steps + ' moves');
    assert.ok(['rounds', 'bankrupt', 'cap', 'time'].includes(c.result.reason));
    if (mode === 'rounds') assert.ok(c.result.reason === 'rounds' || c.result.reason === 'bankrupt');
    assert.equal(s.history.at(-1).length, players);
  }
  for (const kind of ['trade', 'won', 'propose', 'why']) assert.ok(seen[kind] > 0, kind + ' happened (' + JSON.stringify(seen) + ')');
});

test('tycoon view and animations: the order of events, the clock waits for them, public trade and auction', () => {
  const {config, c, s} = game(3);
  roll(s, config, c, 2, 3);  // 5: 兰州
  const v = M.view(s);
  assert.deepEqual(v.fx.map(f => f.t), ['dice', 'walk']);
  assert.deepEqual(v.fx[1].path, [0, 1, 2, 3, 4, 5]);
  assert.equal(c.timer, 45000 + 1000 + 150 + 250 * 5, 'the next step’s clock starts after the animation');
  assert.equal(v.actor, 0); assert.equal(v.mode, 'rounds'); assert.deepEqual(v.rules, {trade: true, auction: true});
  assert.deepEqual(v.limits, {step: 100, counters: 3, proposals: 3, tiles: 6});
  assert.equal('memo' in v, false); assert.equal('anim' in v, false);
  M.act(s, 0, 'pass', {}, config, c);
  assert.deepEqual(M.view(s).auction.order, [1, 2, 0]);
});
