/* Companion chat panel. Lives in a shadow root so site CSS and the i18n scanner leave it alone.
   The conversation exists only in this page's memory and is dropped when the account changes.
   Signed-in accounts talk to the AI assistant when an admin has enabled it; the local guide
   answers guests and steps in whenever the assistant is unavailable. */
(() => {
  'use strict';
  if (window.GaryHubCompanionChat) return;
  const brain = window.GaryHubCompanionBrain, voices = window.GaryHubCompanionVoices, knowledge = window.GaryHubCompanionKnowledge;
  const assistant = window.GaryHubCompanionAssistant;
  if (!brain || !voices || !knowledge) return;
  const base = new URL('.', document.currentScript?.src || location.href).href;
  const asset = file => base + file + (window.GaryHubCompanionAssetVersion ? '?v=' + encodeURIComponent(window.GaryHubCompanionAssetVersion) : '');
  const ui = {
    zh:{subtitle:'站内工具向导', open:'打开', send:'发送', close:'关闭对话', more:'设置', picker:'选择伙伴', current:'当前', login:'登录后可用', input:'输入你的需求', log:'对话记录', launcher:name => `和${name}聊天`,
      chips:['你能做什么', '学习相关', '文档与图片', '日常记录'],
      ai:{subtitle:'AI 日程助手', placeholder:'比如：明天下午三点开组会', chips:['今天有什么安排？', '这周有哪些事项？', '帮我加一个日程', '打开记账'], thinking:'正在想…',
        disclosure:provider => `已接入 AI（${provider}）：我可以帮你查看、添加和删除日程。你的消息和相关日程会发给该服务处理；添加和删除都要你点“确认”才会生效。`,
        add:'添加日程', remove:'删除日程', confirm:'确认', cancel:'取消', added:'已添加到日程 ✓', removed:'已删除 ✓', cancelled:'已取消',
        reminder:time => `每天 ${time} 提醒`, remaining:count => `今天还能用 AI ${count} 次`, offline:'AI 暂时不可用，先用站内向导回答。'}},
    en:{subtitle:'Site tool guide', open:'Open', send:'Send', close:'Close chat', more:'Settings', picker:'Choose a companion', current:'Current', login:'Sign in to use', input:'Describe what you need', log:'Conversation', launcher:name => `Chat with ${name}`,
      chips:['What can you do?', 'Study', 'Documents & images', 'Everyday records'],
      ai:{subtitle:'AI schedule assistant', placeholder:'e.g. Group meeting tomorrow at 3 pm', chips:['What is on today?', 'What is on this week?', 'Add something to my calendar', 'Open the ledger'], thinking:'Thinking…',
        disclosure:provider => `AI is on (${provider}): I can show, add and delete calendar items. Your messages and the related items are sent to that service; nothing is added or deleted until you press Confirm.`,
        add:'Add to calendar', remove:'Delete from calendar', confirm:'Confirm', cancel:'Cancel', added:'Added to your calendar ✓', removed:'Deleted ✓', cancelled:'Cancelled',
        reminder:time => `Daily reminder at ${time}`, remaining:count => `${count} AI messages left today`, offline:'The AI is unavailable right now, so here is the site guide.'}}
  };
  // Only links from the knowledge file are rendered, and only to GaryHub over HTTPS.
  const safeUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' && (url.hostname === 'garyhub.uk' || url.hostname.endsWith('.garyhub.uk')) ? url.href : null; } catch { return null; } };
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };

  // launcher:false is used when the pet itself opens the panel; place() then anchors it beside the pet.
  // onClose/onReply can be replaced with setHandlers() when another pet takes over the same panel.
  function mount({character = voices.fallback, target = document.body, launcher: ownLauncher = true, onClose, onReply} = {}) {
    const handlers = {onClose, onReply};
    const host = el('div'); host.id = 'gh-companion'; host.setAttribute('data-i18n-ignore', '');
    if (!ownLauncher) host.dataset.launcher = 'off';
    const root = host.attachShadow({mode:'open'});
    root.innerHTML = `<link rel="stylesheet" href="${asset('panel.css')}">
      <section class="panel" id="panel" role="dialog" hidden>
        <header><span class="avatar" aria-hidden="true"></span><div class="who"><strong class="name"></strong><span class="subtitle"></span></div><button class="more" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="menu" hidden>⋯</button><button class="close" type="button">×</button></header>
        <div class="menu" id="menu" role="menu" hidden></div>
        <div class="picker" role="group" hidden><strong class="picker-title"></strong><div class="picker-grid"></div></div>
        <div class="log" role="log" aria-live="polite"></div>
        <div class="chips"></div>
        <form class="composer"><input type="text" maxlength="200" autocomplete="off" enterkeyhint="send"><button class="send" type="submit"></button></form>
      </section>
      <button class="launcher" type="button" aria-expanded="false" aria-controls="panel"><span class="avatar" aria-hidden="true"></span></button>`;
    const $ = selector => root.querySelector(selector);
    const panel = $('.panel'), log = $('.log'), input = $('input'), launcher = $('.launcher');
    let lang = window.GaryHubI18n?.language === 'en' ? 'en' : 'zh';
    let user = window.GaryHubIdentity?.user || null, memory = {}, menuItems = [], pickerSpec = null;
    // ai: the server's assistant status for this account; history: recent AI turns sent back as context.
    let ai = null, history = [], busy = false, disclosed = false, statusTicket = 0;
    const more = $('.more'), menu = $('.menu'), picker = $('.picker');

    const say = (key, replyLang, vars) => voices.line(character, replyLang, key, vars);
    const scrollDown = () => { log.scrollTop = log.scrollHeight; };
    const aiOn = () => !!(assistant && user && ai?.enabled);
    function chrome() {
      const t = ui[lang], who = voices.get(character);
      host.style.setProperty('--companion-accent', who.accent);
      for (const avatar of root.querySelectorAll('.avatar')) avatar.textContent = who.name[lang].slice(0, 1);
      $('.name').textContent = who.name[lang]; $('.subtitle').textContent = aiOn() ? t.ai.subtitle : t.subtitle;
      $('.close').setAttribute('aria-label', t.close); $('.send').textContent = t.send;
      input.placeholder = aiOn() ? t.ai.placeholder : say('placeholder', lang); input.setAttribute('aria-label', t.input);
      log.setAttribute('aria-label', t.log); panel.setAttribute('aria-label', t.launcher(who.name[lang]));
      launcher.setAttribute('aria-label', t.launcher(who.name[lang])); launcher.title = launcher.getAttribute('aria-label');
      $('.chips').replaceChildren(...(aiOn() ? t.ai.chips : t.chips).map(text => chip(text)));
      more.setAttribute('aria-label', t.more); more.title = t.more;
      renderMenu(); renderPicker();
    }
    // Character picker: items [{id, name:{zh,en}, blurb:{zh,en}, thumb, locked, note:{zh,en}, current}].
    function renderPicker() {
      $('.picker-title').textContent = ui[lang].picker;
      picker.setAttribute('aria-label', ui[lang].picker);
      $('.picker-grid').replaceChildren(...(pickerSpec?.items || []).map(item => {
        const button = el('button', 'pick'); button.type = 'button';
        const image = el('img'); image.alt = ''; image.src = item.thumb; image.width = image.height = 56;
        button.append(image, el('span', 'pick-name', item.name[lang]), el('span', 'pick-note', item.current ? ui[lang].current : item.locked ? item.note[lang] : item.blurb[lang]));
        button.title = item.blurb[lang];
        if (item.current) button.setAttribute('aria-current', 'true');
        if (item.locked) { button.setAttribute('aria-disabled', 'true'); button.classList.add('locked'); }
        button.addEventListener('click', () => { if (item.locked || item.current) return; hidePicker(); pickerSpec.onPick(item.id); });
        return button;
      }));
    }
    function showPicker(spec) {
      pickerSpec = spec; toggleMenu(false); renderPicker(); picker.hidden = false;
      (picker.querySelector('.pick:not(.locked):not([aria-current])') || picker.querySelector('.pick'))?.focus();
    }
    function hidePicker() { picker.hidden = true; }
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
      handlers.onReply?.(result);
    }
    function guide(message) {
      const result = brain.reply(message, {lang, user, memory});
      memory = result.memory;
      answer(result);
    }
    function ask(text) {
      const message = String(text).trim();
      if (!message || busy) return;
      bubble('user', message);
      if (aiOn()) askAI(message); else guide(message);
    }
    const day = (value, replyLang) => new Intl.DateTimeFormat(replyLang === 'en' ? 'en-US' : 'zh-CN', {month:'short', day:'numeric', weekday:'short', timeZone:'UTC'}).format(new Date(value + 'T00:00:00Z'));
    // A prepared change: nothing is written until the owner presses Confirm here.
    function actionCard(action, replyLang) {
      const t = ui[replyLang].ai, s = action.summary || {}, node = el('article', 'card action');
      const when = s.start_date === s.end_date ? day(s.start_date, replyLang) : `${day(s.start_date, replyLang)} – ${day(s.end_date, replyLang)}`;
      node.append(el('span', 'card-kind', action.kind === 'add_task' ? t.add : t.remove), el('strong', 'card-name', s.title || ''),
        el('p', 'card-copy', [when, s.category, s.reminder_time && t.reminder(s.reminder_time)].filter(Boolean).join(' · ')));
      if (s.note) node.append(el('p', 'card-copy', s.note));
      const row = el('div', 'card-row'), no = el('button', 'card-cancel', t.cancel), yes = el('button', 'card-open', t.confirm);
      no.type = yes.type = 'button';
      async function settle(verb) {
        no.disabled = yes.disabled = true;
        try {
          await assistant[verb](action.id);
          row.replaceChildren(el('span', 'card-done', verb === 'cancel' ? t.cancelled : action.kind === 'add_task' ? t.added : t.removed));
          if (verb === 'confirm') { document.dispatchEvent(new CustomEvent('garyhub:records-changed', {detail:{kind:'tasks'}})); handlers.onReply?.({kind:'thanks', tools:[], lang:replyLang}); }
        } catch (error) { row.replaceChildren(el('span', 'card-note', error.message || ui[replyLang].ai.offline)); }
      }
      no.addEventListener('click', () => settle('cancel')); yes.addEventListener('click', () => settle('confirm'));
      row.append(no, yes); node.append(row);
      return node;
    }
    async function askAI(message) {
      const replyLang = lang, t = ui[replyLang].ai, account = user;
      busy = true; input.disabled = true;
      const wait = bubble('bot', t.thinking); wait.classList.add('waiting'); scrollDown();
      try {
        const data = await assistant.chat({message, history, lang:replyLang, character});
        if (account !== user) return;
        history = [...history, {role:'user', text:message}, {role:'assistant', text:data.reply}].slice(-8);
        const node = bubble('bot', data.reply);
        const cards = [...(data.pages || []).map(id => card(id, replyLang)), ...(data.actions || []).map(action => actionCard(action, replyLang))].filter(Boolean);
        if (cards.length) { const list = el('div', 'cards'); list.append(...cards); node.append(list); }
        if (typeof data.remaining === 'number' && data.remaining <= 5) node.append(el('p', 'quota', t.remaining(data.remaining)));
        handlers.onReply?.({kind:data.actions?.length ? 'clarify' : 'recommend', tools:data.pages || [], lang:replyLang});
      } catch (error) {
        if (account !== user) return;
        // Signed out, switched off or out of quota: say why once, then let the local guide answer.
        if ([401, 503].includes(error.status)) { ai = null; chrome(); }
        bubble('bot', error.message || t.offline).classList.add('notice');
        guide(message);
      } finally {
        wait.remove(); busy = false; input.disabled = false;
        if (!panel.hidden) input.focus({preventScroll:true});
        scrollDown();
      }
    }
    function disclose() {
      if (disclosed || !aiOn() || panel.hidden) return;
      disclosed = true; bubble('bot', ui[lang].ai.disclosure(ai.provider)).classList.add('notice'); scrollDown();
    }
    // Ask whether the assistant is on for this account; a later identity change wins over a slow answer.
    async function refreshAI() {
      const ticket = ++statusTicket;
      let next = null;
      if (assistant && user) { try { next = await assistant.status(); } catch {} }
      if (ticket !== statusTicket) return;
      ai = next; chrome(); disclose();
    }
    function open() {
      panel.hidden = false; launcher.setAttribute('aria-expanded', 'true'); host.dataset.open = '';
      if (!log.childElementCount) { bubble('bot', say('greet', lang)); scrollDown(); }
      disclose();
      input.focus({preventScroll:true});
    }
    function close() {
      if (panel.hidden) return;
      toggleMenu(false); hidePicker();
      panel.hidden = true; launcher.setAttribute('aria-expanded', 'false'); delete host.dataset.open;
      if (host.dataset.launcher === 'off') handlers.onClose?.(); else launcher.focus({preventScroll:true});
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
    function reset() {
      log.replaceChildren(); memory = {}; history = []; disclosed = false; ai = null; chrome();
      if (!panel.hidden) { bubble('bot', say('greet', lang)); scrollDown(); }
      refreshAI();
    }

    launcher.addEventListener('click', () => panel.hidden ? open() : close());
    $('.close').addEventListener('click', close);
    more.addEventListener('click', () => toggleMenu());
    root.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || panel.hidden) return;
      event.stopPropagation();
      if (!menu.hidden) { toggleMenu(false); more.focus(); } else if (!picker.hidden) { hidePicker(); more.focus(); } else close();
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
    addEventListener('pagehide', () => { memory = {}; history = []; });

    chrome(); theme(); target.append(host); refreshAI();
    return {
      element:host, open, close, ask, place, setUser,
      get isOpen() { return !panel.hidden; },
      setMenu(items) { menuItems = items || []; renderMenu(); },
      setHandlers(next) { Object.assign(handlers, next); },
      showPicker, hidePicker,
      showLauncher() { delete host.dataset.launcher; place(null); },
      get character() { return character; },
      // A new character keeps the conversation and introduces itself if the panel is open.
      setCharacter(id) {
        if (!voices.characters[id] || id === character) return;
        character = id; chrome();
        if (!panel.hidden) { bubble('bot', say('greet', lang)); scrollDown(); }
      }
    };
  }
  window.GaryHubCompanionChat = {mount};
})();
