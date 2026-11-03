/* Loads the website companion on a GaryHub page:
     <script src="/companion/boot.js?v=VERSION" defer data-companion="open"></script>
   data-companion: open = full pet by default (Home, Tools); quiet = small and still by default (Calendar, Lab).
   Preferences are a few switches in one cookie shared by *.garyhub.uk; positions stay per site.
   Nothing here reads page content; identity is only used to hide tools the account cannot open. */
(() => {
  'use strict';
  if (window.GaryHubCompanionBoot) return;
  const script = document.currentScript;
  if (!script || !window.fetch || !Element.prototype.attachShadow) return;
  const version = new URL(script.src).searchParams.get('v') || '';
  const base = new URL('.', script.src).href, siteRoot = new URL('..', base).href;
  const scope = script.dataset.companion === 'quiet' ? 'quiet' : 'open';
  const COOKIE = 'garyhub_companion';
  const text = {
    collapse:{zh:'收起米露', en:'Tuck Milu away'}, expand:{zh:'展开米露', en:'Bring Milu out'},
    gravity:{zh:'切换到重力模式（松手会掉落）', en:'Switch to gravity (drops when released)'},
    free:{zh:'切换到自由放置', en:'Switch to free placement'},
    reset:{zh:'回到默认位置', en:'Back to default position'},
    hide:{zh:'关闭米露', en:'Hide Milu'}, show:{zh:'显示网站伙伴米露', en:'Show Milu, the site companion'}
  };
  window.GaryHubCompanionBoot = {version, scope};
  window.GaryHubCompanionAssetVersion = version;

  // Cookie value like "open=on&quiet=min&mode=free&off=0"; anything unexpected is ignored.
  function readPrefs() {
    const raw = document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE + '='));
    const params = new URLSearchParams(raw ? decodeURIComponent(raw.slice(COOKIE.length + 1)) : '');
    const presence = value => ['on', 'min'].includes(value) ? value : null;
    return {open:presence(params.get('open')), quiet:presence(params.get('quiet')), mode:params.get('mode') === 'gravity' ? 'gravity' : 'free', off:params.get('off') === '1'};
  }
  function writePrefs(prefs) {
    const value = new URLSearchParams(Object.entries({open:prefs.open || '', quiet:prefs.quiet || '', mode:prefs.mode, off:prefs.off ? '1' : '0'}).filter(([, v]) => v)).toString();
    const shared = location.hostname === 'garyhub.uk' || location.hostname.endsWith('.garyhub.uk') ? '; Domain=.garyhub.uk' : '';
    document.cookie = `${COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax${shared}${location.protocol === 'https:' ? '; Secure' : ''}`;
  }
  const narrow = matchMedia('(max-width: 600px)');
  const presenceFor = prefs => prefs.off ? 'off' : prefs[scope] || (scope === 'quiet' || narrow.matches ? 'min' : 'on');

  const load = file => new Promise((resolve, reject) => {
    const node = document.createElement('script');
    node.src = file + (version ? '?v=' + encodeURIComponent(version) : ''); node.async = false;
    node.onload = resolve; node.onerror = reject;
    document.head.append(node);
  });

  // Pages without the hub account bar ask the shared session who is signed in.
  async function identity() {
    for (const path of ['/api/hub/me', '/api/me']) {
      try {
        const response = await fetch(path, {cache:'no-store', credentials:'same-origin'});
        if (response.status === 401) return null;
        if (!response.ok) continue;
        const data = await response.json();
        return data.user || null;
      } catch {}
    }
    return null;
  }

  function edgeTab(onShow) {
    const host = document.createElement('div');
    host.id = 'gh-companion-tab'; host.setAttribute('data-i18n-ignore', ''); host.hidden = true;
    const root = host.attachShadow({mode:'open'});
    root.innerHTML = `<style>
      :host{position:fixed;right:0;bottom:120px;z-index:61}
      :host([hidden]){display:none}
      button{display:block;width:14px;height:48px;padding:0;border:0;border-radius:8px 0 0 8px;background:#6f8fd0;opacity:.55;cursor:pointer}
      button:hover,button:focus-visible{opacity:1;width:18px}
      button:focus-visible{outline:2px solid #6f8fd0;outline-offset:2px}
    </style><button type="button"></button>`;
    const button = root.querySelector('button');
    button.addEventListener('click', onShow);
    document.body.append(host);
    return {
      host,
      label(lang) { button.setAttribute('aria-label', text.show[lang]); button.title = text.show[lang]; }
    };
  }

  async function start() {
    const files = [...(window.GaryHubTools ? [] : [siteRoot + 'tools-catalog.js']), ...['knowledge.js', 'brain.js', 'voices.js', 'panel.js', 'characters.js', 'pet.js'].map(file => base + file)];
    for (const file of files) await load(file);
    if (!window.GaryHubCompanionPet) return;
    let prefs = readPrefs(), lang = window.GaryHubI18n?.language === 'en' ? 'en' : 'zh';
    const save = change => { prefs = {...prefs, ...change}; writePrefs(prefs); };
    const pet = window.GaryHubCompanionPet.mount({presence:presenceFor(prefs), mode:prefs.mode, onModeChange:mode => save({mode})});
    const tab = edgeTab(() => { save({off:false, [scope]:'on'}); show(); pet.element.shadowRoot?.querySelector('.hit')?.focus(); });

    function show() { pet.setPresence(presenceFor(prefs)); tab.host.hidden = pet.presence !== 'off'; menu(); }
    function menu() {
      const items = pet.presence === 'on'
        ? [{label:text.collapse, run:() => { save({[scope]:'min'}); show(); }},
           {label:pet.mode === 'gravity' ? text.free : text.gravity, run:() => { pet.setMode(pet.mode === 'gravity' ? 'free' : 'gravity'); menu(); }},
           {label:text.reset, run:() => pet.reset()}]
        : [{label:text.expand, run:() => { save({[scope]:'on'}); show(); }}];
      items.push({label:text.hide, run:() => { save({off:true}); show(); }});
      pet.chat.setMenu(items);
    }
    tab.label(lang);
    document.addEventListener('garyhub:language', event => { lang = event.detail?.language === 'en' ? 'en' : 'zh'; tab.label(lang); });
    // Another subdomain may have changed the shared switches; apply them when the visitor comes back.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { const fresh = readPrefs(); if (JSON.stringify(fresh) !== JSON.stringify(prefs)) { prefs = fresh; pet.setMode(prefs.mode); show(); } } });
    narrow.addEventListener('change', show);
    await pet.ready;
    show();

    if (!document.querySelector('[data-hub-account]')) {
      let checked = 0;
      const refresh = async () => { if (document.hidden || Date.now() - checked < 10000) return; checked = Date.now(); pet.chat.setUser(await identity()); };
      refresh();
      document.addEventListener('visibilitychange', refresh);
      addEventListener('focus', refresh);
    }
  }
  const begin = () => start().catch(() => {});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', begin, {once:true}); else begin();
})();
