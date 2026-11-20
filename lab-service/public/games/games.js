/* GaryHub Games (v2.4.2.0): helpers shared by the lobby and each game on games.garyhub.uk — language, account,
   API calls with the page token, money formatting, the starry sky — and the lobby itself. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  // ---- Language: the shared garyhub_language cookie, and the account's choice through hub-prefs.js ----------------
  const COOKIE = 'garyhub_language';
  const readLang = () => (document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '=')) || '').split('=')[1] === 'en' ? 'en' : 'zh';
  let lang = readLang();
  const listeners = new Set();
  // The page's Chinese text is kept in data-zh the first time, so switching back restores it.
  function paint(root = document) {
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    for (const node of root.querySelectorAll('[data-en]')) { if (node.dataset.zh == null) node.dataset.zh = node.textContent; node.textContent = lang === 'en' ? node.dataset.en : node.dataset.zh; }
    for (const node of root.querySelectorAll('[data-en-placeholder]')) { if (node.dataset.zhPlaceholder == null) node.dataset.zhPlaceholder = node.placeholder; node.placeholder = lang === 'en' ? node.dataset.enPlaceholder : node.dataset.zhPlaceholder; }
    for (const node of root.querySelectorAll('[data-en-label]')) { if (node.dataset.zhLabel == null) node.dataset.zhLabel = node.getAttribute('aria-label') || ''; node.setAttribute('aria-label', lang === 'en' ? node.dataset.enLabel : node.dataset.zhLabel); }
    const title = document.querySelector('title');
    if (title?.dataset.en) { if (title.dataset.zh == null) title.dataset.zh = title.textContent; document.title = lang === 'en' ? title.dataset.en : title.dataset.zh; }
    const button = $('lang');
    if (button) button.textContent = lang === 'en' ? '中文' : 'English';
  }
  function setLanguage(value, {save = true} = {}) {
    if (value !== 'zh' && value !== 'en') return;
    lang = value;
    const domain = location.hostname.endsWith('garyhub.uk') ? '; Domain=.garyhub.uk' : '';
    document.cookie = COOKIE + '=' + lang + '; Path=/; Max-Age=31536000; SameSite=Lax' + domain + (location.protocol === 'https:' ? '; Secure' : '');
    paint();
    if (save) document.dispatchEvent(new CustomEvent('garyhub:language', {detail: {language: lang}}));
    for (const fn of listeners) { try { fn(lang); } catch {} }
  }
  // hub-prefs.js applies the account's language through this interface.
  window.GaryHubI18n = {get language() { return lang; }, setLanguage: value => setLanguage(value, {save: false})};
  const t = (zh, en) => lang === 'en' ? en : zh;

  // ---- Account and API ---------------------------------------------------------------------------------------------
  let csrf = null, me = null;
  async function request(path, {method = 'GET', body} = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const headers = {};
      if (method !== 'GET') {
        if (!csrf) csrf = (await (await fetch('/api/csrf', {cache: 'no-store', credentials: 'same-origin'})).json()).token;
        headers['Content-Type'] = 'application/json'; headers['X-CSRF-Token'] = csrf;
      }
      const response = await fetch(path, {method, headers, cache: 'no-store', credentials: 'same-origin', body: body ? JSON.stringify(body) : undefined});
      const data = await response.json().catch(() => ({}));
      // An expired page token is fetched again once; anything else goes back to the caller.
      if (response.status === 403 && method !== 'GET' && attempt === 0 && /校验|CSRF/i.test(data.message || '')) { csrf = null; continue; }
      if (response.status === 401) { location.href = 'https://calendar.garyhub.uk/login/?next=' + encodeURIComponent(location.href); throw Object.assign(Error(t('请先登录', 'Please sign in')), {status: 401}); }
      if (!response.ok) throw Object.assign(Error(data.message || t('服务暂时不可用，请稍后重试', 'Service unavailable, please try again')), {status: response.status});
      return data;
    }
  }
  async function account() {
    if (!me) me = (await request('/api/me')).user;
    return me;
  }
  const api = {
    get: path => request(path),
    post: async (path, body = {}) => request(path, {method: 'POST', body: {accountId: (await account()).id, ...body}})
  };

  // ---- Formatting ----------------------------------------------------------------------------------------------------
  function money(currency, cents) {
    // A game names its one currency in its header, so amounts use the short symbol (¥, $).
    const whole = cents % 100 === 0, options = {style: 'currency', currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2};
    const locale = lang === 'en' ? 'en-US' : 'zh-CN';
    try { return new Intl.NumberFormat(locale, {...options, currencyDisplay: 'narrowSymbol'}).format(cents / 100); } catch {}
    try { return new Intl.NumberFormat(locale, options).format(cents / 100); } catch { return currency + ' ' + (cents / 100).toFixed(whole ? 0 : 2); }
  }
  const ICONS = {gift: '🎁', cake: '🎂', flower: '💐', book: '📚', game: '🎮', coffee: '☕', ticket: '🎟️', star: '⭐', heart: '💖', plane: '✈️',
    camera: '📷', music: '🎧', bag: '👜', watch: '⌚', phone: '📱', food: '🍱'};
  const prizeText = (prize, currency) => prize.kind === 'money' ? money(currency, prize.amount) : prize.name;
  const prizeValue = prize => prize.kind === 'money' ? prize.amount : prize.value;
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat()) if (child != null && child !== false) node.append(child.nodeType ? child : document.createTextNode(String(child)));
    return node;
  }
  let toastTimer = 0;
  function toast(message) {
    let node = $('toast');
    if (!node) { node = el('div', {id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite'}); document.body.append(node); }
    node.textContent = message; node.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 3200);
  }

  // ---- Starry sky ------------------------------------------------------------------------------------------------------
  function sky() {
    const canvas = document.querySelector('canvas.sky');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let stars = [], frame = 0, last = 0;
    function size() {
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = innerWidth * ratio; canvas.height = innerHeight * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.round(Math.min(160, Math.max(50, innerWidth * innerHeight / 9000)));
      stars = Array.from({length: count}, () => ({x: Math.random() * innerWidth, y: Math.random() * innerHeight * .85, r: Math.random() * 1.3 + .3,
        p: Math.random() * Math.PI * 2, s: .4 + Math.random() * 1.2}));
    }
    function draw(time) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      const light = document.documentElement.dataset.ghTheme === 'light';
      for (const star of stars) {
        const a = reduced.matches ? .7 : .35 + .65 * (0.5 + 0.5 * Math.sin(star.p + time / 1000 * star.s));
        ctx.globalAlpha = light ? a * .45 : a;
        ctx.fillStyle = light ? '#8b72ff' : '#fff8e6';
        ctx.beginPath(); ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    function loop(time) {
      frame = requestAnimationFrame(loop);
      if (time - last < 50) return;
      last = time; draw(time);
    }
    size();
    addEventListener('resize', () => { size(); draw(performance.now()); });
    const run = () => { cancelAnimationFrame(frame); if (!document.hidden && !reduced.matches) frame = requestAnimationFrame(loop); else draw(0); };
    document.addEventListener('visibilitychange', run);
    document.addEventListener('garyhub:theme', () => draw(performance.now()));
    run();
  }

  function header() {
    paint();
    $('lang')?.addEventListener('click', () => setLanguage(lang === 'en' ? 'zh' : 'en'));
    $('theme')?.addEventListener('click', () => window.GaryHubTheme?.toggle());
    account().then(user => { const node = $('who'); if (node && user) node.textContent = user.username; }).catch(() => {});
    sky();
  }

  // ---- Lobby -----------------------------------------------------------------------------------------------------------
  async function lobby() {
    const badge = $('dreamBadge');
    if (!badge) return;
    const show = data => {
      const mine = data.games.filter(game => game.turn === 'me').length;
      const live = data.games.filter(game => game.turn).length;
      badge.textContent = mine ? t(mine + ' 局轮到你', mine + ' waiting for you') : live ? t(live + ' 局进行中', live + ' in progress') : t('新游戏', 'New');
      badge.classList.toggle('me', mine > 0);
    };
    let data = null;
    try { data = await api.get('/api/hub/games'); show(data); } catch {}
    listeners.add(() => data && show(data));
  }

  window.Games = {$, t, el, api, account, money, prizeText, prizeValue, ICONS, toast, reduced, onLanguage: fn => listeners.add(fn), get lang() { return lang; }, paint};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { header(); lobby(); });
  else { header(); lobby(); }
})();
