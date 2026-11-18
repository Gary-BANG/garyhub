'use strict';
// Today summary and cross-record search for the signed-in account (v2.4.1.3).
// Both are read-only and only ever look at rows owned by the session user.
const {VISIBLE_SQL} = require('./notification-policy');
const {localParts} = require('./reminder-utils');
const {rateLimit} = require('./rate-limit');
const {createFx, convert} = require('./fx-rates');

const BASE = () => (process.env.APP_BASE_URL || 'https://calendar.garyhub.uk').replace(/\/+$/, '');
const route = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const LIMIT = 6;

function localDate(timezone, now = new Date()) {
  try { return localParts(now, timezone || 'Etc/UTC').date; }
  catch { return localParts(now, 'Etc/UTC').date; }
}
function parse(text, fallback) {
  try { const value = JSON.parse(text); return value ?? fallback; } catch { return fallback; }
}

// v2.4.1.6: the "this month's budget" card, from the ledger's "all spending" budget. Spending is counted as the ledger
// counts it (expenses minus refunds) for the account's current month, in the budget's currency. Rates come from the
// ledger's cached file only, so the summary never waits for the network; without them a mixed-currency month shows no total.
const cachedRates = dataDir => () => dataDir ? createFx({dataDir, fetcher: async () => { throw Error('cache only'); }}).get() : {available: false};
async function budget(db, userId, date, rates) {
  let row;
  try { row = await db.get("SELECT currency,amount FROM ledger_budgets WHERE user_id=? AND category_id='*'", [userId]); }
  catch { return null; }
  if (!row) return null;
  const month = date.slice(0, 7);
  const entries = await db.all(`SELECT kind,currency,amount FROM ledger_entries WHERE user_id=? AND kind IN ('expense','refund')
    AND date BETWEEN ? AND ?`, [userId, month + '-01', month + '-31']);
  let spent = 0, rate = null;
  try {
    for (const entry of entries) {
      let value = entry.amount;
      if (entry.currency !== row.currency) {
        rate = rate || await rates();
        if (!rate.available) throw Error('rates');
        value = convert(entry.amount, entry.currency, row.currency, rate.rates || rate.rate);
      }
      spent += entry.kind === 'refund' ? -value : value;
    }
  } catch { spent = null; }
  return {month, currency: row.currency, amount: row.amount, spent, url: BASE() + '/ledger/'};
}

async function today(db, userId, now = new Date(), {rates = () => ({available: false})} = {}) {
  const user = await db.get('SELECT timezone FROM users WHERE id=?', [userId]);
  const date = localDate(user?.timezone, now);
  const tasks = await db.all(`SELECT t.id,t.title,t.start_date,t.end_date,t.status,c.color AS category_color
    FROM tasks t LEFT JOIN categories c ON c.id=t.category_id AND c.user_id=t.user_id
    WHERE t.user_id=? AND t.status<>'done' AND t.start_date<=? AND t.end_date>=?
    ORDER BY t.end_date,t.start_date,t.created_at,t.id LIMIT 200`, [userId, date, date]);
  const overdue = await db.get("SELECT COUNT(*) AS n FROM tasks WHERE user_id=? AND status<>'done' AND end_date<?", [userId, date]);
  const list = await db.get('SELECT state FROM todo_lists WHERE user_id=?', [userId]);
  const open = parse(list?.state, []).filter(todo => todo && todo.done === false);
  const unread = await db.get(`SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND ${VISIBLE_SQL} AND read_at IS NULL`, [userId]);
  return {
    accountId: userId, date,
    tasks: {count: tasks.length, items: tasks.slice(0, 5).map(t => ({id: t.id, title: t.title, startDate: t.start_date,
      endDate: t.end_date, status: t.status, color: t.category_color || null}))},
    overdue: overdue.n,
    todos: {count: open.length, items: open.slice(0, 5).map(todo => ({id: todo.id, title: todo.title,
      openPoints: Array.isArray(todo.points) ? todo.points.filter(p => p && p.done === false).length : 0}))},
    unread: unread.n,
    budget: await budget(db, userId, date, rates),
    links: {calendar: BASE() + '/', todos: BASE() + '/todos/'}
  };
}

const like = q => '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
function snippet(text, q, size = 80) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  const at = value.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());
  if (at < 0 || value.length <= size) return value.slice(0, size) + (value.length > size ? '…' : '');
  const start = Math.max(0, at - Math.floor((size - q.length) / 2));
  return (start ? '…' : '') + value.slice(start, start + size) + (start + size < value.length ? '…' : '');
}
const has = (value, needle) => typeof value === 'string' && value.toLocaleLowerCase().includes(needle);

