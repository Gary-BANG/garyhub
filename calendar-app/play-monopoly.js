'use strict';
// Game rooms (v2.4.3.2): "大富翁 / Tycoon" for 2–5 players (computer players fill seats). An original 32-square board:
// twenty cities in seven colour groups, two transit hubs, chance and news cards, a tax office and a rest stop.
// Roll two dice and move; buy cities and hubs nobody owns; pay rent on someone else's (twice the base rent for a whole
// group, then 1–3 houses and a hotel); passing Start pays 2,000 (landing on it 3,000). Doubles roll again (three in a
// row: the rest stop). Raise money by selling houses, mortgaging or selling to the bank; a player who cannot pay a debt
// is bankrupt. After the last round the richest player (cash + land + buildings, mortgaged land at half) wins.
//
// The order of the card decks is the only secret. The computer keeps a cash reserve against the rents it might hit on
// its next roll, is a little greedy for land that completes or blocks a group, and sells and mortgages in a set order.

const fail = (status, message) => Object.assign(Error(message), {status});
const START = 15000, PASS_GO = 2000, LAND_GO = 3000, JAIL = 8, JAIL_FEE = 500, BOARD = 32, MISSES = 2;
const LIMITS = [0, 30, 45, 90], ROUNDS = [15, 20, 25, 30];
const HOUSE = {1: 500, 2: 500, 3: 1000, 4: 1000, 5: 1500, 6: 1500, 7: 2000};
const LEVEL = [1, 5, 12, 20, 28];
const ten = n => Math.round(n / 10) * 10;
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

function settings(input = {}) {
  const players = input.players ?? 4, rounds = input.rounds ?? 20, limit = input.limit ?? 45;
  if (![2, 3, 4, 5].includes(players)) throw fail(400, '玩家人数须为 2–5（可用电脑补位）');
  if (!ROUNDS.includes(rounds)) throw fail(400, '回合数只能是 15、20、25 或 30');
  if (!LIMITS.includes(limit)) throw fail(400, '每步限时只能是 30、45、90 秒或不限时');
  return {players, rounds, limit};
}
const seatCount = config => config.players;
const shuffle = (n, rng) => { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function setup(config, seats, ctx) {
  const state = {players: Array.from({length: seats}, (_, seat) => ({seat, cash: START, pos: 0, jail: 0, free: 0, out: false, again: false, doubles: 0, missed: 0})),
    owner: {}, houses: {}, mortgaged: {}, turn: Math.floor(ctx.rng() * seats), phase: 'roll', round: 1, maxRounds: config.rounds, turns: 0, limit: config.limit,
    dice: null, pending: null, card: null, effects: [], discount: false, decks: {chance: {order: shuffle(CHANCE.length, ctx.rng), pos: 0}, news: {order: shuffle(NEWS.length, ctx.rng), pos: 0}},
    seq: 0, last: null, log: [], outcome: null};
  state.first = state.turn;
  if (config.limit) ctx.setTimer(config.limit * 1000);
  return state;
}

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
  return ten(r);
}
function worth(state, seat) {
  const p = state.players[seat];
  return p.cash + owned(state, seat).reduce((sum, i) => sum + (state.mortgaged[i] ? TILES[i].price / 2 : TILES[i].price) + level(state, i) * (HOUSE[TILES[i].group] || 0), 0);
}
// Everything a player could still turn into cash: houses at half, unmortgaged land at 60%, mortgaged land at 10%.
function raisable(state, seat) {
  return owned(state, seat).reduce((sum, i) => sum + level(state, i) * (HOUSE[TILES[i].group] || 0) / 2 + TILES[i].price * (state.mortgaged[i] ? 0.1 : 0.6), 0);
}
function note(state, entry) { state.log.push({seq: state.seq, ...entry}); if (state.log.length > 50) state.log.shift(); }

