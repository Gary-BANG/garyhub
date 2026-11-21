'use strict';
// v2.4.3.2: 骰子抢宝箱 — moving on the map, carrying and opening chests, duels, spikes, traps, items, the end, timeouts
// and the computer player.
const test = require('node:test'), assert = require('node:assert/strict');
const T = require('../play-treasure');
const queue = values => { const list = values.slice(); return () => list.length ? list.shift() : 0.5; };
function ctx(rng = queue([])) { const c = {rng, timer: null, result: null, auto: []}; Object.assign(c, {setTimer: ms => { c.timer = ms; }, clearTimer: () => { c.timer = null; }, finish: r => { c.result = r; }, auto: s => c.autos.push(s), autos: []}); return c; }
const at = (r, c) => r * T.SIZE + c;
const rejects = (fn, status, pattern) => assert.throws(fn, e => e.status === status && (!pattern || pattern.test(e.message)));

test('treasure map: settings, reach with walls and quicksand, paths that avoid spikes', () => {
  assert.deepEqual(T.settings({}), {players: 2, limit: 20, rounds: 12});
  for (const bad of [{players: 5}, {players: 1}, {limit: 30}, {rounds: 10}]) assert.throws(() => T.settings(bad), e => e.status === 400);
  assert.equal(T.kind(at(1, 1)), '#'); assert.equal(T.kind(at(3, 2)), 'q'); assert.equal(T.kind(at(2, 3)), 'x');
  const r = T.reach(at(0, 0), 2);
  assert.equal(r[at(1, 1)], undefined, 'walls block'); assert.equal(r[at(0, 2)], 2); assert.equal(r[at(2, 0)], 2);
  // Quicksand stops a walk but can be left.
  const q = T.reach(at(3, 1), 3);
  assert.equal(q[at(3, 2)], 1); assert.equal(q[at(3, 3)], undefined, 'no walking on past quicksand');
  assert.equal(T.reach(at(3, 2), 1)[at(3, 3)], 1, 'leaving quicksand is fine');
  // Two equally short ways from (2,2) to (2,4): through the spikes at (2,3) or around — around is preferred only if as short.
  const p = T.path(at(1, 3), at(3, 3), 2);
  assert.deepEqual(p, [at(1, 3), at(2, 3), at(3, 3)]);
  const around = T.path(at(2, 2), at(2, 4), 4);
  assert.ok(around.length === 5 || around.includes(at(2, 3)));
});

