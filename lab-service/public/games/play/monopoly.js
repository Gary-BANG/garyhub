/* GaryHub Games (v2.4.3.2): 大富翁 / Tycoon in a live room. A 32-square ring on Board's 9×9 grid with dice and walking
   tokens in the middle; tap a square for its details and, on your turn, to build, sell or mortgage it. */
(() => {
  'use strict';
  const G = window.Games, {t, el} = G, B = window.Board;
  const GROUP = {1: '#a1887f', 2: '#81d4fa', 3: '#f48fb1', 4: '#ffb74d', 5: '#e57373', 6: '#fff176', 7: '#81c784'};
  const ICON = {go: '⟲', chance: '？', news: '📰', tax: '¥', jail: '☕', park: '🌳', gotojail: '➜', transit: '🚄'};
  const CARDS = {
    scholarship: ['奖学金：收到 1,500', 'Scholarship: receive 1,500'], fine: ['超速罚款：付 800', 'Speeding fine: pay 800'], start: ['前进到起点（领取 3,000）', 'Advance to Start (collect 3,000)'],
    back: ['后退 3 格', 'Go back three squares'], transit: ['前往最近的交通枢纽', 'Go to the nearest transit hub'], repairs: ['房屋维修：每栋房 200，每座酒店 800', 'Repairs: 200 per house, 800 per hotel'],
    birthday: ['生日：每位玩家给你 300', 'Birthday: every player gives you 300'], free: ['免费离开休息站卡（可保留）', 'Leave the rest stop free (keep this card)'], jail: ['前往休息站', 'Go to the rest stop'],
    discount: ['本回合买地打八折', 'Land costs 20% less this turn'], subsidy: ['补贴：每人 +500', 'Subsidy: everyone +500'], boom: ['楼市火热：一轮内过路费 ×1.5', 'Property boom: rents ×1.5 for a round'],
    slump: ['淡季：一轮内过路费 ×0.5', 'Quiet season: rents ×0.5 for a round'], typhoon: ['台风：一个色组一轮内免过路费', 'Typhoon: one colour group charges no rent for a round'],
    upkeep: ['维修季：每人按房屋交费（每栋 100，酒店 400）', 'Upkeep: everyone pays 100 per house, 400 per hotel'], charity: ['慈善晚会：现金最多的玩家给最少的 1,000', 'Charity gala: the richest player gives the poorest 1,000'],
    interest: ['利息：每人得到现金的 5%（最多 1,000）', 'Interest: everyone gets 5% of their cash (up to 1,000)'], transitFest: ['交通节：一轮内交通枢纽过路费 ×2', 'Transit festival: hub rents ×2 for a round']};
  const PHASE = {roll: ['掷骰子', 'roll'], buy: ['决定是否购买', 'deciding to buy'], debt: ['筹钱付款', 'raising money'], manage: ['整理地产', 'managing']};
  const money = n => '¥' + Math.round(n).toLocaleString('en-US');
  const rc = i => i <= 8 ? [8, 8 - i] : i <= 16 ? [8 - (i - 8), 0] : i <= 24 ? [0, i - 16] : [i - 24, 8];
  let ui = null;

  function build(v, api) {
    const s = v.state, board = B.grid(9, 9, 'mono-board');
    s.tiles.forEach((tile, i) => {
      const [r, c] = rc(i), cell = el('button', {class: 'mt ' + tile.kind + (r === 0 || r === 8 ? (c === 0 || c === 8 ? ' corner' : ' row') : ' col'), type: 'button'},
        el('span', {class: 'mt-band'}), el('span', {class: 'mt-icon', text: ICON[tile.kind] && tile.kind !== 'transit' ? ICON[tile.kind] : tile.kind === 'transit' ? (i === 13 ? '🚄' : '✈️') : ''}),
        el('span', {class: 'mt-name'}), el('span', {class: 'mt-sub'}), el('span', {class: 'mt-houses'}));
      if (tile.group) cell.style.setProperty('--g', GROUP[tile.group]);
      cell.addEventListener('click', () => { ui.selected = ui.selected === i ? null : i; panel(); paint(); });
      board.place(i, r, c, cell);
    });
    const centre = el('div', {class: 'mono-centre'});
    centre.style.gridRow = '2 / span 7'; centre.style.gridColumn = '2 / span 7';
    board.tiles.append(centre);
    const dice = B.dice(2), card = el('div', {class: 'mono-card', hidden: true});
    const side = el('div', {class: 'mono-side'});
    const root = el('div', {class: 'mono'}, el('div', {class: 'mono-board-wrap'}, board.root), side);
    return {root, board, centre, dice, card, side, key: '', animSeq: -1, cardSeq: -1, selected: null, api, view: null};
  }
  const name = seat => ui.api.seatName(seat);
  const tname = i => t(...ui.view.state.tiles[i].name);

  function paint() {
    const s = ui.view.state;
    s.tiles.forEach((tile, i) => {
      const cell = ui.board.cell(i), owner = s.owner[i], houses = s.houses[i] || 0;
      cell.querySelector('.mt-name').textContent = t(...tile.name);
      cell.querySelector('.mt-sub').textContent = tile.price ? (owner != null ? (s.mortgaged[i] ? t('抵押', 'mortgaged') : money(s.rents[i] ?? 0)) : money(tile.price)) : '';
      cell.querySelector('.mt-houses').textContent = houses === 4 ? '🏨' : '●'.repeat(houses);
      cell.classList.toggle('owned', owner != null); cell.classList.toggle('mortgaged', !!s.mortgaged[i]); cell.classList.toggle('selected', ui.selected === i);
      if (owner != null) cell.style.setProperty('--owner', B.color(owner)); else cell.style.removeProperty('--owner');
    });
    const here = new Map();
    for (const p of s.players) { if (p.out) { ui.board.remove(p.seat); continue; } const list = here.get(p.pos) || []; list.push(p.seat); here.set(p.pos, list); }
    for (const p of s.players) {
      if (p.out) continue;
      const token = ui.board.token(p.seat, String(p.seat + 1));
      token.classList.toggle('turn', p.seat === s.turn && s.phase !== 'finished'); token.classList.toggle('jailed', !!p.jail);
      token.title = name(p.seat);
      if (!ui.board.busy(p.seat)) { const list = here.get(p.pos); ui.board.put(p.seat, p.pos, list.indexOf(p.seat), list.length); }
    }
  }
  async function animate() {
    const s = ui.view.state, last = s.last;
    if (s.card && s.card.seq > ui.cardSeq) {
      const first = ui.cardSeq < 0; ui.cardSeq = s.card.seq;
      if (!first) {
        const [zh, en] = CARDS[s.card.id] || ['', ''];
        ui.card.hidden = false;
        ui.card.replaceChildren(el('small', {text: name(s.card.seat) + t(' 抽到', ' drew ') + (s.card.deck === 'chance' ? t('机会', 'Chance') : t('新闻', 'News'))}), el('strong', {text: t(zh, en) + (s.card.group ? ' · ' + t('色组 ', 'group ') + s.card.group : '')}));
        clearTimeout(ui.cardTimer); ui.cardTimer = setTimeout(() => { ui.card.hidden = true; }, 3500);
      }
    }
    if (!last || last.seq <= ui.animSeq) { ui.dice.set(s.dice); return; }
    const first = ui.animSeq < 0;
    ui.animSeq = last.seq;
    if (first) { ui.dice.set(s.dice); return; }
    if (last.dice) await ui.dice.roll(last.dice);
    await ui.board.walk(last.seat, last.path, 140);
    paint();
  }

  function centre() {
    const v = ui.view, s = v.state, api = ui.api, me = v.you, mine = s.turn === me && s.phase !== 'finished', p = s.players[me];
    const box = ui.centre;
    box.replaceChildren();
    if (s.phase === 'finished') { box.append(result(v)); return; }
    box.append(el('p', {class: 'eyebrow', text: t('第 ' + s.round + ' / ' + s.maxRounds + ' 回合', 'Round ' + s.round + ' / ' + s.maxRounds)}),
      el('h2', {text: mine ? t('轮到你：' + PHASE[s.phase][0], 'Your turn: ' + PHASE[s.phase][1]) : t(name(s.turn) + ' ' + PHASE[s.phase][0] + '…', name(s.turn) + ' is ' + PHASE[s.phase][1] + '…')}),
      el('div', {class: 'mono-dice'}, ui.dice.root), api.clock());
    const actions = el('div', {class: 'actions'});
    if (mine && s.phase === 'roll') {
      actions.append(el('button', {class: 'btn btn-gold', type: 'button', text: t('掷骰子', 'Roll'), onclick: () => api.act('roll').catch(() => {})}));
      if (p.jail) {
        actions.append(el('button', {class: 'btn btn-ghost btn-sm', type: 'button', disabled: p.cash < 500, text: t('交 500 离开', 'Pay 500 to leave'), onclick: () => api.act('payJail').catch(() => {})}));
        if (p.free) actions.append(el('button', {class: 'btn btn-ghost btn-sm', type: 'button', text: t('用免费卡', 'Use free card'), onclick: () => api.act('useFree').catch(() => {})}));
      }
    }
    if (mine && s.phase === 'buy') {
      box.append(el('p', {class: 'mono-ask', text: t('买下 ' + tname(s.pending.tile) + '，' + money(s.pending.price) + '？', 'Buy ' + tname(s.pending.tile) + ' for ' + money(s.pending.price) + '?')}));
      actions.append(el('button', {class: 'btn btn-gold', type: 'button', disabled: p.cash < s.pending.price, text: t('购买', 'Buy'), onclick: () => api.act('buy').catch(() => {})}),
        el('button', {class: 'btn btn-ghost', type: 'button', text: t('不买', 'Pass'), onclick: () => api.act('pass').catch(() => {})}));
    }
    if (mine && s.phase === 'debt') {
      const reason = {rent: t('过路费', 'rent'), tax: t('税', 'tax'), fine: t('罚款', 'a fine'), repairs: t('维修费', 'repairs')}[s.pending.reason] || '';
      box.append(el('p', {class: 'mono-ask', text: t('要付 ' + money(s.pending.amount) + '（' + reason + '），现金 ' + money(p.cash) + '。点你的地块卖房、抵押或卖地筹钱。', 'You owe ' + money(s.pending.amount) + ' (' + reason + ') and have ' + money(p.cash) + '. Tap your squares to sell houses, mortgage or sell.')}));
      actions.append(el('button', {class: 'btn btn-gold', type: 'button', disabled: p.cash < s.pending.amount, text: t('付款', 'Pay'), onclick: () => api.act('pay').catch(() => {})}),
        el('button', {class: 'btn btn-danger btn-sm', type: 'button', text: t('宣布破产', 'Declare bankruptcy'), onclick: () => { if (confirm(t('确定宣布破产吗？你的地产会交给债主，你将退出这一局。', 'Declare bankruptcy? Your land goes to the creditor and you are out.'))) api.act('bankrupt').catch(() => {}); }}));
    }
    if (mine && s.phase === 'manage') {
      box.append(el('p', {class: 'hint', text: t('可以点自己的地块盖房、抵押或卖地，然后结束回合。', 'Tap your squares to build, mortgage or sell, then end your turn.')}));
      actions.append(el('button', {class: 'btn btn-gold', type: 'button', text: t('结束回合', 'End turn'), onclick: () => api.act('end').catch(() => {})}));
    }
    box.append(actions);
    if (s.effects.length) box.append(el('div', {class: 'chips'}, ...s.effects.map(e => el('span', {class: 'pill me', text: e.kind === 'typhoon' ? t('台风：色组 ' + e.group + ' 免租', 'Typhoon: group ' + e.group + ' free') : e.kind === 'transitFest' ? t('交通节 ×2', 'Transit ×2') : (e.kind === 'boom' ? t('楼市火热 ×', 'Boom ×') : t('淡季 ×', 'Slump ×')) + e.factor}))));
    if (s.discount && mine) box.append(el('span', {class: 'pill me', text: t('本回合买地八折', '20% off land this turn')}));
    box.append(ui.card);
  }

  function detail() {
    const v = ui.view, s = v.state, api = ui.api, i = ui.selected;
    if (i == null) return el('p', {class: 'hint', text: t('点棋盘上的地块查看详情。', 'Tap a square for its details.')});
    const tile = s.tiles[i], owner = s.owner[i], me = v.you, mine = owner === me && s.turn === me && ['roll', 'buy', 'manage', 'debt'].includes(s.phase);
    const box = el('div', {class: 'mono-detail'}, el('h3', {text: t(...tile.name)}));
    if (tile.group) box.firstChild.style.setProperty('--g', GROUP[tile.group]);
    if (!tile.price) { box.append(el('p', {class: 'hint', text: {go: t('经过 +2,000，停在这里 +3,000', 'Pass: +2,000; land here: +3,000'), chance: t('抽一张机会卡', 'Draw a chance card'), news: t('抽一张新闻：影响所有人', 'Draw news: it affects everyone'), tax: t('交现金的 10%（200–1,500）', 'Pay 10% of your cash (200–1,500)'), jail: t('休息站：路过没事；被送进来要停最多 3 轮，或交 500 离开', 'Rest stop: passing is fine; if sent here, stay up to three turns or pay 500'), park: t('休息一下', 'Take a break'), gotojail: t('直接去休息站', 'Go straight to the rest stop')}[tile.kind] || ''})); return box; }
    const houseCost = s.houseCost[tile.group];
    box.append(el('p', {text: t('价格 ', 'Price ') + money(tile.price) + (tile.rent ? t(' · 基础过路费 ', ' · base rent ') + money(tile.rent) : t(' · 过路费 250／两个都有 600', ' · rent 250 / 600 with both'))}),
      el('p', {text: owner != null ? t('主人：', 'Owner: ') + name(owner) + (s.mortgaged[i] ? t('（已抵押）', ' (mortgaged)') : t(' · 现在过路费 ', ' · rent now ') + money(s.rents[i] ?? 0)) : t('无人购买', 'Unowned')}));
    if (tile.group) box.append(el('p', {class: 'hint', text: t('整组 ×2；1/2/3 栋房 ×5/×12/×20；酒店 ×28；每栋 ', 'Whole group ×2; 1/2/3 houses ×5/×12/×20; hotel ×28; each ') + money(houseCost)}));
    if (mine) {
      const actions = el('div', {class: 'actions'}), act = (a, label, cls = 'btn-ghost') => actions.append(el('button', {class: 'btn btn-sm ' + cls, type: 'button', text: label, onclick: () => api.act(a, {tile: i}).catch(() => {})}));
      if (tile.group && s.phase !== 'debt' && (s.houses[i] || 0) < 4) act('build', t('盖房 ', 'Build ') + money(houseCost), 'btn-gold');
      if (s.houses[i]) act('sellHouse', t('卖房 +', 'Sell house +') + money(houseCost / 2));
      if (!s.mortgaged[i]) act('mortgage', t('抵押 +', 'Mortgage +') + money(tile.price / 2));
      else if (s.phase !== 'debt') act('unmortgage', t('赎回 ', 'Redeem ') + money(Math.round(tile.price * 0.055) * 10));
      act('sell', t('卖给银行 +', 'Sell to bank +') + money(Math.round(tile.price * (s.mortgaged[i] ? 0.01 : 0.06)) * 10), 'btn-danger');
      box.append(actions);
    }
    return box;
  }

  function line(e) {
    const who = name(e.seat), to = e.to != null ? name(e.to) : '';
    switch (e.kind) {
      case 'roll': return t(who + ' 掷出 ' + e.dice[0] + ' + ' + e.dice[1], who + ' rolled ' + e.dice[0] + ' + ' + e.dice[1]);
      case 'start': return t(who + ' 经过起点 +' + money(e.amount), who + ' passed Start +' + money(e.amount));
      case 'buy': return t(who + ' 买下 ' + tname(e.tile) + '（' + money(e.price) + '）', who + ' bought ' + tname(e.tile) + ' (' + money(e.price) + ')');
      case 'pass': return t(who + ' 没买 ' + tname(e.tile), who + ' passed on ' + tname(e.tile));
      case 'rent': return t(who + ' 付给 ' + to + ' 过路费 ' + money(e.amount), who + ' paid ' + to + ' ' + money(e.amount) + ' rent');
      case 'tax': return t(who + ' 交税 ' + money(e.amount), who + ' paid ' + money(e.amount) + ' tax');
      case 'fine': return t(who + ' 交罚款 ' + money(e.amount), who + ' paid a ' + money(e.amount) + ' fine');
      case 'repairs': return t(who + ' 付维修费 ' + money(e.amount), who + ' paid ' + money(e.amount) + ' for repairs');
      case 'card': return t(who + ' 抽到' + (e.deck === 'chance' ? '机会' : '新闻') + '：' + (CARDS[e.id]?.[0] || ''), who + ' drew ' + (e.deck === 'chance' ? 'Chance' : 'News') + ': ' + (CARDS[e.id]?.[1] || ''));
      case 'jail': return t(who + ' 进了休息站', who + ' went to the rest stop');
      case 'free': return t(who + ' 掷出对子，离开休息站', who + ' rolled a double and left the rest stop');
      case 'fee': return t(who + ' 交 ' + money(e.amount) + ' 离开休息站', who + ' paid ' + money(e.amount) + ' to leave the rest stop');
      case 'freeCard': return t(who + ' 用免费卡离开休息站', who + ' used a free card');
      case 'build': return t(who + ' 在 ' + tname(e.tile) + (e.level === 4 ? ' 建了酒店' : ' 盖了第 ' + e.level + ' 栋房'), who + (e.level === 4 ? ' built a hotel on ' : ' built house ' + e.level + ' on ') + tname(e.tile));
      case 'sellHouse': return t(who + ' 卖掉 ' + tname(e.tile) + ' 的一栋房', who + ' sold a house on ' + tname(e.tile));
      case 'mortgage': return t(who + ' 抵押了 ' + tname(e.tile), who + ' mortgaged ' + tname(e.tile));
      case 'unmortgage': return t(who + ' 赎回了 ' + tname(e.tile), who + ' redeemed ' + tname(e.tile));
      case 'sell': return t(who + ' 把 ' + tname(e.tile) + ' 卖回银行', who + ' sold ' + tname(e.tile) + ' to the bank');
      case 'bankrupt': return t(who + ' 破产了' + (to ? '，地产归 ' + to : ''), who + ' went bankrupt' + (to ? '; their land goes to ' + to : ''));
      case 'left': return t(who + ' 离开了', who + ' left');
      default: return '';
    }
  }
  function panel() {
    const v = ui.view, s = v.state, api = ui.api, me = v.you;
    centre();
    const side = ui.side;
    side.replaceChildren();
    side.append(detail());
    const list = el('ol', {class: 'mono-players'});
    for (const p of s.players) {
      const props = Object.entries(s.owner).filter(([, o]) => o === p.seat).map(([i]) => Number(i));
      const row = el('li', {class: (p.seat === s.turn && s.phase !== 'finished' ? 'turn ' : '') + (p.out ? 'out' : '')},
        el('span', {class: 'dot', 'aria-hidden': 'true'}), el('strong', {text: name(p.seat) + (p.seat === me ? t('（你）', ' (you)') : '')}),
        el('span', {class: 'cash', text: money(p.cash)}), el('span', {class: 'hint', text: t('总资产 ', 'worth ') + money(p.worth)}),
        p.jail ? el('span', {class: 'pill off', text: t('休息站', 'Rest stop')}) : null, p.free ? el('span', {class: 'pill', text: t('免费卡 ×', 'Free card ×') + p.free}) : null,
        v.seats[p.seat]?.auto ? el('span', {class: 'pill off', text: t('托管', 'Auto')}) : null, p.out ? el('span', {class: 'pill off', text: t('出局', 'Out')}) : null,
        el('span', {class: 'props'}, ...props.map(i => { const chip = el('button', {class: 'prop' + (s.mortgaged[i] ? ' mortgaged' : ''), type: 'button', title: tname(i), text: tname(i).slice(0, 2), onclick: () => { ui.selected = i; panel(); paint(); }}); if (s.tiles[i].group) chip.style.setProperty('--g', GROUP[s.tiles[i].group]); return chip; })));
      row.querySelector('.dot').style.setProperty('--seat', B.color(p.seat));
      list.append(row);
    }
    side.append(el('h3', {text: t('玩家', 'Players')}), list);
    if (v.rules.autoplay && s.phase !== 'finished') {
      const auto = !!v.seats[me]?.auto;
      side.append(el('div', {class: 'actions quiet'}, el('span', {class: 'hint', text: auto ? t('电脑正在替你玩', 'The computer is playing for you') : t('暂时离开可以交给电脑', 'Stepping away? Let the computer play')}),
        el('button', {class: 'btn btn-ghost btn-sm', type: 'button', text: auto ? t('接管', 'Take over') : t('托管', 'Auto-play'), onclick: () => api.act('takeover', {auto: !auto}).catch(() => {})})));
    }
    const log = el('ol', {class: 'tr-log'});
    for (const e of s.log.slice().reverse()) { const text = line(e); if (text) log.append(el('li', {text})); }
    side.append(el('h3', {text: t('记录', 'Log')}), log);
  }
  function result(v) {
    const o = v.state.outcome, me = v.you;
    const why = {rounds: t(o.rounds + ' 回合结束，总资产最多', 'richest after ' + o.rounds + ' rounds'), bankrupt: t('其他玩家都破产了', 'everyone else went bankrupt')};
    const box = el('div', {class: 'result ' + (o.winner === me ? 'win' : o.winner == null ? 'neutral' : 'lose')},
      el('div', {class: 'result-emoji', 'aria-hidden': 'true', text: o.winner === me ? '🏆' : o.winner == null ? '🤝' : '🏙️'}),
      el('h2', {text: o.winner == null ? t('平局', 'A draw') : o.winner === me ? t('你赢了！', 'You won!') : t(name(o.winner) + ' 赢了', name(o.winner) + ' won')}),
      el('p', {class: 'hint', text: why[o.reason] || ''}));
    const list = el('ol', {class: 'tr-rank'});
    for (const r of o.ranking) list.append(el('li', {text: name(r.seat) + ' · ' + (r.out ? t('破产', 'bankrupt') : money(r.worth))}));
    box.append(list);
    return box;
  }

  function render(stage, v, api) {
    const s = v.state;
    if (!s || v.you == null) return;
    const key = v.code + ':' + v.matches;
    if (!ui || ui.key !== key) { ui = build(v, api); ui.key = key; }
    ui.api = api; ui.view = v;
    paint(); panel(); animate();
    stage.append(ui.root);
  }

  window.Play.register('monopoly', {
    render,
    summary: (r, view) => r.winner == null ? t('平局', 'Draw') : view && r.winner === view.you ? t('你赢了', 'You won') : t('其他玩家赢了', 'Someone else won'),
    intro: ['经典大富翁：掷骰子绕城市一圈，买地收过路费，凑齐一组盖房。人数不够时用电脑补位。', 'Classic property trading: roll around the board, buy cities, collect rent and build on whole groups. Computers fill empty seats.'],
    leaveWarning: () => ['离开等于破产：你的地产交还银行，其他人继续。确定离开吗？', 'Leaving counts as bankruptcy: your land goes back to the bank and the others play on. Leave?'],
    settings: [
      {name: 'players', label: ['玩家人数', 'Players'], options: [[2, '2 人', '2'], [3, '3 人', '3'], [4, '4 人', '4'], [5, '5 人', '5']]},
      {name: 'rounds', label: ['回合数', 'Rounds'], options: [[15, '15 回合', '15'], [20, '20 回合', '20'], [25, '25 回合', '25'], [30, '30 回合', '30']]},
      {name: 'limit', label: ['每步限时', 'Time per step'], options: [[30, '30 秒', '30 s'], [45, '45 秒', '45 s'], [90, '90 秒', '90 s'], [0, '不限时', 'No limit']]}
    ],
    rules: () => [
      ['每人 15,000 起步。轮到你时掷两个骰子前进；经过起点 +2,000，正好停在起点 +3,000。掷出对子再掷一次，连续三次对子进休息站。', 'Everyone starts with 15,000. Roll two dice and move; passing Start pays 2,000, landing on it 3,000. Doubles roll again; three in a row send you to the rest stop.'],
      ['停在没人买的城市或交通枢纽可以买下；停在别人的地要付过路费。整组都是你的（且没抵押）时过路费翻倍，还可以平均盖 1–3 栋房和酒店。', 'Unowned cities and hubs can be bought; land on someone else’s and pay rent. A whole group (none mortgaged) doubles the rent and lets you build 1–3 houses and a hotel, evenly.'],
      ['机会卡只影响你，新闻影响所有人（有的持续一轮）。税务局交现金的 10%。休息站最多停 3 轮，可以交 500 或用免费卡离开，掷出对子也能离开。', 'Chance cards affect only you; news affects everyone (some for a round). The tax office takes 10% of your cash. The rest stop holds you up to three turns: pay 500, use a free card, or roll a double.'],
      ['钱不够时卖房（半价）、抵押（得一半，赎回付 55%）或卖地给银行（六成）；实在付不起就破产，地产归债主。', 'Short of money? Sell houses (half price), mortgage (half the price; redeem for 55%) or sell land to the bank (60%). If you still cannot pay you are bankrupt and your land goes to the creditor.'],
      ['回合结束时总资产（现金 + 地价 + 房屋，抵押的地算一半）最多的人获胜，或者其他人都破产。超时由电脑代你决定，连续两次超时转为托管，点“接管”收回。', 'After the last round the highest net worth (cash + land + buildings, mortgaged land at half) wins — or the last player standing. A timed-out step is decided by the computer; two in a row hand your seat to it until you take over.']
    ]
  });
})();