// ---- Turn flow ------------------------------------------------------------------------------------------------------
function proceed(state, me) { state.pending = null; state.phase = me.again && !me.out ? 'roll' : 'manage'; }
function finish(state, ctx, reason) {
  const ranking = state.players.map(p => ({seat: p.seat, worth: p.out ? 0 : worth(state, p.seat), cash: p.cash, out: p.out}))
    .sort((a, b) => (a.out - b.out) || b.worth - a.worth);
  const tie = ranking[1] && !ranking[1].out && ranking[1].worth === ranking[0].worth;
  state.phase = 'finished'; state.pending = null;
  state.outcome = {winner: tie ? null : ranking[0].seat, reason, rounds: state.round, ranking};
  ctx.clearTimer();
  ctx.finish({...state.outcome});
}
function endTurn(state, ctx) {
  if (state.phase === 'finished') return;
  const me = state.players[state.turn];
  me.again = false; me.doubles = 0; state.discount = false; state.pending = null; state.turns++;
  let next = state.turn;
  do { next = (next + 1) % state.players.length; } while (state.players[next].out && next !== state.turn);
  // A round ends when play passes the first player (or the next one still in the game).
  const passed = s => (s - state.first + state.players.length) % state.players.length;
  if (passed(next) <= passed(state.turn)) state.round++;
  state.effects = state.effects.filter(e => e.until > state.turns);
  if (state.round > state.maxRounds) { state.round = state.maxRounds; return finish(state, ctx, 'rounds'); }
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
  note(state, {kind: 'bankrupt', seat: me.seat, to: to ?? null});
  if (active(state).length < 2) return finish(state, ctx, 'bankrupt');
  if (state.turn === me.seat) { state.phase = 'manage'; endTurn(state, ctx); }
}
// A payment: at once if the cash is there; otherwise the player has to raise it (or is bankrupt if they never could).
function charge(state, me, amount, to, reason, ctx) {
  amount = ten(amount);
  if (amount <= 0) return proceed(state, me);
  if (me.cash >= amount) {
    me.cash -= amount; if (to != null) state.players[to].cash += amount;
    note(state, {kind: reason, seat: me.seat, to: to ?? null, amount});
    return proceed(state, me);
  }
  if (me.cash + raisable(state, me.seat) < amount) return bankrupt(state, me, to, ctx);
  state.phase = 'debt'; state.pending = {amount, to: to ?? null, reason};
}
function jail(state, me) {
  me.pos = JAIL; me.jail = 1; me.again = false; me.doubles = 0;
  state.last = {...(state.last || {}), seat: me.seat, jailed: true};
  note(state, {kind: 'jail', seat: me.seat});
  proceed(state, me);
}
function move(state, me, steps, ctx) {
  const from = me.pos, to = ((from + steps) % BOARD + BOARD) % BOARD, path = [from];
  for (let k = 1; k <= Math.abs(steps); k++) path.push(((from + Math.sign(steps) * k) % BOARD + BOARD) % BOARD);
  if (steps > 0 && to < from) { const bonus = to === 0 ? LAND_GO : PASS_GO; me.cash += bonus; note(state, {kind: 'start', seat: me.seat, amount: bonus}); }
  else if (steps > 0 && to === 0) { me.cash += LAND_GO; note(state, {kind: 'start', seat: me.seat, amount: LAND_GO}); }
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
  state.card = {deck, id: card.id, seat: me.seat, seq: state.seq + 1};
  note(state, {kind: 'card', seat: me.seat, deck, id: card.id});
  const until = state.turns + active(state).length;
  if (deck === 'chance') {
    if (card.gain) { me.cash += card.gain; return proceed(state, me); }
    if (card.pay) return charge(state, me, card.pay, null, 'fine', ctx);
    if (card.to === 0) return move(state, me, (BOARD - me.pos) % BOARD || BOARD, ctx);
    if (card.back) return move(state, me, -card.back, ctx);
    if (card.id === 'transit') { const next = TRANSITS.map(i => (i - me.pos + BOARD) % BOARD).filter(n => n > 0).sort((a, b) => a - b)[0]; return move(state, me, next, ctx); }
    if (card.house) { const own = owned(state, me.seat); const n = own.reduce((s, i) => s + (level(state, i) === 4 ? card.hotel : level(state, i) * card.house), 0); return charge(state, me, n, null, 'repairs', ctx); }
    if (card.each) { for (const p of active(state)) if (p.seat !== me.seat) { const n = Math.min(p.cash, card.each); p.cash -= n; me.cash += n; } return proceed(state, me); }
    if (card.id === 'free') { me.free++; return proceed(state, me); }
    if (card.id === 'jail') return jail(state, me);
    if (card.id === 'discount') { state.discount = true; return proceed(state, me); }
  } else {
    if (card.all) for (const p of active(state)) p.cash += card.all;
    if (card.id === 'boom' || card.id === 'slump') state.effects.push({kind: card.id, factor: card.factor, until});
    if (card.id === 'transitFest') state.effects.push({kind: 'transitFest', factor: card.factor, until});
    if (card.id === 'typhoon') { const g = 1 + Math.floor(ctx.rng() * 7); state.effects.push({kind: 'typhoon', group: g, until}); state.card.group = g; }
    if (card.house) for (const p of active(state)) { const n = owned(state, p.seat).reduce((s, i) => s + (level(state, i) === 4 ? card.hotel : level(state, i) * card.house), 0); p.cash -= Math.min(p.cash, n); }
    if (card.give) { const list2 = active(state).slice().sort((a, b) => b.cash - a.cash), rich = list2[0], poor = list2.at(-1); const n = Math.min(rich.cash, card.give); if (rich !== poor) { rich.cash -= n; poor.cash += n; state.card.from = rich.seat; state.card.to = poor.seat; } }
    if (card.rate) for (const p of active(state)) p.cash += Math.min(card.cap, ten(p.cash * card.rate));
  }
  proceed(state, me);
}

