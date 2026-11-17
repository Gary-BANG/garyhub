'use strict';
// v2.4.1.3: ledger budgets, month trend and CSV export on the ledger's own connection and account guard.
const test = require('node:test'), assert = require('node:assert/strict'), express = require('express'), sqlite = require('sqlite3');
const {migrateLedger, registerLedger} = require('../ledger-api');
const budget = require('../ledger-budget');

test('month helpers and CSV cells', () => {
  assert.deepEqual(budget.month('2028-02'), {month: '2028-02', from: '2028-02-01', to: '2028-02-29'});
  assert.equal(budget.shift('2026-01', -1), '2025-12');
  assert.equal(budget.shift('2026-11', -5), '2026-06');
  for (const bad of ['2026-13', '2026-1', '26-01', '', null]) assert.throws(() => budget.month(bad), {status: 400});
  assert.equal(budget.cell('plain'), 'plain');
  assert.equal(budget.cell('a,"b"\nc'), '"a,""b""\nc"');
  // Spreadsheet formulas in notes are neutralised.
  assert.equal(budget.cell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(budget.cell('+1'), "'+1");
  assert.equal(budget.cell('@x'), "'@x");
});

test('budgets, trend and export follow the account guard and the summary conversion', async () => {
  const raw = new sqlite.Database(':memory:');
  const db = {run: (s, p = []) => new Promise((y, n) => raw.run(s, p, function (e) { e ? n(e) : y(this); })),
    get: (s, p = []) => new Promise((y, n) => raw.get(s, p, (e, r) => e ? n(e) : y(r))), all: (s, p = []) => new Promise((y, n) => raw.all(s, p, (e, r) => e ? n(e) : y(r)))};
  let server;
  try {
    await db.run('CREATE TABLE users(id INTEGER PRIMARY KEY)'); await db.run('INSERT INTO users VALUES(2),(3)');
    await migrateLedger(db); await migrateLedger(db);
    const rows = [['a', 2, 'expense', 'USD', 10000, 'food', '2026-11-03', 'lunch, "noodles"'], ['b', 2, 'expense', 'CNY', 70000, 'food', '2026-11-05', '=1+1'],
      ['c', 2, 'refund', 'USD', 2000, 'food', '2026-11-06', ''], ['d', 2, 'income', 'USD', 4000, 'salary', '2026-11-07', ''],
      ['e', 2, 'expense', 'USD', 5000, 'transport', '2026-10-20', 'october'], ['f', 3, 'expense', 'USD', 99900, 'food', '2026-11-03', 'someone else']];
    for (const [id, user, kind, currency, amount, category, date, notes] of rows)
      await db.run('INSERT INTO ledger_entries(id,user_id,kind,currency,date,category_id,amount,notes,request_id) VALUES(?,?,?,?,?,?,?,?,?)', [id, user, kind, currency, date, category, amount, notes, id]);
    let available = true;
    const app = express(); app.use(express.json());
    registerLedger(app, {db, requireLogin: (req, res, next) => { req.session = {user: {id: Number(req.get('x-session') || 2)}}; next(); }, fx: {get: async () => ({available, rate: 7})}});
    app.use((e, req, res, next) => res.status(e.status || 500).json({message: e.message}));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const call = async (path, method = 'GET', data, user = 2) => {
      const r = await fetch('http://127.0.0.1:' + server.address().port + '/api/ledger/' + path, {method, headers: {'x-garyhub-user': String(user), 'x-session': String(user), 'content-type': 'application/json'}, body: data ? JSON.stringify(data) : undefined});
      return {status: r.status, headers: r.headers, data: (r.headers.get('content-type') || '').includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()).toString('utf8')};
    };
    // The page's account must match the session, as for entries.
    const mismatch = await fetch('http://127.0.0.1:' + server.address().port + '/api/ledger/budgets?month=2026-11&currency=USD', {headers: {'x-garyhub-user': '3', 'x-session': '2'}});
    assert.equal(mismatch.status, 409);
    assert.deepEqual((await call('budgets?month=2026-11&currency=USD')).data.items, []);
    assert.equal((await call('budgets/food', 'PUT', {amount: '150.00', currency: 'USD'})).status, 200);
    assert.equal((await call('budgets/*', 'PUT', {amount: '2100', currency: 'CNY'})).status, 200);
    for (const [path, body] of [['budgets/salary', {amount: '1', currency: 'USD'}], ['budgets/nope', {amount: '1', currency: 'USD'}], ['budgets/food', {amount: '0', currency: 'USD'}],
      ['budgets/food', {amount: 5, currency: 'USD'}], ['budgets/food', {amount: '5', currency: 'EUR'}]]) assert.equal((await call(path, 'PUT', body)).status, 400, path + JSON.stringify(body));
    const usd = (await call('budgets?month=2026-11&currency=USD')).data;
    assert.deepEqual([usd.from, usd.to, usd.available, usd.total], ['2026-11-01', '2026-11-30', true, '*']);
    // November: 100 USD + 700 CNY (100 USD) - 20 USD refund = 180 USD of food; October's transport is outside the month.
    assert.deepEqual(usd.items, [{categoryId: '*', currency: 'CNY', amount: '2100.00', budget: 30000, spent: 18000}, {categoryId: 'food', currency: 'USD', amount: '150.00', budget: 15000, spent: 18000}]);
    assert.deepEqual((await call('budgets?month=2026-10&currency=USD')).data.items.map(i => i.spent), [5000, 0]);
    assert.deepEqual((await call('budgets?month=2026-11&currency=USD', 'GET', undefined, 3)).data.items, []);
    assert.equal((await call('budgets/food', 'PUT', {amount: '200', currency: 'USD'})).status, 200);
    assert.equal((await call('budgets?month=2026-11&currency=CNY')).data.items[1].budget, 140000);
    available = false;
    assert.deepEqual((await call('budgets?month=2026-11&currency=USD')).data.items.map(i => [i.amount, i.budget, i.spent]), [['2100.00', null, null], ['200.00', null, null]]);
    assert.deepEqual((await call('trend?month=2026-11&currency=USD&months=3')).data, {accountId: 2, currency: 'USD', available: false, months: []});
    available = true;
    assert.deepEqual((await call('trend?month=2026-11&currency=USD&months=3')).data.months, [{month: '2026-09', consumption: 0, income: 0}, {month: '2026-10', consumption: 5000, income: 0}, {month: '2026-11', consumption: 18000, income: 4000}]);
    for (const bad of ['trend?month=2026-11&currency=USD&months=1', 'trend?month=2026-11&currency=USD&months=13', 'trend?month=x&currency=USD', 'budgets?month=2026-11&currency=EUR'])
      assert.equal((await call(bad)).status, 400, bad);
    const csv = await call('export?from=2026-11-01&to=2026-11-30');
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /^text\/csv/);
    assert.equal(csv.headers.get('content-disposition'), 'attachment; filename="garyhub-ledger-2026-11-01_2026-11-30.csv"');
    const lines = csv.data.split('\r\n');
    assert.equal(lines[0], '﻿date,kind,category,currency,amount,notes,refund_of,id');
    assert.equal(lines[1], '2026-11-03,expense,餐饮,USD,100.00,"lunch, ""noodles""",,a');
    assert.equal(lines[2], "2026-11-05,expense,餐饮,CNY,700.00,'=1+1,,b");
    assert.equal(lines.length, 6);
    assert.equal(csv.data.includes('someone else') || csv.data.includes('october'), false);
    assert.equal((await call('export?from=2026-11-30&to=2026-11-01')).status, 400);
    assert.equal((await call('budgets/food', 'DELETE')).status, 200);
    assert.equal((await call('budgets/food', 'DELETE')).status, 404);
    assert.equal((await call('budgets/*', 'DELETE', undefined, 3)).status, 404);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM ledger_budgets')).n, 1);
  } finally { if (server) await new Promise(resolve => server.close(resolve)); await new Promise(resolve => raw.close(resolve)); }
});
