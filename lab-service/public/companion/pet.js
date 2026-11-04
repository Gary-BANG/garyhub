/* Companion pet: draws one character and handles dragging, free placement, gravity,
   the parachute and landing. 'rig' characters animate layers of a single SVG; 'frames'
   characters swap whole pose images and move the body. A frame loop runs only while
   something moves; idle motion is throttled and stops after a quiet spell. If the artwork
   fails, the plain chat launcher is used. destroy() releases everything, so the page can
   switch characters while keeping one chat panel. */
(() => {
  'use strict';
  if (window.GaryHubCompanionPet) return;
  const rigs = window.GaryHubCompanionCharacters, chatApi = window.GaryHubCompanionChat, voices = window.GaryHubCompanionVoices;
  if (!rigs || !chatApi || !voices) return;
  const base = new URL('.', document.currentScript?.src || location.href).href;
  const asset = file => base + file + (window.GaryHubCompanionAssetVersion ? '?v=' + encodeURIComponent(window.GaryHubCompanionAssetVersion) : '');
  const KEY = {position:'garyhub.companion.position', mode:'garyhub.companion.mode'};
  const GRAVITY = 2600, CHUTE_FROM = 180, CHUTE_SPEED = 170, EDGE = 4, IDLE_FOR = 30000, FADE_MS = 160;
  const text = {
    zh:{label:name => `${name}：按 Enter 聊天，方向键移动，Home 回到默认位置`},
    en:{label:name => `${name}: press Enter to chat, arrow keys to move, Home to reset`}
  };
  const store = {
    get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
  };
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'), compact = matchMedia('(max-width: 600px)');
  const unsafe = doc => doc.querySelector('parsererror, script, foreignObject, image, iframe') ||
    [...doc.querySelectorAll('*')].some(node => [...node.attributes].some(attr => /^on/i.test(attr.name) || /href$/i.test(attr.name) && !attr.value.startsWith('#')));
  // Which whole-pose image a 'frames' character shows in each state.
  const FRAME_FOR = {drag:'held', fall:'fall', chute:'parachute', land:'land', recover:'land'};
  const GESTURE_FRAME = {wave:'wave', tilt:'curious', shake:'decline'};
  // Characters with landing poses step through touchdown → squash → rise by phase progress;
  // the others hold 'land'.
  const LANDING_FRAME = {land:p => p < .5 ? 'touchdown' : 'squash', recover:p => p < .4 ? 'squash' : 'rise'};

  // Harness and parachute for 'rig' characters, drawn in the rig's units around the ring. They sit
  // behind the actor, so the straps only show above the head and the canopy lines meet at the ring.
  function propsMarkup(spec) {
    const [rx, ry] = spec.ring, {strap, canopy, line} = spec.props;
    const L = rx - 540, R = rx + 540, B = ry - 380, T = ry - 910, xs = [R, rx + 270, rx, rx - 270, L];
    const scallops = xs.slice(1).map((next, i) => `Q${(xs[i] + next) / 2} ${B - 60} ${next} ${B}`).join('');
    const seam = (bottom, bend) => `<path d="M${rx} ${T}C${rx + bend} ${T + 120} ${bottom} ${B - 300} ${bottom} ${B}" fill="none" stroke="${line}" stroke-width="10"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="gh-chute-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${canopy[0]}"/><stop offset="1" stop-color="${canopy[1]}"/></linearGradient></defs>
      <g class="chute" display="none">
        ${xs.map(x => `<line x1="${x}" y1="${B}" x2="${rx}" y2="${ry}" stroke="${line}" stroke-width="7"/>`).join('')}
        <path d="M${L} ${B}C${L} ${B - 330} ${rx - 300} ${T} ${rx} ${T}C${rx + 300} ${T} ${R} ${B - 330} ${R} ${B}${scallops}Z" fill="url(#gh-chute-fill)" stroke="${line}" stroke-width="14" stroke-linejoin="round"/>
        ${seam(rx - 270, -170)}${seam(rx, 0)}${seam(rx + 270, 170)}
        <path d="M${rx - 380} ${B - 250}C${rx - 340} ${T + 160} ${rx - 200} ${T + 70} ${rx - 90} ${T + 50}" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="18" stroke-linecap="round"/>
      </g>
      <g class="harness" display="none">
        <path d="M${rx - 18} ${ry + 20}L${rx - 150} ${ry + 360}M${rx + 18} ${ry + 20}L${rx + 150} ${ry + 360}" stroke="${line}" stroke-width="40" stroke-linecap="round"/>
        <path d="M${rx - 18} ${ry + 20}L${rx - 150} ${ry + 360}M${rx + 18} ${ry + 20}L${rx + 150} ${ry + 360}" stroke="${strap}" stroke-width="22" stroke-linecap="round"/>
        <circle cx="${rx}" cy="${ry}" r="30" fill="none" stroke="${line}" stroke-width="14"/>
      </g></svg>`;
  }

  async function loadRig(spec) {
    const response = await fetch(asset(spec.rig), {credentials:'same-origin'});
    if (!response.ok) throw new Error('rig unavailable');
    const doc = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
    if (doc.documentElement.localName !== 'svg' || unsafe(doc)) throw new Error('rig rejected');
    return doc.documentElement;
  }

  // presence: on = full pet, min = small and still in the corner, off = hidden.
  // When onModeChange is given, the caller stores the mode instead of this page's localStorage.
  // Pass an existing chat (from GaryHubCompanionChat.mount) to keep one conversation across characters.
  function mount({character = rigs.fallback, target = document.body, mode: initialMode, presence: initialPresence = 'on', onModeChange, chat: sharedChat} = {}) {
    const id = rigs.characters[character]?.available ? character : rigs.fallback, spec = rigs.characters[id];
    const frames = spec.kind === 'frames';
    // Phase lengths in ms. A 'frames' pose cannot shake its head, so it holds the landing pose for less time.
    const phase = {land:240, recover:frames ? 460 : 820, settle:300};
    const life = new AbortController(), on = (source, type, handler, options = {}) => source.addEventListener(type, handler, {...options, signal:life.signal});
    const host = document.createElement('div');
    host.id = 'gh-companion-pet'; host.setAttribute('data-i18n-ignore', ''); host.hidden = true; host.dataset.character = id;
    const root = host.attachShadow({mode:'open'});
    root.innerHTML = `<link rel="stylesheet" href="${asset('pet.css')}"><div class="art"></div><button class="hit" type="button" aria-haspopup="dialog" aria-expanded="false"></button>`;
    const art = root.querySelector('.art'), hit = root.querySelector('.hit');
    let lang = window.GaryHubI18n?.language === 'en' ? 'en' : 'zh';
    let mode = (initialMode ?? store.get(KEY.mode)) === 'gravity' ? 'gravity' : 'free';
    let presence = ['on', 'min', 'off'].includes(initialPresence) ? initialPresence : 'on';
    let size = 0, k = 1, width = 0, height = 0;
    let x = 0, y = 0, vx = 0, vy = 0, angle = 0, spin = 0, look = 0, chute = 0, chuteTarget = 0;
    let state = 'idle', phaseStart = 0, willChute = false, fallFrom = 0;
    let drag = null, pointer = null, gesture = null, twitch = null;
    let eyes = 'open', mouth = 'smile', parts = {}, pose = null, chuteNode = null, harness = null;
    let images = {}, shown = null, fadeNext = false, fading = null;
    let raf = 0, last = 0, lastRender = 0, lastActive = performance.now(), blinkTimer = 0;
    const handlers = {
      onClose:() => { hit.setAttribute('aria-expanded', 'false'); hit.focus({preventScroll:true}); },
      onReply:result => react(result.kind)
    };
    const chat = sharedChat || chatApi.mount({character:id, target, launcher:false});
    chat.setHandlers(handlers); chat.setCharacter(id);

    // Character units → CSS pixels inside the pet box.
    const px = value => (value - spec.viewBox[0]) * k, py = value => (value - spec.viewBox[1]) * k;
    const ground = () => height - (compact.matches ? 8 : 12);
    const range = () => ({minX:EDGE - px(spec.bounds[0]), maxX:width - EDGE - px(spec.bounds[2]), minY:EDGE - py(spec.bounds[1]), maxY:ground() - py(spec.feet[1])});
    const rect = () => ({left:x + px(spec.bounds[0]), top:y + py(spec.bounds[1]), right:x + px(spec.bounds[2]), bottom:y + py(spec.bounds[3])});
    const now = () => performance.now();

    function measure() {
      size = presence === 'min' ? 56 : compact.matches ? 76 : 120; k = size / spec.viewBox[2];
      width = document.documentElement.clientWidth || innerWidth; height = innerHeight;
      host.style.setProperty('--size', size + 'px');
      const [x0, y0, x1, y1] = spec.bounds;
      Object.assign(hit.style, {left:px(x0) + 'px', top:py(y0) + 'px', width:(x1 - x0) * k + 'px', height:(y1 - y0) * k + 'px'});
      for (const {img, rect: [fx, fy, fw, fh]} of Object.values(images)) Object.assign(img.style, {left:px(fx) + 'px', top:py(fy) + 'px', width:fw * k + 'px', height:fh * k + 'px'});
    }
    function place(saved = store.get(KEY.position)) {
      const r = range();
      if (presence === 'min') { x = r.maxX - 8; y = r.maxY; return; }
      const rx = Number.isFinite(saved?.rx) ? clamp(saved.rx, 0, 1) : 1, ry = Number.isFinite(saved?.ry) ? clamp(saved.ry, 0, 1) : 1;
      x = r.minX + (r.maxX - r.minX) * rx - (saved ? 0 : 12); y = r.minY + (r.maxY - r.minY) * ry;
      keepInside();
    }
    function keepInside() { const r = range(); x = clamp(x, r.minX, r.maxX); y = clamp(y, r.minY, r.maxY); }
    function remember() {
      if (presence !== 'on') return;
      const r = range();
      store.set(KEY.position, {rx:r.maxX > r.minX ? (x - r.minX) / (r.maxX - r.minX) : 1, ry:r.maxY > r.minY ? (y - r.minY) / (r.maxY - r.minY) : 1});
    }

    // Expressions exist only on 'rig' characters; 'frames' poses carry their own faces.
    function setEyes(value) {
      eyes = value;
      for (const [name, part] of Object.entries(spec.eyes || {})) parts[part]?.setAttribute('display', name === value ? 'inline' : 'none');
    }
    function setMouth(value) {
      mouth = value;
      for (const [name, part] of Object.entries(spec.mouth || {})) parts[part]?.setAttribute('display', name === value ? 'inline' : 'none');
    }
    function blink() {
      clearTimeout(blinkTimer);
      if (frames) return;
      if (!document.hidden && !reduced.matches && state === 'idle' && eyes === 'open') {
        setEyes('closed'); setTimeout(() => { if (eyes === 'closed' && state === 'idle') setEyes('open'); }, 130);
      }
      blinkTimer = setTimeout(blink, 2500 + Math.random() * 3500);
    }

    function enter(next) {
      // Standing back up dissolves into idle instead of cutting (poses inside the landing always do).
      if (frames && next === 'idle' && state === 'recover') fadeNext = true;
      state = next; phaseStart = now(); host.dataset.state = next;
      if (next === 'drag') { setMouth('o'); setEyes('open'); chuteTarget = 0; gesture = null; }
      if (next === 'fall') setMouth('o');
      if (next === 'chute') { setMouth('smile'); chuteTarget = 1; }
      if (next === 'land') { setEyes('closed'); chuteTarget = 0; }
      if (next === 'recover') { setEyes('happy'); setMouth('smile'); }
      if (next === 'idle') { setEyes('open'); setMouth('smile'); vx = vy = 0; remember(); if (chatOpen()) chat.place(rect()); }
      wake();
    }
    const chatOpen = () => hit.getAttribute('aria-expanded') === 'true';
    function release() {
      if (mode === 'free') return enter('settle');
      const r = range();
      if (reduced.matches) { y = r.maxY; return enter('settle'); }
      fallFrom = y; willChute = r.maxY - y > CHUTE_FROM;
      vx = clamp(vx, -500, 500); vy = clamp(vy, -300, 600);
      enter('fall');
    }
    function react(kind) {
      if (state !== 'idle') return;
      const type = {recommend:'wave', more:'wave', category:'wave', howto:'wave', greet:'wave', thanks:'wave', bye:'wave', self:'wave', abilities:'wave', clarify:'tilt', none:'shake', moreNone:'shake'}[kind];
      if (!type) return;
      gesture = {type, start:now(), duration:type === 'wave' ? 1000 : 900};
      if (type === 'wave') setEyes('happy');
      wake();
    }

    function step(dt, t) {
      const r = range();
      chute += (chuteTarget - chute) * Math.min(1, dt * (chuteTarget ? 9 : 12));
      let busy = Math.abs(chuteTarget - chute) > .01;
      if (state === 'drag') {
        const ring = [px(spec.ring[0]), py(spec.ring[1])], decay = Math.exp(-dt * 14);
        drag.ox *= decay; drag.oy *= decay;
        const nx = clamp(drag.x - drag.ox - ring[0], r.minX, r.maxX), ny = clamp(drag.y - drag.oy - ring[1], r.minY, r.maxY);
        const nvx = (nx - x) / dt, nvy = (ny - y) / dt, ax = clamp((nvx - vx) / dt, -9000, 9000);
        vx += (nvx - vx) * .5; vy += (nvy - vy) * .5; x = nx; y = ny;
        if (!reduced.matches) {
          const lengthPx = (spec.feet[1] - spec.ring[1]) * k * .55;
          spin += (-(GRAVITY * .8 / lengthPx) * Math.sin(angle) - 4.5 * spin + ax * .35 / lengthPx * Math.cos(angle)) * dt;
          angle = clamp(angle + spin * dt, -.7, .7);
        }
        return true;
      }
      if (state === 'fall' || state === 'chute') {
        if (state === 'fall') {
          vy += GRAVITY * dt;
          if (willChute && y - fallFrom > 40 && vy > 0) enter('chute');
        } else vy += (CHUTE_SPEED - vy) * Math.min(1, dt * 5);
        vx *= Math.exp(-dt * (state === 'chute' ? 3 : 1.5));
        x += vx * dt; y += vy * dt;
        if (x < r.minX || x > r.maxX) { x = clamp(x, r.minX, r.maxX); vx = -vx * .4; }
        const sway = state === 'chute' && !reduced.matches ? Math.sin(t / 1000 * 2.4) * .12 : clamp(-vx * .0006, -.25, .25);
        spin += ((sway - angle) * 40 - spin * 9) * dt; angle += spin * dt;
        if (y >= r.maxY) { y = r.maxY; enter(reduced.matches ? 'idle' : 'land'); }
        return true;
      }
      const elapsed = t - phaseStart;
      if (state === 'land' && elapsed > phase.land) enter('recover');
      else if (state === 'recover' && elapsed > phase.recover) enter('idle');
      else if (state === 'settle' && elapsed > phase.settle) enter('idle');
      if (state !== 'idle') busy = true;
      // Swing settles back to upright.
      spin += (-angle * 60 - spin * 10) * dt; angle += spin * dt;
      if (Math.abs(angle) > .002 || Math.abs(spin) > .01) busy = true; else angle = spin = 0;
      return busy || !!gesture;
    }

    // Gesture progress 0..1, or null once it has finished.
    function gestureProgress(t) {
      if (!gesture) return null;
      const p = (t - gesture.start) / gesture.duration;
      if (p < 1) return p;
      gesture = null; if (state === 'idle') setEyes('open');
      return null;
    }
    function partAngles(t, dt) {
      const seconds = t / 1000, a = {head:0, 'ear-l':0, 'ear-r':0, tail:0, 'paw-r':0};
      if (!reduced.matches) {
        a.tail = state === 'drag' ? 6 * Math.sin(seconds * 9) : state === 'chute' ? 5 * Math.sin(seconds * 3) : state === 'recover' ? 6 * Math.sin(seconds * 15) : 4 * Math.sin(seconds * 2 * Math.PI / 3.2);
        let target = 0;
        if (pointer && state === 'idle') {
          const headX = x + px(spec.pivots.head[0]), headY = y + py(spec.pivots.head[1]);
          if (Math.hypot(pointer.x - headX, pointer.y - headY) < 420) target = clamp((pointer.x - headX) / 140, -1, 1) * 3;
        }
        look += (target - look) * Math.min(1, dt * 6); a.head = look;
        if (state === 'recover') { const p = (t - phaseStart) / phase.recover; a.head = 4 * Math.sin(p * Math.PI * 4) * (1 - p); }
        if (twitch && t < twitch.until) a[twitch.ear] = Math.sin((twitch.until - t) / 25);
        else if (state === 'idle' && Math.random() < dt * .08) twitch = {ear:Math.random() < .5 ? 'ear-l' : 'ear-r', until:t + 160};
      }
      const p = gestureProgress(t);
      if (p !== null && !reduced.matches) {
        if (gesture.type === 'wave') a['paw-r'] = 7 * Math.sin(p * Math.PI * 6);
        if (gesture.type === 'tilt') a.head = 4 * Math.min(1, p * 4, (1 - p) * 4);
        if (gesture.type === 'shake') a.head = 4 * Math.sin(p * Math.PI * 4) * (1 - p);
      }
      for (const part of Object.keys(a)) a[part] = clamp(a[part], -spec.limits[part], spec.limits[part]);
      return a;
    }
    // 'frames' characters show reactions with a pose image when they have one, else a body tilt.
    // The outgoing pose fades on top, so the canopy and harness melt away rather than vanish.
    // The frame loop drives the fade, so it never sticks when the page is not being painted.
    function showFrame(name, t) {
      const pick = images[name]?.ready ? name : 'idle';
      if (pick !== shown) {
        const old = images[shown]?.img, fade = (fadeNext || state === 'land' || state === 'recover') && old && !reduced.matches;
        fadeNext = false;
        if (fading) { fading.img.style.opacity = fading.img.style.zIndex = ''; fading = null; }
        for (const [frame, {img}] of Object.entries(images)) img.hidden = frame !== pick && !(fade && img === old);
        if (fade) { old.style.zIndex = 1; fading = {img:old, start:t}; }
        shown = pick;
      }
      if (!fading) return;
      const p = (t - fading.start) / FADE_MS;
      if (p < 1) { fading.img.style.opacity = (1 - p * (2 - p)).toFixed(3); return; }
      fading.img.hidden = true; fading.img.style.opacity = fading.img.style.zIndex = ''; fading = null;
    }

    function render(t, dt) {
      host.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      const [rx, ry] = spec.ring, [fx, fy] = spec.feet, calm = reduced.matches;
      let sx = 1, sy = 1, lift = 0, turn = 0;
      const p = (t - phaseStart) / (phase[state] || 1), wave = Math.sin(Math.PI * clamp(p, 0, 1));
      if (!calm) {
        if (state === 'settle') { sx = 1 + .05 * wave; sy = 1 - .07 * wave; }
        // A landing pose image is already crouched, so it gets only a light squash and no hop.
        if (state === 'land') { const s = frames ? .3 : 1; sx = 1 + .16 * s * wave; sy = 1 - .2 * s * wave; }
        if (state === 'recover' && !frames) lift = -10 / k * Math.sin(Math.PI * clamp((p - .1) / .35, 0, 1));
        if (state === 'fall') { sx = .96; sy = 1.05; }
        if (state === 'idle') sy = 1 + .006 * Math.sin(t / 1000 * 2 * Math.PI / 3.6);
      }
      if (frames) {
        const g = gestureProgress(t), framed = g !== null && images[GESTURE_FRAME[gesture.type]]?.ready;
        if (g !== null && !framed && !calm) {
          if (gesture.type === 'tilt') turn = 4 * Math.min(1, g * 4, (1 - g) * 4);
          if (gesture.type === 'shake') turn = 3 * Math.sin(g * Math.PI * 4) * (1 - g);
          if (gesture.type === 'wave') lift = -8 / k * Math.abs(Math.sin(g * Math.PI * 2));
        }
        const landing = LANDING_FRAME[state]?.(p);
        showFrame(images[landing]?.ready ? landing : FRAME_FOR[state] || (framed ? GESTURE_FRAME[gesture.type] : 'idle'), t);
        const [rpx, rpy, fpx, fpy] = [px(rx), py(ry), px(fx), py(fy)];
        const degrees = angle * 180 / Math.PI;
        pose.style.transform = `translate(${rpx.toFixed(1)}px,${rpy.toFixed(1)}px) rotate(${degrees.toFixed(2)}deg) translate(${(-rpx).toFixed(1)}px,${(-rpy).toFixed(1)}px) translate(0px,${(lift * k).toFixed(1)}px) translate(${fpx.toFixed(1)}px,${fpy.toFixed(1)}px) rotate(${turn.toFixed(2)}deg) scale(${sx.toFixed(3)},${sy.toFixed(3)}) translate(${(-fpx).toFixed(1)}px,${(-fpy).toFixed(1)}px)`;
        return;
      }
      pose.setAttribute('transform', `rotate(${(angle * 180 / Math.PI).toFixed(2)} ${rx} ${ry}) translate(0 ${lift.toFixed(1)}) translate(${fx} ${fy}) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(${-fx} ${-fy})`);
      harness.setAttribute('display', ['drag', 'fall', 'chute'].includes(state) || state === 'land' && chute > .1 ? 'inline' : 'none');
      chuteNode.setAttribute('display', chute > .02 ? 'inline' : 'none');
      chuteNode.setAttribute('transform', `translate(${rx} ${ry}) scale(${chute.toFixed(3)} ${(chuteTarget ? chute : chute * chute).toFixed(3)}) translate(${-rx} ${-ry})`);
      for (const [part, degrees] of Object.entries(partAngles(t, dt))) {
        const [cx, cy] = spec.pivots[part];
        parts[part]?.setAttribute('transform', degrees ? `rotate(${degrees.toFixed(2)} ${cx} ${cy})` : '');
      }
    }

    function frame(t) {
      raf = 0;
      if (document.hidden) { last = 0; return; }
      const dt = last ? Math.min(.033, (t - last) / 1000) : 1 / 60; last = t;
      const busy = step(dt, t) || !!fading, awake = presence === 'on' && !reduced.matches && t - lastActive < IDLE_FOR;
      if (busy || t - lastRender >= 40) { render(t, dt); lastRender = t; }
      if (busy || awake) schedule(); else last = 0;
    }
    const schedule = () => { if (!raf && !document.hidden && pose && !life.signal.aborted) raf = requestAnimationFrame(frame); };
    const wake = () => { lastActive = now(); schedule(); };

    function toggleChat() {
      if (chatOpen()) { chat.close(); return; }
      hit.setAttribute('aria-expanded', 'true'); chat.open(); chat.place(rect());
    }
    on(hit, 'pointerdown', event => {
      if (event.button !== 0 || drag) return;
      event.preventDefault(); hit.setPointerCapture(event.pointerId);
      const ringX = x + px(spec.ring[0]), ringY = y + py(spec.ring[1]);
      drag = {id:event.pointerId, startX:event.clientX, startY:event.clientY, x:event.clientX, y:event.clientY, ox:event.clientX - ringX, oy:event.clientY - ringY, moved:false};
      wake();
    });
    on(hit, 'pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      drag.x = event.clientX; drag.y = event.clientY;
      // The small parked pet is a button only; expanding it brings dragging back.
      if (presence !== 'on') return;
      if (!drag.moved && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 5) { drag.moved = true; vx = vy = 0; enter('drag'); }
    });
    const finishDrag = (event, cancelled) => {
      if (!drag || event.pointerId !== drag.id) return;
      const moved = drag.moved; drag = null;
      if (hit.hasPointerCapture(event.pointerId)) hit.releasePointerCapture(event.pointerId);
      if (moved) release(); else if (!cancelled) toggleChat();
    };
    on(hit, 'pointerup', event => finishDrag(event, false));
    on(hit, 'pointercancel', event => finishDrag(event, true));
    // Keyboard and assistive technology activate the button with a detail-0 click.
    on(hit, 'click', event => { if (event.detail === 0) toggleChat(); });
    on(hit, 'keydown', event => {
      const step = event.shiftKey ? 64 : 16, moves = {ArrowLeft:[-step, 0], ArrowRight:[step, 0], ArrowUp:[0, -step], ArrowDown:[0, step]};
      if (presence !== 'on') return;
      if (moves[event.key]) { event.preventDefault(); x += moves[event.key][0]; y += moves[event.key][1]; keepInside(); enter('settle'); }
      else if (event.key === 'Home') { event.preventDefault(); reset(); }
    });
    on(document, 'pointermove', event => {
      pointer = {x:event.clientX, y:event.clientY};
      if (!raf && state === 'idle' && presence === 'on') { const r = rect(); if (Math.hypot(pointer.x - (r.left + r.right) / 2, pointer.y - (r.top + r.bottom) / 2) < 420) wake(); }
    }, {passive:true});
    on(document, 'visibilitychange', () => { if (!document.hidden) wake(); });
    on(document, 'garyhub:language', event => { lang = event.detail?.language === 'en' ? 'en' : 'zh'; label(); });
    let resizeFrame = 0;
    const resized = () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => { const saved = store.get(KEY.position); measure(); if (state === 'idle') place(saved); else keepInside(); if (pose) render(now(), 0); if (chatOpen()) chat.place(rect()); }); };
    on(window, 'resize', resized, {passive:true});
    on(compact, 'change', resized);
    on(reduced, 'change', () => { angle = spin = 0; wake(); });
    const label = () => { const name = voices.get(id).name[lang]; hit.setAttribute('aria-label', text[lang].label(name)); hit.title = name; };

    function reset() { store.set(KEY.position, null); place(null); enter('settle'); }
    function setMode(value) {
      mode = value === 'gravity' ? 'gravity' : 'free';
      if (onModeChange) onModeChange(mode); else store.set(KEY.mode, mode);
    }
    function setPresence(value) {
      if (!['on', 'min', 'off'].includes(value) || value === presence) return;
      presence = value;
      if (value === 'off' && chatOpen()) chat.close();
      drag = null; chute = chuteTarget = 0; angle = spin = vx = vy = 0; gesture = null;
      state = 'idle'; host.dataset.state = 'idle'; setEyes('open'); setMouth('smile');
      host.hidden = value === 'off' || !pose;
      measure(); place();
      if (pose) render(now(), 0);
      if (chatOpen()) chat.place(rect());
      wake();
    }

    async function loadArt() {
      if (!frames) {
        const svg = await loadRig(spec);
        svg.removeAttribute('width'); svg.removeAttribute('height');
        art.append(svg);
        for (const part of [...Object.keys(spec.pivots), ...Object.values(spec.eyes), ...Object.values(spec.mouth)]) parts[part] = svg.querySelector('#' + CSS.escape(part));
        const props = new DOMParser().parseFromString(propsMarkup(spec), 'image/svg+xml').documentElement;
        svg.querySelector('defs').append(...props.querySelector('defs').children);
        pose = document.createElementNS('http://www.w3.org/2000/svg', 'g'); pose.setAttribute('class', 'pose');
        const actor = svg.querySelector('#actor');
        actor.before(pose);
        chuteNode = props.querySelector('.chute'); harness = props.querySelector('.harness');
        pose.append(chuteNode, harness, actor);
        return;
      }
      // Whole-pose images: the idle pose must load before the pet appears; the rest follow quietly.
      const box = document.createElement('div'); box.className = 'pose';
      const add = name => {
        const [file, fx, fy, fw, fh, mirrored] = spec.frames[name], img = new Image();
        img.alt = ''; img.decoding = 'async'; img.draggable = false; img.hidden = true; img.src = asset(file);
        if (mirrored) img.style.transform = 'scaleX(-1)';
        images[name] = {img, rect:[fx, fy, fw, fh], ready:false}; box.append(img);
        // The load event, unlike decode(), also settles while the window is not being painted.
        return new Promise((resolve, reject) => {
          img.onload = () => { images[name].ready = true; resolve(); };
          img.onerror = reject;
        });
      };
      await add('idle');
      art.append(box); pose = box;
      for (const name of Object.keys(spec.frames)) if (name !== 'idle') add(name).catch(() => {});
    }

    target.append(host);
    measure(); label();
    // Resolves true once the pet is drawn, false when its artwork could not be used.
    const ready = loadArt().then(() => {
      if (life.signal.aborted) return false;
      setEyes('open'); setMouth('smile');
      measure(); place(); host.hidden = presence === 'off'; render(now(), 0); blink(); wake();
      return true;
    }).catch(() => {
      if (life.signal.aborted) return false;
      // Without the artwork the chat still works through its own launcher.
      host.remove(); chat.showLauncher();
      return false;
    });

    function destroy() {
      life.abort(); cancelAnimationFrame(raf); raf = 0; clearTimeout(blinkTimer); host.remove();
    }
    return {
      element:host, chat, ready, id,
      get mode() { return mode; }, get state() { return state; }, get presence() { return presence; },
      setMode, setPresence, reset, react, destroy,
      // After a character switch this pet takes over the shared panel, which may already be open.
      adoptChat() {
        chat.setHandlers(handlers); chat.setCharacter(id);
        if (chat.isOpen) { hit.setAttribute('aria-expanded', 'true'); chat.place(rect()); }
      },
      // Lets the demo and a future "play" button start a fall from where the pet stands.
      fall() { if (state === 'idle' && pose && presence === 'on') { vx = 0; vy = 0; release(); } },
      lift(height) { if (state !== 'idle' || !pose || presence !== 'on') return; y = Math.max(range().minY, y - height); render(now(), 0); vx = vy = 0; release(); }
    };
  }
  window.GaryHubCompanionPet = {mount};
})();
