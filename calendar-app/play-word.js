'use strict';
// Game rooms (v2.4.3.0): "词语默契 / Word Sync". Two players each write a word at the same time; both are revealed
// together. Different words: next round each writes a new word that links the two just revealed, until both write the
// same word. A word used earlier in the game (by either player) cannot be used again. When the words differ, both
// players may agree that they mean the same thing ("算我们一样"); the program never judges synonyms itself.
//
// Rules are plain functions over a JSON state; the room (play-rooms.js) owns the clock, presence and persistence.
// A player's word for the current round is never in the other player's view until both have submitted.

const LIMITS = [0, 30, 60, 90], GRACE = 15_000, REVIEW = 20_000, HOLD_AFTER = 3, WORD_MAX = 12;
const fail = (status, message) => Object.assign(Error(message), {status});
const chars = text => [...text].length;

// Same word = same letters and digits after Unicode compatibility folding and lower case; spaces and punctuation are ignored.
const normalize = text => String(text).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function settings(input = {}) {
  const limit = input.limit ?? 60, cap = input.cap ?? 20, target = input.target ?? 0;
  if (!LIMITS.includes(limit)) throw fail(400, '每轮限时只能是 30、60、90 秒或不限时');
  if (!Number.isSafeInteger(cap) || cap < 5 || cap > 30) throw fail(400, '轮数上限须在 5 到 30 之间');
  if (!Number.isSafeInteger(target) || (target !== 0 && (target < 2 || target > cap))) throw fail(400, '挑战目标须在 2 到轮数上限之间，或不设');
  return {limit, cap, target};
}

function setup(config, seats, ctx) {
  const state = {round: 1, phase: 'submit', words: [null, null], keys: [null, null], grace: false, history: [], used: [], clue: null,
    review: [null, null], streak: [0, 0], giveUp: [false, false], hold: null, outcome: null};
  startRound(state, config, ctx);
  return state;
}
function startRound(state, config, ctx) {
  state.phase = 'submit'; state.words = [null, null]; state.keys = [null, null]; state.grace = false; state.review = [null, null];
  if (config.limit) ctx.setTimer(config.limit * 1000); else ctx.clearTimer();
}
function finish(state, ctx, result, reason) {
  state.phase = 'finished'; state.hold = null;
  state.outcome = {result, reason, rounds: state.round};
  ctx.clearTimer();
  ctx.finish({result, reason, rounds: state.round});
}

// Both words are known: record the round, then end, review, or go on.
function reveal(state, config, ctx) {
  const [a, b] = state.words, [ka, kb] = state.keys;
  const entry = {round: state.round, words: [a, b], timeout: [a == null, b == null], same: a != null && ka === kb, agreed: false};
  state.history.push(entry);
  for (const key of [ka, kb]) if (key && !state.used.includes(key)) state.used.push(key);
  if (a != null && b != null) state.clue = [a, b];
  if (entry.same) return finish(state, ctx, 'success', 'same');
  if (a != null && b != null) {
    state.phase = 'review'; state.review = [null, null];
    if (config.limit) ctx.setTimer(REVIEW); else ctx.clearTimer();
    return;
  }
  advance(state, config, ctx);
}
function advance(state, config, ctx) {
  if (state.round >= config.cap) return finish(state, ctx, 'fail', 'cap');
  state.round++;
  // Three timeouts in a row by the same player stop the clock until that player comes back.
  const held = state.streak.findIndex(n => n >= HOLD_AFTER);
  if (held >= 0) {
    state.phase = 'hold'; state.hold = held; state.words = [null, null]; state.keys = [null, null]; state.review = [null, null]; state.grace = false;
    ctx.clearTimer();
    return;
  }
  startRound(state, config, ctx);
}

