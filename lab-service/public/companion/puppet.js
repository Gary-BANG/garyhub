/* Articulated motion for rig characters whose spec has a `puppet` section (currently Pudding).
   pet.js keeps the body's position, swing, squash and states; this adds what makes the character
   feel alive: spring-driven ears, tail and legs that lag behind the body, breathing, looking at the
   pointer, a raised paw for waves, idle actions, petting by stroking the head, and lying down to sleep
   when left alone. Quiet pages keep only breathing, blinking, springs and petting.
   Angles are degrees, clockwise as in SVG; lengths are rig units unless named px. */
((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GaryHubCompanionPuppet = api;
})(typeof window === 'object' ? window : this, () => {
  'use strict';
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const ease = p => { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); };
  const bump = p => Math.sin(Math.PI * clamp(p, 0, 1));
  // k = stiffness, c = damping; gx/gy turn the body's acceleration (px/s²) into lag; ga leans a joint
  // against the body's swing so hanging parts stay roughly vertical; max limits the angle.
  const SPRINGS = {
    'ear-l':{k:90, c:11, gx:.0018, gy:.0012, ga:-.25, max:8}, 'ear-r':{k:90, c:11, gx:.0018, gy:-.0012, ga:-.25, max:8},
    'ear-l-tip':{k:55, c:6, gx:.004, gy:.0025, ga:-.6, max:20}, 'ear-r-tip':{k:55, c:6, gx:.004, gy:-.0025, ga:-.6, max:20},
    tail:{k:70, c:8, gx:-.002, gy:0, ga:0, max:9}, 'tail-tip':{k:50, c:6, gx:-.004, gy:0, ga:0, max:16},
    'front-l':{k:80, c:10, gx:.0025, gy:0, ga:-.4, max:9}, 'front-r':{k:80, c:10, gx:.0025, gy:0, ga:-.4, max:9},
    'hind-l':{k:80, c:10, gx:.0025, gy:0, ga:-.4, max:9}, 'hind-r':{k:80, c:10, gx:.0025, gy:0, ga:-.4, max:9}
  };
  const LEGS = new Set(['front-l', 'front-r', 'hind-l', 'hind-r']);
  const ACTIONS = {yawn:1700, wag:1600, look:2000, paw:1300, pant:1800, flick:500};
  const PICKS = ['yawn', 'wag', 'look', 'paw', 'pant', 'flick', 'look', 'wag'];
  const SLEEP_AFTER = 60000, LIE_MS = 1100, WAKE_MS = 600;

  function create({spec, svg, quiet, reduced, kick, face}) {
    const cfg = spec.puppet, piv = cfg.pivots, [fx, fy] = spec.feet;
    const el = id => svg.querySelector('#' + CSS.escape(id));
    const parts = Object.fromEntries(['rig', 'rest', 'head', 'body', 'front-r', 'front-r-raised', ...Object.keys(SPRINGS)].map(id => [id, el(id)]));
    const spring = Object.fromEntries(Object.keys(SPRINGS).map(id => [id, {a:0, v:0}]));
    let breath = 0, look = 0, act = null, nextAct = 0, sleep = null, pet = null, stroke = null, raised = false;
    let prevVx = 0, prevVy = 0, prevState = 'idle', idleSince = performance.now(), sleepTimer = 0, timerSet = 0;
    const calm = () => quiet || reduced.matches;

    // Any attention restarts the countdown to sleep; a timer wakes the frame loop when it runs out.
    function rested(now) {
      idleSince = now;
      if (calm() || now - timerSet < 1000) return;
      clearTimeout(sleepTimer); timerSet = now; sleepTimer = setTimeout(kick, SLEEP_AFTER + 100);
    }
    function wakeUp(now) {
      if (sleep && sleep.phase !== 'waking') { sleep = {phase:'waking', start:now}; kick(); }
      rested(now);
    }
    rested(idleSince);

    // Petting: two direction changes while moving across the head, then it lasts while the strokes go on.
    function overHead(ux, uy) { const [cx, cy, r] = cfg.head; return Math.hypot(ux - cx, uy - cy) < r; }
    function strokeAt(ux, uy, now) {
      if (!overHead(ux, uy)) { stroke = null; return false; }
      if (!stroke || now - stroke.at > 1500) { stroke = {x:ux, dir:0, flips:0, at:now}; return !!pet; }
      if (Math.abs(ux - stroke.x) < 18) return !!pet;
      const dir = Math.sign(ux - stroke.x);
      if (stroke.dir && dir !== stroke.dir) { stroke.flips++; stroke.at = now; }
      stroke.dir = dir; stroke.x = ux;
      if (stroke.flips >= 2 || pet) pet = {until:now + 1200, side:dir};
      return !!pet;
    }

    const setT = (id, value) => parts[id]?.setAttribute('transform', value);
    const rot = (id, deg) => Math.abs(deg) > .01 ? `rotate(${deg.toFixed(2)} ${piv[id][0]} ${piv[id][1]})` : '';

    // ctx: state and elapsed ms from pet.js, body swing angle (rad), velocity (px/s), gesture {type, p} or null,
    // pointer in rig units or null, chatOpen, canAct (shown in full and the page is visible), now (ms).
    function apply(dt, ctx) {
      const now = ctx.now, idle = ctx.state === 'idle';
      if (!idle || ctx.gesture || ctx.chatOpen) rested(now);
      const ax = dt ? clamp((ctx.vx - prevVx) / dt, -6000, 6000) : 0, ay = dt ? clamp((ctx.vy - prevVy) / dt, -6000, 6000) : 0;
      // Touching down: the ears flop outward and the tail whips, harder after a faster fall.
      if (ctx.state === 'land' && prevState !== 'land' && !reduced.matches) {
        const hit = clamp(prevVy / 2, 120, 300);
        spring['ear-l-tip'].v += hit; spring['ear-r-tip'].v -= hit; spring['ear-l'].v += hit * .4; spring['ear-r'].v -= hit * .4;
        spring['tail-tip'].v -= hit * .5;
      }
      prevVx = ctx.vx; prevVy = ctx.vy; prevState = ctx.state;
      if (pet && now > pet.until) pet = null;

      // Sleep after a long quiet spell; anything else going on wakes her up.
      if (!sleep && idle && ctx.canAct && !calm() && !pet && !ctx.chatOpen && now - idleSince > SLEEP_AFTER) sleep = {phase:'lying', start:now};
      if (sleep && sleep.phase !== 'waking' && (!idle || ctx.gesture || ctx.chatOpen || !ctx.canAct)) wakeUp(now);
      let lie = 0, restAlpha = 0;
      if (sleep) {
        const p = (now - sleep.start) / (sleep.phase === 'waking' ? WAKE_MS : LIE_MS);
        if (sleep.phase === 'lying') { lie = ease(p * 1.4); restAlpha = clamp((p - .6) / .3, 0, 1); if (p >= 1) sleep.phase = 'asleep'; }
        else if (sleep.phase === 'asleep') { lie = 1; restAlpha = 1; }
        else { lie = 1 - ease(p); restAlpha = clamp(1 - p / .45, 0, 1); if (p >= 1) { sleep = null; act = {name:'yawn', start:now}; } }
      }

      // Idle actions: open pages only, and only when nothing else is happening.
      if (act && now - act.start > ACTIONS[act.name]) act = null;
      if (sleep || pet || !idle) act = sleep?.phase === 'waking' ? act : null;
      if (!act && !sleep && !pet && idle && ctx.canAct && !calm() && !ctx.gesture && !ctx.chatOpen) {
        if (!nextAct) nextAct = now + 5000 + Math.random() * 5000;
        else if (now > nextAct) {
          act = {name:PICKS[Math.floor(Math.random() * PICKS.length)], start:now, kicked:false};
          nextAct = now + 9000 + Math.random() * 9000;
        }
      }
      const an = act?.name, ap = act ? (now - act.start) / ACTIONS[act.name] : 0;

      // Expression for what is happening now; null keeps pet.js's own choice.
      let eyes = null, mouth = null;
      if (sleep) { eyes = sleep.phase === 'lying' && lie < .3 ? null : 'drowsy'; mouth = 'w'; }
      else if (pet || an === 'pant') { eyes = 'happy'; mouth = 'tongue'; }
      else if (an === 'yawn') { const wide = ap > .15 && ap < .8; eyes = wide ? 'closed' : 'drowsy'; mouth = wide ? 'yawn' : 'w'; }
      else if (an === 'wag' || an === 'paw') eyes = 'happy';
      face(eyes, mouth);

      const still = reduced.matches;
      breath += dt * 2 * Math.PI / 3.4;
      const b = still ? 0 : Math.sin(breath);

      // Head: look at the pointer, then gestures, actions and petting on top.
      const lookTarget = ctx.pointer && idle && !sleep && !still ? clamp((ctx.pointer[0] - piv.head[0]) / 900, -1, 1) * 4 : 0;
      look += (lookTarget - look) * Math.min(1, dt * 5);
      let head = look, headDy = -6 * b, wagAmp = 0, wagHz = 1.2;
      const g = ctx.gesture;
      if (g?.type === 'tilt') head += 7 * Math.min(1, g.p * 4, (1 - g.p) * 4);
      if (g?.type === 'shake') head += 6 * Math.sin(g.p * Math.PI * 4) * (1 - g.p);
      if (an === 'yawn') { head -= 6 * bump(ap * 1.2); headDy -= 18 * bump(ap * 1.2); }
      if (an === 'look') head += 7 * Math.sin(ap * Math.PI * 2) * bump(ap);
      if (an === 'pant') headDy += 6 * Math.sin(ap * Math.PI * 14) * bump(ap);
      if (an === 'wag') { wagAmp = 8 * bump(ap); wagHz = 3.2; }
      if (an === 'flick' && !act.kicked) { act.kicked = true; spring['ear-l'].v -= 260; spring['ear-r'].v += 260; }
      if (pet) { head += 4 * pet.side; wagAmp = 9; wagHz = 3.6; headDy -= 6; }
      if (ctx.state === 'recover') { wagAmp = 7; wagHz = 3; }
      if (idle && !act && !pet && !sleep && !calm()) wagAmp = Math.max(wagAmp, 1.5);
      head = clamp(head, -9, 9) * (1 - lie) + 4 * lie;
      headDy += 40 * lie;
      // The wag is laid over the springs (they would soak up a quick wag); the tip trails the base.
      const wagPhase = now / 1000 * 2 * Math.PI * wagHz;
      const wag = still ? {tail:0, 'tail-tip':0} : {tail:wagAmp * Math.sin(wagPhase), 'tail-tip':wagAmp * .7 * Math.sin(wagPhase - .9)};

      // Springs follow the body's motion and swing, plus the petting targets.
      const swing = ctx.angle * 180 / Math.PI, airborne = ['drag', 'fall', 'chute'].includes(ctx.state);
      const target = {'ear-l':pet ? -3 : 0, 'ear-r':pet ? 3 : 0};
      const h = Math.min(dt, .04) / 2;
      for (const [id, s] of Object.entries(spring)) {
        const c = SPRINGS[id];
        if (still || (LEGS.has(id) && !airborne)) { s.a += (0 - s.a) * Math.min(1, dt * 12); s.v = 0; continue; }
        const goal = (target[id] || 0) + c.ga * swing;
        for (let i = 0; i < 2; i++) {
          s.v += (-c.k * (s.a - goal) - c.c * s.v + (c.gx * ax + c.gy * ay) * c.k) * h;
          s.a += s.v * h;
        }
        s.a = clamp(s.a, -c.max, c.max);
      }

      // The raised paw swaps in for waves and the paw action, and swings from the shoulder.
      const wantPaw = (g?.type === 'wave' || an === 'paw') && !sleep;
      if (wantPaw !== raised) {
        raised = wantPaw;
        parts['front-r']?.setAttribute('display', raised ? 'none' : 'inline');
        parts['front-r-raised']?.setAttribute('display', raised ? 'inline' : 'none');
      }
      if (raised) setT('front-r-raised', `rotate(${(-10 * Math.sin((g?.type === 'wave' ? g.p : ap) * Math.PI * 6)).toFixed(2)} ${piv['front-r'][0]} ${piv['front-r'][1]})`);

      for (const id of Object.keys(SPRINGS)) setT(id, rot(id, spring[id].a + (wag[id] || 0)));
      setT('head', `translate(0 ${headDy.toFixed(1)}) ${rot('head', head)}`);
      setT('body', `translate(${fx} ${fy}) scale(1 ${(1 + .012 * b - .06 * lie).toFixed(4)}) translate(${-fx} ${-fy})`);

      // Lying down: the rig sinks, then the sleeping drawing fades in over it (it breathes by CSS).
      if (parts.rest) {
        parts.rest.setAttribute('display', restAlpha > 0 ? 'inline' : 'none');
        parts.rest.style.opacity = restAlpha.toFixed(2);
        parts.rest.classList.toggle('breathing', sleep?.phase === 'asleep');
      }
      if (parts.rig) parts.rig.style.opacity = (1 - restAlpha).toFixed(2);
    }

    // Still moving: an action, petting, a sleep transition, or springs that have not settled.
    function busy() {
      if (act || pet || (sleep && sleep.phase !== 'asleep')) return true;
      return Object.values(spring).some(s => Math.abs(s.v) > .5 || Math.abs(s.a) > .05);
    }

    return {
      apply, busy, overHead,
      // Pointer moved anywhere on the page (rig units). `near` counts as attention; `canStroke` is false
      // for touch and while a button is held. Returns true when petting needs the frame loop.
      pointer(ux, uy, near, canStroke, now) {
        if (near) { if (sleep) wakeUp(now); else rested(now); }
        return !sleep && canStroke && !reduced.matches && strokeAt(ux, uy, now);
      },
      // A finger sliding on the head: pet.js asks before turning the touch into a drag.
      stroke(ux, uy, now) { return !reduced.matches && strokeAt(ux, uy, now); },
      attention(now) { wakeUp(now); },
      destroy() { clearTimeout(sleepTimer); }
    };
  }
  return {create};
});