test('treasure rules: turns, carrying, opening at the base, spikes, duels, traps, items, hidden information', () => {
  const config = T.settings({players: 3, limit: 20}), c = ctx(queue([0.1, 0.5, 0.9, 0.2, 0.7, 0.3]));
  const s = T.setup(config, 3, c);
  assert.equal(s.goal, 15); assert.equal(s.players.length, 3); assert.equal(s.chests.length, 3); assert.equal(c.timer, 20000);
  assert.deepEqual(s.players.map(p => p.base), [T.BASES[0], T.BASES[1], T.BASES[2]]);
  rejects(() => T.act(s, 1, 'roll', {}, config, c), 409, /轮到/);
  rejects(() => T.act(s, 0, 'move', {to: 1}, config, c), 409);
  // Seat 0 carries a chest: one step less.
  s.players[0].carry = {type: 'silver', value: 5};
  c.rng = queue([3 / 6]); T.act(s, 0, 'roll', {}, config, c);
  assert.deepEqual([s.roll, s.steps, s.phase], [4, 3, 'move']); assert.equal(c.timer, 20000);
  rejects(() => T.act(s, 0, 'move', {to: at(6, 6)}, config, c), 400);
  // Back home: the chest is opened and counted.
  s.players[0].pos = at(0, 2);
  const before = s.chests.length;
  T.act(s, 0, 'move', {to: at(0, 0)}, config, c);
  assert.deepEqual([s.players[0].gold, s.players[0].banked, s.players[0].carry, s.turn], [5, 1, null, 1]);
  assert.equal(s.chests.length, before + 1, 'a new chest appears');
  // Nobody ever sees what an unopened chest holds.
  for (const seat of [0, 1, 2]) assert.ok(!JSON.stringify(T.view(s, seat).chests).includes('value'));
  // Seat 1 walks over spikes with a chest: it falls off there.
  s.players[1].pos = at(1, 3); s.players[1].carry = {type: 'gold', value: 8}; s.phase = 'move'; s.steps = 2;
  T.act(s, 1, 'move', {to: at(3, 3)}, config, c);
  assert.equal(s.players[1].carry, null); assert.ok(s.chests.some(ch => ch.pos === at(2, 3) && ch.type === 'gold'));
  // Seat 2 sets a trap next to itself; only seat 2 sees it.
  s.players[2].pos = at(4, 1); s.players[2].items = ['trap', 'shield'];
  rejects(() => T.act(s, 2, 'item', {item: 'trap', at: at(6, 6)}, config, c), 400);
  T.act(s, 2, 'item', {item: 'trap', at: at(4, 0)}, config, c);
  assert.deepEqual(T.view(s, 2).traps, [at(4, 0)]); assert.deepEqual(T.view(s, 0).traps, []);
  assert.deepEqual(T.view(s, 0).players[2].items, 1, 'others see only how many items');
  assert.deepEqual(T.view(s, 2).players[2].items, ['shield']);
  rejects(() => T.act(s, 2, 'item', {item: 'shield'}, config, c), 400, /自动/);
  c.rng = queue([0]); T.act(s, 2, 'roll', {}, config, c); T.act(s, 2, 'move', {to: at(4, 1)}, config, c);
  // Seat 0 walks into the trap with a chest and 3 gold: stops there, drops the chest, pays 2.
  s.players[0].pos = at(3, 0); s.players[0].carry = {type: 'wood', value: 3}; s.players[0].gold = 3;
  c.rng = queue([2 / 6]); T.act(s, 0, 'roll', {}, config, c);
  T.act(s, 0, 'move', {to: at(5, 0)}, config, c);
  assert.equal(s.players[0].pos, at(4, 0)); assert.equal(s.players[0].carry, null); assert.equal(s.players[0].gold, 1); assert.equal(s.players[2].gold, 2);
  assert.deepEqual(s.traps, []); assert.ok(s.last.trapped);
  // A duel: seat 1 stops on seat 0. Attacker rolls 6, defender 2: seat 1 takes the gold (seat 0 has 1).
  s.turn = 1; s.phase = 'move'; s.steps = 1; s.players[1].pos = at(5, 0); s.players[0].carry = null;
  c.rng = queue([5 / 6, 1 / 6]); T.act(s, 1, 'move', {to: at(4, 0)}, config, c);
  assert.deepEqual([s.last.duel.a, s.last.duel.d, s.last.duel.won], [6, 2, true]); assert.equal(s.players[0].gold, 0);
  // Defender wins ties; the attacker pays one gold. Then the shield stops a winning robbery.
  s.turn = 2; s.phase = 'move'; s.steps = 1; s.players[2].pos = at(5, 0); s.players[2].gold = 4;
  c.rng = queue([2 / 6, 2 / 6]); T.act(s, 2, 'move', {to: at(4, 0)}, config, c);
  assert.equal(s.last.duel.won, false); assert.equal(s.players[2].gold, 3);
  s.turn = 2; s.phase = 'move'; s.steps = 1; s.players[2].pos = at(5, 0); s.players[0].items = ['shield']; s.players[0].carry = {type: 'gold', value: 9};
  c.rng = queue([5 / 6, 0]); T.act(s, 2, 'move', {to: at(4, 0)}, config, c);
  assert.equal(s.players[0].carry.type, 'gold'); assert.deepEqual(s.players[0].items, []);
  // Boots after rolling, recall before rolling (a carried chest is opened at home).
  s.turn = 0; s.phase = 'roll'; s.players[0].items = ['boots', 'recall'];
  rejects(() => T.act(s, 0, 'item', {item: 'boots'}, config, c), 409);
  c.rng = queue([0]); T.act(s, 0, 'roll', {}, config, c);
  T.act(s, 0, 'item', {item: 'boots'}, config, c); assert.equal(s.steps, 4);
  rejects(() => T.act(s, 0, 'item', {item: 'recall'}, config, c), 409);
  T.act(s, 0, 'move', {to: s.players[0].pos}, config, c);
  s.turn = 0; s.phase = 'roll';
  T.act(s, 0, 'item', {item: 'recall'}, config, c);
  assert.equal(s.players[0].pos, s.players[0].base); assert.equal(s.players[0].gold, 10, '1 from the tie plus the gold chest'); assert.equal(s.turn, 1);
});

