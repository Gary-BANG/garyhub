'use strict';
// A-share price alerts (v2.4.1.3). An alert fires once when the quote crosses its price during trading hours,
// then becomes an in-app notification (and a push, when the account has a subscribed browser).
// Routes sit under /api/stocks, so the existing subscriber gate of stock-api.js applies before any of them.
const crypto = require('node:crypto');
const {market, symbolPattern, fail} = require('./stock-market');
const {localParts} = require('./reminder-utils');

const LIMITS = {standard: 3, vip: 20};
const KEEP = 60;
const wrap = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res, next)).catch(error => {
  if (!error.status) return next(error);
  res.status(error.status).json({message: error.message});
});

async function migrate(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS stock_alerts(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,symbol TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',direction TEXT NOT NULL CHECK(direction IN('above','below')),price INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,triggered_at TEXT,triggered_price INTEGER)`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_stock_alerts_user ON stock_alerts(user_id,triggered_at)');
}

// Prices are kept in thousandths of a yuan so three-decimal quotes compare exactly.
function parsePrice(value) {
  if (typeof value !== 'string' || !/^\d{1,6}(?:\.\d{1,3})?$/.test(value)) throw fail(422, '请填写有效的提醒价格（最多三位小数）');
  const [whole, part = ''] = value.split('.');
  const price = Number(whole) * 1000 + Number(part.padEnd(3, '0'));
  if (price <= 0) throw fail(422, '提醒价格应大于 0');
  return price;
}
const showPrice = price => (price / 1000).toFixed(3).replace(/0$/, '');
const output = row => ({id: row.id, symbol: row.symbol, name: row.name, direction: row.direction, price: showPrice(row.price),
  createdAt: row.created_at, triggeredAt: row.triggered_at, triggeredPrice: row.triggered_price === null ? null : showPrice(row.triggered_price)});

// Shanghai/Shenzhen/Beijing continuous trading: weekdays 09:30–11:30 and 13:00–15:00, China time. Holidays simply return no new quote.
function trading(now = new Date()) {
  const day = new Intl.DateTimeFormat('en-US', {timeZone: 'Asia/Shanghai', weekday: 'short'}).format(now);
  if (day === 'Sat' || day === 'Sun') return false;
  const {time} = localParts(now, 'Asia/Shanghai');
  return (time >= '09:30' && time <= '11:30') || (time >= '13:00' && time <= '15:00');
}

async function checkAlerts({db, provider, notify = async () => {}, now = new Date(), force = false}) {
  if (!force && !trading(now)) return {checked: 0, triggered: 0};
  const symbols = await db.all('SELECT DISTINCT symbol FROM stock_alerts WHERE triggered_at IS NULL ORDER BY symbol LIMIT 120');
  let triggered = 0;
  for (const {symbol} of symbols) {
    let quote;
    try { quote = await provider.quote(symbol); } catch { continue; }
    if (!quote || typeof quote.price !== 'number' || !(quote.price > 0) || quote.stale) continue;
    const current = Math.round(quote.price * 1000);
    const due = await db.all(`SELECT a.* FROM stock_alerts a JOIN users u ON u.id=a.user_id
      WHERE a.symbol=? AND a.triggered_at IS NULL AND u.enabled=1
        AND ((a.direction='above' AND a.price<=?) OR (a.direction='below' AND a.price>=?))`, [symbol, current, current]);
    for (const alert of due) {
      const claim = await db.run('UPDATE stock_alerts SET triggered_at=?,triggered_price=? WHERE id=? AND triggered_at IS NULL',
        [now.toISOString(), current, alert.id]);
      if (!claim.changes) continue;
      const name = alert.name || quote.name || symbol;
      const title = name + ' 到价提醒';
      const body = `${name}（${symbol.slice(2)}）现价 ${showPrice(current)}，已${alert.direction === 'above' ? '达到或高于' : '达到或低于'}你设定的 ${showPrice(alert.price)}。`;
      await db.run(`INSERT OR IGNORE INTO notifications(user_id,type,title,body,action_url,dedupe_key,scope) VALUES(?,'stock-alert',?,?,?,?,'tools')`,
        [alert.user_id, title, body, 'https://calendar.garyhub.uk/stocks/', 'stock-alert:' + alert.id]);
      await notify(alert.user_id, {title, body, url: 'https://calendar.garyhub.uk/stocks/', tag: 'stock-' + alert.id});
      triggered++;
    }
  }
  return {checked: symbols.length, triggered};
}

function register(app, {db}) {
  const state = async userId => {
    const user = await db.get('SELECT stock_vip FROM users WHERE id=?', [userId]);
    const vip = user?.stock_vip === 1;
    const alerts = await db.all('SELECT * FROM stock_alerts WHERE user_id=? ORDER BY triggered_at IS NOT NULL,created_at DESC,id', [userId]);
    return {accountId: userId, vip, limit: vip ? LIMITS.vip : LIMITS.standard, alerts: alerts.map(output)};
  };
  app.get('/api/stocks/alerts', wrap(async (req, res) => res.json(await state(req.stockUser))));
  app.post('/api/stocks/alerts', wrap(async (req, res) => {
    const {accountId, symbol, direction} = req.body || {};
    if (accountId !== req.stockUser) throw fail(409, '账号已变化，请刷新');
    if (typeof symbol !== 'string' || !symbolPattern.test(symbol)) throw fail(422, '请选择有效的 A 股代码');
    if (!['above', 'below'].includes(direction)) throw fail(422, '请选择高于或低于');
    const price = parsePrice(req.body.price);
    const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 40) : '';
    const current = await state(accountId);
    const active = current.alerts.filter(a => !a.triggeredAt);
    if (active.length >= current.limit) throw fail(422, `当前最多同时保留 ${current.limit} 个未触发的提醒` + (current.vip ? '' : '；A 股 VIP 可设置 ' + LIMITS.vip + ' 个'));
    if (active.some(a => a.symbol === symbol && a.direction === direction && a.price === showPrice(price))) throw fail(409, '已有相同的提醒');
    await db.run('INSERT INTO stock_alerts(id,user_id,symbol,name,direction,price) VALUES(?,?,?,?,?,?)',
      [crypto.randomUUID(), accountId, symbol, name, direction, price]);
    // Old fired alerts fall off so the list stays short.
    await db.run(`DELETE FROM stock_alerts WHERE user_id=? AND triggered_at IS NOT NULL AND id NOT IN
      (SELECT id FROM stock_alerts WHERE user_id=? ORDER BY created_at DESC,id LIMIT ?)`, [accountId, accountId, KEEP]);
    res.status(201).json(await state(accountId));
  }));
  app.delete('/api/stocks/alerts/:id', wrap(async (req, res) => {
    if (req.body?.accountId !== req.stockUser) throw fail(409, '账号已变化，请刷新');
    const result = await db.run('DELETE FROM stock_alerts WHERE id=? AND user_id=?', [req.params.id, req.stockUser]);
    if (!result.changes) throw fail(404, '提醒不存在');
    res.json(await state(req.stockUser));
  }));
}

function start(db, notify, provider = market()) {
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try { await checkAlerts({db, provider, notify}); }
    catch (error) { console.error('Stock alert check failed:', error.code || error.name || 'error'); }
    finally { busy = false; }
  }, 60_000);
  timer.unref();
  return timer;
}

module.exports = {migrate, register, start, checkAlerts, trading, parsePrice, showPrice, LIMITS};
