'use strict';
// Game rooms (v2.4.3.2): "大富翁 / Tycoon" for 2–5 players (computer players fill seats). An original 32-square board:
// twenty cities in seven colour groups, two transit hubs, chance and news cards, a tax office and a rest stop.
// Roll two dice and move; buy cities and hubs nobody owns; pay rent on someone else's (twice the base rent for a whole
// group, then 1–3 houses and a hotel); passing Start pays 2,000 (landing on it 3,000). Doubles roll again (three in a
// row: the rest stop). Raise money by selling houses, mortgaging or selling to the bank; a player who cannot pay a debt
// is bankrupt. After the last round the richest player (cash + land + buildings, mortgaged land at half) wins.
//
// v2.4.3.3: three ways to play (a number of rounds; classic, until one player is left; a time limit), trading between
// players with counter-offers, an auction for land the player who landed on it does not buy, the net worth of every
// player round by round (for the chart), an ordered list of what happened (dice, walks, money, cards) for the page to
// animate in turn, and the computer's reason for each decision in the log. Rooms created without the new settings, and
// games saved by v2.4.3.2, keep the old rules.
//
// The order of the card decks is the only secret. The computer keeps a cash reserve against the rents it might hit on
// its next roll, is a little greedy for land that completes or blocks a group, trades for the last city of a group,
// builds where opponents are likely to land, and sells and mortgages in a set order.

const fail = (status, message) => Object.assign(Error(message), {status});
const START = 15000, PASS_GO = 2000, LAND_GO = 3000, JAIL = 8, JAIL_FEE = 500, BOARD = 32, MISSES = 2;
const LIMITS = [0, 30, 45, 90], ROUNDS = [15, 20, 25, 30], MODES = ['rounds', 'classic', 'time'], MINUTES = [30, 60, 90];
// Classic and timed games stop after CAP rounds at the latest. Bids rise by at least STEP. A trade moves at most
// TRADE_TILES squares a side and may be countered COUNTERS times; a player proposes at most PROPOSALS a turn.
const CAP = 100, STEP = 100, TRADE_TILES = 6, COUNTERS = 3, PROPOSALS = 3, MEMORY = 3;
// How long the page's animations take at normal speed: the computer waits for them (up to LAG), and so does the clock.
const LAG = 3000;
const FX_MS = {dice: () => 1000, walk: e => 150 + 250 * (e.path.length - 1), jump: () => 500, coins: () => 600, card: () => 1500, trade: () => 600};
const HOUSE = {1: 500, 2: 500, 3: 1000, 4: 1000, 5: 1500, 6: 1500, 7: 2000};
const LEVEL = [1, 5, 12, 20, 28];
const ten = n => Math.round(n / 10) * 10;
const up10 = n => Math.ceil(n / 10) * 10;
const city = (zh, en, group, price) => ({kind: 'property', name: [zh, en], group, price, rent: ten(price * 0.08)});
const special = (kind, zh, en, extra = {}) => ({kind, name: [zh, en], ...extra});
const TILES = [
  special('go', '起点', 'Start'), city('拉萨', 'Lhasa', 1, 600), special('chance', '机会', 'Chance'), city('西宁', 'Xining', 1, 700),
  special('tax', '税务局', 'Tax office'), city('兰州', 'Lanzhou', 2, 1000), city('银川', 'Yinchuan', 2, 1000), city('呼和浩特', 'Hohhot', 2, 1200),
  special('jail', '休息站', 'Rest stop'), city('昆明', 'Kunming', 3, 1400), special('news', '新闻', 'News'), city('贵阳', 'Guiyang', 3, 1400),
  city('南宁', 'Nanning', 3, 1600), special('transit', '高铁站', 'Rail station', {price: 2000}), city('长沙', 'Changsha', 4, 1800), city('武汉', 'Wuhan', 4, 1800),
  special('park', '公园', 'Park'), city('合肥', 'Hefei', 4, 2000), special('chance', '机会', 'Chance'), city('南京', 'Nanjing', 5, 2200),
  city('苏州', 'Suzhou', 5, 2200), city('杭州', 'Hangzhou', 5, 2400), special('news', '新闻', 'News'), city('成都', 'Chengdu', 6, 2600),
  special('gotojail', '前往休息站', 'Go to the rest stop'), city('重庆', 'Chongqing', 6, 2600), city('西安', "Xi'an", 6, 2800), special('chance', '机会', 'Chance'),
  special('transit', '机场', 'Airport', {price: 2000}), city('广州', 'Guangzhou', 7, 3000), city('深圳', 'Shenzhen', 7, 3200), city('上海', 'Shanghai', 7, 3500)
];
const GROUPS = {};
TILES.forEach((t, i) => { if (t.group) (GROUPS[t.group] = GROUPS[t.group] || []).push(i); });
const TRANSITS = TILES.map((t, i) => t.kind === 'transit' ? i : -1).filter(i => i >= 0);
const BUYABLE = TILES.map((t, i) => t.price ? i : -1).filter(i => i >= 0);
// Cards: personal chance, and news for everyone. The page shows the words for each id.
const CHANCE = [{id: 'scholarship', gain: 1500}, {id: 'fine', pay: 800}, {id: 'start', to: 0}, {id: 'back', back: 3}, {id: 'transit'},
  {id: 'repairs', house: 200, hotel: 800}, {id: 'birthday', each: 300}, {id: 'free'}, {id: 'jail'}, {id: 'discount'}];
const NEWS = [{id: 'subsidy', all: 500}, {id: 'boom', factor: 1.5}, {id: 'slump', factor: 0.5}, {id: 'typhoon'}, {id: 'upkeep', house: 100, hotel: 400},
  {id: 'charity', give: 1000}, {id: 'interest', rate: 0.05, cap: 1000}, {id: 'transitFest', factor: 2}];

