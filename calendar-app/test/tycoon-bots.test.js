'use strict';
// v2.4.3.4: 大富翁 — bankruptcy settled with the bank, and the computer's new judgement: a reserve that grows with the
// rent ahead, the rounds still to come, trades valued by what land will earn or cost, sales when short of cash, buying a
// group up from two players, and bids up to near the price.
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../play-monopoly');
const queue = values => { const list = values.slice(); return () => list.length ? list.shift() : 0.5; };
const die = n => (n - 1) / 6 + 0.01;
function ctx(rng = queue([]), now = 0) { const c = {rng, now, timer: null, result: null, autos: []}; Object.assign(c, {setTimer: ms => { c.timer = ms; }, clearTimer: () => { c.timer = null; }, finish: r => { c.result = r; }, auto: s => c.autos.push(s)}); return c; }
function game(players = 3, extra = {}) { const config = M.settings({players, limit: 45, auction: 1, trade: 1, ...extra}), c = ctx(queue([0])); const s = M.setup(config, players, c); s.turn = 0; s.first = 0; return {config, c, s}; }
const roll = (s, config, c, a, b) => { c.rng = queue([die(a), die(b)]); M.act(s, s.turn, 'roll', {}, config, c); };
const asBot = c => ({...c, bot: true});
const bot = (s, seat, level, opts) => M.bot(s, seat, level, queue([]), opts);

test('tycoon bankruptcy: the bank buys everything, the creditor is paid up to the debt, the land goes back', () => {
  // Owing 7,840 at 上海's hotel with 100 in cash, 拉萨 (360 to the bank) and a mortgaged 昆明 (140): bankrupt at once.
  let {config, c, s} = game(3);
  for (const i of [29, 30, 31]) { s.owner[i] = 1; s.houses[i] = 4; }
  s.owner[1] = 0; s.owner[9] = 0; s.mortgaged[9] = true; s.players[0].cash = 100; s.players[0].free = 1; s.players[0].pos = 27;
  roll(s, config, c, 1, 3);
  assert.equal(s.players[0].out, true);
  assert.deepEqual([s.owner[1], s.owner[9], s.mortgaged[9]], [undefined, undefined, undefined], 'the land is the bank’s again');
  assert.equal(s.players[1].cash, M.START + 600); assert.equal(s.players[1].free, 0, 'free cards go back too');
  assert.deepEqual(s.log.find(e => e.kind === 'bankrupt'), {...s.log.find(e => e.kind === 'bankrupt'), seat: 0, to: 1, amount: 600, liquidate: true});
  assert.ok(s.fx.some(f => f.t === 'coins' && f.from === 0 && f.to === 1 && f.amount === 600));
  assert.equal(M.view(s).owner[1], undefined); assert.equal(M.view(s).liquidate, true);
  assert.deepEqual(M.view(s).rules, {trade: true, auction: true}, 'the v2.4.3.3 rules object is unchanged');
  // Declaring bankruptcy with more than the debt: the creditor gets just what was owed; houses go with the land.
  ({config, c, s} = game(3));
  for (const i of [29, 30, 31]) s.owner[i] = 1; s.houses[31] = 1; s.houses[29] = 1; s.houses[30] = 1;
  for (const i of [5, 6, 7]) { s.owner[i] = 0; s.houses[i] = 2; }
  s.players[0].cash = 500; s.players[0].pos = 27;
  roll(s, config, c, 1, 3);  // 上海 with a house: 1,400
  assert.equal(s.phase, 'debt');
  M.act(s, 0, 'bankrupt', {}, config, c);
  assert.equal(s.players[1].cash, M.START + 1400);
  assert.deepEqual([5, 6, 7].map(i => [s.owner[i], s.houses[i]]), [[undefined, undefined], [undefined, undefined], [undefined, undefined]]);
  // Owing the bank (an 800 fine, with land worth 960 to the bank), nobody is paid.
  ({config, c, s} = game(3));
  s.owner[1] = 0; s.owner[5] = 0; s.players[0].cash = 0;
  s.decks.chance.order = [M.CHANCE.findIndex(k => k.id === 'fine')]; s.decks.chance.pos = 0;
  roll(s, config, c, 1, 1);
  assert.equal(s.phase, 'debt'); M.act(s, 0, 'bankrupt', {}, config, c);
  assert.deepEqual([s.owner[1], s.owner[5], s.players[1].cash, s.players[2].cash], [undefined, undefined, M.START, M.START]);
  assert.equal(s.log.find(e => e.kind === 'bankrupt').amount, 0);
  // A room made before v2.4.3.4 keeps handing everything to the creditor.
  ({config, c, s} = game(3));
  delete s.liquidate;
  assert.equal(M.view(s).liquidate, false);
  for (const i of [29, 30, 31]) { s.owner[i] = 1; s.houses[i] = 4; }
  s.owner[1] = 0; s.players[0].cash = 100; s.players[0].pos = 27;
  roll(s, config, c, 1, 3);
  assert.deepEqual([s.owner[1], s.players[1].cash], [1, M.START + 100]);
  assert.equal(s.log.find(e => e.kind === 'bankrupt').liquidate, undefined);
});

