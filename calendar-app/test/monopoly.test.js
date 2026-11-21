'use strict';
// v2.4.3.2: 大富翁 — the board, buying and rent, building, mortgages and selling, the rest stop and doubles, cards,
// debts and bankruptcy, the end of the game, timeouts and the computer player.
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../play-monopoly');
const queue = values => { const list = values.slice(); return () => list.length ? list.shift() : 0.5; };
// Dice are drawn as 1 + floor(rng * 6): die(n) is the rng value that rolls n.
const die = n => (n - 1) / 6 + 0.01;
function ctx(rng = queue([])) { const c = {rng, timer: null, result: null, autos: []}; Object.assign(c, {setTimer: ms => { c.timer = ms; }, clearTimer: () => { c.timer = null; }, finish: r => { c.result = r; }, auto: s => c.autos.push(s)}); return c; }
const rejects = (fn, status, pattern) => assert.throws(fn, e => e.status === status && (!pattern || pattern.test(e.message)));
function game(players = 3, extra = {}) { const config = M.settings({players, limit: 45, ...extra}), c = ctx(queue([0])); const s = M.setup(config, players, c); s.turn = 0; s.first = 0; return {config, c, s}; }
const roll = (s, config, c, a, b) => { c.rng = queue([die(a), die(b)]); M.act(s, s.turn, 'roll', {}, config, c); };

test('tycoon board: 32 squares, seven groups, corners and prices', () => {
  assert.equal(M.TILES.length, 32);
  assert.deepEqual([0, 8, 16, 24].map(i => M.TILES[i].kind), ['go', 'jail', 'park', 'gotojail']);
  assert.deepEqual(Object.values(M.GROUPS).map(g => g.length), [2, 3, 3, 3, 3, 3, 3]);
  assert.equal(M.TILES.filter(t => t.kind === 'property').length, 20);
  assert.deepEqual(['chance', 'news', 'tax', 'transit'].map(k => M.TILES.filter(t => t.kind === k).length), [3, 2, 1, 2]);
  const prices = Object.values(M.GROUPS).map(g => g.map(i => M.TILES[i].price));
  for (let g = 1; g < prices.length; g++) assert.ok(Math.min(...prices[g]) > Math.max(...prices[g - 1]), 'later groups cost more');
  // v2.4.3.3: without the new settings a room keeps the v2.4.3.2 rules (a number of rounds, no auction, no trading).
  assert.deepEqual(M.settings({}), {players: 4, rounds: 20, limit: 45, mode: 'rounds', minutes: 60, auction: 0, trade: 0});
  for (const bad of [{players: 6}, {rounds: 12}, {limit: 60}]) assert.throws(() => M.settings(bad), e => e.status === 400);
});

