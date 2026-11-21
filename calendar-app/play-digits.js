'use strict';
// Game rooms (v2.4.3.0): "对战猜数字 / Number Duel". Each player sets a secret of four different digits (0 may lead).
// Every round both guess at the same time; when both have guessed, each learns xA yB for their own guess: A = right
// digit in the right place, B = right digit in the wrong place. Whoever reaches 4A first wins; both in the same round
// is a draw. A missed round is skipped; three missed rounds in a row lose the game.
//
// A computer player may take a seat. It only ever sees its own guesses and their hints — never the other secret.

const LIMITS = [0, 30, 60], SECRET_TIME = 60_000, LENGTH = 4, MAX_ROUNDS = 30, MISSES = 3, AWAY = 120_000;
const LEVELS = ['easy', 'normal', 'smart'];
const fail = (status, message) => Object.assign(Error(message), {status});
const valid = code => typeof code === 'string' && /^\d{4}$/.test(code) && new Set(code).size === LENGTH;

function score(guess, secret) {
  let a = 0, common = 0;
  for (let i = 0; i < LENGTH; i++) if (guess[i] === secret[i]) a++;
  for (const digit of guess) if (secret.includes(digit)) common++;
  return {a, b: common - a};
}
let ALL = null;
function all() {
  if (!ALL) { ALL = []; for (let n = 0; n < 10000; n++) { const code = String(n).padStart(4, '0'); if (valid(code)) ALL.push(code); } }
  return ALL;
}
function random(rng) {
  const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  for (let i = digits.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [digits[i], digits[j]] = [digits[j], digits[i]]; }
  return digits.slice(0, LENGTH).join('');
}

function settings(input = {}) {
  const limit = input.limit ?? 30;
  if (!LIMITS.includes(limit)) throw fail(400, '每轮限时只能是 30、60 秒或不限时');
  return {limit};
}
function setup(config, seats, ctx) {
  if (config.limit) ctx.setTimer(SECRET_TIME);
  return {phase: 'secret', round: 0, secrets: [null, null], randomSecret: [false, false], pending: [null, null],
    history: [[], []], streak: [0, 0], outcome: null};
}
function finish(state, ctx, winner, reason) {
  state.phase = 'finished'; state.pending = [null, null];
  state.outcome = {winner, reason, rounds: state.round};
  ctx.clearTimer();
  ctx.finish({winner, reason, rounds: state.round});
}
function startGuessing(state, config, ctx) {
  state.phase = 'guess'; state.round = 1; state.pending = [null, null];
  if (config.limit) ctx.setTimer(config.limit * 1000); else ctx.clearTimer();
}
// Both guesses (or timeouts) are in: score them against the other secret, then decide.
function resolve(state, config, ctx) {
  for (const seat of [0, 1]) {
    const guess = state.pending[seat];
    if (guess == null) { state.history[seat].push({round: state.round, timeout: true}); state.streak[seat]++; }
    else state.history[seat].push({round: state.round, guess, ...score(guess, state.secrets[1 - seat])});
  }
  state.pending = [null, null];
  const solved = [0, 1].filter(seat => state.history[seat].at(-1).a === LENGTH);
  if (solved.length === 2) return finish(state, ctx, null, 'both');
  if (solved.length === 1) return finish(state, ctx, solved[0], 'solved');
  const out = [0, 1].filter(seat => state.streak[seat] >= MISSES);
  if (out.length === 2) return finish(state, ctx, null, 'timeouts');
  if (out.length === 1) return finish(state, ctx, 1 - out[0], 'timeouts');
  if (state.round >= MAX_ROUNDS) return finish(state, ctx, null, 'rounds');
  state.round++;
  if (config.limit) ctx.setTimer(config.limit * 1000);
}

const ACTIONS = {
  secret(state, seat, data, config, ctx) {
    if (state.phase !== 'secret') throw fail(409, '密码已经设好了');
    if (state.secrets[seat] != null) throw fail(409, '你已经设好密码了');
    if (!valid(data.code)) throw fail(400, '密码须是 4 个不同的数字');
    state.secrets[seat] = data.code;
    if (state.secrets.every(Boolean)) startGuessing(state, config, ctx);
  },
  guess(state, seat, data, config, ctx) {
    if (state.phase !== 'guess') throw fail(409, '现在不能猜');
    if (state.pending[seat] != null) throw fail(409, '这一轮已经猜过了');
    if (!valid(data.code)) throw fail(400, '请猜 4 个不同的数字');
    state.pending[seat] = data.code; state.streak[seat] = 0;
    if (state.pending.every(Boolean)) resolve(state, config, ctx);
  },
  forfeit(state, seat, data, config, ctx) {
    if (state.phase === 'finished') throw fail(409, '这一局已经结束');
    finish(state, ctx, 1 - seat, 'forfeit');
  },
  // The other player has been away for two minutes: the one still here may take the win.
  claim(state, seat, data, config, ctx) {
    if (state.phase === 'finished') throw fail(409, '这一局已经结束');
    if (ctx.away(1 - seat) < AWAY) throw fail(409, '对方离开不到 2 分钟');
    finish(state, ctx, seat, 'away');
  }
};
function act(state, seat, action, data, config, ctx) {
  const rule = ACTIONS[action];
  if (!rule) throw fail(400, '未知操作');
  rule(state, seat, data || {}, config, ctx);
}

