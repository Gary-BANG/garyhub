'use strict';
// v2.4.3.1: 合作小车 — the shared physics and tracks, the rules on the server, and realtime rooms over real sockets:
// frames twenty times a second, controls only from the right seat, echo of the latest control, quick calls, floods
// dropped, a dropped player's controls released with a pause, a countdown on return, and an instant rematch.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const Sim = require('../play-car-sim'), car = require('../play-car'), play = require('../play-rooms');
const {fixture, account} = require('./helpers/rooms-fixture');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// One step call covers at most 250 ms (as in the room loop), so longer spans go in pieces.
const advance = (s, ms, c) => { for (let left = ms; left > 0 && s.phase !== 'finished'; left -= 50) car.step(s, Math.min(50, left), c); };
const ctx = () => { const c = {saved: 0, result: null}; c.save = () => { c.saved++; }; c.finish = r => { c.result = r; }; return c; };
// A plain autopilot: aims a little ahead on the road, slow for the bridge, fast for the ramp.
function pilot(track, c) {
  const target = Sim.pose(track, Math.min(track.length, c.s + Math.max(8, c.v * 0.9)), 0);
  let angle = Math.atan2(target.y - c.y, target.x - c.x) - c.h;
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  let want = 18;
  for (const z of Sim.ahead(track, c.s, 45)) if (z.kind === 'bridge') want = Math.min(want, z.max - 1.5);
  for (const b of track.bridges) if (c.s >= b.from - 2 && c.s <= b.to) want = Math.min(want, b.max - 1.5);
  for (const r of track.ramps) if (r.at - c.s < 70 && r.at - c.s > -2) want = Math.max(want, r.min + 3);
  return {steer: Math.max(-1, Math.min(1, angle * 3)), gas: c.v < want ? 1 : 0, brake: c.v > want + 1.5 ? 1 : 0};
}

test('car sim: the shared file is the page copy, tracks are consistent, and the physics behaves', () => {
  assert.deepEqual(fs.readFileSync(path.join(__dirname, '../play-car-sim.js')), fs.readFileSync(path.join(__dirname, '../../lab-service/public/games/play/car-sim.js')), 'page copy is byte-identical');
  for (const lv of Sim.LEVELS) {
    const t = Sim.build(lv.id, false), wide = Sim.build(lv.id, true);
    assert.ok(t.finish < t.length && t.checkpoints.every((s, i) => s < t.finish && (i === 0 || s > t.checkpoints[i - 1])));
    assert.ok(wide.half > t.half);
    for (const s of [0, 37, t.length / 2, t.length - 3]) for (const d of [-3, 0, 4]) {
      const p = Sim.pose(t, s, d), at = Sim.locate(t, p.x, p.y, Math.floor(s / 2));
      assert.ok(Math.abs(at.s - s) < 0.6 && Math.abs(at.d - d) < 0.3, 'pose and locate agree at ' + s + ',' + d);
    }
    for (const cone of t.cones) assert.ok(Math.abs(cone.d) < t.half);
  }
  const t = Sim.build(1, false), c = Sim.car(t, 0);
  for (let i = 0; i < 120; i++) Sim.step(t, c, {gas: 1}, [], [], -1);
  assert.ok(c.v > 10 && c.v <= Sim.MAX_SPEED && c.s > 10, 'gas accelerates along the road');
  const h0 = c.h; for (let i = 0; i < 30; i++) Sim.step(t, c, {steer: 1, gas: 1}, [], [], -1);
  assert.ok(c.h > h0 + 0.1, 'positive steer turns right');
  // Too far off the road: a fall. On the grass first: slower.
  const off = Sim.car(t, 20); off.v = 15; off.h += Math.PI / 2;
  let events = [], entered = null;
  for (let i = 0; i < 200 && !events.some(e => e[0] === 'fall'); i++) { events = Sim.step(t, off, {gas: 1}, [], [], -1); if (off.grass && entered == null) entered = off.v; }
  assert.deepEqual(events.at(-1), ['fall', 'edge']); assert.ok(off.v < entered, 'the grass slows the car even with the gas down');
  // Cones and coins.
  const cone = t.cones[0], hitter = Sim.car(t, cone.s - 6);
  const p = Sim.pose(t, cone.s - 6, cone.d); Object.assign(hitter, {x: p.x, y: p.y, v: 12});
  let all = [];
  for (let i = 0; i < 60; i++) all.push(...Sim.step(t, hitter, {gas: 1}, [], [], -1));
  assert.ok(all.some(e => e[0] === 'cone' && e[1] === 0));
  // Level 3: the bridge punishes speed, the ramp needs it.
  const t3 = Sim.build(3, false), fast = Sim.car(t3, 50); fast.v = 18;
  all = [];
  for (let i = 0; i < 120 && !all.some(e => e[0] === 'fall'); i++) all.push(...Sim.step(t3, fast, {gas: 1}, [], [], 0));
  assert.deepEqual(all.at(-1), ['fall', 'fast']);
  const slow = Sim.car(t3, 240); slow.v = 9; all = [];
  for (let i = 0; i < 300 && !all.some(e => e[0] === 'fall'); i++) all.push(...Sim.step(t3, slow, {}, [], [], 1));
  assert.deepEqual(all.at(-1), ['fall', 'gap']);
  const jumper = Sim.car(t3, 240); jumper.v = 19; all = [];
  for (let i = 0; i < 120; i++) all.push(...Sim.step(t3, jumper, {gas: 1}, [], [], 1));
  assert.ok(all.some(e => e[0] === 'jump') && !all.some(e => e[0] === 'fall') && jumper.s > t3.ramps[0].to, 'a fast car clears the gap');
  assert.deepEqual(Sim.ahead(t3, 20, 60).map(z => z.kind), ['bridge']);
  assert.ok(Sim.ahead(t3, 200, 70).some(z => z.kind === 'ramp' && z.min === 16));
});

