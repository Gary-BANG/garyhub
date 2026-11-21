/* GaryHub Games (v2.4.3.1): 合作小车 / Co-op Car in a live room. One player steers, the other works throttle, brake and
   boosts; the server drives the car and sends positions twenty times a second. This page draws them 110 ms in the past,
   smoothing between frames, and shows each player's own controls at once so the car feels heavy rather than late. */
(() => {
  'use strict';
  const G = window.Games, {t, el} = G, Sim = window.CarSim;
  const INTERP = 110, KEEP = 40, CALLS = {left: ['左！', 'Left!'], right: ['右！', 'Right!'], slow: ['慢点！', 'Slow down!'], go: ['冲！', 'Go!'], nice: ['漂亮！', 'Nice!']};
  const FALLS = {bridge: ['从桥上掉下去了', 'Fell off the bridge'], fast: ['桥上太快，滑出去了', 'Too fast on the bridge'], gap: ['没冲过缺口', 'Did not clear the gap'], edge: ['开出赛道太远', 'Too far off the road']};
  const kmh = v => Math.round(v * 3.6);
  let ui = null;

  // ---- Controls -----------------------------------------------------------------------------------------------------
  const held = {left: false, right: false, gas: false, brake: false};
  const keys = {ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake'};
  let q = 0, boosts = 0, last = '', audio = null;
  const sent = new Map(), echoes = [];
  function controls() {
    if (!ui || !ui.role) return null;
    return ui.role === 'steer' ? {steer: (held.right ? 1 : 0) - (held.left ? 1 : 0)} : {gas: held.gas ? 1 : 0, brake: held.brake ? 1 : 0, boost: boosts};
  }
  function push(force = false) {
    const k = controls();
    if (!k || !ui.api.online) return;
    const key = JSON.stringify(k);
    if (!force && key === last) return;
    last = key; q++;
    sent.set(q, performance.now());
    if (sent.size > 50) sent.delete(sent.keys().next().value);
    ui.api.input(k, q);
    mine();
  }
  const active = () => held.left || held.right || held.gas || held.brake;
  // Held controls are sent again every 400 ms, so they come back by themselves after a reconnect.
  setInterval(() => { if (ui && ui.root.isConnected && active()) push(true); }, 400);
  function press(name, down) {
    if (held[name] === down) return;
    held[name] = down; sound();
    push();
  }
  function boost() { if (!ui || ui.role !== 'gas') return; boosts++; push(); }
  addEventListener('keydown', event => {
    if (!ui || !ui.root.isConnected || event.repeat && keys[event.code] || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
    if (keys[event.code]) { event.preventDefault(); press(keys[event.code], true); }
    else if ((event.code === 'Space' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') && ui.role === 'gas') { event.preventDefault(); if (!event.repeat) boost(); }
  });
  addEventListener('keyup', event => { if (ui && keys[event.code]) { event.preventDefault(); press(keys[event.code], false); } });
  // Leaving the page or the tab lets go of everything.
  const release = () => { let any = false; for (const name of Object.keys(held)) if (held[name]) { held[name] = false; any = true; } if (any) push(); };
  addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });

  function hold(button, name) {
    const on = event => { event.preventDefault(); button.setPointerCapture?.(event.pointerId); button.classList.add('down'); press(name, true); };
    const off = () => { button.classList.remove('down'); press(name, false); };
    button.addEventListener('pointerdown', on);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, off);
    button.addEventListener('contextmenu', event => event.preventDefault());
  }

  // ---- Sound: a short beep for calls, countdown and knocks (only after the first tap or key) -------------------------
  // Vibration only after the player has really tapped or pressed something (browsers refuse it before).
  const buzz = ms => { if (navigator.userActivation?.hasBeenActive) try { navigator.vibrate?.(ms); } catch {} };
  function sound() { if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { audio = false; } } }
  function beep(freq, ms = 120, volume = 0.08) {
    if (!audio) return;
    try {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = freq; g.gain.value = volume; o.connect(g); g.connect(audio.destination);
      o.start(); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + ms / 1000); o.stop(audio.currentTime + ms / 1000 + 0.02);
    } catch {}
  }

  // ---- Building the page --------------------------------------------------------------------------------------------
  function build(api) {
    const root = el('div', {class: 'car'});
    const canvas = el('canvas', {class: 'car-view', 'aria-label': t('赛道画面', 'The track')});
    const overlay = el('div', {class: 'car-overlay', 'aria-live': 'assertive'});
    const hint = el('div', {class: 'car-hint', hidden: true});
    const warn = el('div', {class: 'car-warn', hidden: true});
    const call = el('div', {class: 'car-call', hidden: true});
    const mini = el('canvas', {class: 'car-mini', width: '150', height: '150', hidden: true, 'aria-hidden': 'true'});
    const hud = {role: el('span', {class: 'pill me car-role'}), level: el('span', {class: 'car-level'}), hearts: el('span', {class: 'car-hearts', 'aria-label': t('剩余心数', 'Hearts left')}),
      time: el('strong', {class: 'car-time'}), coins: el('span', {class: 'car-coins'}), speed: el('span', {class: 'car-speed'}), boosts: el('span', {class: 'car-boosts'})};
    const partner = {wheel: el('span', {class: 'wheel', 'aria-hidden': 'true', text: '⎈'}), gas: el('i', {class: 'gauge gas'}), brake: el('i', {class: 'gauge brake'}), text: el('span', {class: 'hint'})};
    const echo = el('span', {class: 'pill off car-echo', hidden: true, title: t('从按下到在画面上看到服务器回应的时间', 'Time from a key press until the server answers it on screen')});
    const top = el('div', {class: 'car-top'}, hud.role, hud.level, el('span', {class: 'spacer'}), hud.hearts, hud.coins, hud.boosts, hud.time);
    const wrap = el('div', {class: 'car-stage'}, canvas, mini, hint, warn, call, overlay, el('div', {class: 'car-speedo'}, hud.speed));
    const team = el('div', {class: 'car-team'}, el('span', {class: 'hint', text: t('驾驶状态：', 'At the wheel: ')}), partner.wheel, el('span', {class: 'gauges'}, partner.brake, partner.gas), partner.text, el('span', {class: 'spacer'}), echo);
    const pads = el('div', {class: 'car-controls'});
    const calls = el('div', {class: 'car-calls'}, ...Object.entries(CALLS).map(([c, [zh, en]]) => el('button', {class: 'chip-btn', type: 'button', text: t(zh, en), onclick: () => { sound(); api.say(c); }})));
    root.append(top, wrap, team, pads, calls);
    const ctx = canvas.getContext('2d'), miniCtx = mini.getContext('2d');
    return {root, canvas, ctx, mini, miniCtx, overlay, hint, warn, call, hud, partner, echo, pads, calls, frames: [], key: '', role: null, track: null, api, view: null, draw: 0, callTimer: 0, lastHearts: null, lastCount: null};
  }
  function controlsFor(role) {
    ui.pads.replaceChildren();
    ui.pads.className = 'car-controls ' + (role || '');
    if (role === 'steer') {
      const left = el('button', {class: 'pad-btn', type: 'button', 'aria-label': t('向左', 'Left'), text: '◀'}), right = el('button', {class: 'pad-btn', type: 'button', 'aria-label': t('向右', 'Right'), text: '▶'});
      hold(left, 'left'); hold(right, 'right');
      ui.pads.append(left, el('p', {class: 'hint', text: t('按住转向 · 键盘 ← → 或 A D', 'Hold to steer · keys ← → or A D')}), right);
    } else if (role === 'gas') {
      const brake = el('button', {class: 'pad-btn brake', type: 'button', text: t('刹车', 'Brake')}), gas = el('button', {class: 'pad-btn gas', type: 'button', text: t('油门', 'Gas')});
      const nitro = el('button', {class: 'pad-btn nitro', type: 'button', text: t('氮气', 'Boost')});
      hold(brake, 'brake'); hold(gas, 'gas');
      nitro.addEventListener('pointerdown', event => { event.preventDefault(); sound(); boost(); });
      ui.pads.append(brake, el('div', {class: 'pad-mid'}, nitro, el('p', {class: 'hint', text: t('键盘 ↑ 油门 · ↓ 刹车 · 空格 氮气', 'Keys ↑ gas · ↓ brake · Space boost')})), gas);
    }
  }

  // ---- Frames and interpolation -------------------------------------------------------------------------------------
  function frame(m) {
    if (!ui || !ui.view || ui.view.status !== 'playing') return;
    const f = {...m.d, at: m.s};
    ui.frames.push(f);
    if (ui.frames.length > KEEP) ui.frames.shift();
    // How long until my own controls showed up in a frame from the server.
    const echoed = f.q?.[ui.view.you];
    if (echoed) for (const [n, at] of sent) if (n <= echoed) { echoes.push(performance.now() - at); sent.delete(n); if (echoes.length > 12) echoes.shift(); }
  }
  const lerp = (a, b, k) => a + (b - a) * k;
  const lerpAngle = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };
  function sample() {
    const list = ui.frames;
    if (!list.length) return null;
    const at = ui.api.serverNow() - INTERP;
    let i = list.length - 1;
    while (i > 0 && list[i - 1].at > at) i--;
    const b = list[i], a = list[i - 1];
    if (!a || at >= b.at) {
      // Past the newest frame: carry on along the heading for a moment (at most 120 ms).
      const ahead = Math.min(Math.max(at - b.at, 0), 120) / 1000, moving = b.p === 'running';
      return {...b, x: b.x + (moving ? Math.cos(b.h) * b.v * ahead : 0), y: b.y + (moving ? Math.sin(b.h) * b.v * ahead : 0)};
    }
    const k = Math.max(0, Math.min(1, (at - a.at) / (b.at - a.at || 1)));
    return {...b, x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), h: lerpAngle(a.h, b.h, k), v: lerp(a.v, b.v, k), w: lerp(a.w, b.w, k)};
  }

  // ---- Drawing ------------------------------------------------------------------------------------------------------
  function strip(track, from, to, left, right) {
    const path = new Path2D(), edge = [], back = [];
    for (let s = Math.max(0, from); s <= Math.min(track.length, to) + 0.01; s += 2) { edge.push(Sim.pose(track, s, -left)); back.push(Sim.pose(track, s, right)); }
    if (!edge.length) return path;
    path.moveTo(edge[0].x, edge[0].y);
    for (const p of edge.slice(1)) path.lineTo(p.x, p.y);
    for (const p of back.reverse()) path.lineTo(p.x, p.y);
    path.closePath();
    return path;
  }
  function prepare(track) {
    const lines = new Path2D(), centre = new Path2D();
    for (const side of [-1, 1]) { const p0 = Sim.pose(track, 0, side * track.half); lines.moveTo(p0.x, p0.y); for (let s = 2; s <= track.length; s += 2) { const p = Sim.pose(track, s, side * track.half); lines.lineTo(p.x, p.y); } }
    for (let s = 0; s < track.length - 4; s += 8) { const a = Sim.pose(track, s, 0), b = Sim.pose(track, s + 4, 0); centre.moveTo(a.x, a.y); centre.lineTo(b.x, b.y); }
    const checks = track.checkpoints.map(s => strip(track, s - 0.6, s + 0.6, track.half, track.half));
    return {road: strip(track, 0, track.length, track.half, track.half), verge: strip(track, 0, track.length, track.half + 5, track.half + 5), lines, centre, checks,
      finish: strip(track, track.finish - 1.5, track.finish + 1.5, track.half, track.half),
      water: track.bridges.map(b => strip(track, b.from - 4, b.to + 4, track.half + 9, track.half + 9)), decks: track.bridges.map(b => strip(track, b.from - 4, b.to + 4, b.half, b.half)),
      gaps: track.ramps.map(r => strip(track, r.at + 1, r.to, track.half + 5, track.half + 5)), ramps: track.ramps.map(r => strip(track, r.at - 6, r.at, track.half, track.half)),
      oils: track.oils.map(o => strip(track, o.from, o.to, track.half, track.half)), pads: track.boosts.map(b => strip(track, b.s - 3, b.s + 3, 3 - b.d, 3 + b.d))};
  }
  function palette() {
    const light = document.documentElement.dataset.ghTheme === 'light';
    return light ? {grass: '#8fcf7e', verge: '#79b96a', road: '#5d5f6e', line: '#ffffff', centre: '#f6e7a6', water: '#5aa9e6', deck: '#a8743f', pit: '#1d1b2c', oil: 'rgba(20,16,40,.75)', pad: '#36d6e7', check: '#f3b94a'}
      : {grass: '#16341f', verge: '#1d4128', road: '#2f3142', line: '#e9e6ff', centre: '#cdb66b', water: '#1d5d93', deck: '#7a5230', pit: '#05040c', oil: 'rgba(0,0,0,.72)', pad: '#2fd3e6', check: '#f6c86e'};
  }
  function draw() {
    ui.draw = 0;
    if (!ui.root.isConnected || !ui.view || ui.view.game !== 'car') return;
    ui.draw = requestAnimationFrame(draw);
    const s = ui.view.status === 'playing' ? sample() : null, state = ui.view.state, car = s || state;
    if (!car || !ui.track) return;
    const canvas = ui.canvas, dpr = Math.min(devicePixelRatio || 1, 2), W = canvas.clientWidth, H = canvas.clientHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    const ctx = ui.ctx, c = palette(), shapes = ui.shapes;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = c.grass; ctx.fillRect(0, 0, W, H);
    const ppm = H / 50 * (1 - Math.min(car.v / Sim.BOOST_SPEED, 1) * 0.2);
    ctx.translate(W / 2, H * 0.7); ctx.scale(ppm, ppm); ctx.rotate(-Math.PI / 2 - car.h); ctx.translate(-car.x, -car.y);
    // Road first, then what replaces it (water under the bridge deck, the pit of the gap) so no road line crosses them.
    ctx.fillStyle = c.verge; ctx.fill(shapes.verge);
    ctx.fillStyle = c.road; ctx.fill(shapes.road);
    ctx.fillStyle = c.oil; for (const p of shapes.oils) ctx.fill(p);
    ctx.strokeStyle = c.line; ctx.lineWidth = 0.35; ctx.stroke(shapes.lines);
    ctx.strokeStyle = c.centre; ctx.lineWidth = 0.25; ctx.stroke(shapes.centre);
    for (const [i, p] of shapes.water.entries()) { ctx.fillStyle = c.water; ctx.fill(p); ctx.fillStyle = c.deck; ctx.fill(shapes.decks[i]); ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 0.3; ctx.stroke(shapes.decks[i]); }
    for (const p of shapes.gaps) { ctx.fillStyle = c.pit; ctx.fill(p); }
    ctx.lineWidth = 0.6;
    for (const p of shapes.ramps) { ctx.fillStyle = '#f6c86e'; ctx.fill(p); ctx.strokeStyle = '#2b1a00'; ctx.stroke(p); }
    ctx.fillStyle = c.pad; for (const p of shapes.pads) ctx.fill(p);
    ctx.fillStyle = c.check; for (const p of shapes.checks) ctx.fill(p);
    ctx.fillStyle = '#ffffff'; ctx.fill(shapes.finish);
    // Cones and coins come from the full room state (sent whenever one is knocked or picked up).
    const hit = new Set(state?.hit || []), got = new Set(state?.coins || []), time = performance.now() / 1000;
    for (const [i, coin] of ui.track.coins.entries()) {
      if (got.has(i)) continue;
      ctx.fillStyle = '#f6c86e'; ctx.beginPath(); ctx.ellipse(coin.x, coin.y, 0.8 * Math.abs(Math.cos(time * 3 + i)) + 0.15, 0.8, 0, 0, Math.PI * 2); ctx.fill();
    }
    for (const [i, cone] of ui.track.cones.entries()) {
      ctx.save(); ctx.translate(cone.x, cone.y); ctx.rotate(cone.h + Math.PI / 2);
      if (hit.has(i)) { ctx.fillStyle = 'rgba(150,140,170,.55)'; ctx.fillRect(-0.9, -0.3, 1.8, 0.6); }
      else { ctx.fillStyle = '#ff8a3d'; ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(0.8, 0.7); ctx.lineTo(-0.8, 0.7); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(-0.45, -0.05, 0.9, 0.25); }
      ctx.restore();
    }
    // The car (higher and with a shadow in the air, blinking just after a knock).
    ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.h);
    const lift = car.a ? 1.15 : 1;
    if (car.a) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(-2.1 + 0.8, -1 + 0.8, 4.2, 2); }
    ctx.scale(lift, lift);
    if (car.b) { ctx.fillStyle = '#36d6e7'; ctx.beginPath(); ctx.moveTo(-2.1, -0.6); ctx.lineTo(-3.6 - Math.random(), 0); ctx.lineTo(-2.1, 0.6); ctx.fill(); }
    ctx.globalAlpha = car.inv && Math.floor(time * 10) % 2 ? 0.45 : 1;
    ctx.fillStyle = '#1b1530';
    for (const [x, y, turn] of [[1.3, -1.05, true], [1.3, 1.05, true], [-1.3, -1.05, false], [-1.3, 1.05, false]]) { ctx.save(); ctx.translate(x, y); if (turn) ctx.rotate(car.w || 0); ctx.fillRect(-0.45, -0.22, 0.9, 0.44); ctx.restore(); }
    ctx.fillStyle = '#f6c86e'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-2.1, -0.95, 4.2, 1.9, 0.5) : ctx.rect(-2.1, -0.95, 4.2, 1.9); ctx.fill();
    ctx.fillStyle = '#6b4fe0'; ctx.fillRect(0.2, -0.75, 1.1, 1.5);
    ctx.restore(); ctx.globalAlpha = 1;
    if (s) hud(s);
    minimap(car);
  }
  function minimap(car) {
    if (ui.mini.hidden || !ui.track) return;
    const m = ui.miniCtx, b = ui.bounds;
    m.setTransform(1, 0, 0, 1, 0, 0); m.clearRect(0, 0, 150, 150);
    m.fillStyle = 'rgba(10,7,32,.6)'; m.fillRect(0, 0, 150, 150);
    const scale = 130 / Math.max(b.w, b.h), ox = 75 - (b.x + b.w / 2) * scale, oy = 75 - (b.y + b.h / 2) * scale;
    m.strokeStyle = '#b9b0da'; m.lineWidth = 4; m.lineCap = 'round'; m.beginPath();
    ui.track.points.forEach((p, i) => i ? m.lineTo(p.x * scale + ox, p.y * scale + oy) : m.moveTo(p.x * scale + ox, p.y * scale + oy)); m.stroke();
    m.strokeStyle = '#1d5d93'; for (const z of ui.track.bridges) { m.beginPath(); for (let s = z.from; s <= z.to; s += 4) { const p = Sim.pose(ui.track, s, 0); s === z.from ? m.moveTo(p.x * scale + ox, p.y * scale + oy) : m.lineTo(p.x * scale + ox, p.y * scale + oy); } m.stroke(); }
    m.fillStyle = '#05040c'; for (const r of ui.track.ramps) { const p = Sim.pose(ui.track, (r.at + r.to) / 2, 0); m.fillRect(p.x * scale + ox - 3, p.y * scale + oy - 3, 6, 6); }
    const f = Sim.pose(ui.track, ui.track.finish, 0); m.fillStyle = '#fff'; m.fillRect(f.x * scale + ox - 3, f.y * scale + oy - 3, 6, 6);
    m.fillStyle = '#ff5c7a'; m.beginPath(); m.arc(car.x * scale + ox, car.y * scale + oy, 4, 0, Math.PI * 2); m.fill();
  }

  // ---- Heads-up display ---------------------------------------------------------------------------------------------
  function set(node, text) { if (node.textContent !== text) node.textContent = text; }
  function hud(f) {
    const h = ui.hud;
    set(h.hearts, '❤'.repeat(Math.max(0, f.hp)) + '♡'.repeat(Math.max(0, 3 - f.hp)));
    set(h.time, ui.api.fmt(f.t));
    set(h.speed, kmh(f.v) + ' km/h');
    set(h.boosts, t('氮气 ', 'Boost ') + f.bl);
    if (ui.lastHearts != null && f.hp < ui.lastHearts) { beep(180, 220, 0.12); buzz(120); }
    ui.lastHearts = f.hp;
    // Countdown, falls and warnings.
    if (f.p === 'countdown') {
      const n = Math.ceil(f.cd / 1000);
      if (n !== ui.lastCount) { ui.lastCount = n; beep(n ? 520 : 880, n ? 120 : 260); }
      overlay(n > 0 ? String(n) : t('出发！', 'Go!'), 'count');
    } else if (f.p === 'respawn') {
      const why = FALLS[ui.view.state?.lastFall] || FALLS.edge;
      overlay(t(why[0], why[1]), 'fall', t('回到检查点，扣 3 秒', 'Back to the checkpoint, minus 3 seconds'));
    } else { ui.lastCount = null; if (ui.overlay.dataset.kind !== 'result') overlay(''); }
    const warning = f.ov ? t('太快了！桥上请慢行', 'Too fast for the bridge!') : f.o ? t('油污打滑！', 'Oil — sliding!') : f.g ? t('压到草地了', 'On the grass') : '';
    ui.warn.hidden = !warning; set(ui.warn, warning); ui.warn.classList.toggle('hot', !!f.ov);
    // What my partner is doing right now (and what I am doing, shown at once from my own keys).
    partner(f);
    const tips = Sim.ahead(ui.track, f.s, ui.role === 'gas' ? 90 : 45);
    let tip = '';
    for (const z of tips) {
      const metres = Math.max(0, Math.round(z.at - f.s));
      if (ui.role === 'gas' && z.kind === 'bridge') { tip = t('前方 ' + metres + ' 米窄桥：降到 ' + kmh(z.max) + ' km/h 以下', 'Narrow bridge in ' + metres + ' m: below ' + kmh(z.max) + ' km/h'); break; }
      if (ui.role === 'gas' && z.kind === 'ramp') { tip = t('前方 ' + metres + ' 米跳台：至少 ' + kmh(z.min) + ' km/h 冲过去', 'Jump in ' + metres + ' m: at least ' + kmh(z.min) + ' km/h'); break; }
      if (ui.role === 'gas' && z.kind === 'oil') { tip = t('前方油污：方向会打滑，别太快', 'Oil ahead: steering slides, not too fast'); break; }
      if (ui.role === 'steer' && z.kind === 'cone') { tip = t('前方锥桶', 'Cones ahead'); break; }
      if (ui.role === 'steer' && z.kind === 'bend') { tip = z.dir > 0 ? t('前方右急弯', 'Sharp right ahead') : t('前方左急弯', 'Sharp left ahead'); break; }
    }
    ui.hint.hidden = !tip; set(ui.hint, tip);
    if (echoes.length) { ui.echo.hidden = false; const sorted = echoes.slice().sort((a, b) => a - b); set(ui.echo, t('操作回显 ', 'Echo ') + Math.round(sorted[Math.floor(sorted.length / 2)]) + ' ms'); }
  }
  function partner(f) {
    const p = ui.partner, me = controls();
    const steer = ui.role === 'steer' && me ? me.steer : f.steer, gas = ui.role === 'gas' && me ? me.gas : f.gas, brake = ui.role === 'gas' && me ? me.brake : f.brake;
    p.wheel.style.transform = 'rotate(' + Math.round(steer * 60) + 'deg)';
    p.gas.classList.toggle('on', !!gas); p.brake.classList.toggle('on', !!brake);
    const words = [steer < -0.1 ? t('向左', 'left') : steer > 0.1 ? t('向右', 'right') : t('直行', 'straight')];
    if (brake) words.push(t('刹车', 'braking')); else if (gas) words.push(t('加油', 'on the gas'));
    set(p.text, words.join(' · '));
  }
  function mine() { if (ui?.view?.state) partner({...ui.view.state, ...(ui.frames.at(-1) || {})}); }
  function overlay(text, kind = '', sub = '') {
    if (ui.overlay.dataset.kind === kind && ui.overlay.dataset.text === text) return;
    ui.overlay.dataset.kind = kind; ui.overlay.dataset.text = text;
    ui.overlay.replaceChildren();
    ui.overlay.hidden = !text;
    if (text) ui.overlay.append(el('div', {class: 'big ' + kind, text}), sub ? el('p', {text: sub}) : null);
  }

  // ---- Result -------------------------------------------------------------------------------------------------------
  function result(v) {
    const o = v.state.outcome, lv = Sim.level(o.level), api = ui.api;
    ui.overlay.hidden = false; ui.overlay.dataset.kind = 'result'; ui.overlay.dataset.text = JSON.stringify(o) + v.isHost;
    const box = el('div', {class: 'car-result ' + o.result});
    if (o.result === 'clear') {
      box.append(el('div', {class: 'stars', 'aria-label': o.stars + ' / 3'}, ...[1, 2, 3].map(n => el('span', {class: n <= o.stars ? 'on' : '', text: '★'}))),
        el('h2', {text: t('第 ' + o.level + ' 关通过！', 'Level ' + o.level + ' cleared!')}),
        el('p', {text: t('用时 ', 'Time ') + api.fmt(o.ms) + t('（标准 ', ' (par ') + lv.par + t(' 秒）· 心 ', ' s) · hearts ') + o.hearts + '/3 · ' + t('金币 ', 'coins ') + o.coins + '/' + o.totalCoins}));
    } else if (o.result === 'fail') {
      box.append(el('h2', {text: o.reason === 'time' ? t('时间到了', 'Out of time') : t('三颗心都没了', 'No hearts left')}),
        el('p', {text: t('跑了 ', 'Drove ') + api.fmt(o.ms) + t('，掉出赛道 ', ', fell off ') + o.falls + t(' 次。再来一次吧！', ' times. Try again!')}));
    } else box.append(el('h2', {text: t('有玩家离开，这一局中断', 'A player left; the run was interrupted')}));
    const best = v.tally?.best?.[o.level];
    if (best) box.append(el('p', {class: 'hint', text: t('这个房间第 ' + o.level + ' 关最好：', 'Best on level ' + o.level + ' here: ') + '★'.repeat(best.stars) + ' ' + api.fmt(best.ms)}));
    const actions = el('div', {class: 'actions'});
    if (v.isHost) {
      actions.append(el('button', {class: 'btn btn-gold', type: 'button', text: t('再试一次', 'Try again'), onclick: () => api.act('rematch', {start: true}).catch(() => {})}));
      if (o.result === 'clear' && Sim.level(o.level + 1)) actions.append(el('button', {class: 'btn btn-violet', type: 'button', text: t('下一关', 'Next level'), onclick: () => api.act('rematch', {start: true, settings: {...v.settings, level: o.level + 1}}).catch(() => {})}));
      actions.append(el('button', {class: 'btn btn-ghost', type: 'button', text: t('回到大厅', 'Back to the lobby'), onclick: () => api.act('rematch', {}).catch(() => {})}));
    } else actions.append(el('span', {class: 'hint', text: t('等房主选择再试一次或下一关', 'The host chooses: try again or next level')}));
    box.append(actions);
    ui.overlay.replaceChildren(box);
  }

  // ---- Room hooks ---------------------------------------------------------------------------------------------------
  function render(stage, v, api) {
    if (!ui) ui = build(api);
    ui.api = api; ui.view = v;
    const s = v.state;
    if (!s || v.you == null) return;
    const key = v.code + ':' + v.matches + ':' + s.level + ':' + (s.easy ? 1 : 0);
    if (key !== ui.key) {
      ui.key = key; ui.frames = []; ui.lastHearts = null; sent.clear(); echoes.length = 0;
      ui.track = Sim.build(s.level, s.easy); ui.shapes = prepare(ui.track);
      const xs = ui.track.points.map(p => p.x), ys = ui.track.points.map(p => p.y);
      ui.bounds = {x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys)};
      overlay('');
    }
    if (ui.role !== s.role) { ui.role = s.role; for (const name of Object.keys(held)) held[name] = false; last = ''; controlsFor(s.role); }
    set(ui.hud.role, s.role === 'steer' ? t('你负责：方向', 'You steer') : t('你负责：油门与刹车', 'You drive the pedals'));
    set(ui.hud.level, t('第 ' + s.level + ' 关 · ', 'Level ' + s.level + ' · ') + t(...Sim.level(s.level).name) + (s.easy ? t(' · 宽松', ' · easy') : ''));
    set(ui.hud.coins, '🪙 ' + s.coins.length + '/' + ui.track.coins.length);
    ui.mini.hidden = s.role !== 'gas';
    ui.root.classList.toggle('finished', v.status === 'finished');
    if (v.status === 'finished' && s.outcome) { result(v); hud({...s, p: 'finished'}); }
    else if (ui.overlay.dataset.kind === 'result') overlay('');
    if (v.status !== 'playing') ui.frames = [];
    stage.append(ui.root);
    if (!ui.draw) ui.draw = requestAnimationFrame(draw);
  }
  function said(m, api) {
    if (!ui || !ui.view) return;
    const [zh, en] = CALLS[m.c] || ['', ''], who = m.seat === ui.view.you ? t('你', 'You') : api.seatName(m.seat);
    ui.call.hidden = false; ui.call.replaceChildren(el('small', {text: who}), el('strong', {text: t(zh, en)}));
    ui.call.classList.remove('pop'); void ui.call.offsetWidth; ui.call.classList.add('pop');
    if (m.seat !== ui.view.you) { beep(740, 160, 0.1); buzz(60); }
    clearTimeout(ui.callTimer); ui.callTimer = setTimeout(() => { ui.call.hidden = true; }, 1600);
  }

  window.Play.register('car', {
    render, frame, said, ownFooter: true,
    intro: ['两人开同一辆车：一人只管方向，另一人管油门、刹车和氮气。避开锥桶，按时开到终点。', 'Two players drive one car: one steers, the other works throttle, brake and boosts. Miss the cones and reach the finish in time.'],
    leaveWarning: () => ['离开会结束这一局（记为中断）。确定离开吗？', 'Leaving ends this run (recorded as interrupted). Leave?'],
    summary: r => r.result === 'clear' ? t('第 ' + r.level + ' 关 ' + '★'.repeat(r.stars), 'Level ' + r.level + ' ' + '★'.repeat(r.stars)) : r.result === 'fail' ? t('第 ' + r.level + ' 关未通过', 'Level ' + r.level + ' not cleared') : t('中断', 'Interrupted'),
    settings: [
      {name: 'level', label: ['关卡', 'Level'], options: [[1, '1 · 直道起步', '1 · First drive'], [2, '2 · S 弯与锥桶', '2 · S bends and cones'], [3, '3 · 窄桥与跳台', '3 · Bridge and jump']]},
      {name: 'steer', label: ['谁负责方向', 'Who steers'], options: [[0, '房主', 'The host'], [1, '另一位', 'The other player']]},
      {name: 'easy', label: ['宽松模式', 'Easy mode'], options: [[0, '关', 'Off'], [1, '开：路面更宽', 'On: wider road']]}
    ],
    rules: () => [
      ['方向手按住 ◀ ▶（或键盘 ← → / A D）转向；油门手按住油门、刹车（↑ ↓ / W S），每关有 2 次氮气（空格）。车会慢慢转向、慢慢加速，提前操作。', 'The steering player holds ◀ ▶ (or ← → / A D); the pedal player holds gas and brake (↑ ↓ / W S) and has two boosts per level (Space). The car turns and speeds up gradually — act early.'],
      ['撞到锥桶扣一颗心（共 3 颗），之后 1.5 秒内不再扣。开出赛道太远、从桥上掉下或没冲过缺口：回到上一个检查点，扣 3 秒。', 'A cone costs a heart (three in all), then 1.5 seconds of grace. Going far off the road, off the bridge or into the gap puts you back at the last checkpoint and costs three seconds.'],
      ['窄桥上要慢（超速半秒就会滑下去），跳台前要快。油门手会看到前方提示和小地图，方向手会看到锥桶和急弯提示——多说话！', 'Slow on the narrow bridge (half a second too fast and you slide off), fast before the jump. The pedal player sees hints and a minimap, the steering player sees cones and bends — talk!'],
      ['到终点即过关：1 星；在标准时间内再加 1 星；一颗心都没丢再加 1 星。时间用完或心用完为失败。', 'Reach the finish: one star; within par time: another; no heart lost: a third. Running out of time or hearts fails the run.'],
      ['快捷呼叫会在对方屏幕上弹出并响一声。有人掉线 3 秒后暂停，回来后倒数 3 秒继续。', 'Quick calls pop up on the other screen with a beep. If someone drops out the game pauses after three seconds and restarts with a countdown.']
    ]
  });
})();
