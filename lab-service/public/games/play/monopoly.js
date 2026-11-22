/* GaryHub Games (v2.4.3.2): 大富翁 / Tycoon in a live room. A 32-square ring on Board's 9×9 grid with dice and walking
   tokens in the middle; tap a square for its details and, on your turn, to build, sell or mortgage it.
   v2.4.3.3: numbered squares; trading with counter-offers; auctions; the ways to win (rounds, classic, a time limit); a
   chart of everyone's net worth; coins flying between players, cards that flip; the computer's reasons in the log; on a
   phone the actions sit in a drawer at the bottom. Every animation the server lists plays in order, at the speed this
   viewer picked (board.js); a long backlog is played faster so the board catches up.
   v2.4.3.4: a bankruptcy settled with the bank (the log shows what the creditor got); the computer's new reasons (a
   sale when short of cash, a group bought up from two players, a city closer to a group, a bid under the price). */
(() => {
  'use strict';
  const G = window.Games, {t, el} = G, B = window.Board;
  const GROUP = {1: '#a1887f', 2: '#81d4fa', 3: '#f48fb1', 4: '#ffb74d', 5: '#e57373', 6: '#fff176', 7: '#81c784'};
  const GROUP_NAME = {0: ['交通枢纽', 'transit'], 1: ['青藏', 'Tibet–Qinghai'], 2: ['西北', 'Northwest'], 3: ['西南', 'Southwest'], 4: ['华中', 'Central'],
    5: ['江浙', 'Jiangsu–Zhejiang'], 6: ['川渝陕', 'Sichuan–Chongqing–Shaanxi'], 7: ['粤沪', 'Guangdong–Shanghai']};
  const ICON = {go: '⟲', chance: '？', news: '📰', tax: '¥', jail: '☕', park: '🌳', gotojail: '➜', transit: '🚄'};
  const CARDS = {
    scholarship: ['奖学金：收到 1,500', 'Scholarship: receive 1,500'], fine: ['超速罚款：付 800', 'Speeding fine: pay 800'], start: ['前进到起点（领取 3,000）', 'Advance to Start (collect 3,000)'],
    back: ['后退 3 格', 'Go back three squares'], transit: ['前往最近的交通枢纽', 'Go to the nearest transit hub'], repairs: ['房屋维修：每栋房 200，每座酒店 800', 'Repairs: 200 per house, 800 per hotel'],
    birthday: ['生日：每位玩家给你 300', 'Birthday: every player gives you 300'], free: ['免费离开休息站卡（可保留）', 'Leave the rest stop free (keep this card)'], jail: ['前往休息站', 'Go to the rest stop'],
    discount: ['本回合买地打八折', 'Land costs 20% less this turn'], subsidy: ['补贴：每人 +500', 'Subsidy: everyone +500'], boom: ['楼市火热：一轮内过路费 ×1.5', 'Property boom: rents ×1.5 for a round'],
    slump: ['淡季：一轮内过路费 ×0.5', 'Quiet season: rents ×0.5 for a round'], typhoon: ['台风：一个色组一轮内免过路费', 'Typhoon: one colour group charges no rent for a round'],
    upkeep: ['维修季：每人按房屋交费（每栋 100，酒店 400）', 'Upkeep: everyone pays 100 per house, 400 per hotel'], charity: ['慈善晚会：现金最多的玩家给最少的 1,000', 'Charity gala: the richest player gives the poorest 1,000'],
    interest: ['利息：每人得到现金的 5%（最多 1,000）', 'Interest: everyone gets 5% of their cash (up to 1,000)'], transitFest: ['交通节：一轮内交通枢纽过路费 ×2', 'Transit festival: hub rents ×2 for a round']};
  const PHASE = {roll: ['掷骰子', 'roll'], buy: ['决定是否购买', 'deciding to buy'], debt: ['筹钱付款', 'raising money'], manage: ['整理地产', 'managing'], auction: ['拍卖', 'auction']};
  const money = n => '¥' + Math.round(n).toLocaleString('en-US');
  const compact = n => n >= 10000 ? (Math.round(n / 100) / 10).toString().replace(/\.0$/, '') + 'K' : Math.round(n).toLocaleString('en-US');
  const ten = n => Math.round(n / 10) * 10;
  const rc = i => i <= 8 ? [8, 8 - i] : i <= 16 ? [8 - (i - 8), 0] : i <= 24 ? [0, i - 16] : [i - 24, 8];
  const narrow = matchMedia('(max-width: 640px)');
  const NS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs = {}, ...kids) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v)); n.append(...kids); return n; };
  let ui = null;

  function build(v, api) {
    const s = v.state, board = B.grid(9, 9, 'mono-board');
    s.tiles.forEach((tile, i) => {
      const [r, c] = rc(i), cell = el('button', {class: 'mt ' + tile.kind + (r === 0 || r === 8 ? (c === 0 || c === 8 ? ' corner' : ' row') : ' col'), type: 'button', 'aria-label': '#' + i + ' ' + t(...tile.name)},
        el('span', {class: 'mt-band'}), el('span', {class: 'mt-no', text: String(i)}),
        el('span', {class: 'mt-icon', text: ICON[tile.kind] && tile.kind !== 'transit' ? ICON[tile.kind] : tile.kind === 'transit' ? (i === 13 ? '🚄' : '✈️') : ''}),
        el('span', {class: 'mt-name'}), el('span', {class: 'mt-sub'}), el('span', {class: 'mt-houses'}));
      if (tile.group) cell.style.setProperty('--g', GROUP[tile.group]);
      cell.addEventListener('click', () => { ui.selected = ui.selected === i ? null : i; draw(); });
      board.place(i, r, c, cell);
    });
    const centre = el('div', {class: 'mono-centre'});
    centre.style.gridRow = '2 / span 7'; centre.style.gridColumn = '2 / span 7';
    board.tiles.append(centre);
    const layer = el('div', {class: 'mono-fx', 'aria-hidden': 'true'});
    board.root.append(layer);
    const dice = B.dice(2);
    const card = el('div', {class: 'mono-flip', hidden: true, 'aria-live': 'polite'}, el('div', {class: 'mono-flip-in'}, el('div', {class: 'face back'}), el('div', {class: 'face front'})));
    // The buttons sit in the middle of the board; a trade, an auction or the trade form (`extra`) go under the board.
    const mode = el('div', {class: 'mono-mode'}), slot = el('div', {class: 'mono-slot'}), actions = el('div', {class: 'mono-actions'});
    const extra = el('div', {class: 'mono-extra'}), under = el('div', {class: 'mono-under'});
    centre.append(mode, el('div', {class: 'mono-dice'}, dice.root), card, slot);
    const sheetBody = el('div', {class: 'mono-sheet-body'});
    const sheet = el('div', {class: 'mono-sheet open', hidden: true},
      el('button', {class: 'mono-sheet-handle', type: 'button', 'aria-label': t('展开或收起操作', 'Show or hide the actions'), onclick: () => sheet.classList.toggle('open')}, el('span')), sheetBody);
    // The drawer lives under <body>: the room's card has a backdrop filter, which would pin a fixed element to the card.
    document.body.append(sheet);
    const side = el('div', {class: 'mono-side'});
    const root = el('div', {class: 'mono'}, el('div', {class: 'mono-board-wrap'}, board.root, under), side);
    return {root, board, centre, mode, slot, actions, extra, under, layer, dice, card, side, sheet, sheetBody, speed: B.speedControl(), key: '', fxSeen: -1, queue: [], playing: false,
      at: {}, shown: {}, selected: null, composer: null, lastActor: null, api, view: null};
  }
  const me = () => ui.view.you;
  const name = seat => seat == null || seat < 0 ? t('银行', 'the bank') : ui.api.seatName(seat) + (seat === me() ? t('（你）', ' (you)') : '');
  const tname = i => t(...ui.view.state.tiles[i].name);
  const tn = i => '#' + i + ' ' + tname(i);
  const gname = g => t(...(GROUP_NAME[g] || ['', '']));
  const dot = seat => { const d = el('span', {class: 'dot', 'aria-hidden': 'true'}); d.style.setProperty('--seat', B.color(seat)); return d; };
  const deal = side => [...side.tiles.map(tn), side.cash ? money(side.cash) : null].filter(Boolean).join('、') || t('什么都不给', 'nothing');

  // ---- Board ----------------------------------------------------------------------------------------------------------
  function paint() {
    const s = ui.view.state;
    s.tiles.forEach((tile, i) => {
      const cell = ui.board.cell(i), owner = s.owner[i], houses = s.houses[i] || 0;
      cell.querySelector('.mt-name').textContent = t(...tile.name);
      cell.querySelector('.mt-sub').textContent = tile.price ? (owner != null ? (s.mortgaged[i] ? t('抵押', 'mortgaged') : money(s.rents[i] ?? 0)) : money(tile.price)) : '';
      cell.querySelector('.mt-houses').textContent = houses === 4 ? '🏨' : '●'.repeat(houses);
      cell.classList.toggle('owned', owner != null); cell.classList.toggle('mortgaged', !!s.mortgaged[i]); cell.classList.toggle('selected', ui.selected === i);
      cell.classList.toggle('auctioned', s.phase === 'auction' && s.auction?.tile === i);
      if (owner != null) cell.style.setProperty('--owner', B.color(owner)); else cell.style.removeProperty('--owner');
    });
    // While animations are still to play, tokens stay where the last one left them.
    const busy = ui.playing || ui.queue.length;
    const pos = p => busy && ui.at[p.seat] != null ? ui.at[p.seat] : p.pos;
    const here = new Map();
    for (const p of s.players) { if (p.out) { ui.board.remove(p.seat); continue; } const list = here.get(pos(p)) || []; list.push(p.seat); here.set(pos(p), list); }
    for (const p of s.players) {
      if (p.out) continue;
      const token = ui.board.token(p.seat, String(p.seat + 1));
      token.classList.toggle('turn', p.seat === s.turn && s.phase !== 'finished'); token.classList.toggle('jailed', !!p.jail);
      token.title = name(p.seat);
      if (!ui.board.busy(p.seat)) { const list = here.get(pos(p)); ui.board.put(p.seat, pos(p), list.indexOf(p.seat), list.length); ui.shown[p.seat] = pos(p); }
    }
    if (!busy) ui.dice.set(s.dice);
  }

  // ---- Animations, in the server's order --------------------------------------------------------------------------
  function enqueue() {
    const list = ui.view.state.fx || [];
    // Joining or reloading: nothing that happened before is replayed.
    if (ui.fxSeen < 0) { ui.fxSeen = list.length ? list.at(-1).id : 0; return; }
    const fresh = list.filter(f => f.id > ui.fxSeen);
    if (!fresh.length) return;
    if (!ui.playing && !ui.queue.length) ui.at = {...ui.shown};
    ui.queue.push(...fresh); ui.fxSeen = fresh.at(-1).id;
    if (!ui.playing) run();
  }
  async function run() {
    ui.playing = true;
    const mine = ui;
    while (mine.queue.length) {
      const f = mine.queue.shift(), k = mine.queue.length > 5 ? 0.3 : 1;
      try { await play(f, k); } catch (error) { console.error(error); }
      if (ui !== mine) return;
    }
    ui.playing = false; ui.at = {};
    if (ui.view) paint();
  }
  async function play(f, k) {
    if (f.t === 'dice') { ui.card.hidden = true; await ui.dice.roll(f.dice, 900 * k); await B.wait(250 * k); }
    else if (f.t === 'walk') { await ui.board.walk(f.seat, f.path, 260 * k); ui.at[f.seat] = f.path.at(-1); paint(); await B.wait(150 * k); }
    else if (f.t === 'jump') { ui.at[f.seat] = f.to; paint(); await B.wait(450 * k); }
    else if (f.t === 'coins') await coins(f, 700 * k);
    else if (f.t === 'card') await flip(f, k);
    else if (f.t === 'trade') await flash(f.tiles, 900 * k);
  }
  const point = seat => seat == null || seat < 0 ? {x: 50, y: 50} : ui.board.spot(ui.at[seat] ?? ui.view.state.players[seat]?.pos ?? 0);
  async function coins(f, ms) {
    const d = B.dur(ms);
    if (!d) return;
    const from = point(f.from), to = point(f.to), you = me();
    const chip = el('span', {class: 'coin-fly' + (f.to === you ? ' gain' : f.from === you ? ' loss' : ''), text: '🪙 ' + money(f.amount)});
    chip.style.left = from.x + '%'; chip.style.top = from.y + '%'; chip.style.setProperty('--d', Math.round(d) + 'ms');
    ui.layer.append(chip);
    chip.getBoundingClientRect();
    chip.classList.add('go'); chip.style.left = to.x + '%'; chip.style.top = to.y + '%';
    await B.sleep(d + 80);
    chip.remove();
  }
  async function flip(f, k) {
    const [zh, en] = CARDS[f.card] || ['', ''], deck = f.deck === 'chance' ? t('机会', 'Chance') : t('新闻', 'News');
    const box = ui.card;
    box.querySelector('.back').replaceChildren(el('span', {class: 'deck', text: f.deck === 'chance' ? '？' : '📰'}), el('strong', {text: deck}));
    box.querySelector('.front').replaceChildren(el('small', {text: name(f.seat) + t(' 抽到', ' drew ') + deck}), el('strong', {text: t(zh, en) + (f.group ? ' · ' + gname(f.group) + t('组', ' group') : '')}));
    box.classList.remove('flipped', 'chance', 'news'); box.classList.add(f.deck);
    box.style.setProperty('--flip', Math.round(B.dur(600 * k)) + 'ms');
    box.hidden = false;
    box.getBoundingClientRect();
    box.classList.add('flipped');
    // The card stays up until the next roll; the board waits a moment so it can be read.
    await B.wait(2000 * k);
  }
  async function flash(tiles, ms) {
    for (const i of tiles) ui.board.cell(i)?.classList.add('traded');
    await B.wait(ms);
    for (const i of tiles) ui.board.cell(i)?.classList.remove('traded');
  }

  // ---- The actions (in the middle of the board; in a drawer on a phone) ----------------------------------------------
  function headline() {
    const s = ui.view.state, you = me();
    if (s.trade) return s.trade.to === you ? t('你收到一份交易提议', 'You have a trade offer') : t('等 ' + name(s.trade.to) + ' 回复交易…', 'Waiting for ' + name(s.trade.to) + ' to answer the trade…');
    if (s.phase === 'auction') return s.actor === you ? t('轮到你出价', 'Your bid') : t(name(s.actor) + ' 正在出价…', name(s.actor) + ' is bidding…');
    const [zh, en] = PHASE[s.phase] || ['', ''];
    return s.turn === you ? t('轮到你：' + zh, 'Your turn: ' + en) : t(name(s.turn) + ' ' + zh + '…', name(s.turn) + ' is ' + en + '…');
  }
  function modeLine() {
    const s = ui.view.state, box = ui.mode;
    box.replaceChildren();
    const round = s.mode === 'rounds' ? t('第 ' + s.round + ' / ' + s.maxRounds + ' 回合', 'Round ' + s.round + ' / ' + s.maxRounds) : t('第 ' + s.round + ' 回合', 'Round ' + s.round);
    const kind = s.mode === 'classic' ? t('经典', 'Classic') : s.mode === 'time' ? t('限时', 'Timed') : '';
    box.append(el('p', {class: 'eyebrow'}, kind ? kind + ' · ' : '', round, s.mode === 'time' && s.phase !== 'finished' ? [' · ', el('span', {dataset: {endclock: '1'}})] : null));
    if (s.growth > 1) box.append(el('span', {class: 'pill me', text: t('城市发展：过路费 ×' + s.growth, 'City growth: rents ×' + s.growth)}));
    endClock();
  }
  function actions() {
    const v = ui.view, s = v.state, api = ui.api, you = me(), p = s.players[you], box = ui.actions, extra = ui.extra;
    box.replaceChildren(); extra.replaceChildren();
    if (s.phase === 'finished') { box.append(result(v)); return; }
    box.append(el('h2', {class: 'mono-title', text: headline()}), api.clock());
    if (s.trade) extra.append(tradeCard());
    else if (s.phase === 'auction') extra.append(auctionPanel());
    if (ui.composer && !ui.composer.counter) extra.append(composer());
    if (extra.childNodes.length && !narrow.matches) box.append(el('p', {class: 'hint mono-below', text: t('↓ 详情在棋盘下方', '↓ Details below the board')}));
    const decide = s.actor === you && !s.trade && s.phase !== 'auction';
    const row = el('div', {class: 'actions'});
    if (decide && s.phase === 'roll') {
      row.append(el('button', {class: 'btn btn-gold', type: 'button', text: t('掷骰子', 'Roll'), onclick: () => api.act('roll').catch(() => {})}));
      if (p.jail) {
        row.append(el('button', {class: 'btn btn-ghost btn-sm', type: 'button', disabled: p.cash < 500, text: t('交 500 离开', 'Pay 500 to leave'), onclick: () => api.act('payJail').catch(() => {})}));
        if (p.free) row.append(el('button', {class: 'btn btn-ghost btn-sm', type: 'button', text: t('用免费卡', 'Use free card'), onclick: () => api.act('useFree').catch(() => {})}));
      }
    }
    if (decide && s.phase === 'buy') {
      box.append(el('p', {class: 'mono-ask', text: t('买下 ' + tn(s.pending.tile) + '，' + money(s.pending.price) + '？', 'Buy ' + tn(s.pending.tile) + ' for ' + money(s.pending.price) + '?')}));
      row.append(el('button', {class: 'btn btn-gold', type: 'button', disabled: p.cash < s.pending.price, text: t('购买', 'Buy'), onclick: () => api.act('buy').catch(() => {})}),
        el('button', {class: 'btn btn-ghost', type: 'button', text: s.rules.auction ? t('不买（拍卖）', 'Pass (auction)') : t('不买', 'Pass'), onclick: () => api.act('pass').catch(() => {})}));
    }
    if (decide && s.phase === 'debt') {
      const reason = {rent: t('过路费', 'rent'), tax: t('税', 'tax'), fine: t('罚款', 'a fine'), repairs: t('维修费', 'repairs')}[s.pending.reason] || '';
      box.append(el('p', {class: 'mono-ask', text: t('要付 ' + money(s.pending.amount) + '（' + reason + '），现金 ' + money(p.cash) + '。点你的地块卖房、抵押或卖地筹钱' + (s.rules.trade ? '，也可以发起交易' : '') + '。', 'You owe ' + money(s.pending.amount) + ' (' + reason + ') and have ' + money(p.cash) + '. Tap your squares to sell houses, mortgage or sell' + (s.rules.trade ? ', or propose a trade' : '') + '.')}));
      row.append(el('button', {class: 'btn btn-gold', type: 'button', disabled: p.cash < s.pending.amount, text: t('付款', 'Pay'), onclick: () => api.act('pay').catch(() => {})}),
        el('button', {class: 'btn btn-danger btn-sm', type: 'button', text: t('宣布破产', 'Declare bankruptcy'), onclick: () => { if (confirm(s.liquidate ? t('确定宣布破产吗？你的房子和地会卖给银行，连同现金付给债主（最多到欠款），地产退回银行，你将退出这一局。', 'Declare bankruptcy? Your houses and land are sold to the bank, the creditor gets that and your cash (up to the debt), the land goes back to the bank and you are out.') : t('确定宣布破产吗？你的地产会交给债主，你将退出这一局。', 'Declare bankruptcy? Your land goes to the creditor and you are out.'))) api.act('bankrupt').catch(() => {}); }}));
    }
    if (decide && s.phase === 'manage') {
      box.append(el('p', {class: 'hint', text: t('可以点自己的地块盖房、抵押或卖地，然后结束回合。', 'Tap your squares to build, mortgage or sell, then end your turn.')}));
      row.append(el('button', {class: 'btn btn-gold', type: 'button', text: t('结束回合', 'End turn'), onclick: () => api.act('end').catch(() => {})}));
    }
    if (decide && s.rules.trade && ['roll', 'manage', 'debt'].includes(s.phase) && !ui.composer) {
      const left = s.limits.proposals - s.proposed;
      row.append(el('button', {class: 'btn btn-violet btn-sm', type: 'button', disabled: left <= 0 || !others().length, title: t('这回合还能发起 ' + left + ' 次', left + ' left this turn'),
        text: t('发起交易', 'Propose a trade'), onclick: () => openComposer({})}));
    }
    box.append(row);
    if (s.effects.length) box.append(el('div', {class: 'chips'}, ...s.effects.map(e => el('span', {class: 'pill me', text: e.kind === 'typhoon' ? t('台风：' + gname(e.group) + '组免租', 'Typhoon: ' + gname(e.group) + ' free') : e.kind === 'transitFest' ? t('交通节 ×2', 'Transit ×2') : (e.kind === 'boom' ? t('楼市火热 ×', 'Boom ×') : t('淡季 ×', 'Slump ×')) + e.factor}))));
    if (s.discount && s.turn === you) box.append(el('span', {class: 'pill me', text: t('本回合买地八折', '20% off land this turn')}));
  }
  const others = () => ui.view.state.players.filter(p => !p.out && p.seat !== me());
  // Land that may change hands: no houses anywhere in its group.
  function tradable(seat) {
    const s = ui.view.state;
    return Object.keys(s.owner).map(Number).filter(i => s.owner[i] === seat && !(s.tiles[i].group && s.groups[s.tiles[i].group].some(j => s.houses[j]))).sort((a, b) => a - b);
  }

  // ---- Trades ---------------------------------------------------------------------------------------------------------
  function tradeCard() {
    const s = ui.view.state, tr = s.trade, you = me(), api = ui.api;
    const box = el('div', {class: 'mono-trade'},
      el('p', {class: 'eyebrow', text: tr.counters ? t('还价（第 ' + tr.counters + ' 次）', 'Counter-offer (' + tr.counters + ')') : t('交易提议', 'Trade offer')}),
      el('p', {}, dot(tr.from), el('strong', {text: name(tr.from)}), t(' 给出：', ' gives: ') + deal(tr.give)),
      el('p', {}, dot(tr.to), el('strong', {text: name(tr.to)}), t(' 给出：', ' gives: ') + deal(tr.get)));
    const row = el('div', {class: 'actions'});
    if (tr.to === you && !ui.composer) {
      row.append(el('button', {class: 'btn btn-gold', type: 'button', text: t('接受', 'Accept'), onclick: () => api.act('acceptTrade').catch(() => {})}));
      if (tr.counters < s.limits.counters) row.append(el('button', {class: 'btn btn-violet btn-sm', type: 'button', text: t('还价', 'Counter'), onclick: () => openComposer({counter: true, to: tr.from, give: tr.get, get: tr.give})}));
      row.append(el('button', {class: 'btn btn-ghost btn-sm', type: 'button', text: t('拒绝', 'Refuse'), onclick: () => api.act('rejectTrade').catch(() => {})}));
    } else if (tr.from === you) {
      row.append(el('span', {class: 'hint', text: t('等对方回复…', 'Waiting for an answer…')}), el('button', {class: 'btn btn-ghost btn-sm', type: 'button', text: t('撤回', 'Withdraw'), onclick: () => api.act('cancelTrade').catch(() => {})}));
    }
    box.append(row);
    if (ui.composer?.counter) box.append(composer());
    return box;
  }
  function openComposer(o) {
    const first = others()[0];
    ui.composer = {counter: !!o.counter, to: o.to ?? first?.seat, give: new Set(o.give?.tiles || []), get: new Set(o.get?.tiles || []), giveCash: o.give?.cash || 0, getCash: o.get?.cash || 0, error: ''};
    draw();
  }
  function composer() {
    const c = ui.composer, s = ui.view.state, you = me();
    const pick = (seat, set) => {
      const list = tradable(seat), box = el('div', {class: 'mono-pick'});
      if (!list.length) box.append(el('span', {class: 'hint', text: t('没有可以交易的地', 'No land to trade')}));
      for (const i of list) {
        const chip = el('button', {class: 'pick-chip', type: 'button', 'aria-pressed': String(set.has(i)), text: tn(i) + (s.mortgaged[i] ? t('（抵押）', ' (mortgaged)') : ''),
          onclick: () => { if (set.has(i)) set.delete(i); else set.add(i); draw(); }});
        if (s.tiles[i].group) chip.style.setProperty('--g', GROUP[s.tiles[i].group]);
        box.append(chip);
      }
      return box;
    };
    const cash = (key, field) => {
      const input = el('input', {class: 'input', type: 'number', min: '0', step: '10', inputmode: 'numeric', value: String(c[field] || 0), dataset: {keep: key}, 'aria-label': t('现金', 'Cash')});
      input.addEventListener('input', () => { c[field] = Math.max(0, Math.floor(Number(input.value) || 0)); });
      return el('label', {class: 'field mono-cash'}, el('span', {text: t('现金', 'Cash')}), input);
    };
    const box = el('div', {class: 'mono-compose'}, el('h3', {text: c.counter ? t('还价：改成你能接受的条件', 'Counter: the terms you would accept') : t('发起交易', 'Propose a trade')}));
    if (!c.counter) {
      const select = el('select', {class: 'select', 'aria-label': t('交易对象', 'Trade with')});
      for (const p of others()) select.append(el('option', {value: String(p.seat), text: name(p.seat), selected: p.seat === c.to}));
      select.addEventListener('change', () => { c.to = Number(select.value); c.get.clear(); draw(); });
      box.append(el('label', {class: 'field'}, el('span', {text: t('和谁交易', 'Trade with')}), select));
    }
    box.append(el('div', {class: 'mono-compose-cols'},
      el('section', {}, el('h4', {text: t('你给出', 'You give')}), pick(you, c.give), cash('mono-give-cash', 'giveCash')),
      el('section', {}, el('h4', {text: t(name(c.to) + ' 给出', name(c.to) + ' gives')}), pick(c.to, c.get), cash('mono-get-cash', 'getCash'))));
    if (c.error) box.append(el('p', {class: 'error', text: c.error}));
    box.append(el('div', {class: 'actions'},
      el('button', {class: 'btn btn-gold btn-sm', type: 'button', text: c.counter ? t('发出还价', 'Send counter-offer') : t('发出提议', 'Send offer'), onclick: send}),
      el('button', {class: 'btn btn-ghost btn-sm', type: 'button', text: t('取消', 'Cancel'), onclick: () => { ui.composer = null; draw(); }})));
    return box;
  }
  function send() {
    const c = ui.composer;
    const fail = text => { c.error = text; draw(); };
    if (!c.give.size && !c.get.size) return fail(t('至少要有一块地', 'Include at least one square'));
    if (c.giveCash % 10 || c.getCash % 10) return fail(t('金额要是 10 的整数倍', 'Amounts must be multiples of 10'));
    if (c.giveCash && c.getCash) return fail(t('只需要一方出钱', 'Only one side adds cash'));
    const data = {give: {tiles: [...c.give], cash: c.giveCash}, get: {tiles: [...c.get], cash: c.getCash}};
    if (!c.counter) data.to = c.to;
    ui.api.act(c.counter ? 'counterTrade' : 'proposeTrade', data).then(() => { ui.composer = null; draw(); }).catch(error => fail(error.message));
  }

  // ---- Auctions -------------------------------------------------------------------------------------------------------
  function auctionPanel() {
    const v = ui.view, s = v.state, a = s.auction, you = me(), api = ui.api, tile = s.tiles[a.tile];
    const box = el('div', {class: 'mono-auction'},
      el('p', {class: 'eyebrow', text: t('拍卖', 'Auction')}),
      el('h3', {text: tn(a.tile) + t('（地价 ', ' (price ') + money(tile.price) + t('）', ')')}),
      el('p', {class: 'mono-bid'}, a.leader != null ? [t('最高出价 ', 'Top bid '), el('strong', {text: money(a.bid)}), ' · ' + name(a.leader)] : t('还没有人出价', 'No bids yet')),
      el('ol', {class: 'mono-bidders'}, ...a.order.map(seat => el('li', {class: (seat === s.actor ? 'now' : '') + (a.out.includes(seat) ? ' out' : '')},
        dot(seat), name(seat), a.out.includes(seat) ? t(' · 放弃', ' · out') : seat === a.leader ? t(' · 领先', ' · leading') : seat === s.actor ? t(' · 出价中', ' · bidding') : ''))));
    if (a.trail.length) {
      const list = el('ul', {class: 'mono-trail'});
      for (const e of a.trail.slice(-4).reverse()) list.append(el('li', {}, e.kind === 'bid' ? t(name(e.seat) + ' 出价 ' + money(e.amount), name(e.seat) + ' bid ' + money(e.amount)) : t(name(e.seat) + (e.broke ? ' 现金不够，退出' : e.late ? ' 超时，退出' : ' 放弃'), name(e.seat) + (e.broke ? ' cannot raise' : e.late ? ' timed out' : ' folded')),
        e.why ? el('span', {class: 'why', text: ' — ' + reason(e.why)}) : null));
      box.append(list);
    }
    if (s.actor === you) {
      const cash = s.players[you].cash, min = a.bid + s.limits.step;
      const quick = [...new Set([min, ten(a.bid + Math.max(s.limits.step, tile.price * 0.1)), ten(tile.price)])].filter(n => n >= min && n <= cash).sort((x, y) => x - y);
      const row = el('div', {class: 'actions'});
      for (const n of quick) row.append(el('button', {class: 'btn btn-gold btn-sm', type: 'button', text: t('出价 ', 'Bid ') + money(n), onclick: () => api.act('bid', {amount: n}).catch(() => {})}));
      const input = el('input', {class: 'input', type: 'number', min: String(min), step: '10', inputmode: 'numeric', placeholder: String(min), value: ui.bidDraft || null, dataset: {keep: 'mono-bid'}, 'aria-label': t('出价金额', 'Bid amount')});
      input.addEventListener('input', () => { ui.bidDraft = input.value; });
      row.append(el('span', {class: 'mono-custom'}, input, el('button', {class: 'btn btn-ghost btn-sm', type: 'button', text: t('出价', 'Bid'), onclick: () => { const n = Math.floor(Number(input.value)); if (n) api.act('bid', {amount: n}).catch(() => {}); }})),
        el('button', {class: 'btn btn-danger btn-sm', type: 'button', text: t('放弃', 'Fold'), onclick: () => api.act('fold').catch(() => {})}));
      if (cash < min) row.prepend(el('span', {class: 'hint', text: t('现金不够加价', 'Not enough cash to raise')}));
      box.append(row);
    }
    return box;
  }

  // ---- Side panel -----------------------------------------------------------------------------------------------------
  function detail() {
    const v = ui.view, s = v.state, api = ui.api, i = ui.selected;
    if (i == null) return el('p', {class: 'hint', text: t('点棋盘上的地块查看详情。', 'Tap a square for its details.')});
    const tile = s.tiles[i], owner = s.owner[i], you = me(), mine = owner === you && s.turn === you && s.actor === you && ['roll', 'buy', 'manage', 'debt'].includes(s.phase);
    const box = el('div', {class: 'mono-detail'}, el('h3', {text: tn(i)}));
    if (tile.group) box.firstChild.style.setProperty('--g', GROUP[tile.group]);
    if (!tile.price) { box.append(el('p', {class: 'hint', text: {go: t('经过 +2,000，停在这里 +3,000', 'Pass: +2,000; land here: +3,000'), chance: t('抽一张机会卡', 'Draw a chance card'), news: t('抽一张新闻：影响所有人', 'Draw news: it affects everyone'), tax: t('交现金的 10%（200–1,500）', 'Pay 10% of your cash (200–1,500)'), jail: t('休息站：路过没事；被送进来要停最多 3 轮，或交 500 离开', 'Rest stop: passing is fine; if sent here, stay up to three turns or pay 500'), park: t('休息一下', 'Take a break'), gotojail: t('直接去休息站', 'Go straight to the rest stop')}[tile.kind] || ''})); return box; }
    const houseCost = s.houseCost[tile.group];
    box.append(el('p', {text: (tile.group ? gname(tile.group) + t('组 · ', ' · ') : '') + t('价格 ', 'Price ') + money(tile.price) + (tile.rent ? t(' · 基础过路费 ', ' · base rent ') + money(tile.rent) : t(' · 过路费 250／两个都有 600', ' · rent 250 / 600 with both'))}),
      el('p', {text: owner != null ? t('主人：', 'Owner: ') + name(owner) + (s.mortgaged[i] ? t('（已抵押）', ' (mortgaged)') : t(' · 现在过路费 ', ' · rent now ') + money(s.rents[i] ?? 0)) : t('无人购买', 'Unowned')}));
    if (tile.group) box.append(el('p', {class: 'hint', text: t('整组 ×2；1/2/3 栋房 ×5/×12/×20；酒店 ×28；每栋 ', 'Whole group ×2; 1/2/3 houses ×5/×12/×20; hotel ×28; each ') + money(houseCost)}));
    if (mine) {
      const row = el('div', {class: 'actions'}), act = (a, label, cls = 'btn-ghost') => row.append(el('button', {class: 'btn btn-sm ' + cls, type: 'button', text: label, onclick: () => api.act(a, {tile: i}).catch(() => {})}));
      if (tile.group && s.phase !== 'debt' && (s.houses[i] || 0) < 4) act('build', t('盖房 ', 'Build ') + money(houseCost), 'btn-gold');
      if (s.houses[i]) act('sellHouse', t('卖房 +', 'Sell house +') + money(houseCost / 2));
      if (!s.mortgaged[i]) act('mortgage', t('抵押 +', 'Mortgage +') + money(tile.price / 2));
      else if (s.phase !== 'debt') act('unmortgage', t('赎回 ', 'Redeem ') + money(Math.round(tile.price * 0.055) * 10));
      act('sell', t('卖给银行 +', 'Sell to bank +') + money(Math.round(tile.price * (s.mortgaged[i] ? 0.01 : 0.06)) * 10), 'btn-danger');
      box.append(row);
    }
    return box;
  }
  // The computer's reason for a decision, in words.
  function reason(w) {
    const g = w.g != null ? gname(w.g) : '', s = w.s != null ? name(w.s) : '', n = w.n != null ? money(w.n) : '';
    switch (w.c) {
      case 'complete': return t('凑齐' + g + '组', 'completes the ' + g + ' group');
      case 'block': return t('拦住 ' + s + ' 凑齐' + g + '组', 'stops ' + s + ' completing ' + g);
      case 'pair': return t('和同组已有的地凑在一起', 'joins land it has in that group');
      case 'value': return t('价格合适，现金够用', 'fair price, cash to spare');
      case 'cash': return t('现金很宽裕', 'plenty of cash');
      case 'reserve': return t('要留现金防过路费' + (n ? '（约 ' + n + '）' : ''), 'keeps cash for rent' + (n ? ' (about ' + n + ')' : ''));
      case 'late': return t('后期只买能凑组或拦人的地', 'late on it only buys land that completes or blocks a group');
      case 'random': return t('随手放过', 'just passed');
      case 'ahead': return t(s + ' 在前方 ' + w.n + ' 格，最可能踩到' + g + '组', s + ' is ' + w.n + ' squares before the ' + g + ' group');
      case 'build': return t('整组盖房，提高过路费', 'builds on a whole group');
      case 'raise': return t('筹钱付 ' + n, 'raising ' + n);
      case 'redeem': return t('现金宽裕，赎回抵押', 'cash to spare: redeems');
      case 'early': return t('前期出去抢地', 'early on: out to buy land');
      case 'hide': return t('后期留在休息站躲过路费', 'late on: stays put to avoid rent');
      case 'poor': return t('现金不多，碰运气掷对子', 'short of cash: tries for a double');
      case 'want': return t('想向 ' + s + ' 要' + g + '组缺的城市', 'wants the ' + g + ' cities it lacks from ' + s);
      case 'swap': return t('互换：双方各凑齐一组', 'a swap: a whole group each');
      case 'swap2': return t('互换：' + s + ' 也离凑齐一组更近', 'a swap that brings ' + s + ' closer to a group too');
      case 'plan': return t('分批收购' + g + '组，先找 ' + s, 'buying up the ' + g + ' group, starting with ' + s);
      case 'sale': return t('缺钱，把地卖给用得上的 ' + s + (n ? '（' + n + '）' : ''), 'short of cash: offers land to ' + s + ', who can use it' + (n ? ' (' + n + ')' : ''));
      case 'closer': return t('离凑齐' + g + '组更近一步', 'one city closer to the ' + g + ' group');
      case 'cheap': return t('低于地价买到就赚', 'below its price it is a gain');
      case 'fair': return t('这笔交易划算', 'a good deal');
      case 'unfair': return t('不划算', 'not worth it');
      case 'gift': return t('会让 ' + s + ' 凑齐' + g + '组', 'would give ' + s + ' the ' + g + ' group');
      case 'ask': return t('还价到 ' + n, 'counters at ' + n);
      case 'limit': return t('超过心理价位 ' + n, 'over its limit of ' + n);
      case 'autoplay': return t('托管中不交易、不竞拍', 'auto-play does not trade or bid');
      default: return '';
    }
  }
  function line(e) {
    const who = name(e.seat), to = e.to != null ? name(e.to) : '';
    switch (e.kind) {
      case 'roll': return t(who + ' 掷出 ' + e.dice[0] + ' + ' + e.dice[1], who + ' rolled ' + e.dice[0] + ' + ' + e.dice[1]);
      case 'start': return t(who + ' 经过起点 +' + money(e.amount), who + ' passed Start +' + money(e.amount));
      case 'buy': return t(who + ' 买下 ' + tn(e.tile) + '（' + money(e.price) + '）', who + ' bought ' + tn(e.tile) + ' (' + money(e.price) + ')');
      case 'pass': return t(who + ' 没买 ' + tn(e.tile) + (e.auction ? '，进入拍卖' : ''), who + ' passed on ' + tn(e.tile) + (e.auction ? '; it goes to auction' : ''));
      case 'won': return t(who + ' 拍得 ' + tn(e.tile) + '（' + money(e.price) + '）', who + ' won ' + tn(e.tile) + ' at auction (' + money(e.price) + ')');
      case 'unsold': return t(tn(e.tile) + ' 没人出价，留在银行', 'No bids for ' + tn(e.tile) + '; the bank keeps it');
      case 'rent': return t(who + ' 付给 ' + to + ' 过路费 ' + money(e.amount), who + ' paid ' + to + ' ' + money(e.amount) + ' rent');
      case 'tax': return t(who + ' 交税 ' + money(e.amount), who + ' paid ' + money(e.amount) + ' tax');
      case 'fine': return t(who + ' 交罚款 ' + money(e.amount), who + ' paid a ' + money(e.amount) + ' fine');
      case 'repairs': return t(who + ' 付维修费 ' + money(e.amount), who + ' paid ' + money(e.amount) + ' for repairs');
      case 'card': return t(who + ' 抽到' + (e.deck === 'chance' ? '机会' : '新闻') + '：' + (CARDS[e.id]?.[0] || '') + (e.group ? '（' + gname(e.group) + '组）' : ''), who + ' drew ' + (e.deck === 'chance' ? 'Chance' : 'News') + ': ' + (CARDS[e.id]?.[1] || '') + (e.group ? ' (' + gname(e.group) + ')' : ''));
      case 'jail': return t(who + ' 进了休息站', who + ' went to the rest stop');
      case 'free': return t(who + ' 掷出对子，离开休息站', who + ' rolled a double and left the rest stop');
      case 'fee': return t(who + ' 交 ' + money(e.amount) + ' 离开休息站', who + ' paid ' + money(e.amount) + ' to leave the rest stop');
      case 'freeCard': return t(who + ' 用免费卡离开休息站', who + ' used a free card');
      case 'build': return t(who + ' 在 ' + tn(e.tile) + (e.level === 4 ? ' 建了酒店' : ' 盖了第 ' + e.level + ' 栋房'), who + (e.level === 4 ? ' built a hotel on ' : ' built house ' + e.level + ' on ') + tn(e.tile));
      case 'sellHouse': return t(who + ' 卖掉 ' + tn(e.tile) + ' 的一栋房', who + ' sold a house on ' + tn(e.tile));
      case 'mortgage': return t(who + ' 抵押了 ' + tn(e.tile), who + ' mortgaged ' + tn(e.tile));
      case 'unmortgage': return t(who + ' 赎回了 ' + tn(e.tile), who + ' redeemed ' + tn(e.tile));
      case 'sell': return t(who + ' 把 ' + tn(e.tile) + ' 卖回银行', who + ' sold ' + tn(e.tile) + ' to the bank');
      case 'propose': return t(who + ' 向 ' + to + ' 提议：给出 ' + deal(e.give) + '，换 ' + deal(e.get), who + ' offered ' + to + ' ' + deal(e.give) + ' for ' + deal(e.get));
      case 'counter': return t(who + ' 还价：给出 ' + deal(e.give) + '，换 ' + deal(e.get), who + ' countered: ' + deal(e.give) + ' for ' + deal(e.get));
      case 'trade': return t(who + ' 和 ' + to + ' 成交：' + who + ' 给出 ' + deal(e.give) + '，' + to + ' 给出 ' + deal(e.get), who + ' and ' + to + ' traded: ' + deal(e.give) + ' for ' + deal(e.get));
      case 'reject': return t(who + (e.late ? ' 没有及时回复，' : ' ') + '拒绝了 ' + to + ' 的交易', who + (e.late ? ' did not answer in time and' : '') + ' refused ' + to + '’s trade');
      case 'cancel': return t(who + ' 撤回了给 ' + to + ' 的交易', who + ' withdrew the trade offered to ' + to);
      case 'bankrupt':
        if (e.liquidate) return t(who + ' 破产了' + (to ? '，清算后付给 ' + to + ' ' + money(e.amount) : '') + '，地产退回银行', who + ' went bankrupt' + (to ? '; ' + to + ' gets ' + money(e.amount) + ' from the sale' : '') + '; the land goes back to the bank');
        return t(who + ' 破产了' + (to ? '，地产归 ' + to : ''), who + ' went bankrupt' + (to ? '; their land goes to ' + to : ''));
      case 'left': return t(who + ' 离开了', who + ' left');
      default: return '';
    }
  }
  function logList() {
    const s = ui.view.state, list = el('ol', {class: 'tr-log mono-log'});
    let round = null;
    for (const e of s.log.slice().reverse()) {
      const text = line(e);
      if (!text) continue;
      if (e.r != null && e.r !== round) { round = e.r; list.append(el('li', {class: 'mono-log-round', text: t('第 ' + e.r + ' 回合', 'Round ' + e.r)})); }
      list.append(el('li', {}, text, e.why ? el('span', {class: 'why', text: ' — ' + (e.why.by != null && e.why.by !== e.seat ? name(e.why.by) + t('：', ': ') : '') + reason(e.why)}) : null));
    }
    return list;
  }
  function side() {
    const v = ui.view, s = v.state, api = ui.api, you = me(), box = ui.side;
    box.replaceChildren();
    box.append(detail());
    const list = el('ol', {class: 'mono-players'});
    for (const p of s.players) {
      const props = Object.entries(s.owner).filter(([, o]) => o === p.seat).map(([i]) => Number(i)).sort((a, b) => a - b);
      const row = el('li', {class: (p.seat === s.turn && s.phase !== 'finished' ? 'turn ' : '') + (p.out ? 'out' : '')},
        dot(p.seat), el('strong', {text: (p.seat + 1) + ' · ' + name(p.seat)}),
        el('span', {class: 'cash', text: money(p.cash)}), el('span', {class: 'hint', text: t('总资产 ', 'worth ') + money(p.worth)}),
        p.jail ? el('span', {class: 'pill off', text: t('休息站', 'Rest stop')}) : null, p.free ? el('span', {class: 'pill', text: t('免费卡 ×', 'Free card ×') + p.free}) : null,
        v.seats[p.seat]?.auto ? el('span', {class: 'pill off', text: t('托管', 'Auto')}) : null, p.out ? el('span', {class: 'pill off', text: t('出局', 'Out')}) : null,
        el('span', {class: 'props'}, ...props.map(i => { const chip = el('button', {class: 'prop' + (s.mortgaged[i] ? ' mortgaged' : ''), type: 'button', title: tn(i), text: i + ' ' + tname(i).slice(0, 2), onclick: () => { ui.selected = i; draw(); }}); if (s.tiles[i].group) chip.style.setProperty('--g', GROUP[s.tiles[i].group]); return chip; })));
      list.append(row);
    }
    box.append(el('h3', {text: t('玩家', 'Players')}), list);
    box.append(el('h3', {text: t('资产走势', 'Net worth by round')}), chart(s.history, s.players, 160));
    if (v.rules.autoplay && s.phase !== 'finished') {
      const auto = !!v.seats[you]?.auto;
      box.append(el('div', {class: 'actions quiet'}, el('span', {class: 'hint', text: auto ? t('电脑正在替你玩', 'The computer is playing for you') : t('暂时离开可以交给电脑', 'Stepping away? Let the computer play')}),
        el('button', {class: 'btn btn-ghost btn-sm', type: 'button', text: auto ? t('接管', 'Take over') : t('托管', 'Auto-play'), onclick: () => api.act('takeover', {auto: !auto}).catch(() => {})})));
    }
    box.append(ui.speed, el('h3', {text: t('记录', 'Log')}), logList());
  }

  // ---- Net worth chart: one line per player in the seat colour, numbered like the tokens, with a legend, a hover
  // read-out for any round and a table. ----------------------------------------------------------------------------------
  // A fitted range with clean steps (a line chart needs no zero baseline; differences matter more than totals).
  function range(values) {
    const lo0 = Math.min(...values), hi0 = Math.max(...values), raw = Math.max(hi0 - lo0, 2000) / 3;
    const mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(k => k >= raw);
    const lo = Math.max(0, Math.floor(lo0 / step) * step), hi = Math.max(Math.ceil(hi0 / step) * step, lo + step);
    const ticks = [];
    for (let v = lo; v <= hi + 1e-6; v += step) ticks.push(v);
    return {lo, hi, ticks};
  }
  function chart(history, players, height) {
    const n = history.length;
    if (n < 2) return el('p', {class: 'hint', text: t('第 2 回合开始后显示每回合开始时的总资产。', 'From round 2 this shows everyone’s net worth at the start of each round.')});
    const W = 260, H = height, L = 38, R = 20, T = 12, Bm = 22, {lo, hi, ticks} = range(history.flat());
    const x = i => L + (W - L - R) * (i / (n - 1)), y = val => T + (H - T - Bm) * (1 - (val - lo) / (hi - lo));
    const last = history.at(-1), leader = players.reduce((a, p) => (last[p.seat] ?? 0) > (last[a.seat] ?? 0) ? p : a, players[0]);
    const root = svg('svg', {viewBox: '0 0 ' + W + ' ' + H, class: 'mono-chart-svg', role: 'img',
      'aria-label': t('资产走势，' + n + ' 个记录点；目前领先：' + name(leader.seat) + ' ' + money(last[leader.seat] ?? 0), 'Net worth over ' + n + ' points; leading: ' + name(leader.seat) + ' ' + money(last[leader.seat] ?? 0))});
    for (const val of ticks) root.append(svg('line', {x1: L, x2: W - R, y1: y(val), y2: y(val), class: 'grid'}), svg('text', {x: L - 6, y: y(val) + 4, class: 'tick', 'text-anchor': 'end'}, compact(val)));
    root.append(svg('text', {x: L, y: H - 6, class: 'tick', 'text-anchor': 'start'}, t('第 1 回合', 'Round 1')), svg('text', {x: W - R, y: H - 6, class: 'tick', 'text-anchor': 'end'}, t('现在', 'Now')));
    for (const p of players) {
      const g = svg('g', {class: 'series'});
      g.style.setProperty('--seat', B.color(p.seat));
      g.append(svg('polyline', {class: 'line', points: history.map((row, i) => x(i).toFixed(1) + ',' + y(row[p.seat] ?? 0).toFixed(1)).join(' ')}),
        svg('circle', {class: 'end', cx: x(n - 1), cy: y(last[p.seat] ?? 0), r: 7}),
        svg('text', {class: 'end-no', x: x(n - 1), y: y(last[p.seat] ?? 0) + 3.5, 'text-anchor': 'middle'}, String(p.seat + 1)));
      root.append(g);
    }
    const cross = svg('line', {class: 'cross', y1: T, y2: H - Bm, x1: L, x2: L, visibility: 'hidden'});
    root.append(cross);
    const tip = el('div', {class: 'mono-tip', hidden: true});
    const wrap = el('div', {class: 'mono-chart'}, root, tip);
    const show = event => {
      const box = root.getBoundingClientRect(), px = (event.clientX - box.left) / box.width * W;
      const i = Math.max(0, Math.min(n - 1, Math.round((px - L) / (W - L - R) * (n - 1))));
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
      tip.replaceChildren(el('strong', {text: i === n - 1 ? t('现在', 'Now') : t('第 ' + (i + 1) + ' 回合开始', 'Start of round ' + (i + 1))}),
        ...players.map(p => ({p, val: history[i][p.seat] ?? 0})).sort((a, b) => b.val - a.val).map(({p, val}) => el('span', {}, dot(p.seat), (p.seat + 1) + ' ' + name(p.seat) + ' ' + money(val))));
      tip.hidden = false;
      tip.style.left = Math.min(70, Math.max(0, x(i) / W * 100 - 15)) + '%';
    };
    root.addEventListener('pointermove', show); root.addEventListener('pointerdown', show);
    root.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
    const legend = el('ul', {class: 'mono-legend'}, ...players.map(p => el('li', {}, dot(p.seat), (p.seat + 1) + ' ' + name(p.seat))));
    const table = el('table', {class: 'mono-table'}, el('thead', {}, el('tr', {}, el('th', {text: t('回合', 'Round')}), ...players.map(p => el('th', {text: (p.seat + 1) + ' ' + name(p.seat)})))),
      el('tbody', {}, ...history.map((row, i) => el('tr', {}, el('td', {text: i === n - 1 ? t('现在', 'now') : String(i + 1)}), ...players.map(p => el('td', {text: money(row[p.seat] ?? 0)}))))));
    return el('div', {}, wrap, legend, el('details', {class: 'mono-data'}, el('summary', {text: t('查看数据表', 'Show the table')}), table));
  }

  function result(v) {
    const s = v.state, o = s.outcome, you = me();
    const why = {rounds: t(o.rounds + ' 回合结束，总资产最多', 'richest after ' + o.rounds + ' rounds'), bankrupt: t('其他玩家都破产了', 'everyone else went bankrupt'),
      time: t('时间到，总资产最多', 'time is up: the richest wins'), cap: t('第 ' + o.rounds + ' 回合仍未分出胜负，按总资产', 'no winner by round ' + o.rounds + ': the richest wins')};
    const box = el('div', {class: 'result ' + (o.winner === you ? 'win' : o.winner == null ? 'neutral' : 'lose')},
      el('div', {class: 'result-emoji', 'aria-hidden': 'true', text: o.winner === you ? '🏆' : o.winner == null ? '🤝' : '🏙️'}),
      el('h2', {text: o.winner == null ? t('平局', 'A draw') : o.winner === you ? t('你赢了！', 'You won!') : t(name(o.winner) + ' 赢了', name(o.winner) + ' won')}),
      el('p', {class: 'hint', text: why[o.reason] || ''}));
    const list = el('ol', {class: 'tr-rank'});
    for (const r of o.ranking) list.append(el('li', {}, dot(r.seat), ' ' + name(r.seat) + ' · ' + (r.out ? t('破产', 'bankrupt') : money(r.worth))));
    box.append(list);
    return box;
  }

  // ---- Time limit -----------------------------------------------------------------------------------------------------
  function endClock() {
    const s = ui?.view?.state;
    if (!s || s.mode !== 'time' || !s.endsAt) return;
    const v = ui.view, now = v.paused ? v.paused.since : ui.api.serverNow(), left = s.endsAt - now;
    for (const node of document.querySelectorAll('[data-endclock]')) node.textContent = left > 0 ? t('剩余 ', '') + ui.api.fmt(left) + t('', ' left') : t('时间到，本回合结束后结算', 'time is up: the game ends with this turn');
  }
  setInterval(endClock, 1000);

  // ---- Putting it together --------------------------------------------------------------------------------------------
  function mount() {
    // Moved only when the place changes, so a field being typed in keeps its focus.
    if (narrow.matches) { if (ui.actions.parentNode !== ui.sheetBody) ui.sheetBody.append(ui.actions, ui.extra); }
    else { if (ui.actions.parentNode !== ui.slot) ui.slot.append(ui.actions); if (ui.extra.parentNode !== ui.under) ui.under.append(ui.extra); }
    ui.sheet.hidden = !narrow.matches;
    ui.root.classList.toggle('has-sheet', narrow.matches);
    const actor = ui.view.state.actor;
    if (actor === me() && ui.lastActor !== actor) ui.sheet.classList.add('open');
    ui.lastActor = actor;
  }
  // Redraws everything; a field being typed in (by its data-keep name) gets its focus and cursor back.
  function draw() {
    if (!ui?.view) return;
    const active = document.activeElement, focus = active?.dataset?.keep;
    let start = null, end = null;
    try { start = active.selectionStart; end = active.selectionEnd; } catch {}
    if (ui.view.state.phase !== 'auction') ui.bidDraft = '';
    paint(); modeLine(); actions(); side(); mount();
    const again = focus && document.querySelector('[data-keep="' + focus + '"]');
    if (again && again !== document.activeElement) { again.focus({preventScroll: true}); try { if (start != null) again.setSelectionRange(start, end); } catch {} }
  }
  // The drawer is outside the room's markup: hide it whenever the game is not on the page (lobby, another room).
  setInterval(() => { if (ui && !ui.root.isConnected) ui.sheet.hidden = true; }, 400);
  function render(stage, v, api) {
    const s = v.state;
    if (!s || v.you == null) return;
    const key = v.code + ':' + v.matches;
    if (!ui || ui.key !== key) { ui?.sheet.remove(); ui = build(v, api); ui.key = key; }
    ui.api = api; ui.view = v;
    if (ui.composer && (s.phase === 'finished' || (ui.composer.counter ? s.trade?.to !== v.you : s.trade || s.turn !== v.you || s.actor !== v.you))) ui.composer = null;
    enqueue();
    draw();
    stage.append(ui.root);
  }
  narrow.addEventListener('change', () => { if (ui?.view) ui.api.redraw(); });

  const fallback = {mode: 'rounds', minutes: 60, auction: 0, trade: 0};
  window.Play.register('monopoly', {
    render,
    summary: (r, view) => r.winner == null ? t('平局', 'Draw') : view && r.winner === view.you ? t('你赢了', 'You won') : t('其他玩家赢了', 'Someone else won'),
    intro: ['大富翁：掷骰子绕城市一圈，买地收过路费，凑齐一组盖房；可以和其他玩家交易，没人买的地拿去拍卖。人数不够时用电脑补位。', 'Tycoon: roll around the board, buy cities, collect rent and build on whole groups; trade with the others and auction land nobody buys. Computers fill empty seats.'],
    leaveWarning: () => ['离开等于破产：你的地产交还银行，其他人继续。确定离开吗？', 'Leaving counts as bankruptcy: your land goes back to the bank and the others play on. Leave?'],
    settings: [
      {name: 'players', label: ['玩家人数', 'Players'], options: [[2, '2 人', '2'], [3, '3 人', '3'], [4, '4 人', '4'], [5, '5 人', '5']]},
      {name: 'mode', label: ['胜负方式', 'How to win'], fallback: fallback.mode, options: [['rounds', '限定回合', 'Set rounds'], ['classic', '经典：只剩一人', 'Classic: last one standing'], ['time', '限时', 'Time limit']]},
      {name: 'rounds', label: ['回合数', 'Rounds'], show: s => (s.mode ?? fallback.mode) === 'rounds', options: [[15, '15 回合', '15'], [20, '20 回合', '20'], [25, '25 回合', '25'], [30, '30 回合', '30']]},
      {name: 'minutes', label: ['限时', 'Time limit'], fallback: fallback.minutes, show: s => s.mode === 'time', options: [[30, '30 分钟', '30 min'], [60, '60 分钟', '60 min'], [90, '90 分钟', '90 min']]},
      {name: 'limit', label: ['每步限时', 'Time per step'], options: [[30, '30 秒', '30 s'], [45, '45 秒', '45 s'], [90, '90 秒', '90 s'], [0, '不限时', 'No limit']]},
      {name: 'auction', label: ['没人买的地', 'Land nobody buys'], fallback: fallback.auction, options: [[1, '拍卖', 'Auction'], [0, '留给银行', 'Stays with the bank']]},
      {name: 'trade', label: ['玩家交易', 'Trading'], fallback: fallback.trade, options: [[1, '开启', 'On'], [0, '关闭', 'Off']]}
    ],
    rules: () => [
      ['每人 15,000 起步。轮到你时掷两个骰子前进；经过起点 +2,000，正好停在起点 +3,000。掷出对子再掷一次，连续三次对子进休息站。格子上的数字是序号，记录里写作“#序号 名称”。', 'Everyone starts with 15,000. Roll two dice and move; passing Start pays 2,000, landing on it 3,000. Doubles roll again; three in a row send you to the rest stop. Squares are numbered; the log writes “#number name”.'],
      ['停在没人买的城市或交通枢纽可以买下；不买就拍卖（如果开启）：大家轮流加价，每次至少 100，放弃就退出，最高出价者买下。停在别人的地要付过路费。整组都是你的（且没抵押）时过路费翻倍，还可以平均盖 1–3 栋房和酒店。', 'Unowned cities and hubs can be bought; pass and (if on) the land is auctioned: everyone raises in turn by at least 100 or folds, and the highest bid buys it. Land on someone else’s and pay rent. A whole group (none mortgaged) doubles the rent and lets you build 1–3 houses and a hotel, evenly.'],
      ['交易（如果开启）：轮到你时可以向任何人提议，用地和现金交换（只能一方出钱，有房子的色组要先卖房）；对方可以接受、拒绝或还价，最多还价 3 次。电脑会为了凑齐一组来找你交易，缺钱时也会把地卖给用得上的人；它按剩下的回合估算一块地还能收多少过路费，越到后期越肯卖。', 'Trading (if on): on your turn offer anyone land and cash (one side pays; sell the houses in a group first); they accept, refuse or counter, up to three times. Computers come to you for the cities a group lacks, and offer land to whoever can use it when short of cash; they value land by the rent it can still earn in the rounds left, so they sell more readily late on.'],
      ['机会卡只影响你，新闻影响所有人（有的持续一轮）。税务局交现金的 10%。休息站最多停 3 轮，可以交 500 或用免费卡离开，掷出对子也能离开。钱不够时卖房（半价）、抵押（得一半，赎回付 55%）或卖地给银行（六成）；实在付不起就破产：房子和地按这些价钱卖给银行，连同现金付给债主（最多到欠款），地产退回银行，之后谁停在上面都可以买。', 'Chance cards affect only you; news affects everyone (some for a round). The tax office takes 10% of your cash. The rest stop holds you up to three turns: pay 500, use a free card, or roll a double. Short of money? Sell houses (half price), mortgage (half; redeem for 55%) or sell to the bank (60%); if you still cannot pay you are bankrupt: your houses and land are sold to the bank at those prices, the creditor gets that and your cash (up to what you owe), and the land goes back to the bank for anyone to buy.'],
      ['胜负：限定回合——最后一回合结束时总资产（现金 + 地价 + 房屋，抵押的地算一半）最多者赢；经典——玩到只剩一人，从第 25 回合起每 10 回合过路费上涨一半，第 100 回合仍未分出胜负按总资产；限时——时间到后打完当前回合按总资产。超时由电脑代你决定，连续两次超时转为托管，点“接管”收回。', 'Winning: set rounds — the highest net worth (cash + land + buildings, mortgaged land at half) after the last round; classic — the last player standing, with rents up by half every ten rounds from round 25 and the richest winning if it reaches round 100; time limit — the richest when the turn in which time runs out ends. A timed-out step is decided by the computer; two in a row hand your seat to it until you take over.']
    ]
  });
})();