const ACTIONS = {
  word(state, seat, data, config, ctx) {
    if (state.phase !== 'submit') throw fail(409, '现在不能提交');
    if (state.words[seat] != null) throw fail(409, '这一轮已经提交过了');
    const text = typeof data.text === 'string' ? data.text.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
    if (!text || chars(text) > WORD_MAX) throw fail(400, '请输入 1–' + WORD_MAX + ' 个字的词');
    const key = normalize(text);
    if (!key) throw fail(400, '词里至少要有一个文字或数字');
    if (state.used.includes(key)) throw fail(409, '这个词已经出现过，换一个吧');
    state.words[seat] = text; state.keys[seat] = key; state.streak[seat] = 0;
    if (state.words.every(w => w != null)) reveal(state, config, ctx);
  },
  review(state, seat, data, config, ctx) {
    if (state.phase !== 'review') throw fail(409, '现在不能这样做');
    if (typeof data.same !== 'boolean') throw fail(400, '请选择“算我们一样”或“下一轮”');
    if (state.review[seat] != null) throw fail(409, '已经选过了');
    state.review[seat] = data.same ? 'same' : 'next';
    if (state.review.some(choice => choice == null)) return;
    if (state.review.every(choice => choice === 'same')) {
      state.history.at(-1).agreed = true;
      return finish(state, ctx, 'success', 'agreed');
    }
    advance(state, config, ctx);
  },
  resume(state, seat, data, config, ctx) {
    if (state.phase !== 'hold' || state.hold !== seat) throw fail(409, '现在不需要继续');
    state.hold = null; state.streak[seat] = 0;
    startRound(state, config, ctx);
  },
  giveup(state, seat, data, config, ctx) {
    if (['finished'].includes(state.phase)) throw fail(409, '这一局已经结束');
    if (typeof data.on !== 'boolean') throw fail(400, '请选择是否认输');
    state.giveUp[seat] = data.on;
    if (state.giveUp.every(Boolean)) finish(state, ctx, 'fail', 'giveup');
  }
};

function act(state, seat, action, data, config, ctx) {
  const rule = ACTIONS[action];
  if (!rule) throw fail(400, '未知操作');
  rule(state, seat, data || {}, config, ctx);
}

// The round's clock ran out: first a 15-second last call for whoever has not written, then the round is recorded
// without them. In review, an undecided player counts as "next round".
function timeout(state, config, ctx) {
  if (state.phase === 'submit') {
    if (!state.grace) { state.grace = true; ctx.setTimer(GRACE); return; }
    state.words.forEach((word, seat) => { if (word == null) state.streak[seat]++; });
    return reveal(state, config, ctx);
  }
  if (state.phase === 'review') advance(state, config, ctx);
}

// Leaving a started game ends it as interrupted: not a failure, so no agreement is triggered.
function leave(state, seat, config, ctx) {
  if (state.phase !== 'finished') finish(state, ctx, 'aborted', 'left');
}

function view(state, seat) {
  const other = seat == null ? null : 1 - seat;
  return {
    round: state.round, phase: state.phase, grace: state.grace, clue: state.clue,
    history: state.history.map(entry => ({...entry, words: entry.words.slice(), timeout: entry.timeout.slice()})),
    submitted: state.words.map(word => word != null),
    mine: seat == null ? null : state.words[seat],
    review: seat == null ? null : {mine: state.review[seat], other: state.review[other]},
    giveUp: state.giveUp.slice(), hold: state.hold, streak: state.streak.slice(), used: state.used.length,
    outcome: state.outcome
  };
}

// The room's running tally: games played, successes and the fewest rounds.
function tally(previous, result) {
  const t = previous || {played: 0, success: 0, best: null};
  if (result.result === 'aborted') return t;
  const next = {played: t.played + 1, success: t.success + (result.result === 'success' ? 1 : 0), best: t.best};
  if (result.result === 'success' && (next.best == null || result.rounds < next.best)) next.best = result.rounds;
  return next;
}

module.exports = {id: 'word', seats: 2, bots: [], pausedActions: ['giveup'], settings, setup, act, timeout, leave, view, tally, normalize, LIMITS, GRACE, REVIEW, WORD_MAX};
