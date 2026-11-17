'use strict';
// v2.4.1.3: the Lab proxy for /api/hub/today and /api/hub/search adds Study Hub data for the same account only.
const {test} = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {createExtras} = require('../hub-extras.cjs');

function harness() {
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'garyhub-hub-extras-'));
  fs.mkdirSync(path.join(DATA, 'academic'));
  const save = (uid, courses) => fs.writeFileSync(path.join(DATA, 'academic', 'user-' + uid + '.json'), JSON.stringify({revision: 1, state: {courses}}));
  save(1, [{name: 'ECE 470', lectures: [{title: 'Forward kinematics', status: 'done', scroll: 10}, {title: 'Inverse kinematics', status: 'doing', scroll: 900},
    {title: 'Jacobians', status: 'doing', scroll: 300}, {title: 'Dynamics', status: 'todo'}]}, {name: 'Photo', lectures: [{title: 'Light and kinematics of shutters', status: 'todo'}]}]);
  save(2, [{name: 'Secret course', lectures: [{title: 'Kinematics of bob', status: 'doing', scroll: 5}]}]);
  let who = 1, upstream = {};
  const calls = [];
  const identity = async () => who ? {id: who, username: 'u' + who} : null;
  const calendar = async (req, route) => { calls.push(route); const r = upstream[route.split('?')[0]] || {status: 200, body: {}}; return {ok: r.status < 300, status: r.status, json: async () => structuredClone(r.body)}; };
  const responses = [];
  const json = (res, status, body) => responses.push({status, body});
  const handler = createExtras({DATA, identity, calendar, json});
  const call = async (pathname, method = 'GET') => {
    const url = new URL('http://x' + pathname);
    const handled = await handler({method}, {}, url);
    return handled ? responses.at(-1) : null;
  };
  return {DATA, call, calls, set: (route, status, body) => { upstream[route] = {status, body}; }, as: id => { who = id; }};
}

test('today adds the lecture being read; search adds matching lectures of the same account', async () => {
  const h = harness();
  try {
    assert.equal(await h.call('/api/hub/other'), null);
    h.set('/api/hub/today', 200, {accountId: 1, date: '2026-11-17', tasks: {count: 0, items: []}, todos: {count: 0, items: []}, unread: 0});
    const today = await h.call('/api/hub/today');
    assert.equal(today.status, 200);
    assert.deepEqual(today.body.study, {total: 5, done: 1, doing: 2, current: {title: 'Inverse kinematics', course: 'ECE 470', url: 'https://tools.garyhub.uk/study/'}});
    h.set('/api/hub/search', 200, {accountId: 1, q: 'kinematics', groups: [{type: 'task', items: []}]});
    const found = await h.call('/api/hub/search?q=kinematics');
    assert.deepEqual(found.body.groups.map(g => g.type), ['task', 'lecture']);
    assert.deepEqual(found.body.groups[1].items.map(i => i.title), ['Forward kinematics', 'Inverse kinematics', 'Light and kinematics of shutters']);
    assert.equal(JSON.stringify(found.body).includes('bob'), false);
    assert.equal(h.calls.at(-1), '/api/hub/search?q=kinematics');
    // Calendar answering for another account (a session switch in between) is refused.
    h.set('/api/hub/today', 200, {accountId: 2, tasks: {}, todos: {}});
    assert.equal((await h.call('/api/hub/today')).status, 409);
    h.as(2); h.set('/api/hub/today', 200, {accountId: 2, tasks: {}, todos: {}});
    assert.equal((await h.call('/api/hub/today')).body.study.current.title, 'Kinematics of bob');
    // A user being deleted, or without study data, gets an empty study summary.
    fs.writeFileSync(path.join(h.DATA, '.deleting-user-2'), '');
    assert.deepEqual((await h.call('/api/hub/today')).body.study, {total: 0, done: 0, doing: 0, current: null});
    h.as(3); h.set('/api/hub/today', 200, {accountId: 3, tasks: {}, todos: {}});
    assert.equal((await h.call('/api/hub/today')).body.study.total, 0);
    h.as(0);
    assert.equal((await h.call('/api/hub/today')).status, 401);
    h.as(1);
    assert.equal((await h.call('/api/hub/today', 'POST')).status, 405);
    h.set('/api/hub/search', 400, {message: 'bad'});
    assert.deepEqual(await h.call('/api/hub/search?q='), {status: 400, body: {message: 'bad'}});
  } finally { fs.rmSync(h.DATA, {recursive: true, force: true}); }
});