test('car rules: roles, boosts, hearts, falls, time, stars, resume, leaving and the tally', () => {
  assert.deepEqual(car.settings({}), {level: 1, steer: 0, easy: 0});
  for (const bad of [{level: 4}, {steer: 2}, {easy: true}]) assert.throws(() => car.settings(bad), e => e.status === 400);
  let s = car.setup(car.settings({level: 1, steer: 1})), c = ctx();
  assert.equal(s.phase, 'countdown'); assert.equal(car.view(s, 1).role, 'steer'); assert.equal(car.view(s, 0).role, 'gas');
  advance(s, 3100, c);
  assert.equal(s.phase, 'running'); assert.ok(c.saved >= 1); assert.ok(s.run < 200);
  // Seat 1 steers; seat 0 has the pedals. Fields from the wrong seat are ignored; q only grows.
  car.input(s, 0, {steer: 1, gas: 1, boost: 1}, 5); car.input(s, 1, {steer: -0.5, gas: 1, brake: 1}, 3);
  assert.deepEqual([s.inputs[0].steer, s.inputs[0].gas, s.inputs[1].steer, s.inputs[1].gas, s.inputs[0].q, s.inputs[1].q], [0, 1, -0.5, 0, 5, 3]);
  assert.equal(s.boosts, 1); assert.ok(s.car.boost > 0);
  car.input(s, 0, {gas: 1, boost: 1}, 4); assert.equal(s.boosts, 1); assert.equal(s.inputs[0].q, 5, 'the same boost count asks for nothing');
  car.input(s, 1, {steer: 'left'}); assert.equal(s.inputs[1].steer, 0);
  car.input(s, 1, {steer: 9}); assert.equal(s.inputs[1].steer, 1);
  car.drop(s, 0); assert.deepEqual([s.inputs[0].gas, s.inputs[0].brake], [0, 0]);
  const f = car.frame(s);
  for (const key of ['p', 't', 'x', 'y', 'h', 'v', 'hp', 'q', 'steer', 'gas']) assert.ok(key in f, key);
  assert.ok(JSON.stringify(f).length < 260, 'frames stay small');
  // A cone costs a heart, then a short grace; three hearts gone fails the run.
  const t = car.track(s), cone = t.cones[0];
  s.car = Sim.car(t, cone.s - 4); Object.assign(s.car, Sim.pose(t, cone.s - 4, cone.d)); s.car.v = 10;
  s.inputs[1].steer = 0; s.inputs[0].gas = 1;
  for (let i = 0; i < 40 && s.hearts === 3; i++) car.step(s, 50, c);
  assert.equal(s.hearts, 2); assert.ok(s.invuln > 0); assert.ok(s.hit.includes(0));
  s.hearts = 1; s.invuln = 0; s.car = Sim.car(t, t.cones[1].s - 4); Object.assign(s.car, Sim.pose(t, t.cones[1].s - 4, t.cones[1].d)); s.car.v = 10;
  for (let i = 0; i < 40 && s.phase !== 'finished'; i++) car.step(s, 50, c);
  assert.equal(c.result.result, 'fail'); assert.equal(c.result.reason, 'hearts');
  // Falling: back to the last checkpoint after a moment, three seconds lost.
  s = car.setup(car.settings({level: 3})); c = ctx(); advance(s, 3100, c);
  s.cp = 0; s.car = Sim.car(car.track(s), 70); s.car.v = 18; s.inputs[1].gas = 1;
  const before = s.timeLeft;
  for (let i = 0; i < 40 && s.phase === 'running'; i++) car.step(s, 50, c);
  assert.equal(s.phase, 'respawn'); assert.equal(s.lastFall, 'fast'); assert.ok(before - s.timeLeft >= car.FALL_PENALTY);
  advance(s, car.RESPAWN + 50, c);
  assert.equal(s.phase, 'running'); assert.ok(Math.abs(s.car.s - car.track(s).checkpoints[0]) < 1.5); assert.ok(s.car.v < 1, 'starts again from standstill');
  // Pausing during a fall: the car is put back and waits for a countdown.
  s.car = Object.assign(Sim.car(car.track(s), 70), {v: 18});
  for (let i = 0; i < 40 && s.phase === 'running'; i++) car.step(s, 50, c);
  car.resume(s); assert.equal(s.phase, 'countdown'); assert.equal(s.countdown, car.COUNTDOWN);
  // Running out of time.
  s.phase = 'running'; s.timeLeft = 40; car.step(s, 100, c); assert.deepEqual([c.result.result, c.result.reason], ['fail', 'time']);
  // A whole clear with the autopilot: stars for finishing, par time and no lost heart.
  for (const level of [1, 2, 3]) {
    s = car.setup(car.settings({level, steer: 0})); c = ctx(); advance(s, 3100, c);
    const tr = car.track(s);
    for (let i = 0; i < 60 * 60 && s.phase !== 'finished'; i++) {
      const k = pilot(tr, s.car);
      car.input(s, 0, {steer: k.steer}); car.input(s, 1, {gas: k.gas, brake: k.brake});
      car.step(s, 1000 / 60, c);
    }
    assert.equal(c.result?.result, 'clear', 'level ' + level);
    assert.ok(c.result.stars >= 2 && c.result.ms < tr.par, 'level ' + level + ' within par');
    assert.equal(c.result.stars, s.hearts === 3 ? 3 : 2);
  }
  // Leaving ends the run as interrupted; the tally keeps the best per level.
  s = car.setup(car.settings({})); c = ctx(); car.leave(s, 1, {}, c); assert.equal(c.result.result, 'aborted');
  let tally = car.tally(null, {result: 'clear', level: 1, stars: 2, ms: 30000});
  tally = car.tally(tally, {result: 'clear', level: 1, stars: 2, ms: 28000});
  tally = car.tally(tally, {result: 'fail', level: 2, stars: 0, ms: 9000});
  tally = car.tally(tally, {result: 'aborted', level: 2});
  assert.deepEqual(tally, {runs: 3, clears: 2, best: {1: {stars: 2, ms: 28000}}});
});

