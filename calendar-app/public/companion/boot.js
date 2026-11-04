/* Loads the website companion on a GaryHub page:
     <script src="/companion/boot.js?v=VERSION" defer data-companion="open"></script>
   data-companion: open = full pet by default (Home, Tools); quiet = small and still by default (Calendar, Lab).
   Preferences are a few switches in one cookie shared by *.garyhub.uk; positions stay per site.
   Nothing here reads page content; identity is only used to hide tools the account cannot open
   and to offer the characters its tier includes (guest: Milu; signed in: + Lili; subscriber/admin: all). */
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
    collapse:{zh:name => `收起${name}`, en:name => `Tuck ${name} away`}, expand:{zh:name => `展开${name}`, en:name => `Bring ${name} out`},
    gravity:{zh:() => '切换到重力模式（松手会掉落）', en:() => 'Switch to gravity (drops when released)'},
    free:{zh:() => '切换到自由放置', en:() => 'Switch to free placement'},
    reset:{zh:() => '回到默认位置', en:() => 'Back to default position'},
    choose:{zh:() => '换个伙伴', en:() => 'Choose another companion'},
    hide:{zh:name => `关闭${name}`, en:name => `Hide ${name}`}, show:{zh:'显示网站伙伴', en:'Show the site companion'},
    member:{zh:'登录后可用', en:'Sign in to use'}, subscriber:{zh:'订阅用户可用', en:'For subscribers'}
  };
  window.GaryHubCompanionBoot = {version, scope};
  window.GaryHubCompanionAssetVersion = version;
  const asset = file => base + file + (version ? '?v=' + encodeURIComponent(version) : '');

  // Cookie value like "open=on&quiet=min&mode=free&off=0&char=lili"; anything unexpected is ignored.
  function readPrefs() {
    const raw = document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE + '='));
    const params = new URLSearchParams(raw ? decodeURIComponent(raw.slice(COOKIE.length + 1)) : '');
    const presence = value => ['on', 'min'].includes(value) ? value : null;
    const char = params.get('char');
    return {open:presence(params.get('open')), quiet:presence(params.get('quiet')), mode:params.get('mode') === 'gravity' ? 'gravity' : 'free', off:params.get('off') === '1',
      char:/^[a-z]{2,16}$/.test(char || '') ? char : null};
  }
  function writePrefs(prefs) {
    const value = new URLSearchParams(Object.entries({open:prefs.open || '', quiet:prefs.quiet || '', mode:prefs.mode, off:prefs.off ? '1' : '0', char:prefs.char || ''}).filter(([, v]) => v)).toString();
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

  // Ask the shared session who is signed in; a slow or failing check counts as a guest.
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
  const quickIdentity = () => Promise.race([identity(), new Promise(resolve => setTimeout(() => resolve(null), 2500))]);

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
    const files = [...(window.GaryHubTools ? [] : [siteRoot + 'tools-catalog.js']), ...['knowledge.js', 'brain.js', 'voices.js', 'assistant.js', 'panel.js', 'characters.js', 'puppet.js', 'pet.js'].map(file => base + file)];
    for (const file of files) await load(file);
    const {GaryHubCompanionPet: pets, GaryHubCompanionChat: chats, GaryHubCompanionCharacters: rigs, GaryHubCompanionVoices: voices} = window;
    if (!pets || !chats || !rigs || !voices) return;
    let prefs = readPrefs(), lang = window.GaryHubI18n?.language === 'en' ? 'en' : 'zh';
    let user = await quickIdentity(), pending = null;
    const save = change => { prefs = {...prefs, ...change}; writePrefs(prefs); };
    // The stored choice when this account may use it, otherwise Milu.
    const wanted = () => prefs.char && rigs.allowed(prefs.char, user) ? prefs.char : rigs.fallback;
    const chat = chats.mount({launcher:false});
    chat.setUser(user);
    const mountPet = id => pets.mount({character:id, chat, presence:presenceFor(prefs), mode:prefs.mode, onModeChange:mode => save({mode})});
    let pet = mountPet(wanted());
    const tab = edgeTab(() => { save({off:false, [scope]:'on'}); show(); pet.element.shadowRoot?.querySelector('.hit')?.focus(); });

    function show() { pet.setPresence(presenceFor(prefs)); tab.host.hidden = pet.presence !== 'off'; menu(); }
    function menu() {
      const say = entry => ({zh:entry.zh(voices.get(pet.id).name.zh), en:entry.en(voices.get(pet.id).name.en)});
      const items = pet.presence === 'on'
        ? [{label:say(text.collapse), run:() => { save({[scope]:'min'}); show(); }},
           {label:say(pet.mode === 'gravity' ? text.free : text.gravity), run:() => { pet.setMode(pet.mode === 'gravity' ? 'free' : 'gravity'); menu(); }},
           {label:say(text.reset), run:() => pet.reset()}]
        : [{label:say(text.expand), run:() => { save({[scope]:'on'}); show(); }}];
      if (rigs.roster.length > 1) items.push({label:say(text.choose), run:picker});
      items.push({label:say(text.hide), run:() => { save({off:true}); show(); }});
      chat.setMenu(items);
    }
    function picker() {
      chat.showPicker({
        items:rigs.roster.map(id => ({id, name:voices.get(id).name, blurb:voices.get(id).blurb, thumb:asset(rigs.characters[id].thumbnail),
          locked:!rigs.allowed(id, user), note:text[rigs.characters[id].tier] || text.subscriber, current:id === pet.id})),
        onPick:id => { if (rigs.allowed(id, user)) { save({char:id}); switchTo(id); } }
      });
    }
    // Mount the new character hidden, swap once it has drawn; the chat panel and its conversation stay.
    // A newer request (another pick, or an account change) replaces one that is still loading.
    async function switchTo(id) {
      if (!rigs.allowed(id, user)) return;
      if (pending) { pending.pet.destroy(); pending = null; pet.adoptChat(); }
      if (id === pet.id) return;
      const previous = pet, ticket = pending = {id, pet:mountPet(id)};
      const ok = await Promise.race([ticket.pet.ready, new Promise(resolve => setTimeout(() => resolve(false), 10000))]);
      if (pending !== ticket) return;
      pending = null;
      if (ok && rigs.allowed(id, user)) { previous.destroy(); pet = ticket.pet; pet.adoptChat(); }
      // The new artwork failed or is no longer allowed: keep the current character and its panel wiring.
      else { ticket.pet.destroy(); chat.element.dataset.launcher = 'off'; previous.adoptChat(); }
      menu();
    }
    // Signing out or losing a subscription returns to an allowed character; signing in restores the stored one.
    function applyIdentity(next) {
      const changed = (next?.id ?? null) !== (user?.id ?? null) || next?.role !== user?.role || next?.accountTier !== user?.accountTier;
      user = next; chat.setUser(user);
      if (changed && wanted() !== (pending?.id ?? pet.id)) switchTo(wanted());
      if (changed) menu();
    }

    tab.label(lang);
    document.addEventListener('garyhub:language', event => { lang = event.detail?.language === 'en' ? 'en' : 'zh'; tab.label(lang); });
    document.addEventListener('garyhub:identity', event => applyIdentity(event.detail?.user || null));
    // Another subdomain may have changed the shared switches; apply them when the visitor comes back.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      const fresh = readPrefs();
      if (JSON.stringify(fresh) === JSON.stringify(prefs)) return;
      prefs = fresh; pet.setMode(prefs.mode); show();
      if (wanted() !== pet.id) switchTo(wanted());
    });
    narrow.addEventListener('change', show);
    await pet.ready;
    show();

    if (!document.querySelector('[data-hub-account]')) {
      let checked = Date.now();
      const refresh = async () => { if (document.hidden || Date.now() - checked < 10000) return; checked = Date.now(); applyIdentity(await identity()); };
      document.addEventListener('visibilitychange', refresh);
      addEventListener('focus', refresh);
    }
  }
  const begin = () => start().catch(() => {});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', begin, {once:true}); else begin();
})();
