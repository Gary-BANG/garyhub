/* Homepage "today" panel (v2.4.1.3): for a signed-in account the first screen shows today's schedule, open to-dos,
   the lecture being read and unread notices, read from /api/hub/today. Guests keep the plain welcome page.
   v2.4.1.6: the account chooses which cards show and in what order (home.cards, with a "this month's budget" card),
   and the order of the entry cards below (home.portals); both are set in Settings → Homepage.
   Loaded in <head> so a returning signed-in visitor gets the compact layout before the first paint. */
(() => {
  'use strict';
  const KEY = 'garyhub.home.signedIn', root = document.documentElement;
  const SETTINGS = 'https://tools.garyhub.uk/personalize/#home';
  const CARDS = ['schedule', 'todos', 'study', 'notices', 'budget'], DEFAULT_CARDS = ['schedule', 'todos', 'study', 'notices'];
  const PORTALS = ['tools', 'calendar', 'study', 'sites'];
  try { if (localStorage.getItem(KEY) === '1') root.classList.add('gh-signed-in'); } catch {}
  const TEXT = {
    zh: {title: '今天', hello: name => '你好，' + name, schedule: '今日日程', todos: '待办', study: '在读讲义', notices: '未读通知',
      none: '今天没有安排', overdue: n => n + ' 项已逾期', more: n => '另有 ' + n + ' 项', allDone: '没有未完成的待办', noStudy: '还没有在读的讲义',
      progress: (done, total) => '已学 ' + done + ' / ' + total, noNotice: '没有未读通知', unread: n => n + ' 条未读',
      openCalendar: '打开日历', openTodos: '查看待办', openStudy: '进入学习中心', openNotices: '查看通知', points: n => n + ' 个子项未完成',
      failed: '今日内容暂时无法加载。', until: date => '至 ' + date,
      budget: '本月预算', noBudget: '还没有设置“全部消费”的月度预算', openLedger: '打开记账', spent: (used, total) => '已用 ' + used + ' / ' + total,
      left: value => '剩余 ' + value, over: value => '超出 ' + value, noRates: '汇率暂不可用，暂时无法合计', customize: '自定义', noCards: '今日卡片都已隐藏。'},
    en: {title: 'Today', hello: name => 'Hello, ' + name, schedule: 'Schedule', todos: 'To-dos', study: 'Reading', notices: 'Unread notices',
      none: 'Nothing scheduled today', overdue: n => n + ' overdue', more: n => n + ' more', allDone: 'No open to-dos', noStudy: 'No lecture in progress',
      progress: (done, total) => done + ' of ' + total + ' studied', noNotice: 'No unread notices', unread: n => n + ' unread',
      openCalendar: 'Open calendar', openTodos: 'View to-dos', openStudy: 'Open Study Hub', openNotices: 'View notices', points: n => n + ' open points',
      failed: "Today's summary cannot be loaded right now.", until: date => 'until ' + date,
      budget: 'Budget this month', noBudget: 'No monthly budget for all spending yet', openLedger: 'Open ledger', spent: (used, total) => used + ' of ' + total + ' spent',
      left: value => value + ' left', over: value => value + ' over', noRates: 'Exchange rates unavailable; no total yet', customize: 'Customize', noCards: 'All of today’s cards are hidden.'}
  };
  const lang = () => window.GaryHubI18n?.language === 'en' ? 'en' : 'zh';
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null && text !== '') node.textContent = text; return node; };
  const pref = key => { const value = window.GaryHubPrefs?.get(key); return Array.isArray(value) ? value : null; };
  let user = null, data = null, failed = false, loadedAt = 0, loading = false, panel = null;

  function card(kind, label, count, lines, empty, action, meter) {
    const box = el('article', 'today-card today-' + kind), head = el('div', 'today-head');
    head.append(el('span', 'today-label', label), el('strong', 'today-count', count == null ? '' : String(count)));
    box.append(head);
    if (meter != null) {
      const bar = el('div', 'today-meter' + (meter > 100 ? ' over' : '')), fill = el('span');
      fill.style.width = Math.min(100, Math.max(0, meter)) + '%'; bar.append(fill); box.append(bar);
    }
    const body = el('ul', 'today-lines');
    for (const line of lines) { const item = el('li'); item.append(el('span', 'today-line', line.text)); if (line.note) item.append(el('small', '', line.note)); body.append(item); }
    if (lines.length) box.append(body); else box.append(el('p', 'today-empty', empty));
    if (action.href) { const link = el('a', 'today-go', action.label); link.href = action.href; box.append(link); }
    else { const button = el('button', 'today-go', action.label); button.type = 'button'; button.onclick = action.run; box.append(button); }
    return box;
  }
  function cards(t, locale) {
    const fmt = date => window.GaryHubPrefs?.formatDate(date) ?? date;
    return {
      schedule: () => {
        const tasks = data.tasks.items.slice(0, 3).map(task => ({text: task.title, note: task.endDate > data.date ? t.until(fmt(task.endDate)) : ''}));
        if (data.tasks.count > tasks.length) tasks.push({text: t.more(data.tasks.count - tasks.length)});
        if (data.overdue) tasks.push({text: t.overdue(data.overdue), note: ''});
        return card('schedule', t.schedule, data.tasks.count, tasks, t.none, {label: t.openCalendar, href: data.links.calendar});
      },
      todos: () => {
        const todos = data.todos.items.slice(0, 3).map(todo => ({text: todo.title, note: todo.openPoints ? t.points(todo.openPoints) : ''}));
        if (data.todos.count > todos.length) todos.push({text: t.more(data.todos.count - todos.length)});
        return card('todos', t.todos, data.todos.count, todos, t.allDone, {label: t.openTodos, href: data.links.todos});
      },
      study: () => {
        const study = data.study || {total: 0, done: 0, doing: 0, current: null};
        return card('study', t.study, study.doing || null, study.current ? [{text: study.current.title, note: study.current.course}] : [],
          t.noStudy, {label: study.total ? t.progress(study.done, study.total) + ' · ' + t.openStudy : t.openStudy, href: 'https://tools.garyhub.uk/study/'});
      },
      notices: () => card('notices', t.notices, data.unread, data.unread ? [{text: t.unread(data.unread)}] : [], t.noNotice,
        {label: t.openNotices, run: () => { const bell = document.querySelector('[data-hub-account] [aria-controls="gh-notices"]'); if (bell) { bell.scrollIntoView({block: 'nearest'}); if (bell.getAttribute('aria-expanded') !== 'true') bell.click(); bell.focus(); } }}),
      budget: () => {
        const b = data.budget, ledger = {label: t.openLedger, href: b?.url || 'https://calendar.garyhub.uk/ledger/'};
        if (!b) return card('budget', t.budget, null, [], t.noBudget, ledger);
        let money;
        try { const f = new Intl.NumberFormat(locale, {style: 'currency', currency: b.currency}); money = cents => f.format(cents / 100); }
        catch { money = cents => b.currency + ' ' + (cents / 100).toFixed(2); }
        if (b.spent == null) return card('budget', t.budget, null, [{text: money(b.amount)}, {text: t.noRates}], '', ledger);
        const left = b.amount - b.spent, used = b.amount > 0 ? Math.round(b.spent / b.amount * 100) : 0;
        return card('budget', t.budget, used + '%', [{text: t.spent(money(b.spent), money(b.amount))}, {text: left >= 0 ? t.left(money(left)) : t.over(money(-left))}], '', ledger, used);
      }
    };
  }
  function render() {
    if (!panel) return;
    if (!user) { panel.hidden = true; panel.replaceChildren(); return; }
    const t = TEXT[lang()], locale = lang() === 'en' ? 'en-US' : 'zh-CN';
    const head = el('div', 'today-top'), title = el('h2', '', t.title), side = el('div', 'today-side');
    title.id = 'today-title';
    if (data?.date) title.append(el('span', 'today-date', new Intl.DateTimeFormat(locale, {timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'long'}).format(new Date(data.date + 'T00:00:00Z'))));
    const edit = el('a', 'today-edit', t.customize); edit.href = SETTINGS;
    side.append(el('p', 'today-hello', t.hello(user.username)), edit);
    head.append(title, side);
    const grid = el('div', 'today-grid'), chosen = (pref('home.cards') || DEFAULT_CARDS).filter(kind => CARDS.includes(kind));
    grid.style.setProperty('--cards', String(Math.max(1, chosen.length)));
    if (!data) grid.append(el('p', 'today-empty today-wide', failed ? t.failed : '…'));
    else if (!chosen.length) grid.append(el('p', 'today-empty today-wide', t.noCards));
    else { const make = cards(t, locale); for (const kind of chosen) grid.append(make[kind]()); }
    panel.replaceChildren(head, grid);
    panel.hidden = false;
  }
  // The entry cards keep their markup; only their order follows the account's choice (unlisted ones keep theirs, after).
  function arrangePortals() {
    const grid = document.querySelector('.portal-grid');
    if (!grid) return;
    const order = pref('home.portals') || [], kind = node => PORTALS.find(name => node.classList.contains(name));
    const rank = node => { const at = order.indexOf(kind(node)); return at < 0 ? order.length + PORTALS.indexOf(kind(node)) : at; };
    const nodes = [...grid.querySelectorAll(':scope > a.portal')], sorted = [...nodes].sort((a, b) => rank(a) - rank(b));
    if (sorted.some((node, i) => node !== nodes[i])) for (const node of sorted) grid.append(node);
  }
  async function load(force) {
    if (!user || loading || (!force && Date.now() - loadedAt < 60000)) return;
    loading = true;
    const id = user.id;
    try {
      const response = await fetch('/api/hub/today', {cache: 'no-store', credentials: 'same-origin'});
      if (!response.ok) throw Error('today');
      const value = await response.json();
      if (user?.id !== id || value.accountId !== id) return;
      data = value; failed = false; loadedAt = Date.now();
    } catch { if (user?.id === id) { failed = true; loadedAt = Date.now() - 45000; } }
    finally { loading = false; render(); }
  }
  function apply(next) {
    const changed = next?.id !== user?.id;
    user = next;
    root.classList.toggle('gh-signed-in', !!user);
    try { if (user) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch {}
    if (changed) { data = null; failed = false; loadedAt = 0; render(); arrangePortals(); }
    load(changed);
  }
  // hub-account.js announces "no user" while it is still checking and whenever the tab is hidden, so a signed-out
  // state only counts once it has lasted a moment on a visible page.
  let pending = 0;
  document.addEventListener('garyhub:identity', event => {
    const next = event.detail?.user || null;
    clearTimeout(pending);
    if (next) apply(next);
    else if (!document.hidden) pending = setTimeout(() => apply(null), 1500);
  });
  document.addEventListener('garyhub:language', render);
  document.addEventListener('garyhub:preferences', () => { render(); arrangePortals(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(true); });
  const ready = () => { panel = document.getElementById('today'); render(); arrangePortals(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, {once: true}); else ready();
})();