test('tycoon computer reserve: the rent ahead (one roll for easy, two otherwise), multipliers and a cap', () => {
  let {s} = game(3);
  assert.deepEqual(['easy', 'normal', 'smart'].map(l => Math.round(M.reserveOf(s, 1, M.LEVELS[l]))), [600, 1000, 1000], 'nothing owned: the fixed amount');
  // Hotels on 29–31 stand 7–9 squares ahead of seat 1 (one roll) …
  for (const i of [29, 30, 31]) { s.owner[i] = 2; s.houses[i] = 4; }
  s.players[1].pos = 22;
  const near = ['easy', 'normal', 'smart'].map(l => Math.round(M.reserveOf(s, 1, M.LEVELS[l])));
  assert.ok(near[0] > 3000, 'easy keeps cash for the next roll');
  assert.equal(near[2], 5250, 'never more than 35 % of the net worth');
  // … or 13–15 squares ahead (only the second roll): easy does not look that far.
  s.players[1].pos = 16;
  assert.equal(Math.round(M.reserveOf(s, 1, M.LEVELS.easy)), 600);
  assert.ok(M.reserveOf(s, 1, M.LEVELS.normal) > 1500);
  // A boom raises the rent ahead and so the reserve; a slump lowers it.
  const before = M.reserveOf(s, 1, M.LEVELS.normal);
  s.effects.push({kind: 'boom', factor: 1.5, until: s.turns + 3}); assert.ok(M.reserveOf(s, 1, M.LEVELS.normal) > before);
  s.effects = [{kind: 'slump', factor: 0.5, until: s.turns + 3}]; assert.ok(M.reserveOf(s, 1, M.LEVELS.normal) < before);
});

test('tycoon computer horizon: rounds left, the pace of a timed game, a guess for classic, the margin that settles', () => {
  let {config, c, s} = game(3, {rounds: 20});
  assert.equal(M.horizon(s), 20); assert.equal(M.progress(s), 0);
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' ≈ ' + b);
  s.round = 13; assert.equal(M.horizon(s), 8); near(M.progress(s), 0.6);
  near(M.margin(s, M.LEVELS.normal), 0.2); near(M.margin(s, M.LEVELS.smart), 0.25);
  s.round = 7; near(M.margin(s, M.LEVELS.normal), 0.05 + 0.15 * (6 / 20) / 0.6);
  s.round = 18; near(M.margin(s, M.LEVELS.normal), 0.2);
  s.round = 1; near(M.margin(s, M.LEVELS.normal), 0.05); assert.equal(M.margin(s, M.LEVELS.easy), 0);
  // Timed: 3 rounds in 6 minutes, 24 minutes left: 12 more. A pause does not count.
  ({config, c, s} = game(3, {mode: 'time', minutes: 30}));
  assert.equal(M.horizon(s), 15, 'a guess before the first round is over');
  s.round = 4; s.clockAt = 6 * 60000; assert.equal(M.horizon(s), 12);
  M.resume(s, {pausedFor: 60000}); s.clockAt += 60000;
  assert.equal(M.horizon(s), 12);
  // Moves record the time.
  c.now = 7 * 60000; s.phase = 'manage'; M.act(s, 0, 'end', {}, config, c); assert.equal(s.clockAt, 7 * 60000);
  ({config, c, s} = game(3, {mode: 'classic'}));
  assert.equal(M.horizon(s), 20);
});

