'use strict';
const fs = require('node:fs'), path = require('node:path');
const CURRENCIES = Object.freeze(['CNY', 'USD', 'CAD', 'HKD']);
const URL = 'https://api.frankfurter.dev/v2/rates?base=usd&quotes=cny,cad,hkd';
function scaled(rate) {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0.01 || rate > 1000) throw Error('Invalid rate');
  return BigInt(Math.round(rate * 1e8));
}
function convert(cents, from, to, reference) {
  if (!Number.isSafeInteger(cents) || cents < 0 || !CURRENCIES.includes(from) || !CURRENCIES.includes(to)) throw Error('Invalid money');
  if (from === to) return cents;
  const rates = typeof reference === 'number' ? { USD: 1, CNY: reference } : reference?.rates || reference;
  const a = scaled(rates?.[from]), b = scaled(rates?.[to]);
  // Compute a cross-rate with a single integer rounding step.
  const result = (BigInt(cents) * b + a / 2n) / a;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('Converted amount too large');
  return Number(result);
}
function createFx({ dataDir, fetcher = fetch, clock = Date.now, endpoint = process.env.NODE_ENV === 'test' && process.env.FX_TEST_URL || URL }) {
  const file = path.join(dataDir, 'fx-current.json');
  let cached = null, pending = null, nextTry = 0, lastError = false;
  function validDate(date) {
    if (!/^\d{4}-\d\d-\d\d$/.test(date || '') || date > new Date(clock()).toISOString().slice(0, 10) || !Number.isFinite(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) throw Error('Invalid rate date');
    return date;
  }
  function valid(value) {
    if (value?.base !== 'USD') throw Error('Invalid reference base');
    const rates = { USD: 1 }, quoteDates = {};
    for (const c of ['CNY', 'CAD', 'HKD']) {
      rates[c] = Number(scaled(value.rates?.[c])) / 1e8;
      quoteDates[c] = validDate(value.quoteDates?.[c] || value.date);
    }
    return { base: 'USD', quote: 'CNY', rate: rates.CNY, rates, quoteDates,
      date: Object.values(quoteDates).sort()[0], fetchedAt: value.fetchedAt };
  }
  function parse(rows) {
    if (!Array.isArray(rows) || rows.length !== 3) throw Error('Incomplete reference rates');
    const rates = {}, quoteDates = {};
    for (const row of rows) {
      if (row.base !== 'USD' || !['CNY', 'CAD', 'HKD'].includes(row.quote) || rates[row.quote] !== undefined) throw Error('Unexpected reference currency');
      rates[row.quote] = row.rate; quoteDates[row.quote] = row.date;
    }
    return valid({ base: 'USD', rates, quoteDates, fetchedAt: new Date(clock()).toISOString() });
  }
  try { cached = valid(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch {}
  function output(error) {
    return cached ? { ...cached, available: true, source: 'Frankfurter · 最新参考汇率', sourceUrl: 'https://frankfurter.dev/',
      stale: cached.date !== new Date(clock()).toISOString().slice(0, 10), refreshError: !!error } :
      { available: false, source: 'Frankfurter', error: '暂时无法获取完整汇率；仍可记录和查看四种原币账目。' };
  }
  async function refresh() {
    try {
      const response = await fetcher(endpoint, { signal: AbortSignal.timeout(6000), redirect: 'error' });
      if (!response.ok) throw Error('Rate service');
      const text = await response.text(); if (text.length > 12000) throw Error('Rate response too large');
      const next = parse(JSON.parse(text));
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(next), { mode: 0o600 }); fs.renameSync(tmp, file);
      cached = next; lastError = false; return output(false);
    } catch {
      lastError = true; nextTry = clock() + 60_000; return output(true);
    } finally { pending = null; }
  }
  return { async get() {
    if (cached?.date === new Date(clock()).toISOString().slice(0, 10)) return output(false);
    if (pending) return pending;
    if (clock() < nextTry) return output(lastError || !cached);
    nextTry = clock() + 3600_000; pending = refresh(); return pending;
  } };
}
module.exports = { createFx, convert, scaled, URL, CURRENCIES };