async function search(db, userId, query) {
  const q = String(query || '').trim();
  if (!q || q.length > 80) throw Object.assign(Error('请输入 1–80 个字符的搜索内容'), {status: 400});
  const pattern = like(q), needle = q.toLocaleLowerCase(), base = BASE(), groups = [];
  const add = (type, items) => { if (items.length) groups.push({type, items: items.slice(0, LIMIT)}); };

  const tasks = await db.all(`SELECT id,title,note,start_date,end_date,status FROM tasks
    WHERE user_id=? AND (title LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\')
    ORDER BY start_date DESC,id LIMIT ?`, [userId, pattern, pattern, LIMIT]);
  add('task', tasks.map(t => ({title: t.title, detail: t.start_date === t.end_date ? t.start_date : t.start_date + ' → ' + t.end_date,
    snippet: has(t.title, needle) ? '' : snippet(t.note, q), done: t.status === 'done', url: base + '/?date=' + t.start_date})));

  const list = await db.get('SELECT state FROM todo_lists WHERE user_id=?', [userId]);
  const todos = [];
  for (const todo of parse(list?.state, [])) {
    if (!todo || typeof todo.title !== 'string') continue;
    const point = Array.isArray(todo.points) ? todo.points.find(p => p && has(p.text, needle)) : null;
    if (has(todo.title, needle) || point) todos.push({title: todo.title, detail: '', snippet: has(todo.title, needle) ? '' : snippet(point.text, q),
      done: todo.done === true, url: base + '/todos/'});
    if (todos.length >= LIMIT) break;
  }
  add('todo', todos);

  const diary = await db.all(`SELECT entry_date,title,body FROM diary_entries
    WHERE user_id=? AND (title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')
    ORDER BY entry_date DESC LIMIT ?`, [userId, pattern, pattern, LIMIT]);
  add('diary', diary.map(d => ({title: d.title || d.entry_date, detail: d.entry_date, snippet: has(d.title, needle) ? '' : snippet(d.body, q),
    url: base + '/journal/?date=' + d.entry_date})));

  const ledger = await db.all(`SELECT id,date,kind,currency,amount,notes FROM ledger_entries
    WHERE user_id=? AND notes LIKE ? ESCAPE '\\' ORDER BY date DESC,id LIMIT ?`, [userId, pattern, LIMIT]);
  add('ledger', ledger.map(e => ({title: e.currency + ' ' + (e.amount / 100).toFixed(2), detail: e.date, kind: e.kind, snippet: snippet(e.notes, q),
    url: base + '/ledger/?entry=' + encodeURIComponent(e.id) + '&from=' + e.date + '&to=' + e.date})));

  const projects = await db.all('SELECT id,name,entries FROM research_projects WHERE user_id=? ORDER BY updated_at DESC,id LIMIT 50', [userId]);
  const terms = [];
  outer: for (const project of projects) {
    for (const entry of parse(project.entries, [])) {
      if (!entry) continue;
      const english = Array.isArray(entry.english) ? entry.english : [], chinese = Array.isArray(entry.chinese) ? entry.chinese : [];
      const named = [...english, ...chinese].some(word => has(word, needle));
      if (!named && !has(entry.definition, needle)) continue;
      terms.push({title: [english[0], chinese[0]].filter(Boolean).join(' · ') || project.name, detail: project.name,
        snippet: named ? snippet(entry.definition, '', 80) : snippet(entry.definition, q), url: base + '/research/?project=' + encodeURIComponent(project.id)});
      if (terms.length >= LIMIT) break outer;
    }
  }
  add('research', terms);
  return {accountId: userId, q, groups};
}

function register(app, {db, requireLogin, dataDir}) {
  const rates = cachedRates(dataDir);
  app.get('/api/hub/today', requireLogin, route(async (req, res) => res.json(await today(db, req.session.user.id, new Date(), {rates}))));
  app.get('/api/hub/search', requireLogin, rateLimit(90, 60_000), route(async (req, res) => {
    try { res.json(await search(db, req.session.user.id, req.query.q)); }
    catch (error) { if (!error.status) throw error; res.status(error.status).json({message: error.message}); }
  }));
}

module.exports = {register, today, search, snippet, localDate, budget};