test('tycoon computer trades: the 10,000-for-1,600 offer, cash that counts more when short, a city closer', () => {
  // She has 昆明 and 贵阳 and offers 10,000 for 南宁 (1,600), the sharp computer's: it completes her 西南.
  const offer = (round, cash) => {
    const {config, c, s} = game(3);
    s.owner[9] = 0; s.owner[11] = 0; s.owner[12] = 1; s.round = round; s.players[0].cash = 20000; s.players[1].cash = cash;
    M.act(s, 0, 'proposeTrade', {to: 1, give: {cash: 10000}, get: {tiles: [12]}}, config, c);
    return {s, plan: bot(s, 1, 'smart')};
  };
  // Early, with plenty of cash, it is worth more to keep her from hotels for twenty rounds: it asks for more …
  let {s, plan} = offer(1, 15000);
  assert.equal(plan.action, 'counterTrade'); assert.ok(plan.data.get.cash > 10000 && plan.data.get.cash < 12000, 'asks ' + plan.data.get.cash);
  assert.deepEqual(M.tradeValue(s, 1, s.trade, M.LEVELS.smart).gifts, [3]);
  // … nearly out of cash, or with fewer rounds to go, it takes it.
  assert.equal(offer(1, 800).plan.action, 'acceptTrade');
  assert.equal(offer(12, 15000).plan.action, 'acceptTrade');
  assert.equal(offer(18, 800).plan.action, 'acceptTrade');
  // Cash counts twice while it owes a debt it cannot pay.
  ({s} = offer(1, 15000));
  s.trade = null; s.turn = 1; s.phase = 'debt'; s.pending = {amount: 20000, to: 0, reason: 'rent'};
  assert.equal(M.tradeValue(s, 1, {from: 0, to: 1, give: {tiles: [], cash: 100}, get: {tiles: [12], cash: 0}}, M.LEVELS.smart).w, 2);
  // A city that brings it closer to a group (two of three, the bank has the third) is welcome at an even price; easy
  // no longer accepts a trade it loses on.
  const {config, c, s: t} = game(3);
  t.owner[14] = 1; t.owner[15] = 0;
  M.act(t, 0, 'proposeTrade', {to: 1, give: {tiles: [15]}, get: {cash: 1800}}, config, c);
  assert.deepEqual(bot(t, 1, 'normal').data.why, {c: 'closer', g: 4});
  M.act(t, 0, 'cancelTrade', {}, config, c);
  t.owner[1] = 1; t.owner[3] = 0; t.proposed = 0;
  M.act(t, 0, 'proposeTrade', {to: 1, give: {cash: 500}, get: {tiles: [1]}}, config, c);
  plan = bot(t, 1, 'easy');
  assert.equal(plan.action, 'counterTrade', 'easy asks for more rather than accept a loss'); assert.ok(plan.data.get.cash > 500);
});

