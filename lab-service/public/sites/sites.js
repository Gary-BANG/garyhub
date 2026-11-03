/* Elsewhere page: a depth particle field, dock-style row magnification and site previews. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');

  // Language follows the shared GaryHub cookie, so a choice made on any subdomain carries over.
  const COOKIE = 'garyhub_language';
  const texts = [...document.querySelectorAll('[data-en]')].map(node => ({node, zh:node.textContent, en:node.dataset.en}));
  const titles = {zh:'外站链接 · Gary Hub', en:'Elsewhere · Gary Hub'};
  let lang = (document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '=')) || '').split('=')[1] === 'en' ? 'en' : 'zh';
  function applyLanguage() {
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    for (const item of texts) item.node.textContent = item[lang];
    document.title = titles[lang];
    $('lang').textContent = lang === 'en' ? '中文' : 'English';
  }
  $('lang').addEventListener('click', () => {
    lang = lang === 'en' ? 'zh' : 'en';
    const domain = /(^|\.)garyhub\.uk$/.test(location.hostname) ? '; Domain=.garyhub.uk' : '';
    document.cookie = COOKIE + '=' + lang + '; Path=/; Max-Age=31536000; SameSite=Lax' + domain + (location.protocol === 'https:' ? '; Secure' : '');
    applyLanguage();
  });
  applyLanguage();

  let pointer = null;

  // ---- Particle field ------------------------------------------------------
  const canvas = $('field'), ctx = canvas.getContext('2d');
  const tones = [[142,175,255],[127,224,212],[184,156,255],[255,214,160]];
  const sprites = tones.map(([r,g,b]) => {
    const s = document.createElement('canvas'); s.width = s.height = 64;
    const c = s.getContext('2d'), glow = c.createRadialGradient(32,32,0,32,32,32);
    glow.addColorStop(0, `rgba(${r},${g},${b},1)`); glow.addColorStop(.16, `rgba(${r},${g},${b},.6)`); glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
    c.fillStyle = glow; c.fillRect(0,0,64,64); return s;
  });
  const LINK = 128, REPEL = 150;
  let W = 0, H = 0, dots = [], waves = [], comet = null, nextComet = 0, fieldRaf = 0, fieldLast = 0;
  const pick = () => { const n = Math.random(); return n < .5 ? 0 : n < .78 ? 1 : n < .94 ? 2 : 3; };
  const spawn = () => { const z = .25 + Math.random() * .75; return {x:Math.random()*W, y:Math.random()*H, z, tone:pick(), vx:0, vy:0, phase:Math.random()*6.283, size:2.2 + z*4.2}; };
  function resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * ratio); canvas.height = Math.round(H * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = Math.round(Math.min(230, Math.max(70, W * H / 6500)));
    while (dots.length < count) dots.push(spawn());
    dots.length = count;
    for (const d of dots) { if (d.x > W) d.x = Math.random() * W; if (d.y > H) d.y = Math.random() * H; }
  }
  function step(dt, time) {
    const t = time / 1000;
    for (const d of dots) {
      // A slowly turning flow field; nearer (larger z) particles drift faster.
      const angle = Math.sin(d.x * .0017 + t * .13) * 1.7 + Math.cos(d.y * .0021 - t * .11) * 1.7 + d.phase * .15;
      const speed = 9 + d.z * 16;
      let ax = (Math.cos(angle) * speed - d.vx) * 1.4, ay = (Math.sin(angle) * speed - d.vy) * 1.4;
      if (pointer) {
        const dx = d.x - pointer.x, dy = d.y - pointer.y, dist = Math.hypot(dx, dy);
        if (dist < REPEL && dist > .1) {
          // Push outward and swirl a little, so the cursor parts the field instead of punching a hole.
          const f = (1 - dist / REPEL) ** 2 * 900 * d.z;
          ax += (dx / dist) * f - (dy / dist) * f * .45; ay += (dy / dist) * f + (dx / dist) * f * .45;
        }
      }
      for (const w of waves) {
        const dx = d.x - w.x, dy = d.y - w.y, dist = Math.hypot(dx, dy), band = Math.abs(dist - w.r);
        if (band < 50 && dist > .1) { const f = (1 - band / 50) * 1600 * w.power * d.z; ax += dx / dist * f; ay += dy / dist * f; }
      }
      d.vx += ax * dt; d.vy += ay * dt;
      d.x += d.vx * dt; d.y += d.vy * dt;
      const m = 40;
      if (d.x < -m) d.x = W + m; else if (d.x > W + m) d.x = -m;
      if (d.y < -m) d.y = H + m; else if (d.y > H + m) d.y = -m;
    }
    for (const w of waves) { w.r += 620 * dt; w.power *= Math.pow(.25, dt); }
    waves = waves.filter(w => w.power > .03 && w.r < Math.hypot(W, H));
    if (!comet && time > nextComet) {
      const fromLeft = Math.random() < .5;
      comet = {x: fromLeft ? -80 : W + 80, y: Math.random() * H * .45, vx: (fromLeft ? 1 : -1) * (520 + Math.random() * 260), vy: 150 + Math.random() * 120, life: 0};
    }
    if (comet) {
      comet.x += comet.vx * dt; comet.y += comet.vy * dt; comet.life += dt;
      if (comet.x < -200 || comet.x > W + 200 || comet.y > H + 200) { comet = null; nextComet = time + 6000 + Math.random() * 7000; }
    }
  }
  function draw(time) {
    ctx.clearRect(0, 0, W, H);
    // Parallax: deeper particles shift less as the pointer moves away from centre.
    const px = pointer ? (pointer.x - W / 2) / W : 0, py = pointer ? (pointer.y - H / 2) / H : 0;
    const pos = d => [d.x - px * 26 * d.z, d.y - py * 26 * d.z];
    // Lines between nearby particles of similar depth, bucketed through a grid.
    const grid = new Map(), key = (cx, cy) => cx * 4099 + cy;
    dots.forEach((d, i) => { const k = key(Math.floor(d.x / LINK), Math.floor(d.y / LINK)); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
    ctx.lineWidth = 1;
    for (let i = 0; i < dots.length; i++) {
      const a = dots[i], cx = Math.floor(a.x / LINK), cy = Math.floor(a.y / LINK), [ax, ay] = pos(a);
      for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
        for (const j of grid.get(key(gx, gy)) || []) {
          if (j <= i) continue;
          const b = dots[j];
          if (Math.abs(a.z - b.z) > .32) continue;
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist >= LINK) continue;
          const alpha = (1 - dist / LINK) ** 2 * .42 * Math.min(a.z, b.z);
          const [bx, by] = pos(b), [r, g, bl] = tones[a.tone];
          ctx.strokeStyle = `rgba(${r},${g},${bl},${alpha.toFixed(3)})`;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        }
      }
    }
    if (pointer) {
      for (const d of dots) {
        const dist = Math.hypot(d.x - pointer.x, d.y - pointer.y);
        if (dist > 190) continue;
        const [x, y] = pos(d);
        ctx.strokeStyle = `rgba(190,215,255,${((1 - dist / 190) * .5 * d.z).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(pointer.x, pointer.y); ctx.lineTo(x, y); ctx.stroke();
      }
    }
    for (const w of waves) {
      ctx.strokeStyle = `rgba(142,175,255,${(w.power * .35).toFixed(3)})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, 6.283); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    const t = time / 1000;
    for (const d of dots) {
      const [x, y] = pos(d), size = d.size * 3.2;
      ctx.globalAlpha = (.5 + .5 * Math.sin(t * 1.6 + d.phase * 3)) * .55 * d.z + .25;
      ctx.drawImage(sprites[d.tone], x - size / 2, y - size / 2, size, size);
    }
    if (comet) {
      const tail = ctx.createLinearGradient(comet.x, comet.y, comet.x - comet.vx * .28, comet.y - comet.vy * .28);
      tail.addColorStop(0, 'rgba(230,240,255,.85)'); tail.addColorStop(1, 'rgba(142,175,255,0)');
      ctx.globalAlpha = 1; ctx.strokeStyle = tail; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(comet.x, comet.y); ctx.lineTo(comet.x - comet.vx * .28, comet.y - comet.vy * .28); ctx.stroke();
      ctx.drawImage(sprites[0], comet.x - 14, comet.y - 14, 28, 28);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function fieldFrame(time) {
    fieldRaf = 0;
    const dt = fieldLast ? Math.min((time - fieldLast) / 1000, .05) : 1 / 60; fieldLast = time;
    step(dt, time); draw(time);
    if (!document.hidden && !motion.matches) fieldRaf = requestAnimationFrame(fieldFrame);
  }
  function startField() {
    cancelAnimationFrame(fieldRaf); fieldRaf = 0; fieldLast = 0;
    if (motion.matches) { draw(performance.now()); return; }  // One still frame for reduced motion.
    if (!document.hidden) fieldRaf = requestAnimationFrame(fieldFrame);
  }
  nextComet = performance.now() + 3500;
  resize(); startField();

  // ---- Dock-style rows and the preview card --------------------------------
  const list = $('sites'), preview = $('preview'), image = preview.querySelector('img'), hostLabel = preview.querySelector('.host');
  const rows = [...list.querySelectorAll('.site')].map(node => ({node, scale:1, v:0, center:0}));
  const card = {row:null, y:0, vy:0, target:0, placed:false};
  let focused = null, rowRaf = 0, rowLast = 0;
  const canPreview = () => finePointer.matches && innerWidth - list.getBoundingClientRect().right >= 360;
  function measure() {
    const box = list.getBoundingClientRect();
    // Transforms do not change offsetTop, so centres stay put while rows scale.
    for (const row of rows) row.center = box.top + row.node.parentElement.offsetTop + row.node.offsetTop + row.node.offsetHeight / 2;
    return box;
  }
  function rowFrame(time) {
    rowRaf = 0;
    const box = measure(), dt = rowLast ? Math.min((time - rowLast) / 1000, .032) : 1 / 60; rowLast = time;
    const inside = pointer && pointer.x > box.left - 48 && pointer.x < box.right + 48 && pointer.y > box.top - 120 && pointer.y < box.bottom + 120;
    let moving = false, best = null, bestAmount = 0;
    for (const row of rows) {
      let amount = 0;
      if (inside) amount = Math.max(0, 1 - Math.abs(row.center - pointer.y) / 190) ** 2;
      else if (focused === row) amount = 1;
      if (amount > bestAmount) { best = row; bestAmount = amount; }
      // Same spring as the Tools dock: the row under the pointer grows most, its neighbours a little.
      // Reduced motion keeps the highlight but skips the growth.
      const to = motion.matches ? 1 : 1 + amount * .07;
      row.v += ((to - row.scale) * 380 - row.v * 35) * dt;
      row.scale += row.v * dt;
      if (Math.abs(to - row.scale) < .0005 && Math.abs(row.v) < .01) { row.scale = to; row.v = 0; } else moving = true;
      const a = motion.matches ? (amount > .55 ? 1 : 0) : Math.max(0, (row.scale - 1) / .07);
      row.node.style.transform = row.scale === 1 ? '' : `scale(${row.scale.toFixed(4)})`;
      row.node.style.setProperty('--a', a.toFixed(3));
      row.node.classList.toggle('near', a > .5);
    }
    // The card shows the row under the pointer (or focused) and glides beside the list.
    const target = bestAmount > .55 && canPreview() ? best : null;
    if (target !== card.row) {
      card.row = target;
      if (target) { image.src = target.node.dataset.thumb; hostLabel.textContent = new URL(target.node.href).host + new URL(target.node.href).pathname.replace(/\/$/, ''); }
      preview.classList.toggle('on', !!target);
    }
    if (card.row) {
      const height = preview.offsetHeight || 240;
      card.target = Math.min(Math.max(16, card.row.center - height / 2), innerHeight - height - 16);
      if (!card.placed || motion.matches) { card.y = card.target; card.vy = 0; card.placed = true; }
      card.vy += ((card.target - card.y) * 260 - card.vy * 28) * dt; card.y += card.vy * dt;
      if (Math.abs(card.target - card.y) > .3 || Math.abs(card.vy) > .3) moving = true;
      const tilt = Math.max(-4, Math.min(4, card.vy * .01));
      preview.style.transform = `translate3d(${(box.right + 32).toFixed(1)}px,${card.y.toFixed(1)}px,0) rotate(${tilt.toFixed(2)}deg)`;
    } else card.placed = false;
    if (moving) rowRaf = requestAnimationFrame(rowFrame); else rowLast = 0;
  }
  const animateRows = () => { if (!rowRaf) rowRaf = requestAnimationFrame(rowFrame); };
  for (const row of rows) {
    row.node.addEventListener('focus', () => { focused = row; animateRows(); });
    row.node.addEventListener('blur', () => { if (focused === row) focused = null; animateRows(); });
  }

  // ---- Shared input --------------------------------------------------------
  addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return;
    pointer = {x:event.clientX, y:event.clientY}; animateRows();
  }, {passive:true});
  document.documentElement.addEventListener('pointerleave', () => { pointer = null; animateRows(); });
  addEventListener('pointerdown', event => {
    if (motion.matches || event.target.closest('a,button')) return;
    waves.push({x:event.clientX, y:event.clientY, r:0, power:1});
  }, {passive:true});
  addEventListener('resize', () => { resize(); if (motion.matches) startField(); animateRows(); });
  addEventListener('scroll', animateRows, {passive:true});
  document.addEventListener('visibilitychange', startField);
  motion.addEventListener('change', () => { startField(); for (const row of rows) { row.scale = 1; row.v = 0; row.node.style.transform = ''; row.node.style.setProperty('--a', '0'); } });
  // Warm the preview images once the page is idle, so the first hover is instant.
  addEventListener('load', () => setTimeout(() => { if (finePointer.matches) for (const row of rows) new Image().src = row.node.dataset.thumb; }, 600));
})();