test('tycoon play: buying, rent, building, mortgages, selling, rest stop and doubles', () => {
  const {config, c, s} = game();
  assert.equal(s.players[0].cash, M.START); assert.equal(c.timer, 45000);
  rejects(() => M.act(s, 1, 'roll', {}, config, c), 409, /轮到/);
  roll(s, config, c, 1, 4);  // 5: 兰州
  assert.deepEqual([s.players[0].pos, s.phase, s.pending.tile], [5, 'buy', 5]);
  M.act(s, 0, 'buy', {}, config, c);
  assert.deepEqual([s.owner[5], s.players[0].cash, s.phase], [0, M.START - 1000, 'manage']);
  rejects(() => M.act(s, 0, 'build', {tile: 5}, config, c), 409, /整组/);
  M.act(s, 0, 'end', {}, config, c);
  assert.equal(s.turn, 1);
  // Seat 1 lands on it: base rent 80.
  roll(s, config, c, 2, 3);
  assert.equal(s.players[1].cash, M.START - 80); assert.equal(s.players[0].cash, M.START - 1000 + 80);
  M.act(s, 1, 'end', {}, config, c);
  // A whole group doubles the rent and allows even building.
  s.owner[6] = 0; s.owner[7] = 0;
  assert.equal(M.rent(s, 5), 160);
  s.turn = 0; s.phase = 'manage';
  M.act(s, 0, 'build', {tile: 5}, config, c);
  rejects(() => M.act(s, 0, 'build', {tile: 5}, config, c), 409, /平均/);
  M.act(s, 0, 'build', {tile: 6}, config, c); M.act(s, 0, 'build', {tile: 7}, config, c);
  assert.deepEqual([s.houses[5], s.houses[6], s.houses[7]], [1, 1, 1]); assert.equal(M.rent(s, 5), 400);
  rejects(() => M.act(s, 0, 'mortgage', {tile: 5}, config, c), 409, /房子/);
  M.act(s, 0, 'build', {tile: 5}, config, c);
  rejects(() => M.act(s, 0, 'sellHouse', {tile: 6}, config, c), 409, /平均/);
  const cash = s.players[0].cash;
  M.act(s, 0, 'sellHouse', {tile: 5}, config, c); assert.equal(s.players[0].cash, cash + 250);
  for (const i of [5, 6, 7]) M.act(s, 0, 'sellHouse', {tile: i}, config, c);
  M.act(s, 0, 'mortgage', {tile: 7}, config, c);
  assert.equal(M.rent(s, 5), 80, 'a mortgaged member breaks the group');
  rejects(() => M.act(s, 0, 'build', {tile: 5}, config, c), 409);
  M.act(s, 0, 'unmortgage', {tile: 7}, config, c); assert.equal(s.mortgaged[7], undefined);
  const before = s.players[0].cash; M.act(s, 0, 'sell', {tile: 7}, config, c); assert.equal(s.players[0].cash, before + 720); assert.equal(s.owner[7], undefined);
  rejects(() => M.act(s, 0, 'sell', {tile: 9}, config, c), 400);
  // Transit hubs: 250, both 600; effects change rents for a round.
  s.owner[13] = 2; assert.equal(M.rent(s, 13), 250); s.owner[28] = 2; assert.equal(M.rent(s, 13), 600);
  s.effects.push({kind: 'boom', factor: 1.5, until: s.turns + 3}); assert.equal(M.rent(s, 13), 900); s.effects = [];
  // Rest stop: three doubles in a row send you there; a double gets you out.
  M.act(s, 0, 'end', {}, config, c);
  s.turn = 1; s.players[1].pos = 0; s.phase = 'roll';
  roll(s, config, c, 1, 1); assert.equal(s.phase, s.players[1].pos === 2 ? s.phase : s.phase); assert.equal(s.players[1].doubles, 1);
  if (s.phase === 'buy') M.act(s, 1, 'pass', {}, config, c);
  if (s.phase === 'debt') M.act(s, 1, 'pay', {}, config, c);
  assert.equal(s.phase, 'roll', 'a double rolls again');
  roll(s, config, c, 2, 2); if (s.phase === 'buy') M.act(s, 1, 'pass', {}, config, c);
  roll(s, config, c, 3, 3);
  assert.deepEqual([s.players[1].pos, s.players[1].jail, s.phase], [M.JAIL, 1, 'manage']);
  M.act(s, 1, 'end', {}, config, c);
  s.turn = 1; s.phase = 'roll';
  roll(s, config, c, 2, 5); assert.equal(s.players[1].pos, M.JAIL); assert.equal(s.players[1].jail, 2);
  M.act(s, 1, 'end', {}, config, c); s.turn = 1; s.phase = 'roll';
  M.act(s, 1, 'payJail', {}, config, c); assert.equal(s.players[1].jail, 0);
  // Landing on "go to the rest stop".
  s.players[1].pos = 20; roll(s, config, c, 1, 3);
  assert.deepEqual([s.players[1].pos, s.players[1].jail], [M.JAIL, 1]);
});