const flag = v => v === true ? 1 : v === false ? 0 : v;
function settings(input = {}) {
  const players = input.players ?? 4, rounds = input.rounds ?? 20, limit = input.limit ?? 45;
  const mode = input.mode ?? 'rounds', minutes = input.minutes ?? 60, auction = flag(input.auction ?? 0), trade = flag(input.trade ?? 0);
  if (![2, 3, 4, 5].includes(players)) throw fail(400, '玩家人数须为 2–5（可用电脑补位）');
  if (!MODES.includes(mode)) throw fail(400, '胜负方式只能是限定回合、经典或限时');
  if (!ROUNDS.includes(rounds)) throw fail(400, '回合数只能是 15、20、25 或 30');
  if (!MINUTES.includes(minutes)) throw fail(400, '限时只能是 30、60 或 90 分钟');
  if (!LIMITS.includes(limit)) throw fail(400, '每步限时只能是 30、45、90 秒或不限时');
  if (![0, 1].includes(auction) || ![0, 1].includes(trade)) throw fail(400, '拍卖和交易只能开启或关闭');
  return {players, rounds, limit, mode, minutes, auction, trade};
}
const seatCount = config => config.players;
const shuffle = (n, rng) => { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clock = ctx => ctx.now ?? Date.now();

function setup(config, seats, ctx) {
  const mode = config.mode || 'rounds';
  const state = {players: Array.from({length: seats}, (_, seat) => ({seat, cash: START, pos: 0, jail: 0, free: 0, out: false, again: false, doubles: 0, missed: 0})),
    owner: {}, houses: {}, mortgaged: {}, turn: Math.floor(ctx.rng() * seats), phase: 'roll', round: 1, maxRounds: mode === 'rounds' ? config.rounds : null, turns: 0, limit: config.limit,
    dice: null, pending: null, card: null, effects: [], discount: false, decks: {chance: {order: shuffle(CHANCE.length, ctx.rng), pos: 0}, news: {order: shuffle(NEWS.length, ctx.rng), pos: 0}},
    seq: 0, last: null, log: [], outcome: null};
  state.first = state.turn;
  Object.assign(state, fresh(mode, config, clock(ctx)));
  snapshot(state);
  if (config.limit) ctx.setTimer(config.limit * 1000);
  return state;
}
function fresh(mode, config, now) {
  return {mode, cap: CAP, endsAt: mode === 'time' ? now + config.minutes * 60000 : null, rules: {trade: !!config.trade, auction: !!config.auction},
    trade: null, auction: null, proposed: 0, memo: {}, history: [], fx: [], fxId: 0, anim: 0, why: null};
}
// A game saved by v2.4.3.2 has none of the new fields: it goes on under its old rules.
function norm(state) { if (!state.fx) Object.assign(state, fresh('rounds', {}, 0)); return state; }

// ---- Money and land -------------------------------------------------------------------------------------------------
const active = state => state.players.filter(p => !p.out);
const owned = (state, seat) => BUYABLE.filter(i => state.owner[i] === seat);
const level = (state, i) => state.houses[i] || 0;
function fullGroup(state, i) {
  const g = TILES[i].group;
  return g != null && GROUPS[g].every(j => state.owner[j] === state.owner[i] && !state.mortgaged[j]);
}
function rent(state, i) {
  const t = TILES[i], owner = state.owner[i];
  let r;
  if (t.kind === 'transit') {
    r = [250, 600][TRANSITS.filter(j => state.owner[j] === owner && !state.mortgaged[j]).length - 1] || 0;
    for (const e of state.effects) if (e.kind === 'transitFest') r *= e.factor;
  } else {
    r = t.rent * LEVEL[level(state, i)] * (level(state, i) === 0 && fullGroup(state, i) ? 2 : 1);
    for (const e of state.effects) { if (e.kind === 'typhoon' && e.group === t.group) r = 0; }
  }
  for (const e of state.effects) if (e.kind === 'boom' || e.kind === 'slump') r *= e.factor;
  return ten(r * growth(state));
}
// Classic games (until one player is left) would otherwise run on for ever, as passing Start keeps paying: from round
// GROWTH_FROM every rent rises by half its base every GROWTH_EVERY rounds (×1.5, ×2, ×2.5 …).
const GROWTH_FROM = 25, GROWTH_EVERY = 10;
function growth(state) {
  if (state.mode !== 'classic' || state.round < GROWTH_FROM) return 1;
  return 1 + 0.5 * (1 + Math.floor((state.round - GROWTH_FROM) / GROWTH_EVERY));
}
function worth(state, seat) {
  const p = state.players[seat];
  return p.cash + owned(state, seat).reduce((sum, i) => sum + (state.mortgaged[i] ? TILES[i].price / 2 : TILES[i].price) + level(state, i) * (HOUSE[TILES[i].group] || 0), 0);
}
// Everything a player could still turn into cash: houses at half, unmortgaged land at 60%, mortgaged land at 10%.
function raisable(state, seat) {
  return owned(state, seat).reduce((sum, i) => sum + level(state, i) * (HOUSE[TILES[i].group] || 0) / 2 + TILES[i].price * (state.mortgaged[i] ? 0.1 : 0.6), 0);
}
// A log line; the first one written by a computer's move carries its reason (and whose reason it is).
function note(state, entry) {
  const why = state.why; state.why = null;
  state.log.push({seq: state.seq, r: state.round, ...entry, ...(why ? {why} : {})});
  if (state.log.length > 80) state.log.shift();
}
// Something for the page to show in order: dice, a walk, money changing hands, a card, a trade.
function fx(state, entry) {
  if (!state.fx) return;
  state.fx.push({...entry, id: ++state.fxId});
  if (state.fx.length > 40) state.fx.shift();
  state.anim += FX_MS[entry.t](entry);
}
const coins = (state, from, to, amount) => { if (amount > 0) fx(state, {t: 'coins', from: from ?? -1, to: to ?? -1, amount}); };
function snapshot(state) {
  if (!state.history) return;
  state.history.push(state.players.map(p => p.out ? 0 : worth(state, p.seat)));
  if (state.history.length > CAP + 2) state.history.shift();
}
// Whose decision it is: the player answering a trade, the next bidder, or the player whose turn it is.
function actor(state) {
  if (!state || state.phase === 'finished') return null;
  if (state.trade) return state.trade.to;
  if (state.phase === 'auction' && state.auction) return state.auction.order[state.auction.at];
  return state.turn;
}

// ---- Turn flow ------------------------------------------------------------------------------------------------------
function proceed(state, me) { state.pending = null; state.phase = me.again && !me.out ? 'roll' : 'manage'; }
function finish(state, ctx, reason) {
  state.trade = null; state.auction = null;
  const ranking = state.players.map(p => ({seat: p.seat, worth: p.out ? 0 : worth(state, p.seat), cash: p.cash, out: p.out}))
    .sort((a, b) => (a.out - b.out) || b.worth - a.worth);
  const tie = ranking[1] && !ranking[1].out && ranking[1].worth === ranking[0].worth;
  state.phase = 'finished'; state.pending = null;
  snapshot(state);
  state.outcome = {winner: tie ? null : ranking[0].seat, reason, rounds: state.round, ranking};
  ctx.clearTimer();
  ctx.finish({...state.outcome});
}
function endTurn(state, ctx) {
  if (state.phase === 'finished') return;
  const me = state.players[state.turn];
  me.again = false; me.doubles = 0; state.discount = false; state.pending = null; state.turns++;
  if (state.fx) state.proposed = 0;
  let next = state.turn;
  do { next = (next + 1) % state.players.length; } while (state.players[next].out && next !== state.turn);
  // A round ends when play passes the first player (or the next one still in the game).
  const passed = s => (s - state.first + state.players.length) % state.players.length;
  const newRound = passed(next) <= passed(state.turn);
  if (newRound) state.round++;
  state.effects = state.effects.filter(e => e.until > state.turns);
  const mode = state.mode || 'rounds';
  if (mode === 'rounds' && state.round > state.maxRounds) { state.round = state.maxRounds; return finish(state, ctx, 'rounds'); }
  if (mode !== 'rounds' && state.round > state.cap) { state.round = state.cap; return finish(state, ctx, 'cap'); }
  // A timed game ends with the turn during which the time ran out.
  if (mode === 'time' && clock(ctx) >= state.endsAt) return finish(state, ctx, 'time');
  if (newRound) snapshot(state);
  state.turn = next; state.phase = 'roll'; state.dice = null;
}
function bankrupt(state, me, to, ctx) {
  const creditor = to == null ? null : state.players[to];
  for (const i of owned(state, me.seat)) {
    const houses = level(state, i);
    delete state.houses[i];
    if (creditor) { state.owner[i] = to; creditor.cash += houses * (HOUSE[TILES[i].group] || 0) / 2; }
    else { delete state.owner[i]; delete state.mortgaged[i]; }
  }
  if (creditor) { creditor.cash += me.cash; creditor.free += me.free; }
  me.cash = 0; me.free = 0; me.out = true; me.again = false;
  // A trade with this player is off; in an auction they are out (and their bid no longer counts).
  if (state.trade && (state.trade.from === me.seat || state.trade.to === me.seat)) state.trade = null;
  if (state.auction) { const a = state.auction; if (!a.out.includes(me.seat)) a.out.push(me.seat); if (a.leader === me.seat) { a.leader = null; a.bid = 0; } }
  note(state, {kind: 'bankrupt', seat: me.seat, to: to ?? null});
  if (active(state).length < 2) return finish(state, ctx, 'bankrupt');
  if (state.turn === me.seat) { state.auction = null; state.phase = 'manage'; endTurn(state, ctx); }
  else if (state.phase === 'auction' && state.auction) advance(state, ctx, true);
}
// A payment: at once if the cash is there; otherwise the player has to raise it (or is bankrupt if they never could).
function charge(state, me, amount, to, reason, ctx) {
  amount = ten(amount);
  if (amount <= 0) return proceed(state, me);
  if (me.cash >= amount) {
    me.cash -= amount; if (to != null) state.players[to].cash += amount;
    coins(state, me.seat, to, amount);
    note(state, {kind: reason, seat: me.seat, to: to ?? null, amount});
    return proceed(state, me);
  }
  if (me.cash + raisable(state, me.seat) < amount) return bankrupt(state, me, to, ctx);
  state.phase = 'debt'; state.pending = {amount, to: to ?? null, reason};
}
function jail(state, me) {
  me.pos = JAIL; me.jail = 1; me.again = false; me.doubles = 0;
  state.last = {...(state.last || {}), seat: me.seat, jailed: true};
  fx(state, {t: 'jump', seat: me.seat, to: JAIL});
  note(state, {kind: 'jail', seat: me.seat});
  proceed(state, me);
}
function move(state, me, steps, ctx) {
  const from = me.pos, to = ((from + steps) % BOARD + BOARD) % BOARD, path = [from];
  for (let k = 1; k <= Math.abs(steps); k++) path.push(((from + Math.sign(steps) * k) % BOARD + BOARD) % BOARD);
  fx(state, {t: 'walk', seat: me.seat, path});
  if (steps > 0 && to < from) { const bonus = to === 0 ? LAND_GO : PASS_GO; me.cash += bonus; coins(state, null, me.seat, bonus); note(state, {kind: 'start', seat: me.seat, amount: bonus}); }
  else if (steps > 0 && to === 0) { me.cash += LAND_GO; coins(state, null, me.seat, LAND_GO); note(state, {kind: 'start', seat: me.seat, amount: LAND_GO}); }
  me.pos = to;
  state.last = {seq: state.seq + 1, seat: me.seat, dice: state.dice, path};
  landed(state, me, ctx);
}
function landed(state, me, ctx) {
  const t = TILES[me.pos];
  if (t.price) {
    const owner = state.owner[me.pos];
    if (owner == null) { state.phase = 'buy'; state.pending = {tile: me.pos, price: state.discount ? ten(t.price * 0.8) : t.price}; return; }
    if (owner === me.seat || state.mortgaged[me.pos] || state.players[owner].out) return proceed(state, me);
    return charge(state, me, rent(state, me.pos), owner, 'rent', ctx);
  }
  if (t.kind === 'chance' || t.kind === 'news') return draw(state, me, t.kind, ctx);
  if (t.kind === 'tax') return charge(state, me, Math.min(1500, Math.max(200, me.cash * 0.1)), null, 'tax', ctx);
  if (t.kind === 'gotojail') return jail(state, me);
  proceed(state, me);
}
function draw(state, me, deck, ctx) {
  const d = state.decks[deck], list = deck === 'chance' ? CHANCE : NEWS;
  if (d.pos >= d.order.length) { d.order = shuffle(list.length, ctx.rng); d.pos = 0; }
  const card = list[d.order[d.pos++]];
  const extra = card.id === 'typhoon' ? {group: 1 + Math.floor(ctx.rng() * 7)} : {};
  state.card = {deck, id: card.id, seat: me.seat, seq: state.seq + 1, ...extra};
  note(state, {kind: 'card', seat: me.seat, deck, id: card.id, ...extra});
  fx(state, {t: 'card', deck, card: card.id, seat: me.seat, ...extra});
  const until = state.turns + active(state).length;
  if (deck === 'chance') {
    if (card.gain) { me.cash += card.gain; coins(state, null, me.seat, card.gain); return proceed(state, me); }
    if (card.pay) return charge(state, me, card.pay, null, 'fine', ctx);
    if (card.to === 0) return move(state, me, (BOARD - me.pos) % BOARD || BOARD, ctx);
    if (card.back) return move(state, me, -card.back, ctx);
    if (card.id === 'transit') { const next = TRANSITS.map(i => (i - me.pos + BOARD) % BOARD).filter(n => n > 0).sort((a, b) => a - b)[0]; return move(state, me, next, ctx); }
    if (card.house) { const own = owned(state, me.seat); const n = own.reduce((s, i) => s + (level(state, i) === 4 ? card.hotel : level(state, i) * card.house), 0); return charge(state, me, n, null, 'repairs', ctx); }
    if (card.each) { for (const p of active(state)) if (p.seat !== me.seat) { const n = Math.min(p.cash, card.each); p.cash -= n; me.cash += n; coins(state, p.seat, me.seat, n); } return proceed(state, me); }
    if (card.id === 'free') { me.free++; return proceed(state, me); }
    if (card.id === 'jail') return jail(state, me);
    if (card.id === 'discount') { state.discount = true; return proceed(state, me); }
  } else {
    if (card.all) for (const p of active(state)) p.cash += card.all;
    if (card.id === 'boom' || card.id === 'slump') state.effects.push({kind: card.id, factor: card.factor, until});
    if (card.id === 'transitFest') state.effects.push({kind: 'transitFest', factor: card.factor, until});
    if (card.id === 'typhoon') state.effects.push({kind: 'typhoon', group: extra.group, until});
    if (card.house) for (const p of active(state)) { const n = owned(state, p.seat).reduce((s, i) => s + (level(state, i) === 4 ? card.hotel : level(state, i) * card.house), 0); p.cash -= Math.min(p.cash, n); }
    if (card.give) { const list2 = active(state).slice().sort((a, b) => b.cash - a.cash), rich = list2[0], poor = list2.at(-1); const n = Math.min(rich.cash, card.give); if (rich !== poor) { rich.cash -= n; poor.cash += n; state.card.from = rich.seat; state.card.to = poor.seat; coins(state, rich.seat, poor.seat, n); } }
    if (card.rate) for (const p of active(state)) p.cash += Math.min(card.cap, ten(p.cash * card.rate));
  }
  proceed(state, me);
}

// ---- Auctions -------------------------------------------------------------------------------------------------------
// Everyone still in the game bids in turn, starting after the player who passed (who bids last). A bid raises the
// price by at least STEP; a player who folds is out of this auction; whoever cannot raise any more is out as well.
function startAuction(state, me, ctx) {
  const n = state.players.length, order = [];
  for (let k = 1; k <= n; k++) { const s = (me.seat + k) % n; if (!state.players[s].out) order.push(s); }
  state.auction = {tile: state.pending.tile, bid: 0, leader: null, order, at: 0, out: [], trail: []};
  state.pending = null; state.phase = 'auction';
  advance(state, ctx, true);
}
function trail(state, entry) {
  const why = state.why; state.why = null;
  const a = state.auction;
  a.trail.push({...entry, ...(why ? {why} : {})});
  if (a.trail.length > 8) a.trail.shift();
}
// The next bidder after the current one (or the current one, from the start), or the end of the auction.
function advance(state, ctx, here = false) {
  const a = state.auction, n = a.order.length;
  for (let k = here ? 0 : 1; k <= n; k++) {
    const live = a.order.filter(s => !a.out.includes(s));
    if (!live.length || (live.length === 1 && live[0] === a.leader)) return close(state, ctx);
    const at = (a.at + k) % n, seat = a.order[at];
    if (a.out.includes(seat) || seat === a.leader) continue;
    if (state.players[seat].cash < a.bid + STEP) { a.out.push(seat); trail(state, {seat, kind: 'fold', broke: true}); continue; }
    a.at = at;
    return;
  }
  close(state, ctx);
}
function close(state, ctx) {
  const a = state.auction, me = state.players[state.turn];
  state.auction = null;
  if (a.leader != null) {
    state.players[a.leader].cash -= a.bid; state.owner[a.tile] = a.leader;
    coins(state, a.leader, null, a.bid);
    note(state, {kind: 'won', seat: a.leader, tile: a.tile, price: a.bid});
  } else note(state, {kind: 'unsold', seat: state.turn, tile: a.tile});
  proceed(state, me);
}
function foldOut(state, me, ctx, late) {
  state.auction.out.push(me.seat);
  trail(state, {seat: me.seat, kind: 'fold', ...(late ? {late: true} : {})});
  advance(state, ctx);
}

// ---- Trades ---------------------------------------------------------------------------------------------------------
// A trade: what the proposer gives and what they get. Land with houses in its group cannot change hands; only one side
// adds cash; everything has to belong to the side giving it, now and when the trade is accepted.
function part(x) { return {tiles: Array.isArray(x?.tiles) ? x.tiles : [], cash: x?.cash ?? 0}; }
function offer(state, from, to, d) {
  if (!Number.isSafeInteger(to) || to === from || !state.players[to] || state.players[to].out) throw fail(400, '请选择一位还在局里的玩家');
  const give = part(d.give), get = part(d.get);
  for (const [side, owner] of [[give, from], [get, to]]) {
    if (side.tiles.length > TRADE_TILES) throw fail(400, '一次每方最多 6 块地');
    if (new Set(side.tiles).size !== side.tiles.length) throw fail(400, '同一块地出现了两次');
    for (const i of side.tiles) {
      if (!Number.isSafeInteger(i) || !TILES[i]?.price || state.owner[i] !== owner) throw fail(400, '交易里的地要属于拿出它的一方');
      if (TILES[i].group && groupLevels(state, i).some(Boolean)) throw fail(409, '有房子的色组要先卖掉房子才能交易');
    }
    if (!Number.isSafeInteger(side.cash) || side.cash < 0 || side.cash % 10) throw fail(400, '金额要是 10 的整数倍');
    if (side.cash > state.players[owner].cash) throw fail(409, '出钱的一方现金不够');
  }
  if (!give.tiles.length && !get.tiles.length) throw fail(400, '交易里至少要有一块地');
  if (give.cash && get.cash) throw fail(400, '只需要一方出钱');
  const sorted = list => [...list].sort((a, b) => a - b);
  return {give: {tiles: sorted(give.tiles), cash: give.cash}, get: {tiles: sorted(get.tiles), cash: get.cash}};
}
// A computer that asked for a group and was turned down does not ask that player again for MEMORY rounds.
function remember(state) {
  const tr = state.trade;
  if (!tr || tr.aim == null) return;
  const other = tr.opener === tr.from ? tr.to : tr.from;
  (state.memo[tr.opener] = state.memo[tr.opener] || {})[other + ':' + tr.aim] = state.round;
}

// ---- Moves ----------------------------------------------------------------------------------------------------------
const MANAGE = ['roll', 'buy', 'manage', 'debt'];
const STEPS = new Set(['build', 'unmortgage', 'sellHouse', 'mortgage', 'sell', 'useFree', 'payJail']);
const ANSWERS = new Set(['acceptTrade', 'rejectTrade', 'counterTrade']);
function mine(state, me, i) {
  if (!Number.isSafeInteger(i) || !TILES[i]?.price || state.owner[i] !== me.seat) throw fail(400, '这不是你的地产');
}
const groupLevels = (state, i) => GROUPS[TILES[i].group].map(j => level(state, j));
const ACTIONS = {
  roll(state, me, d, ctx) {
    if (state.phase !== 'roll') throw fail(409, '现在不能掷骰子');
    const a = 1 + Math.floor(ctx.rng() * 6), b = 1 + Math.floor(ctx.rng() * 6);
    state.dice = [a, b]; state.card = null;
    note(state, {kind: 'roll', seat: me.seat, dice: [a, b]});
    fx(state, {t: 'dice', seat: me.seat, dice: [a, b]});
    if (me.jail) {
      if (a === b) { me.jail = 0; me.again = false; note(state, {kind: 'free', seat: me.seat}); return move(state, me, a + b, ctx); }
      me.jail++;
      if (me.jail <= 3) { state.last = {seq: state.seq + 1, seat: me.seat, dice: state.dice, path: [me.pos]}; return proceed(state, me); }
      // Third miss: pay the fee (as much as there is) and go.
      const n = Math.min(me.cash, JAIL_FEE); me.cash -= n; me.jail = 0;
      coins(state, me.seat, null, n);
      note(state, {kind: 'fee', seat: me.seat, amount: n});
      return move(state, me, a + b, ctx);
    }
    if (a === b) { me.doubles++; if (me.doubles >= 3) { state.last = {seq: state.seq + 1, seat: me.seat, dice: state.dice, path: [me.pos]}; return jail(state, me); } me.again = true; }
    else me.again = false;
    move(state, me, a + b, ctx);
  },
  payJail(state, me) {
    if (state.phase !== 'roll' || !me.jail) throw fail(409, '你不在休息站');
    if (me.cash < JAIL_FEE) throw fail(409, '现金不够');
    me.cash -= JAIL_FEE; me.jail = 0; coins(state, me.seat, null, JAIL_FEE); note(state, {kind: 'fee', seat: me.seat, amount: JAIL_FEE});
  },
  useFree(state, me) {
    if (state.phase !== 'roll' || !me.jail || !me.free) throw fail(409, '现在不能用免费离开卡');
    me.free--; me.jail = 0; note(state, {kind: 'freeCard', seat: me.seat});
  },
  buy(state, me, d, ctx) {
    if (state.phase !== 'buy') throw fail(409, '现在不能买');
    const {tile, price} = state.pending;
    if (me.cash < price) throw fail(409, '现金不够：可以先抵押或卖掉别的地产');
    me.cash -= price; state.owner[tile] = me.seat;
    coins(state, me.seat, null, price);
    note(state, {kind: 'buy', seat: me.seat, tile, price});
    proceed(state, me);
  },
  pass(state, me, d, ctx) {
    if (state.phase !== 'buy') throw fail(409, '现在不能这样做');
    const auction = !!state.rules?.auction;
    note(state, {kind: 'pass', seat: me.seat, tile: state.pending.tile, ...(auction ? {auction} : {})});
    if (auction) return startAuction(state, me, ctx);
    proceed(state, me);
  },
  build(state, me, d) {
    if (!['roll', 'buy', 'manage'].includes(state.phase)) throw fail(409, '现在不能盖房');
    const i = d.tile; mine(state, me, i);
    if (TILES[i].kind !== 'property' || !fullGroup(state, i)) throw fail(409, '要先拥有整组城市（且都没有抵押）');
    if (level(state, i) >= 4) throw fail(409, '已经是酒店了');
    if (level(state, i) > Math.min(...groupLevels(state, i))) throw fail(409, '同一组要平均盖房：先盖同组房子少的城市');
    const cost = HOUSE[TILES[i].group];
    if (me.cash < cost) throw fail(409, '现金不够');
    me.cash -= cost; state.houses[i] = level(state, i) + 1;
    note(state, {kind: 'build', seat: me.seat, tile: i, level: state.houses[i]});
  },
  sellHouse(state, me, d) {
    if (!MANAGE.includes(state.phase)) throw fail(409, '现在不能卖房');
    const i = d.tile; mine(state, me, i);
    if (!level(state, i)) throw fail(409, '这里没有房子');
    if (level(state, i) < Math.max(...groupLevels(state, i))) throw fail(409, '同一组要平均卖房：先卖同组房子多的城市');
    state.houses[i]--; if (!state.houses[i]) delete state.houses[i];
    me.cash += HOUSE[TILES[i].group] / 2;
    note(state, {kind: 'sellHouse', seat: me.seat, tile: i});
  },
  mortgage(state, me, d) {
    if (!MANAGE.includes(state.phase)) throw fail(409, '现在不能抵押');
    const i = d.tile; mine(state, me, i);
    if (state.mortgaged[i]) throw fail(409, '已经抵押了');
    if (TILES[i].group && groupLevels(state, i).some(Boolean)) throw fail(409, '先卖掉这一组的房子');
    state.mortgaged[i] = true; me.cash += TILES[i].price / 2;
    note(state, {kind: 'mortgage', seat: me.seat, tile: i});
  },
  unmortgage(state, me, d) {
    if (!['roll', 'buy', 'manage'].includes(state.phase)) throw fail(409, '现在不能赎回');
    const i = d.tile; mine(state, me, i);
    if (!state.mortgaged[i]) throw fail(409, '没有抵押');
    const cost = ten(TILES[i].price * 0.55);
    if (me.cash < cost) throw fail(409, '现金不够');
    me.cash -= cost; delete state.mortgaged[i];
    note(state, {kind: 'unmortgage', seat: me.seat, tile: i});
  },
  sell(state, me, d) {
    if (!MANAGE.includes(state.phase)) throw fail(409, '现在不能卖地');
    const i = d.tile; mine(state, me, i);
    if (TILES[i].group && groupLevels(state, i).some(Boolean)) throw fail(409, '先卖掉这一组的房子');
    me.cash += ten(TILES[i].price * (state.mortgaged[i] ? 0.1 : 0.6));
    delete state.owner[i]; delete state.mortgaged[i];
    note(state, {kind: 'sell', seat: me.seat, tile: i});
  },
  pay(state, me, d, ctx) {
    if (state.phase !== 'debt') throw fail(409, '现在没有要付的钱');
    const {amount, to, reason} = state.pending;
    if (me.cash < amount) throw fail(409, '现金还不够：继续卖房、抵押或卖地');
    me.cash -= amount; if (to != null) state.players[to].cash += amount;
    coins(state, me.seat, to, amount);
    note(state, {kind: reason, seat: me.seat, to, amount});
    proceed(state, me);
  },
  bankrupt(state, me, d, ctx) {
    if (state.phase !== 'debt') throw fail(409, '只有付不起钱时才能宣布破产');
    bankrupt(state, me, state.pending.to, ctx);
  },
  end(state, me, d, ctx) {
    if (state.phase !== 'manage') throw fail(409, '现在不能结束回合');
    endTurn(state, ctx);
  },
  // Auctions.
  bid(state, me, d, ctx) {
    if (state.phase !== 'auction') throw fail(409, '现在没有拍卖');
    const a = state.auction, amount = d.amount;
    if (!Number.isSafeInteger(amount) || amount % 10) throw fail(400, '出价要是 10 的整数倍');
    if (amount < a.bid + STEP) throw fail(409, '至少要出 ' + (a.bid + STEP));
    if (amount > me.cash) throw fail(409, '现金不够');
    a.bid = amount; a.leader = me.seat;
    trail(state, {seat: me.seat, kind: 'bid', amount});
    advance(state, ctx);
  },
  fold(state, me, d, ctx) {
    if (state.phase !== 'auction') throw fail(409, '现在没有拍卖');
    foldOut(state, me, ctx, false);
  },
  // Trades: the player whose turn it is proposes; the other side accepts, refuses or counters; the proposer may withdraw.
  proposeTrade(state, me, d, ctx) {
    if (!state.rules?.trade) throw fail(409, '这一局没有开启交易');
    if (!['roll', 'manage', 'debt'].includes(state.phase)) throw fail(409, '现在不能发起交易');
    if (state.proposed >= PROPOSALS) throw fail(409, '每回合最多发起 3 次交易');
    const o = offer(state, me.seat, d.to, d);
    state.trade = {id: state.seq + 1, from: me.seat, to: d.to, ...o, counters: 0, opener: me.seat, aim: ctx.bot && Number.isSafeInteger(d.aim) ? d.aim : null};
    state.proposed++;
    note(state, {kind: 'propose', seat: me.seat, to: d.to, give: o.give, get: o.get});
  },
  acceptTrade(state, me) {
    const tr = state.trade;
    offer(state, tr.from, tr.to, tr);
    const from = state.players[tr.from];
    for (const i of tr.give.tiles) state.owner[i] = tr.to;
    for (const i of tr.get.tiles) state.owner[i] = tr.from;
    from.cash += tr.get.cash - tr.give.cash; me.cash += tr.give.cash - tr.get.cash;
    note(state, {kind: 'trade', seat: tr.from, to: tr.to, give: tr.give, get: tr.get});
    fx(state, {t: 'trade', from: tr.from, to: tr.to, tiles: [...tr.give.tiles, ...tr.get.tiles]});
    coins(state, tr.from, tr.to, tr.give.cash); coins(state, tr.to, tr.from, tr.get.cash);
    state.trade = null;
  },
  rejectTrade(state, me) {
    note(state, {kind: 'reject', seat: me.seat, to: state.trade.from});
    remember(state); state.trade = null;
  },
  counterTrade(state, me, d) {
    const tr = state.trade;
    if (tr.counters >= COUNTERS) throw fail(409, '已经还价 3 次了：请接受或拒绝');
    const o = offer(state, me.seat, tr.from, d);
    state.trade = {id: state.seq + 1, from: me.seat, to: tr.from, ...o, counters: tr.counters + 1, opener: tr.opener, aim: tr.aim};
    note(state, {kind: 'counter', seat: me.seat, to: tr.from, give: o.give, get: o.get});
  },
  cancelTrade(state, me) {
    note(state, {kind: 'cancel', seat: me.seat, to: state.trade.to});
    remember(state); state.trade = null;
  }
};

// The reasons a computer may give; anything else in a move's data is ignored.
const WHY = new Set(['complete', 'block', 'pair', 'value', 'cash', 'reserve', 'late', 'random', 'ahead', 'build', 'raise', 'redeem', 'early', 'hide', 'poor',
  'want', 'swap', 'fair', 'unfair', 'gift', 'ask', 'limit', 'autoplay']);
function cleanWhy(why, seat) {
  if (!why || !WHY.has(why.c)) return null;
  const out = {c: why.c, by: seat};
  for (const k of ['g', 's', 'n', 't']) if (Number.isSafeInteger(why[k])) out[k] = why[k];
  return out;
}
function act(state, seat, action, data, config, ctx) {
  norm(state);
  const rule = ACTIONS[action];
  if (!rule) throw fail(400, '未知操作');
  if (state.phase === 'finished') throw fail(409, '这一局已经结束');
  const d = data && typeof data === 'object' ? data : {};
  if (action === 'cancelTrade') { if (!state.trade || state.trade.from !== seat) throw fail(409, '没有可以撤回的交易'); }
  else if (seat !== actor(state)) throw fail(409, state.trade && seat === state.trade.from ? '先等对方回复交易' : '还没轮到你');
  else if (state.trade && !ANSWERS.has(action)) throw fail(409, '先回复这笔交易');
  else if (!state.trade && ANSWERS.has(action)) throw fail(409, '现在没有要回复的交易');
  const me = state.players[seat];
  state.anim = 0;
  state.why = ctx.bot ? cleanWhy(d.why, seat) : null;
  rule(state, me, d, ctx);
  state.why = null;
  me.missed = 0;
  state.seq++;
  if (state.phase !== 'finished' && config.limit) ctx.setTimer(config.limit * 1000 + Math.min(state.anim, LAG));
}
// Time is up: an unanswered trade is refused, a silent bidder folds, otherwise the computer decides for that player (a
// debt is settled in full). Two misses in a row hand the seat to the computer.
function timeout(state, config, ctx) {
  norm(state);
  if (state.phase === 'finished') return;
  const seat = actor(state), me = state.players[seat];
  state.anim = 0;
  if (state.trade) { note(state, {kind: 'reject', seat, to: state.trade.from, late: true}); remember(state); state.trade = null; }
  else if (state.phase === 'auction') foldOut(state, me, ctx, true);
  else if (state.phase === 'manage') endTurn(state, ctx);
  else {
    // Small steps (houses, mortgages, the rest-stop fee) first, then the decision itself (roll, buy or pass, pay).
    for (let guard = 0; guard < 80; guard++) {
      const plan = bot(state, seat, 'normal', ctx.rng, {auto: true});
      if (!plan) break;
      state.why = cleanWhy(plan.data?.why, seat);
      ACTIONS[plan.action](state, me, plan.data, ctx);
      state.why = null;
      if (!STEPS.has(plan.action) || actor(state) !== seat || state.phase === 'finished') break;
    }
  }
  state.seq++;
  me.missed++;
  if (me.missed >= MISSES) ctx.auto(seat);
  if (state.phase !== 'finished' && config.limit) ctx.setTimer(config.limit * 1000 + Math.min(state.anim, LAG));
}
function leave(state, seat, config, ctx) {
  norm(state);
  const me = state.players[seat];
  if (!me || me.out || state.phase === 'finished') return;
  note(state, {kind: 'left', seat});
  bankrupt(state, me, null, ctx);
  state.seq++;
}
// The room was paused (nobody online): a time limit moves on by as long as the pause lasted.
function resume(state, info) {
  if (state?.endsAt && info?.pausedFor > 0) state.endsAt += info.pausedFor;
}

function view(state) {
  const s = state;
  return {tiles: TILES, groups: GROUPS, houseCost: HOUSE, owner: s.owner, houses: s.houses, mortgaged: s.mortgaged,
    players: s.players.map(p => ({seat: p.seat, cash: p.cash, pos: p.pos, jail: p.jail, free: p.free, out: p.out, missed: p.missed, worth: p.out ? 0 : worth(s, p.seat)})),
    turn: s.turn, phase: s.phase, round: s.round, maxRounds: s.maxRounds, dice: s.dice, pending: s.pending, card: s.card,
    effects: s.effects, discount: s.discount, rents: Object.fromEntries(BUYABLE.filter(i => s.owner[i] != null).map(i => [i, s.mortgaged[i] ? 0 : rent(s, i)])),
    last: s.last, log: s.log.slice(-30), seq: s.seq, outcome: s.outcome,
    mode: s.mode || 'rounds', cap: s.cap || CAP, endsAt: s.endsAt ?? null, growth: growth(s), growthFrom: GROWTH_FROM, growthEvery: GROWTH_EVERY, rules: s.rules || {trade: false, auction: false}, actor: actor(s),
    trade: s.trade ? {id: s.trade.id, from: s.trade.from, to: s.trade.to, give: s.trade.give, get: s.trade.get, counters: s.trade.counters} : null,
    auction: s.auction || null, proposed: s.proposed || 0, history: s.history || [], fx: (s.fx || []).slice(-30),
    limits: {step: STEP, counters: COUNTERS, proposals: PROPOSALS, tiles: TRADE_TILES}};
}

// ---- Computer player ------------------------------------------------------------------------------------------------
// accept: how much better than even a trade must be (a share of what it gives up); gift: what handing someone a whole
// group costs (a multiple of the land's price); premium: what it first offers for the last city of a group; want/bid:
// how far it goes in an auction (a multiple of the price) for land that completes a group / anything else.
const LEVELS = {
  easy: {name: 'easy', reserve: 600, late: 600, risk: 0, greed: 0.5, skip: 0.2, block: false, cushion: 0, top: 3, accept: -0.1, gift: 2, propose: false, counter: null, want: 1.3, bid: 0.85},
  normal: {name: 'normal', reserve: 1000, late: 2000, risk: 1.5, greed: 0.5, skip: 0, block: true, cushion: 500, top: 3, accept: 0, gift: 2, propose: true, premium: 1.5, counter: 0.05, want: 2, bid: 1},
  smart: {name: 'smart', reserve: 1000, late: 2500, risk: 1.5, greed: 0.5, skip: 0, block: true, cushion: 500, top: 4, stage: true, accept: 0.1, gift: 2.5, noGift: true, propose: true, premium: 1.3, swap: true, counter: 0.15, want: 2.4, bid: 1.1}
};
const P2 = k => (6 - Math.abs(k - 7)) / 36;
// Expected rent on the next roll: each square two to twelve ahead, weighted by how likely the dice land there.
function exposure(state, seat) {
  const pos = state.players[seat].pos;
  let sum = 0;
  for (let k = 2; k <= 12; k++) { const i = (pos + k) % BOARD, o = state.owner[i]; if (o != null && o !== seat && !state.mortgaged[i]) sum += P2(k) * rent(state, i); }
  return sum;
}
const late = state => BUYABLE.filter(i => state.owner[i] != null).length > BUYABLE.length * 0.7;
function reserveOf(state, seat, cfg) { return (late(state) ? cfg.late : cfg.reserve) + cfg.risk * exposure(state, seat); }
const groupOf = i => TILES[i].group ? GROUPS[TILES[i].group] : TRANSITS;
const gid = i => TILES[i].group || 0;
const base = (state, i) => TILES[i].price * (state.mortgaged[i] ? 0.5 : 1);
function buyChoice(state, seat, cfg, rng) {
  const {tile, price} = state.pending, me = state.players[seat], after = me.cash - price, g = gid(tile);
  if (rng() < cfg.skip) return {buy: false, why: {c: 'random', t: tile}};
  if (after < 300) return {buy: false, why: {c: 'reserve', t: tile}};
  const group = groupOf(tile);
  const completes = group.every(j => j === tile || state.owner[j] === seat);
  const rival = cfg.block ? active(state).find(p => p.seat !== seat && group.filter(j => j !== tile).every(j => state.owner[j] === p.seat)) : null;
  const reserve = reserveOf(state, seat, cfg);
  if (cfg.stage && late(state) && !completes && !rival) return after >= reserve * 2 ? {buy: true, why: {c: 'cash', t: tile}} : {buy: false, why: {c: 'late', t: tile}};
  if (completes && after >= reserve * cfg.greed) return {buy: true, why: {c: 'complete', g, t: tile}};
  if (rival && after >= reserve * cfg.greed) return {buy: true, why: {c: 'block', s: rival.seat, g, t: tile}};
  if (after >= reserve) return {buy: true, why: {c: group.some(j => j !== tile && state.owner[j] === seat) ? 'pair' : 'value', g, t: tile}};
  return {buy: false, why: {c: 'reserve', t: tile, n: ten(reserve)}};
}
// Raising money, in order: houses (cheapest group first), land outside whole groups, the rest, then selling mortgaged land.
function raiseStep(state, seat) {
  const own = owned(state, seat), why = {c: 'raise', n: state.pending?.amount};
  const housed = own.filter(i => level(state, i) && level(state, i) === Math.max(...groupLevels(state, i))).sort((a, b) => HOUSE[TILES[a].group] - HOUSE[TILES[b].group]);
  if (housed.length) return {action: 'sellHouse', data: {tile: housed[0], why}};
  const free = own.filter(i => !state.mortgaged[i] && !(TILES[i].group && groupLevels(state, i).some(Boolean)));
  const loose = free.filter(i => !fullGroup(state, i)).sort((a, b) => TILES[a].price - TILES[b].price);
  if (loose.length) return {action: 'mortgage', data: {tile: loose[0], why}};
  if (free.length) return {action: 'mortgage', data: {tile: free.sort((a, b) => TILES[a].price - TILES[b].price)[0], why}};
  const sold = own.filter(i => state.mortgaged[i]).sort((a, b) => TILES[a].price - TILES[b].price);
  if (sold.length) return {action: 'sell', data: {tile: sold[0], why}};
  return null;
}
// How likely opponents are to land on a group with their next roll, and the opponent most likely to.
function heat(state, seat, g) {
  let h = 0, top = null;
  for (const p of active(state)) {
    if (p.seat === seat) continue;
    for (const i of GROUPS[g]) {
      const d = (i - p.pos + BOARD) % BOARD;
      if (d < 2 || d > 12) continue;
      h += P2(d);
      if (!top || P2(d) > top.w) top = {w: P2(d), s: p.seat, n: d};
    }
  }
  return {h, top};
}
function manageStep(state, seat, cfg) {
  const me = state.players[seat], reserve = reserveOf(state, seat, cfg);
  const back = owned(state, seat).filter(i => state.mortgaged[i]).sort((a, b) => (fullGroupIf(state, b, seat) - fullGroupIf(state, a, seat)) || TILES[b].price - TILES[a].price);
  if (back.length && me.cash - ten(TILES[back[0]].price * 0.55) > reserve * 2) return {action: 'unmortgage', data: {tile: back[0], why: {c: 'redeem', t: back[0]}}};
  // Houses where the whole group is ours, evenly, up to three houses (smart: a hotel): first the group opponents are
  // most likely to land on next (six to eight squares ahead of them), then the cheaper step.
  const options = owned(state, seat).filter(i => TILES[i].kind === 'property' && fullGroup(state, i) && level(state, i) < cfg.top && level(state, i) === Math.min(...groupLevels(state, i)))
    .map(i => ({i, ...heat(state, seat, TILES[i].group)}))
    .sort((a, b) => b.h - a.h || level(state, a.i) - level(state, b.i) || TILES[b.i].rent - TILES[a.i].rent);
  const pick = options[0];
  if (pick && me.cash - HOUSE[TILES[pick.i].group] >= reserve + cfg.cushion) {
    const g = TILES[pick.i].group;
    return {action: 'build', data: {tile: pick.i, why: pick.top ? {c: 'ahead', s: pick.top.s, n: pick.top.n, g, t: pick.i} : {c: 'build', g, t: pick.i}}};
  }
  return null;
}
const fullGroupIf = (state, i, seat) => TILES[i].group && GROUPS[TILES[i].group].every(j => state.owner[j] === seat) ? 1 : 0;

// What a trade is worth to `seat`: land it gets at its price (×2.5 when that completes a group of its own, ×1.3 when
// it then holds all but one of a group of three), minus land it gives (×2.5 when that breaks its own whole group, ×gift
// when it hands the other side a whole group), plus the cash.
function tradeValue(state, seat, tr, cfg) {
  const other = tr.from === seat ? tr.to : tr.from, gives = tr.from === seat ? tr.give : tr.get, gets = tr.from === seat ? tr.get : tr.give;
  const after = {...state.owner};
  for (const i of gives.tiles) after[i] = other;
  for (const i of gets.tiles) after[i] = seat;
  const whole = (map, s, i) => groupOf(i).every(j => map[j] === s);
  const most = (map, s, i) => { const g = groupOf(i); return g.length > 2 && g.filter(j => map[j] === s).length === g.length - 1; };
  let value = gets.cash - gives.cash;
  const gains = new Set(), gifts = new Set();
  for (const i of gets.tiles) { const k = whole(after, seat, i) ? 2.5 : most(after, seat, i) ? 1.3 : 1; if (k === 2.5) gains.add(gid(i)); value += base(state, i) * k; }
  for (const i of gives.tiles) {
    const theirs = whole(after, other, i);
    if (theirs) gifts.add(gid(i));
    value -= base(state, i) * (theirs ? cfg.gift : whole(state.owner, seat, i) ? 2.5 : 1);
  }
  const stake = gives.cash + gives.tiles.reduce((sum, i) => sum + base(state, i), 0);
  return {value, stake, gains: [...gains], gifts: [...gifts]};
}
// Answering a trade: accept when it is good enough; otherwise ask for (or offer) the difference in cash, once or twice.
function judge(state, seat, cfg, rng, opts) {
  const tr = state.trade, me = state.players[seat], other = state.players[tr.from];
  if (opts.auto) return {action: 'rejectTrade', data: {why: {c: 'autoplay'}}};
  const {value, stake, gains, gifts} = tradeValue(state, seat, tr, cfg);
  if (cfg.noGift && gifts.length && !gains.length) return {action: 'rejectTrade', data: {why: {c: 'gift', g: gifts[0], s: tr.from}}};
  const floor = Math.min(reserveOf(state, seat, cfg) * cfg.greed, me.cash), need = cfg.accept * Math.max(stake, 1);
  const pays = tr.get.cash;
  if (value >= need && me.cash - pays >= floor && (cfg.name !== 'easy' || rng() < 0.75)) return {action: 'acceptTrade', data: {why: gains.length ? {c: 'complete', g: gains[0]} : {c: 'fair'}}};
  if (cfg.counter != null && tr.counters < COUNTERS - 1 && value < need) {
    // Net cash the other side should hand over for the trade to be worth it (negative: what this side can pay).
    const net = tr.give.cash - tr.get.cash + up10((need - value) * (1 + cfg.counter));
    const fine = net >= 0 ? net <= other.cash : me.cash + net >= floor;
    if (fine) return {action: 'counterTrade', data: {give: {tiles: tr.get.tiles, cash: net < 0 ? -net : 0}, get: {tiles: tr.give.tiles, cash: net > 0 ? net : 0}, why: {c: 'ask', n: Math.abs(net)}}};
  }
  if (me.cash - pays < floor) return {action: 'rejectTrade', data: {why: {c: 'reserve'}}};
  return {action: 'rejectTrade', data: {why: gifts.length ? {c: 'gift', g: gifts[0], s: tr.from} : {c: 'unfair'}}};
}
// Asking for the city (or two) that would complete a group of its own: a swap that completes one of theirs in return if
// there is one (smart), else cash at a premium — never again to the same player for that group within a few rounds.
function proposal(state, seat, cfg, opts) {
  if (!state.rules?.trade || !cfg.propose || opts.auto || state.trade || state.proposed >= 1) return null;
  const me = state.players[seat], reserve = reserveOf(state, seat, cfg), memo = state.memo?.[seat] || {};
  const wants = [];
  for (const [key, list] of Object.entries(GROUPS)) {
    const g = Number(key), missing = list.filter(j => state.owner[j] !== seat);
    if (!missing.length || missing.length === list.length || missing.length > (cfg.swap ? 2 : 1)) continue;
    const owner = state.owner[missing[0]];
    if (owner == null || owner === seat || state.players[owner].out || !missing.every(j => state.owner[j] === owner)) continue;
    if (list.some(j => level(state, j))) continue;
    if (memo[owner + ':' + g] != null && state.round - memo[owner + ':' + g] < MEMORY) continue;
    let swap = null;
    if (cfg.swap) for (const [k2, other] of Object.entries(GROUPS)) {
      if (Number(k2) === g) continue;
      const need = other.filter(j => state.owner[j] !== owner);
      if (need.length === 1 && state.owner[need[0]] === seat && !other.some(j => level(state, j))) { swap = need[0]; break; }
    }
    wants.push({g, owner, missing, price: missing.reduce((sum, j) => sum + base(state, j), 0), swap, worth: list.reduce((sum, j) => sum + TILES[j].rent, 0)});
  }
  wants.sort((a, b) => b.worth - a.worth);
  for (const w of wants) {
    if (w.swap != null) {
      const diff = ten(w.price - base(state, w.swap));
      const give = {tiles: [w.swap], cash: Math.max(0, diff)}, get = {tiles: w.missing, cash: Math.max(0, -diff)};
      if (me.cash - give.cash >= reserve * cfg.greed && get.cash <= state.players[w.owner].cash) return {action: 'proposeTrade', data: {to: w.owner, give, get, aim: w.g, why: {c: 'swap', g: w.g, s: w.owner, t: w.swap}}};
    }
    const cash = up10(w.price * cfg.premium);
    if (me.cash - cash >= reserve * cfg.greed) return {action: 'proposeTrade', data: {to: w.owner, give: {tiles: [], cash}, get: {tiles: w.missing, cash: 0}, aim: w.g, why: {c: 'want', g: w.g, s: w.owner}}};
  }
  return null;
}
// Bidding: up to a limit (higher for land that completes or blocks a group), raising by about a tenth of the price.
function bidding(state, seat, cfg, rng, opts) {
  const a = state.auction, me = state.players[seat], i = a.tile, price = TILES[i].price, g = gid(i), group = groupOf(i);
  if (opts.auto) return {action: 'fold', data: {why: {c: 'autoplay', t: i}}};
  const completes = group.every(j => j === i || state.owner[j] === seat);
  const rival = cfg.block ? active(state).find(p => p.seat !== seat && group.filter(j => j !== i).every(j => state.owner[j] === p.seat)) : null;
  const factor = completes ? cfg.want : rival ? Math.max(cfg.bid, 1.5) : cfg.stage && late(state) ? 0.6 : cfg.bid;
  const reserve = reserveOf(state, seat, cfg);
  const limit = ten(Math.min(price * factor, me.cash - (completes || rival ? reserve * cfg.greed : reserve)));
  const next = a.bid + STEP;
  if (limit < next) return {action: 'fold', data: {why: {c: 'limit', n: Math.max(0, limit), t: i}}};
  const amount = Math.min(limit, Math.max(next, ten(a.bid + Math.max(STEP, price * 0.1))));
  return {action: 'bid', data: {amount, why: completes ? {c: 'complete', g, t: i} : rival ? {c: 'block', s: rival.seat, g, t: i} : {c: 'value', t: i}}};
}
// opts.auto: playing for an absent player (托管) or for one whose time ran out — no trades, no auctions.
function bot(state, seat, levelName, rng, opts = {}) {
  if (!state || state.phase === 'finished' || actor(state) !== seat) return null;
  const cfg = LEVELS[levelName] || LEVELS.normal, me = state.players[seat], lag = Math.min(state.anim || 0, LAG);
  const slow = 650 + rng() * 550 + lag, quick = 250 + rng() * 200 + lag;
  if (state.trade) return {...judge(state, seat, cfg, rng, opts), delay: slow};
  if (state.phase === 'auction') return {...bidding(state, seat, cfg, rng, opts), delay: quick + 300};
  if (state.phase === 'debt') {
    if (me.cash >= state.pending.amount) return {action: 'pay', data: {}, delay: slow};
    const step = raiseStep(state, seat);
    return step ? {...step, delay: quick} : {action: 'bankrupt', data: {}, delay: slow};
  }
  if (state.phase === 'buy') { const c = buyChoice(state, seat, cfg, rng); return {action: c.buy ? 'buy' : 'pass', data: {why: c.why}, delay: slow}; }
  if (state.phase === 'roll' || state.phase === 'manage') {
    const step = manageStep(state, seat, cfg);
    if (step) return {...step, delay: quick};
    if (state.phase === 'manage') {
      const ask = proposal(state, seat, cfg, opts);
      return ask ? {...ask, delay: slow} : {action: 'end', data: {}, delay: quick};
    }
    if (me.jail) {
      if (me.free) return {action: 'useFree', data: {why: {c: 'early'}}, delay: slow};
      const early = BUYABLE.filter(i => state.owner[i] == null).length > 8;
      if (early && me.cash > reserveOf(state, seat, cfg) + JAIL_FEE) return {action: 'payJail', data: {why: {c: 'early'}}, delay: slow};
      return {action: 'roll', data: {why: {c: early ? 'poor' : 'hide'}}, delay: slow};
    }
    return {action: 'roll', data: {}, delay: slow};
  }
  return null;
}
const botKey = (state, seat, plan) => state.seq + ':' + plan.action + ':' + (plan.data?.tile ?? plan.data?.amount ?? '');

function tally(previous, result) {
  const t = previous || {wins: {}, draws: 0, games: 0};
  const next = {wins: {...t.wins}, draws: t.draws, games: t.games + 1};
  if (result.winner == null) next.draws++; else next.wins[result.winner] = (next.wins[result.winner] || 0) + 1;
  return next;
}

module.exports = {id: 'monopoly', seats: 4, seatCount, bots: ['easy', 'normal', 'smart'], away: 'autoplay', pausedActions: [], settings, setup, act, timeout, leave, resume, view, bot, botKey, tally,
  rent, worth, raisable, actor, tradeValue, LEVELS, TILES, GROUPS, HOUSE, CHANCE, NEWS, START, JAIL, LIMITS, ROUNDS, MODES, MINUTES, CAP, STEP};
