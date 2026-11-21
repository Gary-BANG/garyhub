'use strict';
// Game rooms (v2.4.3.1): "合作小车 / Co-op Car". Two players drive one car: one steers, the other works the throttle,
// brake and the two boosts. The server runs the car (play-car-sim.js, 60 steps a second) from the latest controls of
// both players and sends positions twenty times a second; pages draw them slightly in the past and smooth between them.
//
// Three hearts (a cone costs one), a time limit per level, checkpoints (leaving the road puts the car back at the last
// one and costs three seconds), and one to three stars: finishing, beating the level's par time, losing no heart.
// When a player drops out the room pauses; on return a three-second countdown starts the car again.
const Sim = require('./play-car-sim');

const fail = (status, message) => Object.assign(Error(message), {status});
const STEP_MS = Sim.STEP * 1000, COUNTDOWN = 3000, RESPAWN = 1200, FALL_PENALTY = 3000, HEARTS = 3, BOOSTS = 2, BOOST_TIME = 3;
const CALLS = ['left', 'right', 'slow', 'go', 'nice'];
const tracks = new Map();
const track = (state) => {
  const key = state.level + ':' + (state.easy ? 1 : 0);
  if (!tracks.has(key)) tracks.set(key, Sim.build(state.level, state.easy));
  return tracks.get(key);
};

function settings(input = {}) {
  const level = input.level ?? 1, steer = input.steer ?? 0, easy = input.easy ?? 0;
  if (!Sim.level(level)) throw fail(400, '没有这一关');
  if (steer !== 0 && steer !== 1) throw fail(400, '请选择谁负责方向');
  if (easy !== 0 && easy !== 1) throw fail(400, '宽松模式只能开或关');
  return {level, steer, easy};
}

function setup(config) {
  const state = {level: config.level, easy: !!config.easy, steerSeat: config.steer, phase: 'countdown', countdown: COUNTDOWN, respawn: 0,
    timeLeft: 0, run: 0, hearts: HEARTS, invuln: 0, boosts: BOOSTS, boostSeen: [0, 0], coins: [], hit: [], cp: -1, falls: 0, lastFall: null,
    inputs: [{steer: 0, gas: 0, brake: 0, q: 0}, {steer: 0, gas: 0, brake: 0, q: 0}], car: null, carry: 0, outcome: null};
  const t = track(state);
  state.timeLeft = t.time;
  state.car = Sim.car(t, 0);
  return state;
}

// The controls each seat is allowed to change; the other fields of its message are ignored.
function input(state, seat, k, q) {
  if (!state || state.phase === 'finished' || (seat !== 0 && seat !== 1) || !k || typeof k !== 'object') return;
  const own = state.inputs[seat];
  if (Number.isSafeInteger(q) && q > own.q) own.q = q;
  if (seat === state.steerSeat) {
    const steer = Number(k.steer);
    own.steer = Number.isFinite(steer) ? Math.max(-1, Math.min(1, steer)) : 0;
  } else {
    own.gas = k.gas ? 1 : 0; own.brake = k.brake ? 1 : 0;
    // Boosts are counted by the page; a higher count asks for one more.
    if (Number.isSafeInteger(k.boost) && k.boost > state.boostSeen[seat]) {
      state.boostSeen[seat] = k.boost;
      if (state.boosts > 0 && state.phase === 'running' && state.car.boost <= 0) { state.boosts--; state.car.boost = BOOST_TIME; }
    }
  }
}
// A player who drops out lets go of every control.
function drop(state, seat) {
  if (!state || !state.inputs[seat]) return;
  Object.assign(state.inputs[seat], {steer: 0, gas: 0, brake: 0});
}

function controls(state) {
  const steer = state.inputs[state.steerSeat], pedals = state.inputs[1 - state.steerSeat];
  return {steer: steer.steer, gas: pedals.gas, brake: pedals.brake};
}
function stars(state, t) {
  return 1 + (state.run <= t.par ? 1 : 0) + (state.hearts === HEARTS ? 1 : 0);
}
function end(state, ctx, result, reason) {
  const t = track(state);
  state.phase = 'finished';
  state.outcome = {result, reason, level: state.level, ms: Math.round(state.run), hearts: state.hearts, coins: state.coins.length, totalCoins: t.coins.length,
    falls: state.falls, stars: result === 'clear' ? stars(state, t) : 0};
  ctx.finish({...state.outcome});
}