// ---- Moves ----------------------------------------------------------------------------------------------------------
const MANAGE = ['roll', 'buy', 'manage', 'debt'];
const STEPS = new Set(['build', 'unmortgage', 'sellHouse', 'mortgage', 'sell', 'useFree', 'payJail']);
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
    if (me.jail) {
      if (a === b) { me.jail = 0; me.again = false; note(state, {kind: 'free', seat: me.seat}); return move(state, me, a + b, ctx); }
      me.jail++;
      if (me.jail <= 3) { state.last = {seq: state.seq + 1, seat: me.seat, dice: state.dice, path: [me.pos]}; return proceed(state, me); }
      // Third miss: pay the fee (as much as there is) and go.
      const n = Math.min(me.cash, JAIL_FEE); me.cash -= n; me.jail = 0;
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
    me.cash -= JAIL_FEE; me.jail = 0; note(state, {kind: 'fee', seat: me.seat, amount: JAIL_FEE});
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
    note(state, {kind: 'buy', seat: me.seat, tile, price});
    proceed(state, me);
  },
  pass(state, me) {
    if (state.phase !== 'buy') throw fail(409, '现在不能这样做');
    note(state, {kind: 'pass', seat: me.seat, tile: state.pending.tile});
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
  }
};

function act(state, seat, action, data, config, ctx) {
  const rule = ACTIONS[action];
  if (!rule) throw fail(400, '未知操作');
  if (state.phase === 'finished') throw fail(409, '这一局已经结束');
  if (seat !== state.turn) throw fail(409, '还没轮到你');
  const me = state.players[seat];
  rule(state, me, data || {}, ctx);
  me.missed = 0;
  state.seq++;
  if (state.phase !== 'finished' && config.limit) ctx.setTimer(config.limit * 1000);
}
// Time is up: the computer decides for that player (a debt is settled in full); two misses in a row hand over the seat.
function timeout(state, config, ctx) {
  if (state.phase === 'finished') return;
  const seat = state.turn, me = state.players[seat];
  if (state.phase === 'manage') endTurn(state, ctx);
  else {
    // Small steps (houses, mortgages, the rest-stop fee) first, then the decision itself (roll, buy or pass, pay).
    for (let guard = 0; guard < 80; guard++) {
      const plan = bot(state, seat, 'normal', ctx.rng);
      if (!plan) break;
      ACTIONS[plan.action](state, me, plan.data, ctx);
      if (!STEPS.has(plan.action) || state.turn !== seat || state.phase === 'finished') break;
    }
  }
  state.seq++;
  me.missed++;
  if (me.missed >= MISSES) ctx.auto(seat);
  if (state.phase !== 'finished' && config.limit) ctx.setTimer(config.limit * 1000);
}
function leave(state, seat, config, ctx) {
  const me = state.players[seat];
  if (!me || me.out || state.phase === 'finished') return;
  note(state, {kind: 'left', seat});
  bankrupt(state, me, null, ctx);
  state.seq++;
}