test('treasure end: goal, rounds, leaving, timeouts and 托管, and computer games', () => {
  let config = T.settings({players: 2}), c = ctx();
  let s = T.setup(config, 2, c);
  s.players[0].gold = 10; s.players[0].carry = {type: 'wood', value: 2}; s.players[0].pos = at(0, 1); s.phase = 'move'; s.steps = 1;
  T.act(s, 0, 'move', {to: at(0, 0)}, config, c);
  assert.deepEqual([c.result.winner, c.result.reason], [0, 'goal']);
  // The last round ends the game: most gold wins.
  c = ctx(); s = T.setup(config, 2, c); s.round = config.rounds; s.turn = 1; s.phase = 'move'; s.steps = 1; s.players[0].gold = 3; s.players[1].gold = 1;
  T.act(s, 1, 'move', {to: s.players[1].pos}, config, c);
  assert.deepEqual([c.result.winner, c.result.reason, c.result.rounds], [0, 'rounds', 12]);
  // Three players: one leaves (their chest stays on the map), the game goes on; a second leaves: it ends.
  config = T.settings({players: 3}); c = ctx(); s = T.setup(config, 3, c);
  s.players[1].carry = {type: 'gold', value: 7};
  T.leave(s, 1, config, c);
  assert.equal(s.players[1].out, true); assert.ok(s.chests.some(ch => ch.type === 'gold')); assert.equal(c.result, null);
  s.turn = 0; T.act(s, 0, 'roll', {}, config, c); T.act(s, 0, 'move', {to: s.players[0].pos}, config, c);
  assert.equal(s.turn, 2, 'the player who left is skipped');
  T.leave(s, 0, config, c); assert.deepEqual([c.result.winner, c.result.reason], [2, 'left']);
  // Timeouts: the computer plays the step; two in a row hand the seat over.
  config = T.settings({players: 2, limit: 20}); c = ctx(); s = T.setup(config, 2, c);
  T.timeout(s, config, c); assert.equal(s.phase, 'move'); assert.deepEqual(c.autos, []); assert.equal(c.timer, 20000);
  T.timeout(s, config, c); assert.equal(s.turn, 1); assert.deepEqual(c.autos, [0]);
  T.act(s, 1, 'roll', {}, config, c); assert.equal(s.players[1].missed, 0);
  // Computer-only games always end, with every chest accounted for.
  let seed = 3; const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (const [players, levels] of [[2, ['smart', 'easy']], [3, ['normal', 'smart', 'easy']], [4, ['normal', 'normal', 'smart', 'easy']]]) {
    config = T.settings({players}); c = ctx(rng); s = T.setup(config, players, c);
    for (let i = 0; i < 3000 && !c.result; i++) {
      const plan = T.bot(s, s.turn, levels[s.turn], rng);
      assert.ok(plan && plan.delay > 0);
      T.act(s, s.turn, plan.action, plan.data, config, c);
      assert.ok(s.players.every(p => p.gold >= 0));
      assert.ok(s.chests.length + s.players.filter(p => p.carry).length >= (players === 2 ? 2 : 3));
    }
    assert.ok(c.result, players + ' players finish'); assert.ok(['goal', 'rounds'].includes(c.result.reason));
    assert.equal(T.bot(s, s.turn, 'normal', rng), null);
  }
  assert.deepEqual(T.tally(T.tally(null, {winner: 1}), {winner: null}), {wins: {1: 1}, draws: 1, games: 2});
});
