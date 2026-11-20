/* Daydreamer (v2.4.2.0): my games, a new game, and one game in play. The server decides what each side may see and
   do; this page draws it, sends one move at a time and checks the seal fingerprint at the end. */
(() => {
  'use strict';
  const G = window.Games;
  const {$, t, el, api, money, prizeText, prizeValue, ICONS, toast} = G;
  const ICON_KEYS = Object.keys(ICONS);
  const params = new URLSearchParams(location.search);
  const LIVE = ['invited', 'opening', 'offering', 'answering', 'revealing'];
  let me = null, view = 'home', redraw = () => {};

  const show = id => { for (const section of ['loading', 'home', 'create', 'game']) $(section).hidden = section !== id; view = id; };
  const fail = error => toast(error?.message || t('出了点问题，请稍后重试', 'Something went wrong, please try again'));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const name = value => value || t('已注销账号', 'a closed account');
  const boxLabel = n => '#' + (n + 1);

  // ---- My games ------------------------------------------------------------------------------------------------------
  function matchText(game) {
    const other = name(game.opponent);
    if (game.turn === 'me') return {
      invited: t(other + ' 邀请你：选一个盒子', other + ' invited you: pick a box'), opening: t('轮到你揭开盒子', 'Your turn to open boxes'),
      offering: t('轮到你出价', 'Your turn to make an offer'), answering: t('对方出价了，成交吗？', 'An offer is waiting for you'),
      revealing: t('轮到你揭开剩下的盒子', 'Your turn to open the rest')}[game.status];
    if (game.turn === 'them') return t('等待 ' + other + '…', 'Waiting for ' + other + '…');
    if (game.status === 'finished') return game.result ? t('已结束 · 盒内是 ', 'Finished · the box held ') + prizeText(game.result, game.currency) : t('已结束', 'Finished');
    return {cancelled: t('已取消', 'Cancelled'), declined: t('对方已婉拒', 'Declined'), expired: t('超过 30 天未进行，已过期', 'Expired after 30 quiet days')}[game.status] || game.status;
  }
  async function home() {
    show('home');
    const data = await api.get('/api/hub/games');
    redraw = () => drawHome(data);
    drawHome(data);
  }
  function drawHome(data) {
    const lists = $('lists');
    lists.replaceChildren();
    const groups = [
      [t('轮到你', 'Your turn'), data.games.filter(g => g.turn === 'me')],
      [t('等待对方', 'Waiting for the other player'), data.games.filter(g => g.turn === 'them')],
      [t('已结束', 'Finished'), data.games.filter(g => !g.turn)]
    ];
    if (!data.games.length) lists.append(el('div', {class: 'card'}, el('p', {class: 'empty', text: t('还没有对局。发起一局，邀请朋友来做个白日梦吧。', 'No games yet. Start one and invite a friend to daydream.')})));
    for (const [title, games] of groups) {
      if (!games.length) continue;
      lists.append(el('section', {class: 'list'}, el('h2', {}, title, el('span', {class: 'pill', text: String(games.length)})),
        el('ul', {}, games.map(game => {
          const bar = el('div', {class: 'progress'}, el('i'));
          bar.firstChild.style.setProperty('--p', Math.round(game.opened / Math.max(1, game.boxes - 1) * 100) + '%');
          return el('li', {}, el('a', {class: 'card match' + (game.turn === 'me' ? ' me' : ''), href: '/dream/?id=' + game.id},
            el('div', {class: 'line'}, el('strong', {text: game.title || t('白日梦 #', 'Daydream #') + game.id}),
              el('span', {class: 'pill ' + (game.turn === 'me' ? 'me' : game.status === 'finished' ? 'done' : game.turn ? '' : 'off'),
                text: game.role === 'host' ? t('我发起', 'Host') : t('我参与', 'Player')})),
            el('small', {text: (game.role === 'host' ? t('参与人 ', 'Player ') : t('发起人 ', 'Host ')) + name(game.opponent) + ' · ' + game.boxes + t(' 个盒子', ' boxes')}),
            bar, el('span', {text: matchText(game)})));
        }))));
    }
  }

  // ---- New game ------------------------------------------------------------------------------------------------------
  const PRESETS = {
    money: () => [1, 5, 10, 20, 50, 100, 200, 500, 1000, 2000].map(n => ({kind: 'money', amount: String(n)})),
    mix: () => [...[1, 10, 50, 100, 300, 800, 2000].map(n => ({kind: 'money', amount: String(n)})),
      {kind: 'gift', icon: 'coffee', name: t('一杯奶茶', 'A bubble tea'), value: '20'},
      {kind: 'gift', icon: 'ticket', name: t('两张电影票', 'Two cinema tickets'), value: '120'},
      {kind: 'gift', icon: 'book', name: t('一本想读的书', 'A book you want'), value: '80'}]
  };
  const parseCents = text => { const s = String(text || '').trim().replace(/,/g, ''); return /^\d{1,6}(\.\d{1,2})?$/.test(s) && Number(s) > 0 && Number(s) <= 999999 ? Math.round(Number(s) * 100) : null; };
  async function create() {
    show('create');
    let rows = PRESETS.money(), first = 3, recent = [];
    api.get('/api/hub/games').then(data => { recent = data.recent; drawRecent(); }).catch(() => {});
    const currency = () => $('currency').value;
    function prizes() {
      return rows.map(row => row.kind === 'money' ? {kind: 'money', amount: parseCents(row.amount)} :
        {kind: 'gift', icon: row.icon || 'gift', name: String(row.name || '').trim(), value: String(row.value || '').trim() ? parseCents(row.value) : null});
    }
    function problem() {
      if (rows.length < 10 || rows.length > 20) return t('请设置 10–20 个奖品', 'Set 10–20 prizes');
      for (const [i, row] of rows.entries()) {
        if (row.kind === 'money' && parseCents(row.amount) == null) return t('第 ' + (i + 1) + ' 项：金额须在 0.01 到 999,999 之间', 'Prize ' + (i + 1) + ': amount must be 0.01–999,999');
        if (row.kind === 'gift' && (!String(row.name || '').trim() || String(row.name).trim().length > 30)) return t('第 ' + (i + 1) + ' 项：礼品名称须为 1–30 个字', 'Prize ' + (i + 1) + ': gift name must be 1–30 characters');
        if (row.kind === 'gift' && String(row.value || '').trim() && parseCents(row.value) == null) return t('第 ' + (i + 1) + ' 项：估值无效', 'Prize ' + (i + 1) + ': invalid value');
      }
      if (!$('player').value.trim()) return t('请输入参与人的用户名', "Enter the player's username");
      return '';
    }
    function drawRows() {
      const list = $('prizeRows');
      list.replaceChildren(...rows.map((row, i) => {
        const kind = el('div', {class: 'kind', role: 'group'},
          ['money', 'gift'].map(k => el('button', {type: 'button', 'aria-pressed': String(row.kind === k), text: k === 'money' ? t('金额', 'Amount') : t('礼品', 'Gift'),
            onclick: () => { if (row.kind !== k) { rows[i] = k === 'money' ? {kind: 'money', amount: ''} : {kind: 'gift', icon: 'gift', name: '', value: ''}; drawRows(); } }})));
        const input = row.kind === 'money'
          ? el('div', {class: 'prize-input'}, el('input', {class: 'input', inputmode: 'decimal', value: row.amount, placeholder: t('金额，例如 100', 'Amount, e.g. 100'), 'aria-label': t('金额', 'Amount'),
              oninput: e => { row.amount = e.target.value; drawPreview(); }}))
          : el('div', {class: 'prize-input gift'},
              el('button', {class: 'input icon-pick', type: 'button', 'aria-label': t('选择图标', 'Choose icon'), text: ICONS[row.icon] || ICONS.gift, onclick: e => iconMenu(e.currentTarget, row)}),
              el('input', {class: 'input', maxlength: '30', value: row.name, placeholder: t('礼品名称', 'Gift name'), 'aria-label': t('礼品名称', 'Gift name'), oninput: e => { row.name = e.target.value; drawPreview(); }}),
              el('input', {class: 'input', inputmode: 'decimal', value: row.value, placeholder: t('估值（选填）', 'Value (opt.)'), 'aria-label': t('估值', 'Value'), oninput: e => { row.value = e.target.value; drawPreview(); }}));
        return el('li', {class: 'prize-row'}, kind, input,
          el('button', {class: 'remove', type: 'button', disabled: rows.length <= 10, 'aria-label': t('删除这一项', 'Remove'), text: '×', onclick: () => { rows.splice(i, 1); drawRows(); }}));
      }));
      $('addRow').disabled = rows.length >= 20;
      $('prizeCount').textContent = rows.length + ' / 10–20';
      first = Math.min(first, rows.length - 2);
      drawStepper(); drawPreview();
    }
    function iconMenu(anchor, row) {
      document.querySelector('.icon-menu')?.remove();
      const menu = el('div', {class: 'icon-menu', role: 'menu'}, ICON_KEYS.map(key => el('button', {type: 'button', role: 'menuitem', 'aria-pressed': String(row.icon === key), text: ICONS[key],
        onclick: () => { row.icon = key; menu.remove(); drawRows(); }})));
      document.body.append(menu);
      const box = anchor.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, box.left + scrollX)) + 'px';
      menu.style.top = (box.bottom + scrollY + 6) + 'px';
      setTimeout(() => document.addEventListener('click', function close(e) { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); } }));
    }
    function drawStepper() {
      const max = rows.length - 2;
      $('firstStepper').replaceChildren(
        el('button', {type: 'button', disabled: first <= 0, 'aria-label': t('减少', 'Fewer'), text: '−', onclick: () => { first--; drawStepper(); }}),
        el('output', {text: String(first)}),
        el('button', {type: 'button', disabled: first >= max, 'aria-label': t('增加', 'More'), text: '+', onclick: () => { first++; drawStepper(); }}));
      $('firstHint').textContent = first ? t('参与人选好盒子后，先揭开 ' + first + ' 个别的盒子，再由你出价。', 'After choosing, the player opens ' + first + ' other boxes, then you make an offer.')
        : t('参与人选好盒子后，你直接出价。', 'After choosing, you make an offer straight away.');
    }
    function drawRecent() {
      $('recent').replaceChildren(...recent.map(user => el('button', {type: 'button', text: user, onclick: () => { $('player').value = user; }})));
    }
    function drawPreview() {
      const list = prizes().map((prize, index) => ({...prize, index})).filter(p => p.kind === 'money' ? p.amount : p.name);
      drawBoard($('previewBoard'), list, currency(), new Set(), null);
    }
    $('presetMoney').onclick = () => { rows = PRESETS.money(); drawRows(); };
    $('presetMix').onclick = () => { rows = PRESETS.mix(); drawRows(); };
    $('addRow').onclick = () => { if (rows.length < 20) { rows.push({kind: 'money', amount: ''}); drawRows(); $('prizeRows').lastElementChild?.querySelector('input')?.focus(); } };
    $('currency').onchange = drawPreview;
    $('createForm').onsubmit = async event => {
      event.preventDefault();
      const message = problem();
      $('createError').textContent = message;
      if (message) return;
      $('createSubmit').disabled = true;
      try {
        const made = await api.post('/api/hub/games', {title: $('title').value.trim(), currency: currency(), prizes: prizes(), player: $('player').value.trim(), firstCount: first});
        location.href = '/dream/?id=' + made.id;
      } catch (error) { $('createError').textContent = error.message; $('createSubmit').disabled = false; }
    };
    try { const saved = window.GaryHubPrefs && await Promise.race([window.GaryHubPrefs.ready, sleep(1500)]); if (saved?.['ledger.currency']) $('currency').value = saved['ledger.currency']; } catch {}
    redraw = drawRows;
    drawRows(); drawRecent();
  }

  // ---- Prize board ---------------------------------------------------------------------------------------------------
  // Amounts from low to high in two columns, then gifts by value; opened prizes are crossed out.
  function drawBoard(target, prizes, currency, gone, kept) {
    const amounts = prizes.filter(p => p.kind === 'money').sort((a, b) => a.amount - b.amount || a.index - b.index);
    const gifts = prizes.filter(p => p.kind === 'gift').sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || a.index - b.index);
    const top = amounts.length ? amounts[Math.floor(amounts.length * .7)]?.amount ?? Infinity : Infinity;
    const item = p => el('div', {class: 'prize' + (gone.has(p.index) ? ' gone' : '') + (kept === p.index ? ' kept' : '') + (p.kind === 'money' && p.amount >= top ? ' high' : '')},
      p.kind === 'money' ? el('span', {text: money(currency, p.amount)})
        : el('span', {class: 'gift-name'}, (ICONS[p.icon] || ICONS.gift) + ' ' + p.name),
      p.kind === 'gift' && p.value ? el('small', {text: '≈ ' + money(currency, p.value)}) : null);
    const half = Math.ceil(amounts.length / 2);
    target.replaceChildren(
      amounts.length ? el('h3', {text: t('金额', 'Amounts')}) : null,
      amounts.length ? el('div', {class: 'col'}, amounts.slice(0, half).map(item)) : null,
      amounts.length ? el('div', {class: 'col'}, amounts.slice(half).map(item)) : null,
      gifts.length ? el('h3', {text: t('礼品', 'Gifts')}) : null,
      gifts.length ? el('div', {class: 'col gifts'}, gifts.map(item)) : null);
    if (!prizes.length) target.append(el('p', {class: 'hint', text: t('填写奖品后会显示在这里。', 'Prizes appear here as you add them.')}));
  }

  // ---- One game ------------------------------------------------------------------------------------------------------
  let game = null, timer = 0, busy = false, seen = null, picked = new Set(), auto = false, verified = null;
  const remaining = () => game.boxes - 1 - game.opened.length;
  const other = () => name(game.role === 'host' ? game.player : game.host);
  const openedMap = () => new Map(game.opened.map(o => [o.box, o.prize]));

  async function play(id) {
    show('game');
    redraw = () => draw(false);
    await refresh(id);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }
  async function refresh(id = game?.id) {
    clearTimeout(timer);
    try {
      const fresh = await api.get('/api/hub/games/' + id);
      const changed = !game || fresh.revision !== game.revision;
      const finishedNow = game && game.status !== 'finished' && fresh.status === 'finished';
      game = fresh;
      if (changed) { picked = new Set([...picked].filter(b => !openedMap().has(b))); draw(finishedNow); }
    } catch (error) { if (error.status === 404) { toast(error.message); setTimeout(() => { location.href = '/dream/'; }, 1500); return; } fail(error); }
    // Waiting for the other player: look again every 8 seconds while the page is visible.
    if (game && LIVE.includes(game.status) && game.turn !== 'me' && !document.hidden) timer = setTimeout(() => refresh(), 8000);
  }
  async function send(action, body = {}) {
    if (busy) return null;
    busy = true;
    const before = game.status;
    let next;
    try { next = await api.post('/api/hub/games/' + game.id + '/' + action, {revision: game.revision, ...body}); }
    catch (error) {
      busy = false;
      fail(error);
      if (error.status === 409) await refresh();
      return null;
    }
    busy = false;
    game = next;
    picked.clear();
    draw(before !== 'finished' && game.status === 'finished');
    if (LIVE.includes(game.status) && game.turn !== 'me') { clearTimeout(timer); timer = setTimeout(() => refresh(), 8000); }
    return game;
  }

  function banner() {
    const k = game.pending, r = remaining(), last = game.rounds.at(-1);
    const offer = last?.offer ? money(game.currency, last.offer.amount) : '';
    const mine = game.turn === 'me', host = game.role === 'host', o = other();
    switch (game.status) {
      case 'invited': return host ? t('等待 ' + o + ' 选一个盒子', 'Waiting for ' + o + ' to pick a box') : t('选一个属于你的盒子', 'Pick the box you will keep');
      case 'opening': return mine ? t('本轮请揭开 ' + k + ' 个盒子', 'Open ' + k + ' boxes this round') : t('等待 ' + o + ' 揭开 ' + k + ' 个盒子', 'Waiting for ' + o + ' to open ' + k + ' boxes');
      case 'offering': return host ? t('轮到你出价收购 ' + o + ' 的盒子', "Your offer for " + o + "'s box") : t('等待 ' + o + ' 出价', 'Waiting for ' + o + "'s offer");
      case 'answering': return host ? t('等待 ' + o + ' 答复你的报价 ' + offer, 'Waiting for ' + o + ' to answer your offer of ' + offer) : t(o + ' 出价 ' + offer + '，成交吗？', o + ' offers ' + offer + '. Deal?');
      case 'revealing': return host ? (r ? t('逐个揭开剩下的 ' + r + ' 个盒子', 'Open the remaining ' + r + ' boxes') : t('最后，揭开 ' + o + ' 的盒子', "Finally, open " + o + "'s box"))
        : t('等待 ' + o + ' 揭开盒子', 'Waiting for ' + o + ' to open the boxes');
      case 'finished': return t('结果揭晓', 'The result is in');
      case 'cancelled': return t('发起人取消了这一局', 'The host cancelled this game');
      case 'declined': return t('参与人婉拒了邀请', 'The player declined');
      case 'expired': return t('超过 30 天没有进行，这一局已过期', 'This game expired after 30 quiet days');
    }
    return '';
  }

  function draw(celebrate) {
    if (!game) return;
    const opened = openedMap(), finished = game.status === 'finished', host = game.role === 'host';
    $('gameEyebrow').textContent = (host ? t('你是发起人 · 参与人 ', 'You host · player ') + name(game.player) : t('你是参与人 · 发起人 ', 'You play · host ') + name(game.host)) + ' · ' + game.currency;
    $('gameTitle').textContent = game.title || t('白日梦 #', 'Daydream #') + game.id;
    document.title = $('gameTitle').textContent + ' · ' + t('白日梦想家', 'Daydreamer');
    const text = banner(), node = $('banner');
    node.replaceChildren(game.turn === 'me' ? el('b', {text}) : el('span', {class: LIVE.includes(game.status) ? 'waiting-dots' : '', text}));
    drawSeal();

    // Boxes: newly opened ones turn over one after another.
    const known = seen || new Set(opened.keys());
    const fresh = [...opened.keys()].filter(b => !known.has(b));
    const boxes = $('boxes');
    boxes.setAttribute('aria-label', t('盒子', 'Boxes'));
    const pick = pickMode();
    boxes.replaceChildren(...Array.from({length: game.boxes}, (_, i) => {
      const kept = game.chosen === i, isOpen = opened.has(i) || (finished && kept);
      const prizeIndex = opened.has(i) ? opened.get(i) : finished && kept ? game.reveal.chosenPrize : null;
      const prize = prizeIndex == null ? null : game.prizes[prizeIndex];
      const can = pick && pick.can(i);
      const node = el('button', {type: 'button', class: 'box' + (can ? ' pickable' : '') + (kept ? ' kept' : '') + (picked.has(i) ? ' selected' : '') + (isOpen && !fresh.includes(i) ? ' open' : '') +
          (kept && !finished && LIVE.includes(game.status) ? ' waiting' : ''),
        'aria-label': boxLabel(i) + (kept ? t('（' + (host ? 'TA 的' : '你的') + '盒子）', host ? " (their box)" : ' (your box)') : '') + (prize ? ': ' + prizeText(prize, game.currency) : ''),
        'aria-pressed': picked.has(i) ? 'true' : null, disabled: !can && !isOpen ? true : null, onclick: can ? () => pick.click(i) : null},
        kept ? el('span', {class: 'mark', text: host ? t('TA 的盒子', 'Their box') : t('你的盒子', 'Your box')}) : null,
        el('span', {class: 'flip'},
          el('span', {class: 'face front'}, el('span', {class: 'num', text: String(i + 1)})),
          el('span', {class: 'face back'}, prize ? [
            el('span', {class: 'emoji', text: prize.kind === 'money' ? '✨' : ICONS[prize.icon] || ICONS.gift}),
            el('span', {class: 'val', text: prizeText(prize, game.currency)}),
            el('span', {class: 'tag', text: boxLabel(i)})] : null)));
      return node;
    }));
    fresh.forEach((b, n) => setTimeout(() => boxes.children[b]?.classList.add('open'), G.reduced.matches ? 0 : 120 + n * 550));
    seen = new Set(opened.keys());
    if (finished) seen.add(game.chosen);

    // Prize board and history.
    const gone = new Set([...opened.values()]);
    if (finished) for (let i = 0; i < game.prizes.length; i++) if (i !== game.reveal.chosenPrize) gone.add(i);
    drawBoard($('board'), game.prizes, game.currency, gone, finished ? game.reveal.chosenPrize : null);
    $('leftCount').textContent = finished ? t('已全部揭开', 'All open') : t('未揭开 ' + (game.boxes - game.opened.length), (game.boxes - game.opened.length) + ' sealed');
    if (matchMedia('(max-width: 980px)').matches && !$('boardWrap').dataset.set) { $('boardWrap').open = false; $('boardWrap').dataset.set = '1'; }
    drawHistory();
    drawDock();
    if (celebrate) celebrateResult();
    else if (finished) { try { if (!localStorage.getItem('dream-seen-' + game.id)) celebrateResult(); } catch {} }
  }

  // What clicking a box does right now, or null.
  function pickMode() {
    const opened = openedMap(), host = game.role === 'host', sealed = i => !opened.has(i) && i !== game.chosen;
    if (busy) return null;
    if (!host && game.status === 'invited') return {can: () => true, click: i => { picked = new Set([i]); draw(false); }};
    if (!host && game.status === 'opening') return {can: sealed, click: i => {
      if (picked.has(i)) picked.delete(i); else if (picked.size < game.pending) picked.add(i); else toast(t('本轮只需揭开 ' + game.pending + ' 个', 'Only ' + game.pending + ' this round'));
      draw(false);
    }};
    if (host && game.status === 'revealing') {
      if (remaining() > 0) return {can: sealed, click: i => send('reveal', {box: i})};
      return {can: i => i === game.chosen, click: () => send('reveal', {box: game.chosen})};
    }
    return null;
  }

  function drawDock() {
    const dock = $('dock'), host = game.role === 'host', o = other(), r = remaining(), last = game.rounds.at(-1);
    const say = (...parts) => el('p', {class: 'say'}, ...parts);
    const row = (...buttons) => el('div', {class: 'row'}, ...buttons);
    const wait = text => say(el('span', {class: 'waiting-dots', text}));
    let content = [];
    switch (game.status) {
      case 'invited':
        content = host ? [wait(t(o + ' 还没有选盒子', o + " hasn't picked a box yet")),
          row(el('button', {class: 'btn btn-danger btn-sm', type: 'button', text: t('取消这一局', 'Cancel this game'), onclick: () => confirm(t('确定取消这一局吗？', 'Cancel this game?')) && send('cancel')}))]
          : [say(t('选一个盒子留给自己。', 'Pick a box to keep. '), game.pending ? t('之后先揭开 ' + game.pending + ' 个别的盒子，再看 ' + o + ' 出价。', 'Then you open ' + game.pending + ' other boxes and ' + o + ' makes an offer.') : t(o + ' 会直接出价。', o + ' will make an offer right away.')),
            row(el('button', {class: 'btn btn-gold', type: 'button', disabled: !picked.size, text: picked.size ? t('就选 ' + boxLabel([...picked][0]), 'Keep ' + boxLabel([...picked][0])) : t('先点一个盒子', 'Tap a box first'),
              onclick: () => send('choose', {box: [...picked][0]})}),
              el('button', {class: 'btn btn-ghost', type: 'button', text: t('婉拒邀请', 'Decline'), onclick: () => confirm(t('确定婉拒这次邀请吗？', 'Decline this invitation?')) && send('decline')}))];
        break;
      case 'opening':
        content = host ? [wait(t(o + ' 正在挑选要揭开的 ' + game.pending + ' 个盒子', o + ' is choosing ' + game.pending + ' boxes to open'))]
          : [say(t('点选要揭开的盒子 · 已选 ', 'Tap the boxes to open · chosen '), el('b', {text: picked.size + ' / ' + game.pending})),
            row(el('button', {class: 'btn btn-gold', type: 'button', disabled: picked.size !== game.pending, text: t('揭开', 'Open them'), onclick: () => send('open', {boxes: [...picked].sort((a, b) => a - b)})}),
              picked.size ? el('button', {class: 'btn btn-ghost', type: 'button', text: t('清除选择', 'Clear'), onclick: () => { picked.clear(); draw(false); }}) : null)];
        break;
      case 'offering':
        content = host ? [offerForm(r)] : [wait(t(o + ' 正在考虑出价', o + ' is thinking about an offer'))];
        break;
      case 'answering': {
        const offer = last.offer;
        if (host) { content = [wait(t('已出价 ' + money(game.currency, offer.amount) + '，等待 ' + o + ' 答复', 'You offered ' + money(game.currency, offer.amount) + '; waiting for ' + o))]; break; }
        content = [el('div', {class: 'envelope'},
          el('p', {class: 'from', text: t(o + ' 想买下你的盒子', o + ' wants to buy your box')}),
          el('p', {class: 'amount', text: money(game.currency, offer.amount)}),
          offer.note ? el('p', {class: 'note', text: '“' + offer.note + '”'}) : null,
          el('div', {class: 'row'},
            el('button', {class: 'btn btn-gold', type: 'button', text: t('成交', 'Deal'), onclick: () => confirm(t('以 ' + money(game.currency, offer.amount) + ' 卖出你的盒子？', 'Sell your box for ' + money(game.currency, offer.amount) + '?')) && send('answer', {accept: true})}),
            el('button', {class: 'btn btn-ghost', type: 'button', text: last.nextCount ? t('不卖，再揭开 ' + last.nextCount + ' 个', 'No deal, open ' + last.nextCount + ' more') : t('不卖，开我的盒子', 'No deal, open my box'),
              onclick: () => send('answer', {accept: false})})))];
        break;
      }
      case 'revealing':
        if (!host) { content = [wait(t(o + ' 正在揭开盒子（已开 ' + game.opened.length + ' / ' + (game.boxes - 1) + '）', o + ' is opening the boxes (' + game.opened.length + ' / ' + (game.boxes - 1) + ')'))]; break; }
        content = r ? [say(game.deal != null ? t('已以 ' + money(game.currency, game.deal) + ' 成交。', 'Deal at ' + money(game.currency, game.deal) + '. ') : t('对方守住了自己的盒子。', 'They kept their box. '),
            t('点任意未开的盒子揭开，还剩 ', 'Tap any sealed box to open it; '), el('b', {text: String(r)}), t(' 个。', ' left.')),
            row(el('button', {class: 'btn btn-violet', type: 'button', text: auto ? t('停止', 'Stop') : t('依次自动揭开', 'Open them one by one'), onclick: () => { auto = !auto; if (auto) autoReveal(); else draw(false); }}))]
          : [say(t('其他盒子都已揭开。现在，揭晓 ' + o + ' 的盒子 ' + boxLabel(game.chosen) + '。', 'Every other box is open. Now reveal ' + o + "'s box " + boxLabel(game.chosen) + '.')),
            row(el('button', {class: 'btn btn-gold', type: 'button', text: t('揭晓 ' + boxLabel(game.chosen), 'Reveal ' + boxLabel(game.chosen)), onclick: () => send('reveal', {box: game.chosen})}))];
        break;
      case 'finished':
        content = [resultView()];
        break;
      default:
        content = [say(banner()), row(el('a', {class: 'btn btn-ghost', href: '/dream/', text: t('返回我的对局', 'Back to my games')}))];
    }
    dock.replaceChildren(...content);
  }

  function offerForm(r) {
    const sealed = game.prizes.filter((p, i) => !game.opened.some(o => o.prize === i));
    const values = sealed.map(prizeValue).filter(v => v != null);
    const avg = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
    let next = Math.min(Math.max(1, game.rounds.at(-1)?.count || 1), Math.max(1, r - 1));
    const amount = el('input', {class: 'input', inputmode: 'decimal', placeholder: t('出价金额', 'Your offer'), 'aria-label': t('出价金额', 'Your offer')});
    const note = el('input', {class: 'input', maxlength: '60', placeholder: t('附一句话（选填）', 'A short note (optional)'), 'aria-label': t('附言', 'Note')});
    const out = el('output', {text: String(next)});
    const minus = el('button', {type: 'button', 'aria-label': t('减少', 'Fewer'), text: '−'}), plus = el('button', {type: 'button', 'aria-label': t('增加', 'More'), text: '+'});
    const sync = () => { out.textContent = String(next); minus.disabled = next <= 1; plus.disabled = next >= r - 1; };
    minus.onclick = () => { next--; sync(); }; plus.onclick = () => { next++; sync(); }; sync();
    const error = el('p', {class: 'error', role: 'alert'});
    const submit = el('button', {class: 'btn btn-gold', type: 'submit', text: t('送出报价', 'Send the offer')});
    return el('form', {class: 'offer', novalidate: true, onsubmit: async e => {
      e.preventDefault();
      const cents = parseCents(amount.value);
      if (cents == null) { error.textContent = t('出价须在 0.01 到 999,999 之间', 'The offer must be 0.01–999,999'); return; }
      submit.disabled = true;
      if (!await send('offer', {amount: cents, note: note.value.trim(), nextCount: r >= 2 ? next : null})) submit.disabled = false;
    }},
    el('div', {class: 'offer-stats'},
      el('span', {}, t('未揭开 ', 'Sealed '), el('b', {text: String(sealed.length)})),
      avg != null ? el('span', {}, t('未揭开平均 ', 'Average sealed '), el('b', {text: money(game.currency, avg)})) : null,
      values.length ? el('span', {}, t('最高 ', 'Highest '), el('b', {text: money(game.currency, Math.max(...values))})) : null),
    el('div', {class: 'offer-form'},
      el('label', {class: 'field'}, el('span', {text: t('出价（' + game.currency + '）', 'Offer (' + game.currency + ')')}), amount),
      el('label', {class: 'field'}, el('span', {text: t('附言', 'Note')}), note)),
    r >= 2 ? el('div', {class: 'field'}, el('span', {text: t('如果对方不卖，下一轮揭开几个盒子', 'If they refuse, boxes to open next round')}), el('div', {class: 'stepper'}, minus, out, plus))
      : el('p', {class: 'hint', text: t('只剩一个别的盒子：这是最后一次出价。', 'Only one other box is left: this is the last offer.')}),
    el('div', {class: 'row'}, submit), error);
  }

  function verdict() {
    const prize = game.prizes[game.reveal.chosenPrize], value = prizeValue(prize), host = game.role === 'host', o = other();
    const inside = prizeText(prize, game.currency);
    if (game.deal == null) return {gets: inside, text: host ? t(o + ' 守住了自己的梦，带走盒子里的奖品。', o + ' kept the dream and takes the prize inside.') : t('你守住了自己的梦，盒子里的奖品归你。', 'You kept the dream: the prize inside is yours.')};
    const deal = money(game.currency, game.deal);
    let text = t('以 ' + deal + ' 成交。', 'Sold for ' + deal + '. ');
    if (value != null) {
      if (game.deal > value) text += host ? t('盒子没那么值钱——' + o + ' 卖了个好价钱。', 'The box was worth less — ' + o + ' sold well.') : t('盒子没那么值钱——你卖了个好价钱！', 'The box was worth less — you sold well!');
      else if (game.deal < value) text += host ? t('盒子比报价更值——这笔你赚到了！', 'The box was worth more — a good buy for you!') : t('盒子比报价更值——这次让发起人赚到了。', 'The box was worth more — the host got a bargain.');
      else text += t('不多不少，刚刚好。', 'Exactly even.');
    }
    return {gets: deal, text};
  }
  function resultView() {
    const prize = game.prizes[game.reveal.chosenPrize], v = verdict(), host = game.role === 'host';
    return el('div', {class: 'result'},
      el('p', {class: 'say', text: t(boxLabel(game.chosen) + ' 里是', 'Box ' + boxLabel(game.chosen) + ' held')}),
      el('p', {class: 'big-prize', text: (prize.kind === 'gift' ? (ICONS[prize.icon] || ICONS.gift) + ' ' : '') + prizeText(prize, game.currency)}),
      el('p', {class: 'verdict', text: v.text}),
      el('p', {class: 'say'}, t('参与人获得：', 'The player receives: '), el('b', {text: v.gets})),
      el('div', {class: 'row'},
        game.honored ? el('span', {class: 'pill done', text: t('发起人已标记兑现', 'Marked as honoured')})
          : host ? el('button', {class: 'btn btn-violet btn-sm', type: 'button', text: t('标记已兑现', 'Mark as honoured'), onclick: () => send('honor')}) : el('span', {class: 'pill', text: t('等待发起人兑现', 'Waiting to be honoured')}),
        el('button', {class: 'btn btn-ghost btn-sm', type: 'button', text: t('再看一次揭晓', 'Replay the reveal'), onclick: celebrateResult}),
        el('a', {class: 'btn btn-ghost btn-sm', href: '/dream/?new=1', text: t('再来一局', 'Play again')})),
      el('p', {class: 'hint', text: t('游戏只做记录，不处理任何付款。', 'The game only keeps a record; it never moves money.')}));
  }

  function drawHistory() {
    const items = [];
    game.rounds.forEach((round, i) => {
      const parts = [el('b', {text: t('第 ' + (i + 1) + ' 轮', 'Round ' + (i + 1))}), ' '];
      if (round.boxes.length) parts.push(t('揭开 ', 'opened ') + round.boxes.map(boxLabel).join(' '));
      else if (round.count === 0) parts.push(t('直接出价', 'straight to an offer'));
      else parts.push(t('待揭开 ' + round.count + ' 个', round.count + ' to open'));
      if (round.offer) parts.push(' · ' + t('出价 ', 'offer ') + money(game.currency, round.offer.amount) + (round.offer.note ? ' “' + round.offer.note + '”' : ''));
      if (round.answer) parts.push(' → ' + (round.answer === 'accept' ? t('成交', 'deal') : t('不卖', 'no deal')));
      items.push(el('p', {}, ...parts));
    });
    $('history').replaceChildren(el('h3', {text: t('过程', 'History')}), ...(items.length ? items : [el('p', {text: t('还没有开始。', 'Not started yet.')})]));
  }

  async function drawSeal() {
    const short = game.commitment.slice(0, 6) + '…' + game.commitment.slice(-6);
    const seal = $('seal');
    seal.classList.toggle('ok', verified === true);
    seal.textContent = (verified === true ? '✓ ' : verified === false ? '✗ ' : '🔒 ') + t('封箱指纹 ', 'Seal ') + short;
    seal.onclick = () => toast(game.reveal
      ? (verified ? t('已核对：公开的盒子顺序与开局时的封箱指纹一致。', 'Checked: the published order matches the seal shown at the start.') : t('公开的顺序与封箱指纹不一致！', 'The published order does not match the seal!'))
      : t('开局时生成的指纹（SHA-256）。结束后公开盒子顺序，页面会自动核对中途没有改动。', 'A SHA-256 fingerprint made at the start. At the end the order is published and checked against it.'));
    if (game.reveal && verified === null && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(game.reveal.salt + '|' + game.reveal.layout.join(',')));
      verified = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('') === game.commitment;
      drawSeal();
    }
  }

  async function autoReveal() {
    draw(false);
    while (auto && game.status === 'revealing' && game.role === 'host' && remaining() > 0) {
      const opened = openedMap();
      const next = Array.from({length: game.boxes}, (_, i) => i).find(i => i !== game.chosen && !opened.has(i));
      if (next == null || !await send('reveal', {box: next})) break;
      await sleep(G.reduced.matches ? 200 : 1100);
    }
    auto = false;
    draw(false);
  }

  // ---- The final reveal ----------------------------------------------------------------------------------------------
  function celebrateResult() {
    if (!game?.reveal) return;
    try { localStorage.setItem('dream-seen-' + game.id, '1'); } catch {}
    const prize = game.prizes[game.reveal.chosenPrize], layer = $('reveal');
    $('revealLabel').textContent = t(boxLabel(game.chosen) + ' 里是……', 'Box ' + boxLabel(game.chosen) + ' holds…');
    $('revealPrize').textContent = (prize.kind === 'gift' ? (ICONS[prize.icon] || ICONS.gift) + ' ' : '') + prizeText(prize, game.currency);
    $('revealNote').textContent = verdict().text;
    layer.hidden = false; layer.classList.remove('go'); void layer.offsetWidth; layer.classList.add('go');
    $('revealClose').focus();
    if (!G.reduced.matches) setTimeout(confetti, 1300);
  }
  function confetti() {
    const canvas = $('confetti'), ctx = canvas.getContext('2d');
    canvas.width = innerWidth; canvas.height = innerHeight;
    const colors = ['#f6c86e', '#a98bff', '#f7a8d8', '#7fe3c4', '#ffffff'];
    const bits = Array.from({length: 140}, () => ({x: innerWidth / 2, y: innerHeight / 2.4, vx: (Math.random() - .5) * 14, vy: -Math.random() * 13 - 4,
      r: Math.random() * Math.PI, vr: (Math.random() - .5) * .3, w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, c: colors[Math.floor(Math.random() * colors.length)]}));
    const start = performance.now();
    (function frame(now) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const b of bits) {
        b.vy += .32; b.vx *= .99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); ctx.restore();
      }
      if (now - start < 3200 && !$('reveal').hidden) requestAnimationFrame(frame); else ctx.clearRect(0, 0, canvas.width, canvas.height);
    })(start);
  }
  $('revealClose').onclick = () => { $('reveal').hidden = true; };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('reveal').hidden) $('reveal').hidden = true; });

  // ---- Start ---------------------------------------------------------------------------------------------------------
  G.onLanguage(() => redraw());
  (async () => {
    try {
      me = await G.account();
      const id = Number(params.get('id'));
      if (Number.isSafeInteger(id) && id > 0) await play(id);
      else if (params.has('new')) await create();
      else await home();
    } catch (error) { if (error.status !== 401) { show('home'); fail(error); } }
  })();
})();