test('car rooms: frames, role-gated controls, echo, quick calls, floods, drop and return, instant rematch', async () => {
  const {db, server, base} = await fixture();
  Object.assign(play.TUNING, {grace: 200, resumeMin: 1000, botScale: 0.01});
  try {
    const alice = await account(base, 1), bob = await account(base, 2);
    const {code} = await (await alice.post('/api/hub/play', {game: 'car', settings: {level: 1, steer: 0, easy: 0}})).json();
    const a = await alice.socket();
    let b = await bob.socket();
    let view = await a.hello(code); assert.deepEqual(view.rules.bots, []); assert.deepEqual(view.settings, {level: 1, steer: 0, easy: 0});
    await b.hello(code); await b.act('ready', {ready: true});
    assert.equal((await a.act('start')).ok, true);
    view = await b.state(r => r.status === 'playing');
    assert.equal(view.state.role, 'gas'); assert.equal(view.state.phase, 'countdown');
    // Frames: about twenty a second to everyone, with server times.
    const frames = [];
    const collect = c => c.next(m => m.t === 'f', 3000).then(m => { frames.push(m); return m; });
    const first = await collect(a);
    const t0 = Date.now(); a.messages.length = 0;
    await sleep(1000);
    const count = a.messages.filter(m => m.t === 'f').length + 0;
    assert.ok(count >= 15 && count <= 25, 'frames per second: ' + count);
    assert.ok(Math.abs(first.s - t0) < 2000 && first.d.p === 'countdown');
    // Running after the countdown; the pedal seat drives, the steering seat cannot press the gas.
    await a.state(r => r.state?.phase === 'running');
    a.send({t: 'in', q: 1, k: {gas: 1}});
    await sleep(400);
    assert.equal(play.rooms.get(code).state.inputs[0].gas, 0, 'the steering seat has no pedals');
    b.send({t: 'in', q: 7, k: {gas: 1}}); a.send({t: 'in', q: 2, k: {steer: 0.2}});
    const moving = await a.next(m => m.t === 'f' && m.d.v > 3 && m.d.q[1] === 7 && m.d.q[0] === 2, 4000);
    assert.equal(moving.d.gas, 1); assert.equal(moving.d.steer, 0.2);
    // Quick calls reach both players; unknown ones and rapid repeats do not.
    b.send({t: 'say', c: 'slow'}); b.send({t: 'say', c: 'slow'}); b.send({t: 'say', c: 'boom'});
    const said = await a.next(m => m.t === 'said', 2000);
    assert.deepEqual([said.seat, said.c], [1, 'slow']);
    await sleep(200);
    assert.equal(a.messages.filter(m => m.t === 'said').length, 0, 'one call only');
    // A flood of controls is dropped without closing the connection.
    for (let i = 0; i < 200; i++) b.send({t: 'in', q: 100 + i, k: {gas: 1}});
    await sleep(300);
    assert.equal(b.closed, null); assert.ok(play.rooms.get(code).state.inputs[1].q < 300);
    // Saved moments (the countdown ending) are in play_rooms.
    const saved = JSON.parse((await db.get('SELECT data FROM play_rooms WHERE code=?', [code])).data);
    assert.equal(saved.state.phase, 'running');
    // Bob drops off (FIN only): his pedals are released at once, the room pauses, frames stop.
    b.socket.end();
    view = await a.state(r => !!r.paused);
    assert.equal(play.rooms.get(code).state.inputs[1].gas, 0);
    a.messages.length = 0; await sleep(400);
    assert.equal(a.messages.filter(m => m.t === 'f').length, 0, 'no frames while paused');
    b = await bob.socket(); view = await b.hello(code);
    assert.equal(view.paused, null); assert.equal(view.state.phase, 'countdown');
    await a.next(m => m.t === 'f' && m.d.p === 'countdown', 2000);
    // Out of time: the host starts again at once, on the next level, without the lobby; others cannot.
    play.rooms.get(code).state.timeLeft = 20; play.rooms.get(code).state.phase = 'running';
    view = await a.state(r => r.status === 'finished');
    assert.deepEqual([view.result.result, view.result.reason], ['fail', 'time']);
    assert.equal((await b.act('rematch', {start: true})).status, 403);
    assert.equal((await a.act('rematch', {start: true, settings: {level: 2, steer: 1, easy: 1}})).ok, true);
    view = await b.state(r => r.status === 'playing' && r.matches === 1);
    assert.deepEqual([view.state.level, view.state.role, view.state.easy, view.matches], [2, 'steer', true, 1]);
    assert.deepEqual(view.tally, {runs: 1, clears: 0, best: {}});
    a.close(); b.close();
  } finally { play.stop(); server.close(); }
});
