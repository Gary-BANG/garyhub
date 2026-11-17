/* GaryHub preferences (v2.4.1.4). Load early in <head> on every GaryHub page (both services keep identical copies).
   GaryHubTheme: one day/night setting (system, light or dark) for every sub-site. The cookie garyhub_prefs on
   .garyhub.uk carries it between sub-sites before the account answers; each page's own ◐ button still switches
   light/dark, and that choice is saved too.
   GaryHubPrefs: the signed-in account's preferences (/api/hub/preferences). They are written into the caches each
   page already reads (cookies and localStorage), and local changes are saved back. Guests keep browser-only settings. */
(() => {
  'use strict';
  if (window.GaryHubPrefs) return;
  const COOKIE = 'garyhub_prefs', root = document.documentElement;
  const domain = location.hostname === 'garyhub.uk' || location.hostname.endsWith('.garyhub.uk') ? '; Domain=.garyhub.uk' : '';
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  const readCookie = name => { const part = document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith(name + '=')); return part ? decodeURIComponent(part.slice(name.length + 1)) : null; };
  const writeCookie = (name, value) => { document.cookie = name + '=' + encodeURIComponent(value) + '; Path=/; Max-Age=31536000; SameSite=Lax' + domain + secure; };
  const store = {get: key => { try { return localStorage.getItem(key); } catch { return null; } }, set: (key, value) => { try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch {} }};
  const cookiePrefs = () => new URLSearchParams(readCookie(COOKIE) || '');
  let local = cookiePrefs();
  const saveLocal = () => writeCookie(COOKIE, local.toString());

  // ---- Day / night ------------------------------------------------------------------------------------------
  const MODES = ['system', 'light', 'dark'], media = matchMedia('(prefers-color-scheme: dark)');
  // Before v2.4.1.4 each sub-site kept its own choice; the first one found becomes the shared one.
  function legacy() {
    const plain = store.get('garyhub-theme') || store.get('garyhub-useful-theme');
    if (plain === 'light' || plain === 'dark') return plain;
    const stocks = store.get('garyhub-stocks-theme');
    return stocks === 'night' ? 'dark' : stocks === 'day' ? 'light' : null;
  }
  // Done once per browser (marked in the shared cookie), so choosing "system" later is not undone by an old key.
  if (local.get('m') !== '1') { const found = MODES.includes(local.get('theme')) ? null : legacy(); if (found) local.set('theme', found); local.set('m', '1'); saveLocal(); }
  const mode = () => MODES.includes(local.get('theme')) ? local.get('theme') : 'system';
  const resolved = () => mode() === 'system' ? (media.matches ? 'dark' : 'light') : mode();
  const listeners = new Set();
  let shown = null;
  function apply() {
    const value = resolved();
    root.dataset.ghTheme = value;
    if (value === shown) return;
    shown = value;
    for (const fn of listeners) { try { fn(value); } catch {} }
    document.dispatchEvent(new CustomEvent('garyhub:theme', {detail: {theme: value, mode: mode()}}));
  }
  function setMode(value, {save = true} = {}) {
    if (!MODES.includes(value)) return;
    if (value === 'system') local.delete('theme'); else local.set('theme', value);
    saveLocal(); apply();
    if (save) queue({'appearance.theme': value});
  }
  const Theme = {
    resolved, mode, setMode,
    toggle() { setMode(resolved() === 'dark' ? 'light' : 'dark'); return resolved(); },
    bind(fn) { listeners.add(fn); try { fn(resolved()); } catch {} return () => listeners.delete(fn); }
  };
  media.addEventListener?.('change', () => { if (mode() === 'system') apply(); });
  apply();

  // ---- Homepage starfield ----------------------------------------------------------------------------------
  const SKY = ['full', 'calm', 'still'];
  root.dataset.ghSky = SKY.includes(local.get('sky')) ? local.get('sky') : 'full';
  function setSky(value, {save = true} = {}) {
    if (!SKY.includes(value)) return;
    if (value === 'full') local.delete('sky'); else local.set('sky', value);
    saveLocal(); root.dataset.ghSky = value;
    if (save) queue({'appearance.sky': value});
  }

  // Another sub-site may have changed the shared cookie while this tab was in the background.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const fresh = cookiePrefs();
    if (fresh.toString() !== local.toString()) { local = fresh; root.dataset.ghSky = SKY.includes(local.get('sky')) ? local.get('sky') : 'full'; apply(); }
  });

  // ---- Account preferences ---------------------------------------------------------------------------------
  const COMPANION = 'garyhub_companion';
  const state = {accountId: null, prefs: null, timezone: null, revision: 0};
  let pending = {}, timer = 0, csrf = null, loaded = false, lastError = null, resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  function companionCookie() {
    const params = new URLSearchParams(readCookie(COMPANION) || ''), out = {};
    for (const key of ['open', 'quiet']) if (['on', 'min'].includes(params.get(key))) out['companion.' + key] = params.get(key);
    if (params.get('mode')) out['companion.mode'] = params.get('mode') === 'gravity' ? 'gravity' : 'free';
    if (params.has('off')) out['companion.off'] = params.get('off') === '1';
    if (/^[a-z]{2,16}$/.test(params.get('char') || '')) out['companion.char'] = params.get('char');
    return out;
  }
  function writeCompanion(prefs) {
    const params = new URLSearchParams(readCookie(COMPANION) || '');
    for (const key of ['open', 'quiet', 'mode', 'char']) { const v = prefs['companion.' + key]; if (v) params.set(key, v); else params.delete(key); }
    if (typeof prefs['companion.off'] === 'boolean') params.set('off', prefs['companion.off'] ? '1' : '0');
    if (!params.get('mode')) params.set('mode', 'free');
    writeCookie(COMPANION, params.toString());
  }
  // Writes saved values into the caches the pages read (cookies, localStorage, the live theme and language).
  const STORAGE = {'ledger.currency': 'garyhub.ledger.currency', 'tools.view': 'garyhub.tools.view'};
  function applyLocal(prefs, keys) {
    for (const key of keys) {
      const value = prefs[key];
      if (key === 'appearance.theme') setMode(value || 'system', {save: false});
      else if (key === 'appearance.sky') setSky(value || 'full', {save: false});
      else if (key === 'language' && value && window.GaryHubI18n && window.GaryHubI18n.language !== value) window.GaryHubI18n.setLanguage(value);
      else if (STORAGE[key]) store.set(STORAGE[key], value);
    }
    if (keys.some(key => key.startsWith('companion.'))) writeCompanion(prefs);
  }
  // Server values win; a value set only in this browser is uploaded once, so earlier choices are not lost.
  function adopt(prefs) {
    const upload = {};
    const theme = prefs['appearance.theme'];
    if (theme) { if (theme !== mode()) setMode(theme, {save: false}); }
    else if (local.get('theme')) upload['appearance.theme'] = mode();
    const sky = prefs['appearance.sky'];
    if (sky) { if (sky !== root.dataset.ghSky) setSky(sky, {save: false}); }
    else if (local.get('sky')) upload['appearance.sky'] = local.get('sky');
    const language = prefs.language, chosen = readCookie('garyhub_language');
    if (language) { if (window.GaryHubI18n && window.GaryHubI18n.language !== language) window.GaryHubI18n.setLanguage(language); }
    else if (chosen === 'zh' || chosen === 'en') upload.language = chosen;
    const companion = Object.keys(prefs).filter(key => key.startsWith('companion.') && prefs[key] !== null);
    if (companion.length) writeCompanion(prefs);
    else Object.assign(upload, companionCookie());
    for (const [key, storage, allowed] of [['ledger.currency', 'garyhub.ledger.currency', ['CNY', 'USD', 'CAD', 'HKD']], ['tools.view', 'garyhub.tools.view', ['grid', 'dock']]]) {
      if (prefs[key]) store.set(storage, prefs[key]);
      else if (allowed.includes(store.get(storage))) upload[key] = store.get(storage);
    }
    if (Object.keys(upload).length) queue(upload);
  }
  async function load() {
    try {
      const response = await fetch('/api/hub/preferences', {cache: 'no-store', credentials: 'same-origin'});
      if (response.status !== 200) return;
      const data = await response.json();
      Object.assign(state, {accountId: data.accountId, prefs: data.prefs, timezone: data.timezone, revision: data.revision});
      adopt(data.prefs);
      document.dispatchEvent(new CustomEvent('garyhub:preferences', {detail: data}));
    } catch {} finally { loaded = true; resolveReady(state.prefs); flushSoon(); }
  }
  function queue(patch) {
    for (const [key, value] of Object.entries(patch)) {
      if (state.prefs && key !== 'region.timezone' && state.prefs[key] === value) { delete pending[key]; continue; }
      pending[key] = value;
    }
    flushSoon();
  }
  function flushSoon() { clearTimeout(timer); timer = setTimeout(flush, 400); }
  // Returns whether everything queued was saved. Guests have nothing to save once the account check is done.
  async function flush() {
    if (!Object.keys(pending).length) return true;
    if (!state.accountId) { if (loaded) pending = {}; return loaded; }
    const set = pending; pending = {}; lastError = null;
    try {
      if (!csrf) csrf = (await (await fetch('/api/csrf', {cache: 'no-store', credentials: 'same-origin'})).json()).token;
      const response = await fetch('/api/hub/preferences', {method: 'PUT', cache: 'no-store', credentials: 'same-origin',
        headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf}, body: JSON.stringify({accountId: state.accountId, set})});
      if (response.status === 403) csrf = null;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(Error(data.message || 'save'), {status: response.status});
      Object.assign(state, {prefs: data.prefs, timezone: data.timezone, revision: data.revision});
      applyLocal(data.prefs, Object.keys(set).filter(key => key !== 'region.timezone'));
      document.dispatchEvent(new CustomEvent('garyhub:preferences', {detail: data}));
      return true;
    } catch (error) {
      lastError = error;
      // A refused value (400) or a changed account (401/409) is not retried; network trouble is.
      if (![400, 401, 409].includes(error.status)) pending = {...set, ...pending};
      return false;
    }
  }
  document.addEventListener('garyhub:language', event => { const v = event.detail?.language; if (v === 'zh' || v === 'en') queue({language: v}); });
  document.addEventListener('garyhub:companion-prefs', event => {
    const p = event.detail || {}, patch = {};
    for (const key of ['open', 'quiet']) patch['companion.' + key] = ['on', 'min'].includes(p[key]) ? p[key] : null;
    patch['companion.mode'] = p.mode === 'gravity' ? 'gravity' : 'free';
    patch['companion.off'] = !!p.off;
    patch['companion.char'] = /^[a-z]{2,16}$/.test(p.char || '') ? p.char : null;
    queue(patch);
  });
  addEventListener('pagehide', () => { if (Object.keys(pending).length) flush(); });

  window.GaryHubTheme = Theme;
  window.GaryHubPrefs = {
    ready, setSky,
    get accountId() { return state.accountId; },
    get prefs() { return state.prefs; },
    get timezone() { return state.timezone; },
    get: key => state.prefs ? state.prefs[key] : null,
    save: queue,
    // Saves at once and reports the outcome; the settings centre uses this for its "saved" messages.
    async saveNow(patch) { await ready; queue(patch); clearTimeout(timer); if (!await flush()) throw lastError || Error('save failed'); return state; }
  };
  load();
})();