test('tycoon computer sales: short of cash it offers land to a player who can use it, easy below its value', () => {
  const debt = () => {
    const g = game(3);
    g.s.owner[7] = 1; g.s.owner[5] = 0; g.s.owner[6] = 0; g.s.owner[9] = 1; g.s.owner[11] = 2;
    g.s.turn = 1; g.s.phase = 'debt'; g.s.pending = {amount: 3000, to: 2, reason: 'rent'}; g.s.players[1].cash = 200;
    return g;
  };
  let {config, c, s} = debt();
  const asks = ['easy', 'normal', 'smart'].map(l => bot(s, 1, l).data);
  for (const d of asks) assert.deepEqual([d.to, d.give, d.get.tiles, d.why.c, d.why.t], [0, {tiles: [7], cash: 0}, [], 'sale', 7], 'the city that completes her group');
  assert.ok(asks[0].get.cash < asks[1].get.cash && asks[1].get.cash < asks[2].get.cash, 'easy asks least: ' + asks.map(d => d.get.cash));
  assert.equal(bot(s, 1, 'easy', {auto: true}).action, 'mortgage', '托管 raises money itself');
  // Refused: it offers 昆明 to seat 2 (who has 贵阳); refused again (two a turn): it raises the money.
  M.act(s, 1, 'proposeTrade', asks[0], config, asBot(c));
  M.act(s, 0, 'rejectTrade', {}, config, c);
  let plan = bot(s, 1, 'easy');
  assert.deepEqual([plan.data.to, plan.data.give.tiles, plan.data.why.c], [2, [9], 'sale']);
  M.act(s, 1, plan.action, plan.data, config, asBot(c));
  M.act(s, 2, 'rejectTrade', {}, config, c);
  assert.equal(bot(s, 1, 'easy').action, 'mortgage');
  // Easy's price is below what the city is worth to it (a fifth of its price at most); a regular computer's is not.
  ({config, c, s} = debt());
  const worth = (level, cash) => M.tradeValue(s, 1, {from: 1, to: 0, give: {tiles: [7], cash: 0}, get: {tiles: [], cash}}, M.LEVELS[level]).value;
  assert.ok(worth('easy', asks[0].get.cash) < 0 && worth('easy', asks[0].get.cash) >= -240);
  assert.ok(worth('normal', asks[1].get.cash) >= 0);
  // She counters lower than that: it keeps to its price.
  M.act(s, 1, 'proposeTrade', asks[0], config, asBot(c));
  M.act(s, 0, 'counterTrade', {give: {cash: asks[0].get.cash - 300}, get: {tiles: [7]}}, config, c);
  plan = bot(s, 1, 'easy');
  assert.equal(plan.action, 'counterTrade'); assert.ok(plan.data.get.cash >= asks[0].get.cash, 'asks ' + plan.data.get.cash);
  // Not short of cash: easy never proposes; without trading the sale is not an option.
  ({config, c, s} = game(3));
  s.owner[5] = 1; s.owner[6] = 1; s.owner[7] = 0; s.turn = 1; s.phase = 'manage';
  assert.equal(bot(s, 1, 'easy').action, 'end');
  ({config, c, s} = game(3, {trade: 0}));
  s.owner[7] = 1; s.owner[5] = 0; s.turn = 1; s.phase = 'debt'; s.pending = {amount: 3000, to: 2, reason: 'rent'}; s.players[1].cash = 200;
  assert.equal(bot(s, 1, 'easy').action, 'mortgage');
});