test('tycoon cards, debts, bankruptcy, the end, timeouts and the computer', () => {
  let {config, c, s} = game(3);
  // Chance: birthday (300 from each other player).
  s.decks.chance.order = [M.CHANCE.findIndex(k => k.id === 'birthday')]; s.decks.chance.pos = 0;
  roll(s, config, c, 1, 1);  // to square 2 (chance)
  assert.equal(s.card.id, 'birthday'); assert.equal(s.players[0].cash, M.START + 600);
  if (s.phase === 'roll') { s.phase = 'manage'; s.players[0].again = false; }
  M.act(s, 0, 'end', {}, config, c);
  // News for everyone: a boom for one round, then it ends.
  s.decks.news.order = [M.NEWS.findIndex(k => k.id === 'boom')]; s.decks.news.pos = 0;
  s.players[1].pos = 7; roll(s, config, c, 1, 2);
  assert.ok(s.effects.some(e => e.kind === 'boom'));
  M.act(s, 1, 'end', {}, config, c);
  for (let k = 0; k < 3 && s.effects.length; k++) { s.phase = 'manage'; M.act(s, s.turn, 'end', {}, config, c); }
  assert.deepEqual(s.effects, [], 'news effects last one round');
  // Debt: not enough cash, but land to mortgage; then pay.
  ({config, c, s} = game(3));
  s.owner[31] = 1; s.owner[29] = 1; s.owner[30] = 1; s.houses[31] = 1; s.houses[29] = 1; s.houses[30] = 1;
  s.players[0].cash = 500; s.owner[1] = 0; s.owner[3] = 0; s.owner[9] = 0; s.players[0].pos = 27;
  roll(s, config, c, 1, 3);  // 31: 上海 with a house, rent 280 × 5 = 1,400
  assert.equal(s.phase, 'debt'); assert.equal(s.pending.amount, 1400); assert.equal(s.pending.to, 1);
  rejects(() => M.act(s, 0, 'pay', {}, config, c), 409, /不够/);
  rejects(() => M.act(s, 0, 'build', {tile: 1}, config, c), 409);
  M.act(s, 0, 'sell', {tile: 3}, config, c); M.act(s, 0, 'sell', {tile: 1}, config, c);
  assert.equal(s.players[0].cash, 500 + 420 + 360);
  rejects(() => M.act(s, 0, 'pay', {}, config, c), 409);
  M.act(s, 0, 'bankrupt', {}, config, c);
  assert.equal(s.players[0].out, true); assert.equal(s.players[1].cash, M.START + 1280); assert.equal(s.turn, 1);
  // A debt nobody could ever pay is bankruptcy at once; the land goes to the creditor (houses sold at half to them).
  ({config, c, s} = game(2));
  s.owner[29] = 1; s.owner[30] = 1; s.owner[31] = 1; for (const i of [29, 30, 31]) s.houses[i] = 4;
  s.owner[1] = 0; s.houses[1] = 0; s.players[0].cash = 100; s.players[0].pos = 27;
  roll(s, config, c, 1, 3);
  assert.equal(s.players[0].out, true); assert.equal(s.owner[1], 1); assert.deepEqual([c.result.winner, c.result.reason], [1, 'bankrupt']);
  // The last round: the highest net worth wins.
  ({config, c, s} = game(3, {rounds: 15}));
  s.round = 15; s.turn = 2; s.phase = 'manage'; s.players[1].cash = 40000;
  M.act(s, 2, 'end', {}, config, c);
  assert.deepEqual([c.result.reason, c.result.winner], ['rounds', 1]); assert.equal(c.result.ranking[0].worth, 40000);
  // Timeouts: the computer decides; two in a row hand the seat to it.
  ({config, c, s} = game(3));
  // The computer's planning draws two numbers (its delay) before the dice.
  c.rng = queue([0.5, 0.5, die(2), die(3)]); M.timeout(s, config, c);
  assert.deepEqual([s.players[0].pos, s.phase, s.players[0].missed], [5, 'buy', 1]);
  M.timeout(s, config, c); assert.equal(s.phase, 'manage', 'bought or passed for the absent player'); assert.deepEqual(c.autos, [0]);
  M.timeout(s, config, c); assert.equal(s.turn, 1);
  M.act(s, 1, 'roll', {}, config, c); assert.equal(s.players[1].missed, 0);
  // Computer-only tables of every size finish with consistent books.
  let seed = 17; const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (const players of [2, 3, 5]) {
    ({config, c, s} = game(players, {rounds: 15})); c.rng = rng;
    const levels = ['smart', 'normal', 'easy', 'normal', 'smart'];
    for (let i = 0; i < 8000 && !c.result; i++) {
      const plan = M.bot(s, s.turn, levels[s.turn], rng);
      assert.ok(plan, 'a plan in ' + s.phase);
      M.act(s, s.turn, plan.action, plan.data, config, c);
      assert.ok(s.players.every(p => p.cash >= 0));
      for (const [i2, h] of Object.entries(s.houses)) assert.ok(h >= 1 && h <= 4 && !s.mortgaged[i2] && s.owner[i2] != null);
      for (const o of Object.values(s.owner)) assert.equal(s.players[o].out, false);
    }
    assert.ok(c.result, players + ' players finish');
  }
  assert.deepEqual(M.tally(null, {winner: 2}), {wins: {2: 1}, draws: 0, games: 1});
});