// Time is up: a missing secret is drawn at random; a missing guess is a skipped round.
function timeout(state, config, ctx) {
  if (state.phase === 'secret') {
    state.secrets.forEach((code, seat) => { if (code == null) { state.secrets[seat] = random(ctx.rng); state.randomSecret[seat] = true; } });
    return startGuessing(state, config, ctx);
  }
  if (state.phase === 'guess') resolve(state, config, ctx);
}
function leave(state, seat, config, ctx) {
  if (state.phase !== 'finished') finish(state, ctx, 1 - seat, 'forfeit');
}

function view(state, seat) {
  const finished = state.phase === 'finished', other = seat == null ? null : 1 - seat;
  return {
    phase: state.phase, round: state.round,
    secretSet: state.secrets.map(Boolean), mySecret: seat == null ? null : state.secrets[seat],
    randomSecret: seat == null ? false : state.randomSecret[seat],
    guessed: state.pending.map(Boolean), myGuess: seat == null ? null : state.pending[seat],
    // history[i] = the guesses seat i made against the other secret; both sides are public once scored.
    history: state.history.map(list => list.map(entry => ({...entry}))),
    streak: state.streak.slice(), other,
    secrets: finished ? state.secrets.slice() : null, outcome: state.outcome
  };
}

// ---- Computer player -------------------------------------------------------------------------------------------
// It keeps the codes that agree with the hints it remembers. easy and normal remember only their last three hints, and
// easy also guesses carelessly one time in five; smart remembers all and picks the guess whose worst answer leaves the
// fewest codes (bounded work per move). Measured over hundreds of random secrets: about 9, 7.4 and 5.4 guesses.
const MEMORY = {easy: 3, normal: 3};
function candidates(history, memory = Infinity) {
  const scored = history.filter(entry => !entry.timeout);
  const kept = memory === Infinity ? scored : scored.slice(-memory);
  return all().filter(code => !scored.some(entry => entry.guess === code) && kept.every(entry => { const s = score(entry.guess, code); return s.a === entry.a && s.b === entry.b; }));
}
function pick(list, rng) { return list[Math.floor(rng() * list.length)]; }
function smartGuess(left, rng) {
  if (left.length <= 2) return left[0];
  const pool = left.length > 300 ? Array.from({length: 300}, () => pick(left, rng)) : left.slice();
  if (left.length <= 300) for (let i = 0; i < Math.min(150, Math.floor(200_000 / left.length)); i++) pool.push(pick(all(), rng));
  const inSet = new Set(left);
  let best = null, bestWorst = Infinity;
  for (const guess of pool) {
    const buckets = new Map();
    let worst = 0;
    for (const code of left) {
      const s = score(guess, code), key = s.a * 10 + s.b, n = (buckets.get(key) || 0) + 1;
      buckets.set(key, n);
      if (n > worst) { worst = n; if (worst > bestWorst) break; }
    }
    if (worst < bestWorst || (worst === bestWorst && inSet.has(guess) && !inSet.has(best))) { best = guess; bestWorst = worst; }
  }
  return best;
}
function botGuess(history, level, rng) {
  const left = candidates(history, MEMORY[level]);
  if (!left.length) return random(rng);
  if (level === 'easy') return rng() < 0.2 ? random(rng) : pick(left, rng);
  if (level === 'normal') return pick(left, rng);
  if (!history.some(entry => !entry.timeout)) return '0123';
  return smartGuess(left, rng);
}
// What the computer in this seat does next, and after how long; null when it has nothing to do.
function bot(state, seat, level, rng) {
  if (state.phase === 'secret' && state.secrets[seat] == null) return {action: 'secret', data: {code: random(rng)}, delay: 1200 + rng() * 1500};
  if (state.phase === 'guess' && state.pending[seat] == null) {
    const slow = level === 'easy' ? 4000 : 2000;
    return {action: 'guess', data: {code: botGuess(state.history[seat], level, rng)}, delay: slow + rng() * 4000};
  }
  return null;
}

function tally(previous, result) {
  const t = previous || {wins: [0, 0], draws: 0};
  return result.winner == null ? {wins: t.wins.slice(), draws: t.draws + 1} : {wins: t.wins.map((n, i) => n + (i === result.winner ? 1 : 0)), draws: t.draws};
}

module.exports = {id: 'digits', seats: 2, bots: LEVELS, pausedActions: ['forfeit', 'claim'], settings, setup, act, timeout, leave, view, bot, tally,
  score, valid, candidates, botGuess, random, LIMITS, SECRET_TIME, MAX_ROUNDS, AWAY};
