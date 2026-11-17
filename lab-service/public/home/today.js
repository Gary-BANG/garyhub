/* Homepage "today" panel (v2.4.1.3): for a signed-in account the first screen shows today's schedule, open to-dos,
   the lecture being read and unread notices, read from /api/hub/today. Guests keep the plain welcome page.
   Loaded in <head> so a returning signed-in visitor gets the compact layout before the first paint. */
(() => {
  'use strict';
  const KEY = 'garyhub.home.signedIn', root = document.documentElement;
  try { if (localStorage.getItem(KEY) === '1') root.classList.add('gh-signed-in'); } catch {}
  const TEXT = {
    zh: {title: '今天', hello: name => '你好，' + name, schedule: '今日日程', todos: '待办', study: '在读讲义', notices: '未读通知',
      none: '今天没有安排', overdue: n => n + ' 项已逾期', more: n => '另有 ' + n + ' 项', allDone: '没有未完成的待办', noStudy: '还没有在读的讲义',
      progress: (done, total) => '已学 ' + done + ' / ' + total, noNotice: '没有未读通知', unread: n => n + ' 条未读',
      openCalendar: '打开日历', openTodos: '查看待办', openStudy: '进入学习中心', openNotices: '查看通知', points: n => n + ' 个子项未完成',
      failed: '今日内容暂时无法加载。', until: date => '至 ' + date},
    en: {title: 'Today', hello: name => 'Hello, ' + name, schedule: 'Schedule', todos: 'To-dos', study: 'Reading', notices: 'Unread notices',
      none: 'Nothing scheduled today', overdue: n => n + ' overdue', more: n => n + ' more', allDone: 'No open to-dos', noStudy: 'No lecture in progress',
      progress: (done, total) => done + ' of ' + total + ' studied', noNotice: 'No unread notices', unread: n => n + ' unread',
      openCalendar: 'Open calendar', openTodos: 'View to-dos', openStudy: 'Open Study Hub', openNotices: 'View notices', points: n => n + ' open points',
      failed: "Today's summary cannot be loaded right now.", until: date => 'until ' + date}
  };
  const lang = () => window.GaryHubI18n?.language === 'en' ? 'en' : 'zh';
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null && text !== '') node.textContent = text; return node; };
  let user = null, data = null, failed = false, loadedAt = 0, loading = false, panel = null;

  function card(kind, label, count, lines, empty, action) {
    const box = el('article', 'today-card today-' + kind), head = el('div', 'today-head');
    head.append(el('span', 'today-label', label), el('strong', 'today-count', count == null ? '' : String(count)));
    box.append(head);
    const body = el('ul', 'today-lines');
    for (const line of lines) { const item = el('li'); item.append(el('span', 'today-line', line.text)); if (line.note) item.append(el('small', '', line.note)); body.append(item); }
    if (lines.length) box.append(body); else box.append(el('p', 'today-empty', empty));
    if (action.href) { const link = el('a', 'today-go', action.label); link.href = action.href; box.append(link); }
    else { const button = el('button', 'today-go', action.label); button.type = 'button'; button.onclick = action.run; box.append(button); }
    return box;
  }
  function render() {
    if (!panel) return;
    if (!user) { panel.hidden = true; panel.replaceChildren(); return; }
    const t = TEXT[lang()], locale = lang() === 'en' ? 'en-US' : 'zh-CN';
    const head = el('div', 'today-top'), title = el('h2', '', t.title);
    title.id = 'today-title';
    if (data?.date) title.append(el('span', 'today-date', new Intl.DateTimeFormat(locale, {timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'long'}).format(new Date(data.date + 'T00:00:00Z'))));
    head.append(title, el('p', 'today-hello', t.hello(user.username)));
    const grid = el('div', 'today-grid');
    if (!data) grid.append(el('p', 'today-empty today-wide', failed ? t.failed : '…'));
    else {
      const tasks = data.tasks.items.slice(0, 3).map(task => ({text: task.title, note: task.endDate > data.date ? t.until(task.endDate) : ''}));
      if (data.tasks.count > tasks.length) tasks.push({text: t.more(data.tasks.count - tasks.length)});
      if (data.overdue) tasks.push({text: t.overdue(data.overdue), note: ''});
      grid.append(card('schedule', t.schedule, data.tasks.count, tasks, t.none, {label: t.openCalendar, href: data.links.calendar}));
      const todos = data.todos.items.slice(0, 3).map(todo => ({text: todo.title, note: todo.openPoints ? t.points(todo.openPoints) : ''}));
      if (data.todos.count > todos.length) todos.push({text: t.more(data.todos.count - todos.length)});
      grid.append(card('todos', t.todos, data.todos.count, todos, t.allDone, {label: t.openTodos, href: data.links.todos}));
      const study = data.study || {total: 0, done: 0, doing: 0, current: null};
      grid.append(card('study', t.study, study.doing || null, study.current ? [{text: study.current.title, note: study.current.course}] : [],
        t.noStudy, {label: study.total ? t.progress(study.done, study.total) + ' · ' + t.openStudy : t.openStudy, href: 'https://tools.garyhub.uk/study/'}));
      grid.append(card('notices', t.notices, data.unread, data.unread ? [{text: t.unread(data.unread)}] : [], t.noNotice,
        {label: t.openNotices, run: () => { const bell = document.querySelector('[data-hub-account] [aria-controls="gh-notices"]'); if (bell) { bell.scrollIntoView({block: 'nearest'}); if (bell.getAttribute('aria-expanded') !== 'true') bell.click(); bell.focus(); } }}));
    }
    panel.replaceChildren(head, grid);
    panel.hidden = false;
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
    if (changed) { data = null; failed = false; loadedAt = 0; render(); }
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
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(true); });
  const ready = () => { panel = document.getElementById('today'); render(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, {once: true}); else ready();
})();
