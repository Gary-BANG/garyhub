/* GaryHub Games (v2.4.3.0): live rooms on games.garyhub.uk — the start page (new room, join by code, my rooms), the
   room socket (reconnects by itself, corrects for this device's clock, measures latency), seats, the lobby, and the
   frame that each game draws into. Games register with Play.register(id, {...}) from word.js and digits.js. */
(() => {
  'use strict';
  const G = window.Games, {$, t, el} = G;
  const games = {};
  const NAMES = {word: ['词语默契', 'Word Sync'], digits: ['对战猜数字', 'Number Duel']};
  const BOTS = {easy: ['新手', 'Beginner'], normal: ['普通', 'Regular'], smart: ['精明', 'Sharp']};
  const gameName = id => NAMES[id] ? t(NAMES[id][0], NAMES[id][1]) : id;
  const botName = level => BOTS[level] ? t('电脑·' + BOTS[level][0], 'Computer · ' + BOTS[level][1]) : t('电脑', 'Computer');
  const label = name => name && name.startsWith('@') ? botName(name.slice(1)) : name || t('空座位', 'Empty seat');
  const params = new URLSearchParams(location.search);
  const CODE = /^[A-HJ-NP-Z2-9]{6}$/;

  // ---- State ----------------------------------------------------------------------------------------------------
  let code = null, view = null, socket = null, welcomed = false, stopped = false, retry = 0, retryTimer = 0, pingTimer = 0, failures = 0;
  let offset = 0, bestRtt = Infinity, recent = [], connState = 'connecting';
  const samples = [], pending = new Map();
  const serverNow = () => Date.now() + offset;
  const seatName = i => { const s = view?.seats[i]; return !s ? '' : s.bot ? botName(s.bot) : s.name || t('空座位', 'Empty seat'); };

  // ---- Socket -----------------------------------------------------------------------------------------------------
  function send(message) { if (socket && socket.readyState === 1) socket.send(JSON.stringify(message)); }
  function connect() {
    clearTimeout(retryTimer);
    if (stopped || socket) return;
    welcomed = false;
    connection(retry ? 'retry' : 'connecting');
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/hub/play/socket');
    socket = ws;
    ws.onmessage = event => { if (socket !== ws) return; let m; try { m = JSON.parse(event.data); } catch { return; } receive(m); };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null; clearInterval(pingTimer);
      for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Object.assign(Error(t('连接中断，请重试', 'Connection lost, please try again')), {status: 0})); }
      pending.clear();
      if (stopped) return;
      connection('offline');
      // A refused handshake looks like any drop; after two in a row, ask the account check (it sends a signed-out page to log in).
      if (!welcomed && ++failures >= 2) G.api.get('/api/me').catch(() => {});
      retryTimer = setTimeout(connect, [1000, 2000, 4000, 8000, 15000][Math.min(retry++, 4)]);
      render();
    };
  }
  function receive(m) {
    if (m.t === 'welcome') {
      welcomed = true; retry = 0; failures = 0;
      if (bestRtt === Infinity) offset = m.now - Date.now();
      send({t: 'hello', room: code});
      clearInterval(pingTimer);
      for (let i = 0; i < 4; i++) setTimeout(ping, 300 * i);
      pingTimer = setInterval(ping, 5000);
      return;
    }
    if (m.t === 'state') {
      if (!view || m.room.code !== view.code || m.room.revision >= view.revision) { view = m.room; connection('online'); render(); }
      return;
    }
    if (m.t === 'net') { if (view) { view.seats = m.seats; seatsPanel(); netPanel(); } return; }
    if (m.t === 'pong') {
      const rtt = Date.now() - m.c;
      if (rtt < 0 || rtt > 30000) return;
      samples.push(rtt); if (samples.length > 20) samples.shift();
      // The fastest round trip gives the best estimate of the server's clock.
      if (rtt <= bestRtt) { bestRtt = rtt; offset = m.s + rtt / 2 - Date.now(); }
      myPing();
      return;
    }
    if (m.t === 'ack') {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id); clearTimeout(p.timer);
      if (m.ok) p.resolve(m.result); else p.reject(Object.assign(Error(m.message || t('操作失败', 'That did not work')), {status: m.status}));
      return;
    }
    if (m.t === 'error') { stop(); problem(m.status === 404 ? t('找不到这个房间', 'Room not found') : t('进不了这个房间', 'Cannot enter this room'), m.message); return; }
    if (m.t === 'bye') {
      const reasons = {
        elsewhere: [t('这个房间已在别的页面打开', 'This room is open in another page'), t('同一账号只能在一个页面里玩。', 'One account plays in one page at a time.'), true],
        kicked: [t('你已离开这个房间', 'You left this room'), t('房主请你离开了这个房间。', 'The host asked you to leave the room.')],
        removed: [t('这个房间已经关闭', 'This room is closed'), t('房间已被删除。', 'The room was removed.')],
        closed: [t('这个房间已经关闭', 'This room is closed'), t('房间长时间没有人使用，已经关闭。', 'Nobody used the room for a while, so it was closed.')],
        auth: [t('需要重新登录', 'Please sign in again'), t('登录已失效。', 'Your sign-in has expired.')]
      };
      if (m.reason === 'left') { stopped = true; location.href = '/play/'; return; }
      if (m.reason === 'shutdown') return;
      if (m.reason === 'auth') G.api.get('/api/me').catch(() => {});
      const [title, text, again] = reasons[m.reason] || reasons.closed;
      stop(); problem(title, text, again);
    }
  }
  function stop() { stopped = true; clearTimeout(retryTimer); clearInterval(pingTimer); if (socket) { const s = socket; socket = null; s.close(); } }
  function act(a, d = {}) {
    return new Promise((resolve, reject) => {
      if (!socket || socket.readyState !== 1) return reject(Object.assign(Error(t('正在重新连接，请稍候', 'Reconnecting, one moment')), {status: 0}));
      const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      pending.set(id, {resolve, reject, timer: setTimeout(() => { pending.delete(id); reject(Error(t('服务器没有回应，请重试', 'No answer from the server, please try again'))); }, 10000)});
      send({t: 'act', id, a, d});
    });
  }
  // Moves that fail say why in a short message; the page keeps whatever the player typed.
  const run = (a, d) => act(a, d).catch(error => { G.toast(error.message); throw error; });

  // ---- Latency ------------------------------------------------------------------------------------------------------
  function stats() {
    if (samples.length < 3) return null;
    const sorted = samples.slice().sort((a, b) => a - b), at = q => sorted[Math.round(q * (sorted.length - 1))];
    return {median: at(0.5), jitter: at(0.9) - at(0.1), min: sorted[0], n: sorted.length};
  }
  function ping() { send({t: 'ping', c: Date.now(), net: stats()}); }
  function myPing() {
    const node = $('myPing'), s = stats();
    if (!node || !s) return;
    node.hidden = false;
    node.textContent = t('延迟 ', 'Ping ') + s.median + ' ms';
    node.className = 'pill ping ' + (s.median < 120 ? 'good' : s.median < 250 ? 'fair' : 'slow');
  }
  async function netTest() {
    const button = $('netTest');
    button.disabled = true; button.textContent = t('测量中…', 'Measuring…');
    samples.length = 0;
    for (let i = 0; i < 20; i++) { send({t: 'ping', c: Date.now()}); await new Promise(resolve => setTimeout(resolve, 120)); }
    await new Promise(resolve => setTimeout(resolve, 600));
    ping();
    button.disabled = false; button.textContent = t('再测一次', 'Measure again');
    const s = stats();
    if (s) G.toast(t('你到服务器：中位 ' + s.median + ' ms，最快 ' + s.min + ' ms，波动 ' + s.jitter + ' ms', 'You to the server: median ' + s.median + ' ms, best ' + s.min + ' ms, jitter ' + s.jitter + ' ms'));
  }
  function netPanel() {
    const list = $('netList');
    if (!list || !view) return;
    list.replaceChildren();
    const measured = view.seats.map((s, i) => ({i, s})).filter(x => !x.s.bot && !x.s.empty && x.s.net);
    for (const {i, s} of measured) {
      list.append(el('dt', {text: seatName(i) + (i === view.you ? t('（你）', ' (you)') : '')}),
        el('dd', {text: s.net.median + ' ms' + t('，波动 ', ', jitter ') + s.net.jitter + ' ms'}));
    }
    if (measured.length === 2) {
      const between = Math.round((measured[0].s.net.median + measured[1].s.net.median) / 2);
      list.append(el('dt', {class: 'between', text: t('你们之间（经服务器）', 'Between you (via the server)')}), el('dd', {class: 'between', text: t('约 ', 'about ') + between + ' ms'}));
    }
    if (!measured.length) list.append(el('dd', {class: 'hint', text: t('连接后自动测量。', 'Measured once connected.')}));
  }

  // ---- Clock --------------------------------------------------------------------------------------------------------
  // Any element with data-clock shows the round's time left; the bar inside it shrinks with the time.
  const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function clock() {
    const node = el('div', {class: 'clock', dataset: {clock: '1'}}, el('span', {class: 'clock-text'}), el('span', {class: 'clock-bar'}, el('i')));
    tick(); return node;
  }
  function tick() {
    if (!view) return;
    const left = view.deadline ? view.deadline - serverNow() : view.remaining;
    for (const node of document.querySelectorAll('[data-clock]')) {
      const text = node.querySelector('.clock-text'), bar = node.querySelector('.clock-bar i');
      if (left == null) { node.hidden = true; continue; }
      node.hidden = false;
      if (!node.dataset.total || Number(node.dataset.deadline) !== view.deadline) { node.dataset.total = String(Math.max(left, 1)); node.dataset.deadline = String(view.deadline); }
      text.textContent = view.paused ? t('已暂停 ', 'Paused ') + fmt(left) : fmt(left);
      bar.style.width = Math.max(0, Math.min(100, left / Number(node.dataset.total) * 100)) + '%';
      node.classList.toggle('urgent', !view.paused && left < 10_000);
    }
    const away = document.querySelector('[data-away]');
    if (away && view.away) {
      const since = Math.min(...view.away.filter(Boolean));
      away.textContent = Number.isFinite(since) ? fmt(serverNow() - since) : '';
    }
  }
  setInterval(tick, 250);

  // ---- Room page ----------------------------------------------------------------------------------------------------
  function show(id) { for (const section of ['loading', 'start', 'room', 'problem']) { const node = $(section); if (node) node.hidden = section !== id; } }
  function problem(title, text, again = false) {
    show('problem');
    $('problemTitle').textContent = title; $('problemText').textContent = text || '';
    const button = $('retry'); button.hidden = !again;
  }
  function connection(state) {
    connState = state;
    const node = $('conn');
    if (!node) return;
    node.dataset.state = state;
    $('connText').textContent = {online: t('已连接', 'Connected'), connecting: t('连接中…', 'Connecting…'), retry: t('重新连接中…', 'Reconnecting…'), offline: t('连接中断', 'Disconnected')}[state];
  }
  // Keeps what the player is typing (and the focus) across redraws.
  function keep(root, draw) {
    const saved = {}, active = document.activeElement?.dataset?.keep;
    for (const input of root.querySelectorAll('[data-keep]')) saved[input.dataset.keep] = {value: input.value, start: input.selectionStart, end: input.selectionEnd};
    draw();
    for (const input of root.querySelectorAll('[data-keep]')) {
      const s = saved[input.dataset.keep];
      if (s && !input.disabled) { input.value = s.value; if (input.dataset.keep === active) { input.focus({preventScroll: true}); try { input.setSelectionRange(s.start, s.end); } catch {} } }
    }
  }
  function render() {
    if (!view) return;
    show('room');
    $('roomGame').textContent = gameName(view.game);
    $('roomCode').textContent = view.code;
    $('crumbRoom').textContent = gameName(view.game);
    document.title = gameName(view.game) + ' · ' + view.code + ' · Gary Hub';
    connection(connState);
    seatsPanel(); netPanel(); banner();
    const stage = $('stage');
    keep(stage, () => {
      stage.replaceChildren();
      stage.dataset.status = view.status;
      if (view.status === 'lobby' || !view.state) lobby(stage);
      else {
        games[view.game]?.render(stage, view, api);
        if (view.status === 'finished') stage.append(footer());
      }
    });
    tick();
  }
  function banner() {
    const node = $('banner');
    node.replaceChildren(); node.hidden = true; node.className = 'banner';
    if (!socket || socket.readyState !== 1) {
      if (view && !stopped) { node.hidden = false; node.classList.add('warn'); node.append(t('连接中断，正在重新连接…你的进度保存在服务器上。', 'Disconnected, reconnecting… your progress is kept on the server.')); }
      return;
    }
    if (view.paused) {
      node.hidden = false; node.classList.add('warn');
      const missing = view.seats.map((s, i) => i).filter(i => !view.seats[i].bot && !view.seats[i].empty && !view.seats[i].online && i !== view.you);
      if (view.paused.reason === 'restart' && !missing.length) node.append(t('服务器刚刚重启，马上继续…', 'The server just restarted; continuing…'));
      else node.append(t('等待 ', 'Waiting for ') + (missing.map(seatName).join('、') || t('其他玩家', 'the other player')) + t(' 回来，计时已暂停', ' to come back; the clock is stopped'), ' · ', el('span', {dataset: {away: '1'}}));
      games[view.game]?.paused?.(node, view, api);
    }
  }
  function seatsPanel() {
    const list = $('seats');
    if (!list || !view) return;
    list.replaceChildren();
    const lobbyish = view.status !== 'playing';
    view.seats.forEach((s, i) => {
      const name = seatName(i), tags = el('span', {class: 'tags'});
      if (i === view.host) tags.append(el('span', {class: 'pill me', text: t('房主', 'Host')}));
      if (i === view.you) tags.append(el('span', {class: 'pill', text: t('你', 'You')}));
      if (view.status === 'lobby' && !s.empty && !s.bot && i !== view.host) tags.append(el('span', {class: 'pill ' + (s.ready ? 'done' : 'off'), text: s.ready ? t('已准备', 'Ready') : t('未准备', 'Not ready')}));
      if (!s.empty && !s.bot && s.net) tags.append(el('span', {class: 'pill off', text: s.net.median + ' ms'}));
      const item = el('li', {class: 'seat' + (i === view.you ? ' mine' : '') + (s.empty ? ' empty' : '') + (!s.online ? ' away' : '')},
        el('span', {class: 'avatar', 'aria-hidden': 'true', text: s.bot ? '🤖' : s.empty ? '·' : (s.name || '?').slice(0, 1).toUpperCase()}),
        el('span', {class: 'who-name'}, el('span', {class: 'status-dot', title: s.online ? t('在线', 'Online') : t('离线', 'Offline')}), name), tags);
      if (view.isHost && lobbyish && i !== view.you && !s.empty) {
        item.append(el('button', {class: 'chip-btn seat-x', type: 'button', 'aria-label': s.bot ? t('移除电脑玩家', 'Remove computer') : t('请对方离开', 'Ask to leave'), text: '✕',
          onclick: () => { if (s.bot || confirm(t('请 ' + name + ' 离开这个房间？', 'Ask ' + name + ' to leave this room?'))) run(s.bot ? 'removeBot' : 'kick', {seat: i}).catch(() => {}); }}));
      }
      list.append(item);
    });
  }
  function settingsControls(game) {
    const rules = games[view.game]?.settings || [];
    const box = el('div', {class: 'settings-grid'});
    for (const field of rules) {
      const current = view.settings[field.name];
      if (!view.isHost) {
        const option = field.options.find(o => o[0] === current);
        box.append(el('div', {class: 'setting'}, el('span', {class: 'hint', text: t(...field.label)}), el('strong', {text: option ? t(option[1], option[2]) : String(current)})));
        continue;
      }
      const select = el('select', {class: 'select', 'aria-label': t(...field.label)});
      for (const [value, zh, en] of field.options) select.append(el('option', {value: String(value), text: t(zh, en), selected: value === current}));
      select.addEventListener('change', () => {
        const next = {...view.settings, [field.name]: Number(select.value)};
        run('settings', {settings: next}).catch(() => { select.value = String(current); });
      });
      box.append(el('label', {class: 'field'}, el('span', {text: t(...field.label)}), select));
    }
    return box;
  }
  function lobby(stage) {
    const game = games[view.game];
    stage.append(el('div', {class: 'stage-head'}, el('h2', {text: t('等人到齐', 'Waiting for players')}),
      el('p', {class: 'hint', text: game?.intro ? t(...game.intro) : ''})));
    // Sharing: the code, the link, and invitations by username.
    const share = el('div', {class: 'share'},
      el('div', {class: 'big-code', text: view.code}),
      el('p', {class: 'hint', text: t('把房间码或链接发给朋友，对方登录后就能进来。', 'Send the code or the link; your friend signs in and joins.')}));
    const input = el('input', {class: 'input', maxlength: '64', autocomplete: 'off', placeholder: t('对方的用户名', "Friend's username"), dataset: {keep: 'invite'}});
    const form = el('form', {class: 'invite', novalidate: true}, input, el('button', {class: 'btn btn-violet btn-sm', type: 'submit', text: t('发送邀请', 'Invite')}));
    form.addEventListener('submit', event => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) return;
      run('invite', {username: name}).then(r => { input.value = ''; G.toast(t('已邀请 ' + r.invited + '，对方会收到站内通知', 'Invited ' + r.invited + '; they get an in-app notice')); }).catch(() => {});
    });
    const chips = el('div', {class: 'chips'});
    for (const name of recent.filter(n => !view.seats.some(s => s.name === n))) chips.append(el('button', {class: 'chip-btn', type: 'button', text: name, onclick: () => { input.value = name; input.focus(); }}));
    share.append(form, chips, el('p', {class: 'hint', text: t('这个房间还可以邀请 ' + view.invitesLeft + ' 次。', view.invitesLeft + ' invitations left for this room.')}));
    stage.append(share);
    stage.append(el('h3', {text: t('设置', 'Settings')}), settingsControls());
    const actions = el('div', {class: 'actions'});
    const empty = view.seats.some(s => s.empty), me = view.seats[view.you];
    if (view.isHost && view.rules.bots.length && empty) {
      const level = el('select', {class: 'select', 'aria-label': t('电脑难度', 'Computer level')});
      for (const l of view.rules.bots) level.append(el('option', {value: l, text: botName(l), selected: l === 'normal'}));
      actions.append(el('span', {class: 'bot-pick'}, level, el('button', {class: 'btn btn-ghost', type: 'button', text: t('添加电脑对手', 'Add computer'), onclick: () => run('addBot', {level: level.value}).catch(() => {})})));
    }
    if (view.isHost) {
      const waiting = view.seats.filter((s, i) => !s.empty && !s.bot && i !== view.host && !s.ready).length, offline = view.seats.some(s => !s.empty && !s.bot && !s.online);
      const why = empty ? t('还有空座位', 'A seat is empty') : waiting ? t('等对方准备', 'Waiting for the others to get ready') : offline ? t('有玩家不在线', 'Someone is offline') : '';
      actions.append(el('button', {class: 'btn btn-gold', type: 'button', disabled: !!why, text: t('开始', 'Start'), onclick: () => run('start').catch(() => {})}));
      if (why) actions.append(el('span', {class: 'hint', text: why}));
    } else if (me) {
      actions.append(el('button', {class: 'btn ' + (me.ready ? 'btn-ghost' : 'btn-gold'), type: 'button', text: me.ready ? t('取消准备', 'Not ready') : t('准备', 'Ready'),
        onclick: () => run('ready', {ready: !me.ready}).catch(() => {})}));
      if (me.ready) actions.append(el('span', {class: 'hint', text: t('等房主开始', 'Waiting for the host to start')}));
    }
    stage.append(actions);
    if (view.result && game?.summary) stage.append(el('p', {class: 'last-result', text: t('上一局：', 'Last game: ') + game.summary(view.result, view)}));
    if (game?.rules) stage.append(el('details', {class: 'rules'}, el('summary', {text: t('玩法说明', 'How to play')}), el('ol', {}, game.rules().map(([zh, en]) => el('li', {text: t(zh, en)})))));
  }
  function footer() {
    const box = el('div', {class: 'actions footer'});
    if (view.isHost) box.append(el('button', {class: 'btn btn-gold', type: 'button', text: t('再来一局', 'Play again'), onclick: () => run('rematch').catch(() => {})}));
    else box.append(el('span', {class: 'hint', text: t('等房主再来一局', 'Waiting for the host to play again')}));
    return box;
  }
  async function leave() {
    if (!view) { location.href = '/play/'; return; }
    const warn = view.status === 'playing' ? games[view.game]?.leaveWarning?.() : null;
    if (!confirm(warn ? t(...warn) : t('确定离开这个房间吗？', 'Leave this room?'))) return;
    try { await act('leave'); } catch (error) { if (error.status !== 0) { G.toast(error.message); return; } }
    stopped = true; location.href = '/play/';
  }
  function copyLink() {
    const link = location.origin + '/play/?room=' + code;
    const done = () => G.toast(t('邀请链接已复制', 'Invite link copied'));
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(done, () => G.toast(link));
    else G.toast(link);
  }

  // ---- Start page ---------------------------------------------------------------------------------------------------
  const STATUS = {lobby: ['等人中', 'Waiting'], playing: ['进行中', 'Playing'], finished: ['已结束', 'Finished']};
  let listing = null;
  function roomsList() {
    const box = $('myRooms');
    if (!box || !listing) return;
    box.replaceChildren();
    if (!listing.rooms.length) { box.append(el('p', {class: 'empty', text: t('还没有房间。', 'No rooms yet.')})); return; }
    const list = el('ul', {class: 'room-list'});
    for (const room of listing.rooms) {
      const state = room.paused ? t('已暂停', 'Paused') : t(...(STATUS[room.status] || STATUS.finished));
      const others = room.players.filter((p, i) => i !== room.you).map(label).join('、') || t('等人加入', 'nobody yet');
      const summary = room.result && games[room.game]?.summary ? games[room.game].summary(room.result, {you: room.you, seats: room.players.map(p => ({name: p}))}) : '';
      list.append(el('li', {}, el('a', {href: '/play/?room=' + room.code, class: 'room-link'},
        el('span', {class: 'room-name'}, el('strong', {text: gameName(room.game)}), el('span', {class: 'code', text: room.code})),
        el('span', {class: 'hint', text: t('和 ', 'with ') + others + (summary ? ' · ' + summary : '')}),
        el('span', {class: 'pill' + (room.status === 'playing' ? ' me' : room.status === 'finished' ? ' done' : ''), text: state}))));
    }
    box.append(list);
  }
  async function start() {
    show('start');
    const form = $('createForm');
    const pick = () => { const game = form.elements.game.value; $('wordSettings').hidden = game !== 'word'; $('digitsSettings').hidden = game !== 'digits'; };
    if (['word', 'digits'].includes(params.get('game'))) form.elements.game.value = params.get('game');
    pick();
    for (const radio of form.querySelectorAll('input[name=game]')) radio.addEventListener('change', pick);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const game = form.elements.game.value, button = form.querySelector('button[type=submit]');
      const settings = game === 'word' ? {limit: Number(form.elements.limit.value), cap: Number(form.elements.cap.value), target: Number(form.elements.target.value)}
        : {limit: Number(form.elements.dlimit.value)};
      button.disabled = true; $('createError').textContent = '';
      try { const room = await G.api.post('/api/hub/play', {game, settings}); location.href = '/play/?room=' + room.code; }
      catch (error) { $('createError').textContent = error.message; button.disabled = false; }
    });
    $('joinForm').addEventListener('submit', event => {
      event.preventDefault();
      const value = $('joinRoom').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!CODE.test(value)) { $('joinError').textContent = t('房间码是 6 位字母或数字', 'A room code has 6 letters or digits'); return; }
      location.href = '/play/?room=' + value;
    });
    try { listing = await G.api.get('/api/hub/play'); roomsList(); } catch (error) { $('myRooms').replaceChildren(el('p', {class: 'error', text: error.message})); }
  }

  // ---- Shared with the games ----------------------------------------------------------------------------------------
  const api = {act: run, clock, seatName, serverNow, botName, gameName, fmt, redraw: () => render(), get view() { return view; }};
  window.Play = {register: (id, game) => { games[id] = game; }, api, label};

  function boot() {
    G.onLanguage(() => { if (view) render(); else roomsList(); });
    const raw = (params.get('room') || '').toUpperCase();
    if (!raw) return start();
    if (!CODE.test(raw)) return problem(t('房间码不对', 'Not a room code'), t('房间码是 6 位字母或数字。', 'A room code has 6 letters or digits.'));
    code = raw;
    show('loading');
    $('copyLink').addEventListener('click', copyLink);
    $('leave').addEventListener('click', leave);
    $('netTest').addEventListener('click', netTest);
    $('retry').addEventListener('click', () => { stopped = false; retry = 0; connect(); });
    G.api.get('/api/hub/play').then(data => { recent = data.recent || []; if (view?.status === 'lobby') render(); }).catch(() => {});
    const again = () => { if (!stopped && !socket) { retry = 0; connect(); } };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) again(); });
    addEventListener('online', again);
    connect();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
