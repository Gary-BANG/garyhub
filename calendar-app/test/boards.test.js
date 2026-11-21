'use strict';
// v2.4.3.2: board-game rooms over real sockets — seats from the settings, computer players taking their turns, 托管 for a
// player who drops out (the game goes on), taking over again, a pause only when nobody is left and the computer for
// whoever is still away when play resumes; 大富翁 with a computer opponent.
const test = require('node:test'), assert = require('node:assert/strict');
const play = require('../play-rooms');
const {fixture, account} = require('./helpers/rooms-fixture');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('board rooms: seats, computers, 托管, take over, pause and resume', async () => {
  const {server, base} = await fixture();
  Object.assign(play.TUNING, {grace: 200, resumeMin: 1000, botScale: 0.01});
  try {
    const alice = await account(base, 1), bob = await account(base, 2), carol = await account(base, 3);
    const {code} = await (await alice.post('/api/hub/play', {game: 'treasure', settings: {players: 3, limit: 0}})).json();
    const a = await alice.socket();
    let b = await bob.socket();
    let view = await a.hello(code);
    assert.equal(view.seats.length, 3); assert.equal(view.rules.seats, 3); assert.equal(view.rules.autoplay, true); assert.deepEqual(view.rules.bots, ['easy', 'normal', 'smart']);
    assert.equal((await a.act('settings', {settings: {players: 4, limit: 0, rounds: 8}})).ok, true);
    view = await a.state(r => r.seats.length === 4);
    await b.hello(code);
    const c = await carol.socket(); await c.hello(code);
    // Fewer seats only while nobody sits in the ones that go.
    assert.equal((await a.act('settings', {settings: {players: 2, limit: 0, rounds: 8}})).status, 409);
    assert.equal((await a.act('settings', {settings: {players: 3, limit: 0, rounds: 8}})).ok, true);
    await c.act('leave');
    assert.equal((await a.act('addBot', {level: 'normal'})).ok, true);
    view = await a.state(r => r.seats[2].bot === 'normal' && r.seats.length === 3);
    await b.act('ready', {ready: true});
    assert.equal((await a.act('start')).ok, true);
    view = await a.state(r => r.status === 'playing');
    assert.deepEqual([view.state.turn, view.state.players.length, view.state.goal], [0, 3, 15]);
    // Alice and Bob take their turns; the computer in seat 3 takes its own.
    await a.act('roll'); await a.act('move', {to: view.state.players[0].pos});
    assert.equal((await a.act('roll')).status, 409, 'not her turn any more');
    await b.act('roll');
    view = await b.state(r => r.state?.phase === 'move' && r.state.turn === 1);
    await b.act('move', {to: view.state.players[1].pos});
    view = await a.state(r => r.state?.turn === 0 && r.state.round === 2);
    assert.ok(view.state.log.some(e => e.seat === 2 && e.kind === 'roll'), 'the computer rolled');
    // Bob's connection drops: after the grace period his seat is played by the computer and the game goes on.
    b.socket.end();
    view = await a.state(r => r.seats[1].auto);
    assert.equal(view.paused, null);
    await a.act('roll'); view = await a.state(r => r.state?.phase === 'move'); await a.act('move', {to: view.state.players[0].pos});
    view = await a.state(r => r.state?.turn === 0 && r.state.round === 3);
    assert.ok(view.state.log.some(e => e.seat === 1 && e.kind === 'roll'), 'Bob\'s turn was played for him');
    // Back again, he is still on 托管 until he takes over.
    b = await bob.socket(); view = await b.hello(code);
    assert.equal(view.seats[1].auto, true);
    assert.equal((await b.act('takeover', {auto: 'no'})).status, 400);
    assert.equal((await b.act('takeover', {auto: false})).ok, true);
    view = await a.state(r => r.seats[1].auto === false);
    // Everybody leaves: the game pauses. Alice returns: it goes on, with the computer playing for Bob.
    a.socket.end(); b.socket.end();
    await sleep(600);
    assert.equal(play.rooms.get(code).paused?.reason, 'away');
    const a2 = await alice.socket(); view = await a2.hello(code);
    assert.equal(view.paused, null); assert.equal(view.seats[1].auto, true); assert.equal(view.seats[0].auto, false);
    // 托管 is not a thing in the word game.
    const {code: words} = await (await alice.post('/api/hub/play', {game: 'word', settings: {}})).json();
    await a2.hello(words);
    assert.equal((await a2.act('takeover', {auto: true})).status, 409);
    a2.close();
  } finally { play.stop(); server.close(); }
});

test('tycoon room: a human and a computer play turns in order', async () => {
  const {server, base} = await fixture();
  Object.assign(play.TUNING, {grace: 200, resumeMin: 1000, botScale: 0.01});
  try {
    const alice = await account(base, 1);
    const {code} = await (await alice.post('/api/hub/play', {game: 'monopoly', settings: {players: 2, rounds: 15, limit: 0}})).json();
    const a = await alice.socket();
    let view = await a.hello(code);
    assert.equal(view.seats.length, 2);
    await a.act('addBot', {level: 'smart'});
    assert.equal((await a.act('start')).ok, true);
    // The latest room state that has arrived (older ones are skipped).
    const latest = async () => { await sleep(120); const list = a.messages.filter(m => m.t === 'state' && m.room.code === code); a.messages.length = 0; if (list.length) view = list.at(-1).room; return view; };
    view = await a.state(r => r.status === 'playing');
    assert.equal(view.state.tiles.length, 32); assert.equal(view.state.players[0].cash, 15000);
    // Whoever starts, the computer plays until it is Alice's turn to roll.
    for (let i = 0; i < 80 && !(view.state.turn === 0 && view.state.phase === 'roll'); i++) await latest();
    assert.equal(view.state.turn, 0);
    const round = view.state.round;
    for (let i = 0; i < 20 && view.state.turn === 0; i++) {
      const phase = view.state.phase;
      const action = phase === 'roll' ? 'roll' : phase === 'buy' ? 'pass' : phase === 'debt' ? 'bankrupt' : 'end';
      assert.equal((await a.act(action)).ok, true, action);
      await latest();
    }
    // The computer rolls, decides and ends its turn by itself; then it is Alice's turn again.
    for (let i = 0; i < 80 && !(view.state.turn === 0 && view.state.phase === 'roll'); i++) await latest();
    assert.equal(view.state.turn, 0); assert.ok(view.state.round > round || view.state.first === 1);
    assert.ok(view.state.log.some(e => e.seat === 1 && e.kind === 'roll'), 'the computer rolled');    a.close();
  } finally { play.stop(); server.close(); }
});
