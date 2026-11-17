'use strict';
// Ledger budgets, month trend and CSV export (v2.4.1.3). Registered by ledger-api.js with its own
// connection, account guard and serialized queue, so these follow the same rules as the entries.
const {convert, CURRENCIES} = require('./fx-rates');
const TOTAL = '*';
const MAX = 40;
const fail = (message, status = 400) => { throw Object.assign(Error(message), {status}); };

async function migrateBudgets(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS ledger_budgets(user_id INTEGER NOT NULL,category_id TEXT NOT NULL,currency TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK(amount>0),updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,category_id))`);
}
function month(value) {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || value < '1900-01' || value > '2199-12') fail('月份应为 YYYY-MM');
  const [year, number] = value.split('-').map(Number);
  return {month: value, from: value + '-01', to: new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10)};
}
function shift(value, delta) {
  const [year, number] = value.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7);
}
// A value starting with one of these could run as a formula when the file is opened in a spreadsheet.
const cell = value => {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
};

function registerBudgets(app, {db, route, categories, fx, money, date}) {
  const currency = value => { if (!CURRENCIES.includes(value)) fail('请选择有效的币种'); return value; };
  // Consumption (expense minus refund) and income by category for a date range, converted into one currency.
  async function totals(uid, from, to, target, rate) {
    const rows = await db.all('SELECT kind,currency,category_id,amount FROM ledger_entries WHERE user_id=? AND date BETWEEN ? AND ?', [uid, from, to]);
    const byCategory = {};
    let consumption = 0, income = 0;
    for (const row of rows) {
      const value = convert(row.amount, row.currency, target, rate.rates || rate.rate);
      if (row.kind === 'income') { income += value; continue; }
      const delta = row.kind === 'refund' ? -value : value;
      consumption += delta;
      byCategory[row.category_id] = (byCategory[row.category_id] || 0) + delta;
    }
    return {consumption, income, byCategory};
  }
  app.get('/api/ledger/budgets', ...route(async (req, res) => {
    const uid = req.session.user.id, period = month(req.query.month), target = currency(req.query.currency);
    const rows = await db.all('SELECT category_id,currency,amount FROM ledger_budgets WHERE user_id=? ORDER BY category_id', [uid]);
    const rate = await fx.get();
    const spent = rate.available ? await totals(uid, period.from, period.to, target, rate) : null;
    res.json({accountId: uid, ...period, currency: target, available: !!rate.available, total: TOTAL, items: rows.map(row => ({
      categoryId: row.category_id, currency: row.currency, amount: (row.amount / 100).toFixed(2),
      budget: rate.available ? convert(row.amount, row.currency, target, rate.rates || rate.rate) : null,
      spent: spent ? (row.category_id === TOTAL ? spent.consumption : spent.byCategory[row.category_id] || 0) : null}))});
  }));
  app.put('/api/ledger/budgets/:category', ...route(async (req, res) => {
    const uid = req.session.user.id, id = req.params.category;
    if (id !== TOTAL) {
      const category = (await categories(uid)).find(c => c.id === id);
      if (!category || category.type !== 'expense') fail('请选择有效的支出类别');
    }
    const amount = money(req.body.amount), unit = currency(req.body.currency);
    const existing = await db.get('SELECT 1 AS found FROM ledger_budgets WHERE user_id=? AND category_id=?', [uid, id]);
    const count = await db.get('SELECT COUNT(*) AS n FROM ledger_budgets WHERE user_id=?', [uid]);
    if (!existing && count.n >= MAX) fail(`最多设置 ${MAX} 项预算`);
    await db.run(`INSERT INTO ledger_budgets(user_id,category_id,currency,amount) VALUES(?,?,?,?) ON CONFLICT(user_id,category_id)
      DO UPDATE SET currency=excluded.currency,amount=excluded.amount,updated_at=CURRENT_TIMESTAMP`, [uid, id, unit, amount]);
    res.json({ok: true});
  }));
  app.delete('/api/ledger/budgets/:category', ...route(async (req, res) => {
    const result = await db.run('DELETE FROM ledger_budgets WHERE user_id=? AND category_id=?', [req.session.user.id, req.params.category]);
    if (!result.changes) fail('预算不存在', 404);
    res.json({ok: true});
  }));
  app.get('/api/ledger/trend', ...route(async (req, res) => {
    const uid = req.session.user.id, end = month(req.query.month).month, target = currency(req.query.currency);
    const months = Number(req.query.months || 6);
    if (!Number.isInteger(months) || months < 2 || months > 12) fail('月份数应为 2–12');
    const rate = await fx.get();
    if (!rate.available) return res.json({accountId: uid, currency: target, available: false, months: []});
    const out = [];
    for (let i = months - 1; i >= 0; i--) {
      const period = month(shift(end, -i)), sum = await totals(uid, period.from, period.to, target, rate);
      out.push({month: period.month, consumption: sum.consumption, income: sum.income});
    }
    res.json({accountId: uid, currency: target, available: true, months: out});
  }));
  app.get('/api/ledger/export', ...route(async (req, res) => {
    const uid = req.session.user.id, from = date(req.query.from), to = date(req.query.to);
    if (to < from) fail('结束日期不能早于开始日期');
    const names = new Map((await categories(uid)).map(c => [c.id, c.name]));
    const rows = await db.all('SELECT * FROM ledger_entries WHERE user_id=? AND date BETWEEN ? AND ? ORDER BY date,created_at,id LIMIT 20000', [uid, from, to]);
    const lines = [['date', 'kind', 'category', 'currency', 'amount', 'notes', 'refund_of', 'id'].join(',')];
    for (const row of rows) lines.push([row.date, row.kind, names.get(row.category_id) || row.category_id, row.currency, (row.amount / 100).toFixed(2),
      row.notes, row.refund_of || '', row.id].map(cell).join(','));
    res.set({'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="garyhub-ledger-${from}_${to}.csv"`});
    res.send('﻿' + lines.join('\r\n') + '\r\n');
  }));
}

module.exports = {migrateBudgets, registerBudgets, month, shift, cell, TOTAL};
