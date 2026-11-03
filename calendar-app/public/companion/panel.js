/* Companion chat panel. Lives in a shadow root so site CSS and the i18n scanner leave it alone.
   The conversation exists only in this page's memory and is dropped when the account changes.
   The avatar is a placeholder until the character artwork and motion layer arrive. */
(() => {
  'use strict';
  if (window.GaryHubCompanionChat) return;
  const brain = window.GaryHubCompanionBrain, voices = window.GaryHubCompanionVoices, knowledge = window.GaryHubCompanionKnowledge;
  if (!brain || !voices || !knowledge) return;
  const base = new URL('.', document.currentScript?.src || location.href).href;
  const asset = file => base + file + (window.GaryHubCompanionAssetVersion ? '?v=' + encodeURIComponent(window.GaryHubCompanionAssetVersion) : '');
  const ui = {
    zh:{subtitle:'站内工具向导', open:'打开', send:'发送', close:'关闭对话', more:'设置', login:'登录后可用', input:'输入你的需求', log:'对话记录', launcher:name => `和${name}聊天`,
      chips:['你能做什么', '学习相关', '文档与图片', '日常记录']},
    en:{subtitle:'Site tool guide', open:'Open', send:'Send', close:'Close chat', more:'Settings', login:'Sign in to use', input:'Describe what you need', log:'Conversation', launcher:name => `Chat with ${name}`,
      chips:['What can you do?', 'Study', 'Documents & images', 'Everyday records']}
  };
  // Only links from the knowledge file are rendered, and only to GaryHub over HTTPS.
  const safeUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' && (url.hostname === 'garyhub.uk' || url.hostname.endsWith('.garyhub.uk')) ? url.href : null; } catch { return null; } };
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };

  // launcher:false is used when the pet itself opens the panel; place() then anchors it beside the pet.
  function mount({character = voices.fallback, target = document.body, launcher: ownLauncher = true, onClose, onReply} = {}) {
    const host = el('div'); host.id = 'gh-companion'; host.setAttribute('data-i18n-ignore', '');
    if (!ownLauncher) host.dataset.launcher = 'off';
    const root = host.attachShadow({mode:'open'});
    root.innerHTML = `<link rel="stylesheet" href="${asset('panel.css')}">
      <section class="panel" id="panel" role="dialog" hidden>
        <header><span class="avatar" aria-hidden="true"></span><div class="who"><strong class="name"></strong><span class="subtitle"></span></div><button class="more" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="menu" hidden>⋯</button><button class="close" type="button">×</button></header>
        <div class="menu" id="menu" role="menu" hidden></div>
        <div class="log" role="log" aria-live="polite"></div>
        <div class="chips"></div>
        <form class="composer"><input type="text" maxlength="200" autocomplete="off" enterkeyhint="send"><button class="send" type="submit"></button></form>
      </section>
      <button class="launcher" type="button" aria-expanded="false" aria-controls="panel"><span class="avatar" aria-hidden="true"></span></button>`;
    const $ = selector => root.querySelector(selector);
    const panel = $('.panel'), log = $('.log'), input = $('input'), launcher = $('.launcher');
    let lang = window.GaryHubI18n?.language === 'en' ? 'en' : 'zh';
    let user = window.GaryHubIdentity?.user || null, memory = {}, menuItems = [];
    const more = $('.more'), menu = $('.menu');

    const say = (key, replyLang, vars) => voices.line(character, replyLang, key, vars);
    const scrollDown = () => { log.scrollTop = log.scrollHeight; };
    function chrome() {
      const t = ui[lang], who = voices.get(character);
      host.style.setProperty('--companion-accent', who.accent);
      for (const avatar of root.querySelectorAll('.avatar')) avatar.textContent = who.name[lang].slice(0, 1);
      $('.name').textContent = who.name[lang]; $('.subtitle').textContent = t.subtitle;
      $('.close').setAttribute('aria-label', t.close); $('.send').textContent = t.send;
      input.placeholder = say('placeholder', lang); input.setAttribute('aria-label', t.input);
      log.setAttribute('aria-label', t.log); panel.setAttribute('aria-label', t.launcher(who.name[lang]));
      launcher.setAttribute('aria-label', t.launcher(who.name[lang])); launcher.title = launcher.getAttribute('aria-label');
      $('.chips').replaceChildren(...t.chips.map(text => chip(text)));
      more.setAttribute('aria-label', t.more); more.title = t.more;
      renderMenu();
    }
    // Settings menu items come from the pet: [{label:{zh,en}, run}].
    function renderMenu() {
      more.hidden = !menuItems.length;
      menu.replaceChildren(...menuItems.map(item => {
        const button = el('button', 'menu-item', item.label[lang]); button.type = 'button'; button.setAttribute('role', 'menuitem');
        button.addEventListener('click', () => { toggleMenu(false); item.run(); });
        return button;
      }));
    }
    function toggleMenu(show = menu.hidden) {
      menu.hidden = !show; more.setAttribute('aria-expanded', String(show));
      if (show) menu.querySelector('button')?.focus();
    }
    function theme() {
      const dark = document.body?.classList.contains('dark') || document.documentElement.dataset.theme === 'dark';
      host.dataset.theme = dark ? 'dark' : 'light';
    }
    function chip(text) {
      const button = el('button', 'chip', text); button.type = 'button';
      button.addEventListener('click', () => ask(text));
      return button;
    }
    function card(id, replyLang) {
      const entry = knowledge.byId.get(id), url = entry && safeUrl(entry.url);
      if (!url) return null;
      const node = el('article', 'card');
      node.append(el('strong', 'card-name', entry.name[replyLang]), el('p', 'card-copy', entry.description[replyLang]));
      const row = el('div', 'card-row');
      if (!user && entry.access !== 'public') row.append(el('span', 'card-note', ui[replyLang].login));
      const link = el('a', 'card-open', ui[replyLang].open); link.href = url;
      row.append(link); node.append(row);
      return node;
    }
    function bubble(who, text) {
      const node = el('div', `msg ${who}`); node.append(el('p', 'text', text));
      log.append(node); return node;
    }
    function answer(result) {
      const replyLang = result.lang, first = knowledge.byId.get(result.tools[0]);
      const vars = {tool:first?.name[replyLang] ?? '', category:knowledge.categories.find(item => item.id === result.category)?.name[replyLang] ?? ''};
      const node = bubble('bot', say(result.kind, replyLang, vars));
      if (result.kind === 'howto' && first) node.append(el('p', 'text howto', first.howto[replyLang]));
      const cards = result.tools.map(id => card(id, replyLang)).filter(Boolean);
      if (cards.length) { const list = el('div', 'cards'); list.append(...cards); node.append(list); }
      if (result.categories?.length) {
        const row = el('div', 'chips inline');
        row.append(...result.categories.map(id => chip(knowledge.categories.find(item => item.id === id).name[replyLang])));
        node.append(row);
      }
      scrollDown();
      onReply?.(result);
    }
    function ask(text) {
      const message = String(text).trim();
      if (!message) return;
      bubble('user', message);
      const result = brain.reply(message, {lang, user, memory});
      memory = result.memory;
      answer(result);
    }
    function open() {
      panel.hidden = false; launcher.setAttribute('aria-expanded', 'true'); host.dataset.open = '';
      if (!log.childElementCount) { bubble('bot', say('greet', lang)); scrollDown(); }
      input.focus({preventScroll:true});
    }
    function close() {
      if (panel.hidden) return;
      toggleMenu(false);
      panel.hidden = true; launcher.setAttribute('aria-expanded', 'false'); delete host.dataset.open;
      if (host.dataset.launcher === 'off') onClose?.(); else launcher.focus({preventScroll:true});
    }
    function place(anchor) {
      const sides = ['left', 'top', 'right', 'bottom'];
      if (!anchor || matchMedia('(max-width:600px)').matches) { for (const side of sides) host.style.removeProperty(side); host.style.removeProperty('--panel-room'); return; }
      const width = 340, gap = 10, viewWidth = document.documentElement.clientWidth || innerWidth, viewHeight = innerHeight;
      const left = anchor.left - gap - width >= 8 ? anchor.left - gap - width : Math.max(8, Math.min(anchor.right + gap, viewWidth - width - 8));
      const bottom = Math.min(Math.max(8, viewHeight - anchor.bottom), Math.max(8, viewHeight - 240));
      Object.assign(host.style, {left:left + 'px', right:'auto', top:'auto', bottom:bottom + 'px'});
      host.style.setProperty('--panel-room', viewHeight - bottom - 8 + 'px');
    }
    function reset() { log.replaceChildren(); memory = {}; if (!panel.hidden) { bubble('bot', say('greet', lang)); scrollDown(); } }

    launcher.addEventListener('click', () => panel.hidden ? open() : close());
    $('.close').addEventListener('click', close);
    more.addEventListener('click', () => toggleMenu());
    root.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || panel.hidden) return;
      event.stopPropagation();
      if (!menu.hidden) { toggleMenu(false); more.focus(); } else close();
    });
    $('.composer').addEventListener('submit', event => { event.preventDefault(); const text = input.value; input.value = ''; ask(text); });
    document.addEventListener('garyhub:language', event => { lang = event.detail?.language === 'en' ? 'en' : 'zh'; chrome(); });
    // A different account must not see the previous account's conversation or suggestions.
    function setUser(next = null) {
      if ((next?.id ?? null) !== (user?.id ?? null) || next?.role !== user?.role || next?.accountTier !== user?.accountTier) { user = next; reset(); }
    }
    document.addEventListener('garyhub:identity', event => setUser(event.detail?.user || null));
    new MutationObserver(theme).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme', 'class'], subtree:false});
    if (document.body) new MutationObserver(theme).observe(document.body, {attributes:true, attributeFilter:['class']});
    addEventListener('pagehide', () => { memory = {}; });

    chrome(); theme(); target.append(host);
    return {
      element:host, open, close, ask, place, setUser,
      get isOpen() { return !panel.hidden; },
      setMenu(items) { menuItems = items || []; renderMenu(); },
      showLauncher() { delete host.dataset.launcher; place(null); },
      get character() { return character; },
      setCharacter(id) { if (voices.characters[id]) { character = id; chrome(); } }
    };
  }
  window.GaryHubCompanionChat = {mount};
})();