// Advances the game by dt milliseconds in fixed steps. ctx.save() marks a moment worth keeping (and sending in full).
function step(state, dt, ctx) {
  if (state.phase === 'finished') return;
  const t = track(state);
  state.carry = Math.min(state.carry + dt, 250);
  while (state.carry >= STEP_MS && state.phase !== 'finished') {
    state.carry -= STEP_MS;
    if (state.phase === 'countdown') {
      state.countdown -= STEP_MS;
      if (state.countdown <= 0) { state.countdown = 0; state.phase = 'running'; ctx.save(); }
      continue;
    }
    if (state.phase === 'respawn') {
      state.respawn -= STEP_MS;
      if (state.respawn <= 0) { state.car = Sim.car(t, state.cp >= 0 ? t.checkpoints[state.cp] : 0); state.phase = 'running'; ctx.save(); }
      continue;
    }
    state.run += STEP_MS; state.timeLeft -= STEP_MS; state.invuln = Math.max(0, state.invuln - STEP_MS);
    if (state.timeLeft <= 0) { state.timeLeft = 0; return end(state, ctx, 'fail', 'time'); }
    for (const [kind, value] of Sim.step(t, state.car, controls(state), state.hit, state.coins, state.cp)) {
      if (kind === 'cone') {
        state.hit.push(value);
        if (state.invuln <= 0) {
          state.hearts--; state.invuln = 1500; state.car.v *= 0.35;
          if (state.hearts <= 0) return end(state, ctx, 'fail', 'hearts');
        }
        ctx.save();
      } else if (kind === 'coin') { state.coins.push(value); ctx.save(); }
      else if (kind === 'checkpoint') { state.cp = Math.max(state.cp, value); ctx.save(); }
      else if (kind === 'fall') {
        state.falls++; state.lastFall = value; state.timeLeft -= FALL_PENALTY; state.phase = 'respawn'; state.respawn = RESPAWN;
        state.car.v = 0;
        if (state.timeLeft <= 0) { state.timeLeft = 0; return end(state, ctx, 'fail', 'time'); }
        ctx.save();
        break;
      } else if (kind === 'finish') return end(state, ctx, 'clear', 'finish');
    }
  }
}

// Back from a pause: the car waits for a fresh countdown (a fall in progress is completed first).
function resume(state) {
  if (!state || state.phase === 'finished') return;
  if (state.phase === 'respawn') { const t = track(state); state.car = Sim.car(t, state.cp >= 0 ? t.checkpoints[state.cp] : 0); }
  state.phase = 'countdown'; state.countdown = COUNTDOWN; state.carry = 0;
}

const r1 = n => Math.round(n * 10) / 10, r3 = n => Math.round(n * 1000) / 1000;
// The part that changes every step, sent twenty times a second to everyone in the room.
function frame(state) {
  const c = state.car, i = state.inputs;
  return {p: state.phase, cd: Math.max(0, Math.round(state.countdown)), t: Math.max(0, Math.round(state.timeLeft)), r: Math.round(state.run),
    x: r1(c.x), y: r1(c.y), h: r3(c.h), v: r1(c.v), w: r3(c.w), s: r1(c.s), a: c.air > 0 ? 1 : 0, b: c.boost > 0 ? 1 : 0, g: c.grass, o: c.oil, ov: c.over,
    hp: state.hearts, inv: state.invuln > 0 ? 1 : 0, bl: state.boosts, steer: r3(i[state.steerSeat].steer), gas: i[1 - state.steerSeat].gas, brake: i[1 - state.steerSeat].brake,
    q: [i[0].q, i[1].q]};
}
function view(state, seat) {
  if (!state) return null;
  return {...frame(state), phase: state.phase, level: state.level, easy: state.easy, steerSeat: state.steerSeat, role: seat == null ? null : seat === state.steerSeat ? 'steer' : 'gas',
    coins: state.coins.slice(), hit: state.hit.slice(), cp: state.cp, falls: state.falls, lastFall: state.lastFall, outcome: state.outcome};
}

// The car has no turn-based moves; everything goes through input().
function act() { throw fail(400, '未知操作'); }
function timeout() {}
function leave(state, seat, config, ctx) {
  if (state.phase === 'finished') return;
  state.phase = 'finished';
  state.outcome = {result: 'aborted', reason: 'left', level: state.level, ms: Math.round(state.run), hearts: state.hearts, coins: state.coins.length, falls: state.falls, stars: 0};
  ctx.finish({...state.outcome});
}

// Per room: runs, clears, and for each level the best stars and then the fastest clear.
function tally(previous, result) {
  const t = previous ? {runs: previous.runs, clears: previous.clears, best: {...previous.best}} : {runs: 0, clears: 0, best: {}};
  if (result.result === 'aborted') return t;
  t.runs++;
  if (result.result === 'clear') {
    t.clears++;
    const old = t.best[result.level];
    if (!old || result.stars > old.stars || (result.stars === old.stars && result.ms < old.ms)) t.best[result.level] = {stars: result.stars, ms: result.ms};
  }
  return t;
}

module.exports = {id: 'car', seats: 2, bots: [], pausedActions: [], calls: CALLS, grace: 3000, instantRematch: true,
  // The room steps the car twenty times a second (each call runs the 60-per-second physics it owes) and sends a frame each time.
  realtime: {hz: 20, send: 20}, settings, setup, act, timeout, leave, view, tally, input, drop, step, resume, frame, track,
  COUNTDOWN, RESPAWN, FALL_PENALTY, HEARTS, BOOSTS};