test('tycoon computer requests: two missing cities, offers that shrink late, buying a group up from two players', () => {
  // A regular computer with 合肥 asks seat 0 for 长沙 and 武汉 together; the offer shrinks as the game runs out.
  let {config, c, s} = game(3);
  s.owner[17] = 1; s.owner[14] = 0; s.owner[15] = 0; s.turn = 1; s.phase = 'manage';
  let plan = bot(s, 1, 'normal');
  assert.deepEqual([plan.action, plan.data.to, plan.data.get.tiles, plan.data.why.c], ['proposeTrade', 0, [14, 15], 'want']);
  const early = plan.data.give.cash;
  assert.ok(early >= 3600 * 1.2, 'at least the premium: ' + early);
  s.round = 10; assert.ok(bot(s, 1, 'normal').data.give.cash < early);
  s.round = 18; assert.equal(bot(s, 1, 'normal').action, 'end', 'too late to pay a premium');
  // The sharp computer with 南京, in the second half: 苏州 (seat 0) and 杭州 (seat 2) belong to two players. It asks the
  // poorer one first, at least the price.
  ({config, c, s} = game(3));
  s.owner[19] = 1; s.owner[20] = 0; s.owner[21] = 2; s.players[2].cash = 9000; s.turn = 1; s.phase = 'manage';
  s.round = 5; assert.equal(bot(s, 1, 'smart').action, 'end', 'not in the first half');
  s.round = 12;
  assert.equal(bot(s, 1, 'normal').action, 'end', 'only the sharp computer gathers a group');
  plan = bot(s, 1, 'smart');
  assert.deepEqual([plan.data.to, plan.data.get.tiles, plan.data.why], [2, [21], {c: 'plan', g: 5, s: 2, t: 21}]);
  assert.ok(plan.data.give.cash >= 2400);
  M.act(s, 1, plan.action, plan.data, config, asBot(c));
  M.act(s, 2, 'acceptTrade', {}, config, c);
  // With 杭州 it now asks seat 0 for the last one like any other request; two proposals a turn in the second half.
  plan = bot(s, 1, 'smart');
  assert.deepEqual([plan.data.to, plan.data.get.tiles, plan.data.why.c], [0, [20], 'want']);
  M.act(s, 1, plan.action, plan.data, config, asBot(c));
  M.act(s, 0, 'rejectTrade', {}, config, c);
  assert.equal(s.proposed, 2); assert.equal(bot(s, 1, 'smart').action, 'end');
});

test('tycoon computer play: no random passes, every level blocks and builds to a hotel, bids up to near the price', () => {
  // Easy no longer passes at random (the old 20 %), and blocks a group.
  let {config, c, s} = game(3);
  s.owner[5] = 2; s.owner[6] = 2; s.turn = 1; s.players[1].pos = 3;
  c.rng = queue([die(2), die(2)]); M.act(s, 1, 'roll', {}, config, c);  // 7: 呼和浩特
  assert.equal(s.phase, 'buy');
  const choice = M.bot(s, 1, 'easy', () => 0);
  assert.deepEqual([choice.action, choice.data.why.c], ['buy', 'block']);
  // A fourth level (the hotel) at every level, with cash to spare.
  ({config, c, s} = game(3));
  for (const i of [5, 6, 7]) { s.owner[i] = 1; s.houses[i] = 3; }
  s.turn = 1; s.phase = 'manage';
  for (const level of ['easy', 'normal', 'smart']) assert.equal(bot(s, 1, level).action, 'build', level);
  M.act(s, 1, 'build', {tile: 5}, config, c); assert.equal(s.houses[5], 4);
  // Auctions: with 1,500 in cash a regular computer would keep its whole 1,000 reserve and stop at 500, but land under
  // its price adds to its net worth, so it goes on to 850 (85 %) keeping half the reserve.
  ({config, c, s} = game(3));
  roll(s, config, c, 1, 4); M.act(s, 0, 'pass', {}, config, c);  // 兰州, 1,000
  s.players[1].cash = 1500;
  assert.deepEqual(bot(s, 1, 'normal').data.why, {c: 'cheap', t: 5});
  s.auction.bid = 750; s.auction.leader = 0;
  assert.deepEqual(bot(s, 1, 'normal').data, {amount: 850, why: {c: 'cheap', t: 5}});
  s.auction.bid = 850;
  assert.deepEqual(bot(s, 1, 'normal').data, {why: {c: 'limit', n: 850, t: 5}});
  assert.equal(bot(s, 1, 'smart').data.amount, 950);
});
