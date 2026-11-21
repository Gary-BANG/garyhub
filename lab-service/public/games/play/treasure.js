/* GaryHub Games (v2.4.3.2): 骰子抢宝箱 / Treasure Dash in a live room. Draws the 7×7 map with Board (board.js): roll, then
   tap a highlighted tile; carry a chest home to open it. Chest contents and other players' traps never reach this page. */
(() => {
  'use strict';
  const G = window.Games, {t, el} = G, B = window.Board;
  const ITEMS = {boots: ['疾风靴', 'Boots', '👟', '掷骰后使用：这回合多走 3 步', 'After rolling: three more steps this turn'],
    trap: ['暗夹', 'Trap', '🪤', '放在身边一格，只有你看得见；踩到的人掉宝箱并赔你 2 金币', 'Set next to you, seen only by you; whoever steps on it drops their chest and pays you 2 gold'],
    shield: ['护盾', 'Shield', '🛡️', '自动生效：挡住一次抢夺或暗夹', 'Works by itself: stops one robbery or trap'],
    recall: ['回城卷轴', 'Recall', '🌀', '掷骰前使用：立刻回到自己的基地（带着宝箱就直接打开）', 'Before rolling: straight back to your base (a carried chest is opened)']};
  const CHEST = {wood: ['木箱', 'wooden chest'], silver: ['银箱', 'silver chest'], gold: ['金箱', 'gold chest']};
  const TILE = {'#': 'wall', q: 'quick', x: 'spike', '?': 'itemspot', c: 'spawn', C: 'spawn centre', B: 'base', '.': 'floor'};
  let ui = null;
  const name = (api, seat) => api.seatName(seat);

  function build(v, api) {
    const s = v.state, size = s.size;
    const board = B.grid(size, size, 'treasure-board');
    for (let i = 0; i < size * size; i++) {
      const k = s.map[Math.floor(i / size)][i % size], cell = el('button', {class: 'tc ' + TILE[k], type: 'button', 'aria-label': t('第 ', 'Row ') + (Math.floor(i / size) + 1) + t(' 行第 ', ', column ') + (i % size + 1) + t(' 列', '')});
      cell.append(el('span', {class: 'tc-mark', text: k === 'q' ? '≋' : k === 'x' ? '▲' : k === '?' ? '' : ''}), el('span', {class: 'tc-thing'}));
      cell.addEventListener('click', () => tap(i));
      board.place(i, Math.floor(i / size), i % size, cell);
    }
    for (const p of s.players) { const base = board.cell(p.base); base.style.setProperty('--seat', B.color(p.seat)); base.classList.add('owned'); }
    const dice = B.dice(1), duel = el('div', {class: 'tr-duel', hidden: true});
    const side = el('div', {class: 'tr-side'});
    const root = el('div', {class: 'treasure'}, el('div', {class: 'tr-board-wrap'}, board.root, duel), side);
    return {root, board, dice, duel, side, key: '', animSeq: -1, rollSeq: -1, placing: false, api, view: null};
  }

  function tap(i) {
    const v = ui.view, s = v?.state;
    if (!s || s.turn !== v.you || s.phase === 'finished') return;
    if (ui.placing) { ui.placing = false; ui.api.act('item', {item: 'trap', at: i}).catch(() => {}); return update(); }
    if (s.phase === 'move' && s.reach?.includes(i)) ui.api.act('move', {to: i}).catch(() => {});
  }
  function neighbours(s, pos) {
    const r = Math.floor(pos / s.size), c = pos % s.size;
    return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([y, x]) => y >= 0 && y < s.size && x >= 0 && x < s.size).map(([y, x]) => y * s.size + x)
      .filter(p => !['#', 'B'].includes(s.map[Math.floor(p / s.size)][p % s.size]) && !s.players.some(o => !o.out && o.pos === p));
  }

  // Everything on the map: chests, items, my traps, highlights, then tokens (the walk of the last move first).
  function paint() {
    const v = ui.view, s = v.state, me = v.you, mine = s.turn === me && s.phase !== 'finished';
    const chests = new Map(s.chests.map(c => [c.pos, c.type])), items = new Set(s.items), traps = new Set(s.traps);
    const targets = new Set(ui.placing ? neighbours(s, s.players[me].pos) : mine && s.phase === 'move' ? s.reach || [] : []);
    for (const [i, cell] of ui.board.cells()) {
      const thing = cell.querySelector('.tc-thing'), chest = chests.get(i);
      thing.textContent = chest ? '🧰' : items.has(i) ? '❔' : traps.has(i) ? '🪤' : '';
      thing.className = 'tc-thing' + (chest ? ' chest ' + chest : items.has(i) ? ' item' : traps.has(i) ? ' trap' : '');
      cell.classList.toggle('target', targets.has(i));
      cell.classList.toggle('placing', ui.placing && targets.has(i));
      cell.disabled = !targets.has(i);
    }
    const here = new Map();
    for (const p of s.players) { if (p.out) { ui.board.remove(p.seat); continue; } const list = here.get(p.pos) || []; list.push(p.seat); here.set(p.pos, list); }
    for (const p of s.players) {
      if (p.out) continue;
      const token = ui.board.token(p.seat, String(p.seat + 1));
      token.classList.toggle('carry', !!p.carry); token.classList.toggle('turn', p.seat === s.turn && s.phase !== 'finished');
      token.title = name(ui.api, p.seat);
      if (!ui.board.busy(p.seat)) { const list = here.get(p.pos); ui.board.put(p.seat, p.pos, list.indexOf(p.seat), list.length); }
    }
  }
  async function animate() {
    const s = ui.view.state, last = s.last;
    if (s.phase === 'move' && s.roll && ui.rollSeq !== s.seq) { ui.rollSeq = s.seq; ui.dice.roll([s.roll]); }
    if (!last || last.seq <= ui.animSeq) return;
    const first = ui.animSeq < 0;
    ui.animSeq = last.seq;
    if (first) return;
    if (last.roll) ui.dice.set([last.roll]);
    await ui.board.walk(last.seat, last.teleport ? [last.path[0], last.path.at(-1)] : last.path, last.teleport ? 300 : 170);
    if (last.duel) {
      const d = last.duel;
      ui.duel.hidden = false;
      ui.duel.replaceChildren(el('strong', {text: t('抢夺！', 'Robbery!')}),
        el('span', {text: name(ui.api, last.seat) + ' 🎲' + d.a + '  vs  ' + name(ui.api, d.rival) + ' 🎲' + d.d + (d.bonus ? t('（基地 +1）', ' (base +1)') : '')}),
        el('span', {class: d.won ? 'win' : 'lose', text: d.won ? t('抢夺成功', 'Success') : t('抢夺失败', 'Failed')}));
      setTimeout(() => { ui.duel.hidden = true; }, 2600);
    }
    paint();
  }

  function line(api, e) {
    const who = name(api, e.seat);
    switch (e.kind) {
      case 'roll': return t(who + ' 掷出 ' + e.roll + '，可走 ' + e.steps + ' 步', who + ' rolled ' + e.roll + ': ' + e.steps + ' steps');
      case 'pick': return t(who + ' 捡到' + CHEST[e.type][0], who + ' picked up a ' + CHEST[e.type][1]);
      case 'bank': return t(who + ' 打开' + CHEST[e.type][0] + '：+' + e.value + ' 金币', who + ' opened a ' + CHEST[e.type][1] + ': +' + e.value + ' gold');
      case 'duel': {
        const rival = name(api, e.rival), took = e.took === 'chest' ? t('抢到宝箱', 'took the chest') : e.took === 'shield' ? t('被护盾挡住', 'stopped by a shield') : e.took > 0 ? t('抢到 ' + e.took + ' 金币', 'took ' + e.took + ' gold') : e.took < 0 ? t('失败，赔 1 金币', 'failed, paid 1 gold') : t('失败', 'failed');
        return t(who + ' 抢 ' + rival + '：' + e.a + ' 对 ' + e.d + (e.bonus ? '+1' : '') + '，' + took, who + ' robbed ' + rival + ': ' + e.a + ' vs ' + e.d + (e.bonus ? '+1' : '') + ', ' + took);
      }
      case 'spike': return t(who + ' 踩到尖刺，宝箱掉了', who + ' hit the spikes and dropped the chest');
      case 'trap': return e.blocked ? t(who + ' 的护盾挡住了一个暗夹', who + "'s shield stopped a trap") : t(who + ' 踩到 ' + name(api, e.owner) + ' 的暗夹，赔 ' + e.paid + ' 金币', who + ' stepped on ' + name(api, e.owner) + "'s trap and paid " + e.paid + ' gold');
      case 'item': return t(who + ' 得到一个道具', who + ' found an item');
      case 'use': return e.item === 'trap' ? t(who + ' 悄悄放下一个暗夹', who + ' set a hidden trap') : t(who + ' 使用了' + ITEMS[e.item][0], who + ' used ' + ITEMS[e.item][1]);
      case 'left': return t(who + ' 离开了', who + ' left');
      default: return '';
    }
  }

  function panel() {
    const v = ui.view, s = v.state, api = ui.api, me = v.you, player = s.players[me], mine = s.turn === me && s.phase !== 'finished';
    const side = ui.side;
    side.replaceChildren();
    if (s.phase === 'finished') side.append(result(v));
    else {
      const head = el('div', {class: 'tr-head'}, el('div', {}, el('p', {class: 'eyebrow', text: t('第 ' + s.round + ' / ' + s.maxRounds + ' 回合 · 目标 ' + s.goal + ' 金币', 'Round ' + s.round + ' / ' + s.maxRounds + ' · goal ' + s.goal + ' gold')}),
        el('h2', {text: mine ? (s.phase === 'roll' ? t('轮到你：掷骰子', 'Your turn: roll') : t('选一格走过去（最多 ' + s.steps + ' 步）', 'Pick a tile (up to ' + s.steps + ' steps)')) : t('轮到 ' + name(api, s.turn), name(api, s.turn) + "'s turn")})), api.clock());
      side.append(head, el('div', {class: 'tr-dice'}, ui.dice.root));
      const actions = el('div', {class: 'actions'});
      if (mine && s.phase === 'roll') actions.append(el('button', {class: 'btn btn-gold', type: 'button', text: t('掷骰子', 'Roll'), onclick: () => api.act('roll').catch(() => {})}));
      if (mine && s.phase === 'move') actions.append(el('button', {class: 'btn btn-ghost btn-sm', type: 'button', text: t('原地不动', 'Stay here'), onclick: () => api.act('move', {to: player.pos}).catch(() => {})}));
      if (ui.placing) actions.append(el('span', {class: 'hint', text: t('点一个发光的格子放暗夹', 'Tap a glowing tile for the trap')}), el('button', {class: 'btn btn-ghost btn-sm', type: 'button', text: t('取消', 'Cancel'), onclick: () => { ui.placing = false; update(); }}));
      side.append(actions);
      // My items.
      if (Array.isArray(player.items) && player.items.length) {
        const box = el('div', {class: 'tr-items'}, el('h3', {text: t('我的道具', 'My items')}));
        player.items.forEach((item, k) => {
          const [zh, en, icon, tipZh, tipEn] = ITEMS[item];
          const usable = mine && ((item === 'recall' && s.phase === 'roll') || (item === 'boots' && s.phase === 'move' && !s.boots) || (item === 'trap' && neighbours(s, player.pos).length));
          box.append(el('button', {class: 'tr-item', type: 'button', disabled: !usable, title: t(tipZh, tipEn), onclick: () => {
            if (item === 'trap') { ui.placing = !ui.placing; return update(); }
            api.act('item', {item}).catch(() => {});
          }}, el('span', {class: 'icon', text: icon}), el('span', {text: t(zh, en)}), el('small', {text: t(tipZh, tipEn)})));
          void k;
        });
        side.append(box);
      }
    }
    // Players.
    const list = el('ol', {class: 'tr-players'});
    for (const p of s.players) {
      const seat = v.seats[p.seat];
      list.append(el('li', {class: (p.seat === s.turn && s.phase !== 'finished' ? 'turn ' : '') + (p.out ? 'out' : '')},
        el('span', {class: 'dot', 'aria-hidden': 'true'}), el('strong', {text: name(api, p.seat) + (p.seat === me ? t('（你）', ' (you)') : '')}),
        el('span', {class: 'gold', text: '🪙 ' + p.gold}), el('span', {class: 'hint', text: t('已开 ' + p.banked + ' 箱', p.banked + ' opened')}),
        p.carry ? el('span', {class: 'pill me', text: '🧰 ' + t(CHEST[p.carry][0], CHEST[p.carry][1])}) : null,
        el('span', {class: 'hint', text: Array.isArray(p.items) ? p.items.map(i => ITEMS[i][2]).join(' ') : p.items ? t(p.items + ' 个道具', p.items + ' items') : ''}),
        seat?.auto ? el('span', {class: 'pill off', text: t('托管', 'Auto')}) : null, p.out ? el('span', {class: 'pill off', text: t('已离开', 'Left')}) : null));
      list.lastChild.querySelector('.dot').style.setProperty('--seat', B.color(p.seat));
    }
    side.append(el('h3', {text: t('玩家', 'Players')}), list);
    if (v.rules.autoplay && s.phase !== 'finished') {
      const auto = !!v.seats[me]?.auto;
      side.append(el('div', {class: 'actions quiet'}, el('span', {class: 'hint', text: auto ? t('电脑正在替你玩', 'The computer is playing for you') : t('暂时离开可以交给电脑', 'Stepping away? Let the computer play')}),
        el('button', {class: 'btn btn-ghost btn-sm', type: 'button', text: auto ? t('接管', 'Take over') : t('托管', 'Auto-play'), onclick: () => api.act('takeover', {auto: !auto}).catch(() => {})})));
    }
    const log = el('ol', {class: 'tr-log'});
    for (const e of s.log.slice().reverse()) { const text = line(api, e); if (text) log.append(el('li', {text})); }
    side.append(el('h3', {text: t('记录', 'Log')}), log);
  }
  function result(v) {
    const o = v.state.outcome, api = ui.api, me = v.you;
    const why = {goal: t('先拿到 ' + v.state.goal + ' 金币', 'reached ' + v.state.goal + ' gold first'), rounds: t(o.rounds + ' 回合结束，金币最多', 'most gold after ' + o.rounds + ' rounds'), left: t('其他玩家都离开了', 'everyone else left')};
    const box = el('div', {class: 'result ' + (o.winner === me ? 'win' : o.winner == null ? 'neutral' : 'lose')},
      el('div', {class: 'result-emoji', 'aria-hidden': 'true', text: o.winner === me ? '🏆' : o.winner == null ? '🤝' : '🧰'}),
      el('h2', {text: o.winner == null ? t('平局', 'A draw') : o.winner === me ? t('你赢了！', 'You won!') : t(name(api, o.winner) + ' 赢了', name(api, o.winner) + ' won')}),
      el('p', {class: 'hint', text: why[o.reason] || ''}));
    const list = el('ol', {class: 'tr-rank'});
    for (const r of o.ranking) list.append(el('li', {text: name(api, r.seat) + ' · 🪙 ' + r.gold + ' · ' + t('开箱 ' + r.banked, r.banked + ' opened') + (r.out ? t('（离开）', ' (left)') : '')}));
    box.append(list);
    return box;
  }

  function update() { if (!ui?.view?.state) return; paint(); panel(); }
  function render(stage, v, api) {
    const s = v.state;
    if (!s || v.you == null) return;
    const key = v.code + ':' + v.matches;
    if (!ui || ui.key !== key) { ui = build(v, api); ui.key = key; }
    ui.api = api; ui.view = v;
    if (s.phase !== 'move' || s.turn !== v.you) ui.placing = ui.placing && s.turn === v.you && s.phase !== 'finished';
    update();
    animate();
    stage.append(ui.root);
  }

  window.Play.register('treasure', {
    render,
    summary: (r, view) => r.winner == null ? t('平局', 'Draw') : view && r.winner === view.you ? t('你赢了', 'You won') : t('其他玩家赢了', 'Someone else won'),
    intro: ['掷骰子在地图上走，捡宝箱运回自己的基地才算分；路上可能被抢。先到目标金币的人获胜。', 'Roll and move, pick up chests and carry them home to count them — others may rob you on the way. First to the goal wins.'],
    leaveWarning: () => ['离开后你会退出这一局，其他人继续。确定离开吗？', 'Leaving drops you out of this game; the others play on. Leave?'],
    settings: [
      {name: 'players', label: ['玩家人数', 'Players'], options: [[2, '2 人', '2'], [3, '3 人', '3'], [4, '4 人', '4']]},
      {name: 'rounds', label: ['回合数', 'Rounds'], options: [[8, '8 回合', '8'], [12, '12 回合', '12'], [16, '16 回合', '16']]},
      {name: 'limit', label: ['每步限时', 'Time per step'], options: [[20, '20 秒', '20 s'], [40, '40 秒', '40 s'], [0, '不限时', 'No limit']]}
    ],
    rules: () => [
      ['轮到你时掷一个骰子，最多走那么多步（上下左右，墙不能穿过，流沙会让你停下）。带着宝箱时每次少走 1 步。', 'On your turn roll one die and walk up to that many steps (no diagonals; walls block; quicksand stops you). Carrying a chest costs one step.'],
      ['走到宝箱上就捡起来（一次只能带一个），带回自己颜色的基地才打开计分：木箱 2–4、银箱 4–6、金箱 7–9 金币。中间的宝箱更值钱。', 'Walk onto a chest to pick it up (one at a time); bring it to your own base to open it: wood 2–4, silver 4–6, gold 7–9. The centre holds richer chests.'],
      ['停在别人所在的格子会抢夺：双方各掷一个骰子，点数高者胜，平局算防守方赢，防守方在自己基地 +1。赢了抢走对方的宝箱（没有就抢 2 金币），输了赔 1 金币。', 'Stopping on another player starts a robbery: both roll, higher wins, ties go to the defender (+1 on their own base). Win their chest (or 2 gold); lose and pay 1 gold.'],
      ['带着宝箱经过尖刺会掉箱。“？”格给一个道具（最多 2 个）：疾风靴、暗夹、护盾、回城卷轴。', 'Spikes knock a carried chest off. A “?” tile gives an item (two at most): boots, trap, shield, recall.'],
      ['先拿到目标金币（2 人 12，3–4 人 15）获胜；否则回合结束时金币最多者获胜。超时由电脑代走，连续两次超时会转为托管，点“接管”收回。', 'Reach the goal (12 gold for two players, 15 for more) first; otherwise the most gold at the end wins. A timed-out step is played by the computer; two in a row hand your seat to it until you take over.']
    ]
  });
})();