function view(state) {
  return {tiles: TILES, groups: GROUPS, houseCost: HOUSE, owner: state.owner, houses: state.houses, mortgaged: state.mortgaged,
    players: state.players.map(p => ({seat: p.seat, cash: p.cash, pos: p.pos, jail: p.jail, free: p.free, out: p.out, missed: p.missed, worth: p.out ? 0 : worth(state, p.seat)})),
    turn: state.turn, phase: state.phase, round: state.round, maxRounds: state.maxRounds, dice: state.dice, pending: state.pending, card: state.card,
    effects: state.effects, discount: state.discount, rents: Object.fromEntries(BUYABLE.filter(i => state.owner[i] != null).map(i => [i, state.mortgaged[i] ? 0 : rent(state, i)])),
    last: state.last, log: state.log.slice(-14), seq: state.seq, outcome: state.outcome};
}

// ---- Computer player ------------------------------------------------------------------------------------------------
const LEVELS = {
  easy: {reserve: 600, late: 600, risk: 0, greed: 0.5, skip: 0.2, block: false, cushion: 0, top: 3},
  normal: {reserve: 1000, late: 2000, risk: 1.5, greed: 0.5, skip: 0, block: true, cushion: 500, top: 3},
  smart: {reserve: 1000, late: 2500, risk: 1.5, greed: 0.5, skip: 0, block: true, cushion: 500, top: 4, stage: true}
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
function wantsToBuy(state, seat, cfg, rng) {
  const {tile, price} = state.pending, me = state.players[seat], after = me.cash - price, t = TILES[tile];
  if (rng() < cfg.skip || after < 300) return false;
  const group = t.group ? GROUPS[t.group] : TRANSITS;
  const completes = group.every(j => j === tile || state.owner[j] === seat);
  const blocks = cfg.block && active(state).some(p => p.seat !== seat && group.filter(j => j !== tile).every(j => state.owner[j] === p.seat));
  const reserve = reserveOf(state, seat, cfg);
  if (cfg.stage && late(state) && !completes && !blocks) return after >= reserve * 2;
  if (after >= reserve) return true;
  return (completes || blocks) && after >= reserve * cfg.greed;
}
// Raising money, in order: houses (cheapest group first), land outside whole groups, the rest, then selling mortgaged land.
function raiseStep(state, seat) {
  const own = owned(state, seat);
  const housed = own.filter(i => level(state, i) && level(state, i) === Math.max(...groupLevels(state, i))).sort((a, b) => HOUSE[TILES[a].group] - HOUSE[TILES[b].group]);
  if (housed.length) return {action: 'sellHouse', data: {tile: housed[0]}};
  const free = own.filter(i => !state.mortgaged[i] && !(TILES[i].group && groupLevels(state, i).some(Boolean)));
  const loose = free.filter(i => !fullGroup(state, i)).sort((a, b) => TILES[a].price - TILES[b].price);
  if (loose.length) return {action: 'mortgage', data: {tile: loose[0]}};
  if (free.length) return {action: 'mortgage', data: {tile: free.sort((a, b) => TILES[a].price - TILES[b].price)[0]}};
  const sold = own.filter(i => state.mortgaged[i]).sort((a, b) => TILES[a].price - TILES[b].price);
  if (sold.length) return {action: 'sell', data: {tile: sold[0]}};
  return null;
}
function manageStep(state, seat, cfg) {
  const me = state.players[seat], reserve = reserveOf(state, seat, cfg);
  const back = owned(state, seat).filter(i => state.mortgaged[i]).sort((a, b) => (fullGroupIf(state, b, seat) - fullGroupIf(state, a, seat)) || TILES[b].price - TILES[a].price);
  if (back.length && me.cash - ten(TILES[back[0]].price * 0.55) > reserve * 2) return {action: 'unmortgage', data: {tile: back[0]}};
  // Houses where the whole group is ours: the cheapest step first, up to three houses (smart: a hotel), opponents' side first.
  const options = owned(state, seat).filter(i => TILES[i].kind === 'property' && fullGroup(state, i) && level(state, i) < cfg.top && level(state, i) === Math.min(...groupLevels(state, i)))
    .sort((a, b) => level(state, a) - level(state, b) || TILES[b].rent - TILES[a].rent);
  if (options.length && me.cash - HOUSE[TILES[options[0]].group] >= reserve + cfg.cushion) return {action: 'build', data: {tile: options[0]}};
  return null;
}
const fullGroupIf = (state, i, seat) => TILES[i].group && GROUPS[TILES[i].group].every(j => state.owner[j] === seat) ? 1 : 0;
function bot(state, seat, levelName, rng) {
  if (state.phase === 'finished' || state.turn !== seat) return null;
  const cfg = LEVELS[levelName] || LEVELS.normal, me = state.players[seat], slow = 650 + rng() * 550, quick = 250 + rng() * 200;
  if (state.phase === 'debt') {
    if (me.cash >= state.pending.amount) return {action: 'pay', data: {}, delay: slow};
    const step = raiseStep(state, seat);
    return step ? {...step, delay: quick} : {action: 'bankrupt', data: {}, delay: slow};
  }
  if (state.phase === 'buy') return {action: wantsToBuy(state, seat, cfg, rng) ? 'buy' : 'pass', data: {}, delay: slow};
  if (state.phase === 'roll' || state.phase === 'manage') {
    const step = manageStep(state, seat, cfg);
    if (step) return {...step, delay: quick};
    if (state.phase === 'manage') return {action: 'end', data: {}, delay: quick};
    if (me.jail) {
      if (me.free) return {action: 'useFree', data: {}, delay: slow};
      const early = BUYABLE.filter(i => state.owner[i] == null).length > 8;
      if (early && me.cash > reserveOf(state, seat, cfg) + JAIL_FEE) return {action: 'payJail', data: {}, delay: slow};
    }
    return {action: 'roll', data: {}, delay: slow};
  }
  return null;
}
const botKey = (state, seat, plan) => state.seq + ':' + plan.action + ':' + (plan.data?.tile ?? '');

function tally(previous, result) {
  const t = previous || {wins: {}, draws: 0, games: 0};
  const next = {wins: {...t.wins}, draws: t.draws, games: t.games + 1};
  if (result.winner == null) next.draws++; else next.wins[result.winner] = (next.wins[result.winner] || 0) + 1;
  return next;
}

module.exports = {id: 'monopoly', seats: 4, seatCount, bots: ['easy', 'normal', 'smart'], away: 'autoplay', pausedActions: [], settings, setup, act, timeout, leave, view, bot, botKey, tally,
  rent, worth, raisable, TILES, GROUPS, HOUSE, CHANCE, NEWS, START, JAIL, LIMITS, ROUNDS};
