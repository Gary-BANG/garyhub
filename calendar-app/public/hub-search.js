/* GaryHub search panel (v2.4.1.3): Ctrl/⌘+K or "/" opens it. Tools and pages are matched in the browser;
   a signed-in account also searches its own schedule, to-dos, journal, ledger notes, research terms and lectures
   through /api/hub/search. Everything is rendered as text, never as markup. */
(() => {
  'use strict';
  if (window.GaryHubSearch) return;
  const TEXT = {
    zh: {button: '搜索', label: '搜索 GaryHub', placeholder: '搜索工具、日程、待办、日记、账本、词典…', hint: '↑↓ 选择 · Enter 打开 · Esc 关闭',
      guest: '登录后还可以搜索你的日程、待办、日记、账本、科研词典和讲义。', empty: '没有找到匹配的内容。', start: '输入关键词开始搜索。',
      busy: '搜索过于频繁，请稍后再试。', failed: '记录暂时无法搜索，工具和页面仍可使用。', done: '已完成',
      groups: {tool: '工具', page: '页面', task: '日程', todo: '待办', diary: '日记', ledger: '账本', research: '科研词典', lecture: '讲义'},
      kinds: {expense: '支出', income: '收入', refund: '退款'}},
    en: {button: 'Search', label: 'Search GaryHub', placeholder: 'Search tools, schedule, to-dos, journal, ledger, terms…', hint: '↑↓ to move · Enter to open · Esc to close',
      guest: 'Sign in to also search your schedule, to-dos, journal, ledger, research terms and lectures.', empty: 'Nothing matched.', start: 'Type to search.',
      busy: 'Too many searches; try again in a moment.', failed: 'Your records cannot be searched right now; tools and pages still work.', done: 'Done',
      groups: {tool: 'Tools', page: 'Pages', task: 'Schedule', todo: 'To-dos', diary: 'Journal', ledger: 'Ledger', research: 'Research Dictionary', lecture: 'Lectures'},
      kinds: {expense: 'Expense', income: 'Income', refund: 'Refund'}}
  };
  const TOOLS = {grades: 'https://tools.garyhub.uk/grades/', study: 'https://tools.garyhub.uk/study/', lab: 'https://lab.garyhub.uk/lab/',
    research: 'https://calendar.garyhub.uk/research/', calendar: 'https://calendar.garyhub.uk/', files: 'https://files.garyhub.uk/',
    stocks: 'https://calendar.garyhub.uk/stocks/', reading: 'https://rss.garyhub.uk/', status: 'https://kuma.garyhub.uk/',
    'server-monitor': 'https://tools.garyhub.uk/server-monitor/', 'ai-logs': 'https://tools.garyhub.uk/ai-logs/', access: 'https://lab.garyhub.uk/access/',
    totp: 'https://tools.garyhub.uk/totp/', eraser: 'https://tools.garyhub.uk/useful/image-eraser/', markdown: 'https://tools.garyhub.uk/useful/markdown-viewer/',
    pdf: 'https://tools.garyhub.uk/useful/pdf-gray/'};
  const PAGES = [
    {zh: '主页', en: 'Home', url: 'https://garyhub.uk/', keys: 'home homepage 首页 主页'},
    {zh: '工具台', en: 'Tools', url: 'https://tools.garyhub.uk/', keys: 'tools 工具台 工具箱'},
    {zh: '日记', en: 'Journal', url: 'https://calendar.garyhub.uk/journal/', keys: 'journal diary 日记'},
    {zh: '健康记录', en: 'Health records', url: 'https://calendar.garyhub.uk/health-records/', keys: 'health weight exercise 健康 体重 运动 锻炼'},
    {zh: '记账', en: 'Ledger', url: 'https://calendar.garyhub.uk/ledger/', keys: 'ledger money expense budget 记账 账本 收支 预算'},
    {zh: '固定开支', en: 'Fixed expenses', url: 'https://calendar.garyhub.uk/ledger/fixed/', keys: 'fixed expenses subscription 固定开支 订阅'},
    {zh: '待办清单', en: 'To-do list', url: 'https://calendar.garyhub.uk/todos/', keys: 'todo todos 待办 清单'},
    {zh: '设置', en: 'Settings', url: 'https://tools.garyhub.uk/personalize/', keys: 'personalize settings preferences 个性化 设置 外观 主题 语言 时区 伙伴'},
    {zh: '外站与课程', en: 'Elsewhere', url: 'https://sites.garyhub.uk/', keys: 'elsewhere sites course 外站 课程'},
    {zh: '游戏厅', en: 'Games', url: 'https://games.garyhub.uk/', keys: 'games game daydreamer play 游戏 游戏厅 白日梦想家 小游戏'}
  ];
  const lang = () => window.GaryHubI18n?.language === 'en' ? 'en' : 'zh';
  const t = () => TEXT[lang()];
  const account = () => window.GaryHubIdentity?.user || (typeof state === 'object' && state && state.me) || null;
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null && text !== '') node.textContent = text; return node; };
  const norm = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('en').trim().replace(/\s+/g, ' ');
  const permitted = (tool, user) => tool.audience === 'paid-only' ? user?.accountTier === 'subscriber' : !tool.audience || user?.role === 'admin' || tool.audience === 'subscriber' && user?.accountTier === 'subscriber';

  let root = null, input, list, status, opener = null, rows = [], active = -1, ticket = 0, timer = 0, remote = [], remoteFor = '', notice = '';
  function catalog() {
    if (window.GaryHubTools || document.querySelector('script[data-gh-catalog]')) return;
    const script = document.createElement('script');
    script.src = '/tools-catalog.js'; script.dataset.ghCatalog = '';
    script.onload = () => { if (root && !root.hidden) render(); };
    document.head.append(script);
  }
  function local(query) {
    const user = account(), language = lang(), tokens = norm(query).split(' ').filter(Boolean), groups = [];
    if (!tokens.length) return groups;
    const tools = (window.GaryHubTools?.tools || []).filter(tool => TOOLS[tool.id] && permitted(tool, user) && window.GaryHubTools.matches(tool, query))
      .slice(0, 6).map(tool => ({title: tool.name[language], detail: tool.short[language], url: TOOLS[tool.id]}));
    if (tools.length) groups.push({type: 'tool', items: tools});
    const pages = PAGES.filter(page => tokens.every(token => norm(page.zh + ' ' + page.en + ' ' + page.keys).includes(token)))
      .slice(0, 5).map(page => ({title: page[language], detail: new URL(page.url).hostname, url: page.url}));
    if (pages.length) groups.push({type: 'page', items: pages});
    return groups;
  }
  function render() {
    const query = input.value.trim(), text = t(), groups = [...local(query), ...(remoteFor === query ? remote : [])];
    list.replaceChildren(); rows = [];
    for (const group of groups) {
      const section = el('li', 'gh-search-group'); section.setAttribute('role', 'presentation');
      section.append(el('div', 'gh-search-heading', text.groups[group.type] || group.type));
      const items = el('ul'); items.setAttribute('role', 'group');
      for (const item of group.items) {
        const link = el('a', 'gh-search-row'); link.href = item.url; link.setAttribute('role', 'option'); link.id = 'gh-search-option-' + rows.length;
        const main = el('span', 'gh-search-main'); main.append(el('span', 'gh-search-title', item.title));
        const shown = String(item.detail || '').replace(/\d{4}-\d{2}-\d{2}/g, date => window.GaryHubPrefs?.formatDate(date) ?? date);
        const detail = [item.kind ? text.kinds[item.kind] : '', shown, item.done ? text.done : ''].filter(Boolean).join(' · ');
        if (detail) main.append(el('span', 'gh-search-detail', detail));
        link.append(main);
        if (item.snippet) link.append(el('span', 'gh-search-snippet', item.snippet));
        const row = el('li'); row.setAttribute('role', 'presentation'); row.append(link); items.append(row); rows.push(link);
      }
      section.append(items); list.append(section);
    }
    status.textContent = notice || (!query ? (account() ? text.start : text.guest) : rows.length ? (account() ? '' : text.guest) : text.empty);
    select(rows.length ? 0 : -1);
  }
  function select(index) {
    active = index;
    rows.forEach((row, i) => row.setAttribute('aria-selected', String(i === index)));
    if (index >= 0) { input.setAttribute('aria-activedescendant', rows[index].id); rows[index].scrollIntoView({block: 'nearest'}); }
    else input.removeAttribute('aria-activedescendant');
  }
  async function query() {
    const value = input.value.trim(), mine = ++ticket;
    notice = '';
    if (!value || !account()) { remote = []; remoteFor = value; render(); return; }
    try {
      const response = await fetch('/api/hub/search?q=' + encodeURIComponent(value), {cache: 'no-store', credentials: 'same-origin'});
      if (mine !== ticket) return;
      if (response.status === 429) notice = t().busy;
      else if (response.status === 401) { remote = []; remoteFor = value; render(); return; }
      else if (!response.ok) notice = t().failed;
      const data = response.ok ? await response.json() : {groups: []};
      if (mine !== ticket) return;
      remote = Array.isArray(data.groups) ? data.groups : []; remoteFor = value;
    } catch { if (mine !== ticket) return; remote = []; remoteFor = value; notice = t().failed; }
    render();
  }
  function build() {
    root = el('div', 'gh-search'); root.hidden = true; root.dataset.i18nIgnore = '';
    const dialog = el('div', 'gh-search-dialog'); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
    const field = el('div', 'gh-search-field');
    field.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';
    input = el('input'); input.type = 'search'; input.maxLength = 80; input.autocomplete = 'off'; input.spellcheck = false;
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'true'); input.setAttribute('aria-controls', 'gh-search-results');
    field.append(input);
    list = el('ul', 'gh-search-results'); list.id = 'gh-search-results'; list.setAttribute('role', 'listbox');
    status = el('p', 'gh-search-status'); status.setAttribute('role', 'status');
    const foot = el('p', 'gh-search-hint');
    dialog.append(field, list, status, foot); root.append(dialog); document.body.append(root);
    const texts = () => { const text = t(); dialog.setAttribute('aria-label', text.label); input.placeholder = text.placeholder; input.setAttribute('aria-label', text.label); foot.textContent = text.hint; };
    texts();
    document.addEventListener('garyhub:language', () => { texts(); labelButtons(); if (!root.hidden) render(); });
    input.addEventListener('input', () => { clearTimeout(timer); ++ticket; notice = ''; render(); timer = setTimeout(query, 260); });
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (rows.length) select((active + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length); }
      else if (event.key === 'Enter' && !event.isComposing && active >= 0) { event.preventDefault(); rows[active].click(); }
    });
    root.addEventListener('mousedown', event => { if (event.target === root) close(); });
    root.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
    list.addEventListener('click', event => { if (event.target.closest('a')) close(false); });
  }
  function open() {
    if (!root) build();
    if (!root.hidden) { input.select(); return; }
    opener = document.activeElement; catalog();
    root.hidden = false; document.documentElement.classList.add('gh-search-open');
    render(); input.focus(); input.select();
    if (input.value.trim()) query();
  }
  function close(refocus = true) {
    if (!root || root.hidden) return;
    root.hidden = true; document.documentElement.classList.remove('gh-search-open'); clearTimeout(timer); ++ticket;
    if (refocus && opener && document.contains(opener)) opener.focus();
  }
  const buttons = [];
  function labelButtons() { for (const button of buttons) { button.querySelector('span').textContent = t().button; button.setAttribute('aria-label', t().label); } }
  function mount() {
    for (const host of document.querySelectorAll('[data-gh-search-host]')) {
      if (host.querySelector('.gh-search-button')) continue;
      const button = el('button', 'gh-search-button'); button.type = 'button'; button.dataset.i18nIgnore = '';
      button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><span></span><kbd>' + (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K') + '</kbd>';
      button.addEventListener('click', open); buttons.push(button); host.prepend(button);
    }
    labelButtons();
  }
  document.addEventListener('keydown', event => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') { event.preventDefault(); open(); }
    else if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); open(); }
  });
  document.addEventListener('garyhub:identity', () => { if (root && !root.hidden) query(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once: true}); else mount();
  window.GaryHubSearch = {open, close};
})();
