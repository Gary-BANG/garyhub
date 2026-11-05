/* Companion chat panel. Lives in a shadow root so site CSS and the i18n scanner leave it alone.
   What is shown exists only in this page and is dropped when the account changes.
   Signed-in accounts talk to the AI assistant when an admin has enabled it; the server keeps the
   last five rounds for that account, which "Clear conversation" removes. The local guide answers
   guests and steps in when the assistant is switched off or the daily chat allowance is used up. */
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
      ai:{subtitle:'AI 助手', placeholder:'比如：明天下午三点开组会', chips:['今天有什么安排？', '这周有哪些事项？', '帮我加一个日程', '打开记账'], searchChip:'今天有什么新闻？', thinking:'正在想…',
        disclosure:(provider, search, rounds) => `已接入 AI（${provider}）：我可以帮你查看、添加和删除日程${search ? '，也能联网搜索新闻和时事' : ''}。你的消息和相关日程会发给该服务处理；最近 ${rounds} 轮对话保存在服务器上，可在“⋯”里清空。添加和删除都要你点“确认”才会生效。`,
        add:'添加日程', remove:'删除日程', confirm:'确认', cancel:'取消', added:'已添加到日程 ✓', removed:'已删除 ✓', cancelled:'已取消',
        reminder:time => `每天 ${time} 提醒`, sources:'来源', forget:'清空对话', forgotten:'对话记忆已清空。',
        remaining:{chat:count => `今天还能和 AI 对话 ${count} 次`, data:count => `今天还能操作日程 ${count} 次`, search:count => `今天还能联网搜索 ${count} 次`},
        offline:'AI 暂时不可用，先用站内向导回答。'}},
    en:{subtitle:'Site tool guide', open:'Open', send:'Send', close:'Close chat', more:'Settings', picker:'Choose a companion', current:'Current', login:'Sign in to use', input:'Describe what you need', log:'Conversation', launcher:name => `Chat with ${name}`,
      chips:['What can you do?', 'Study', 'Documents & images', 'Everyday records'],
      ai:{subtitle:'AI assistant', placeholder:'e.g. Group meeting tomorrow at 3 pm', chips:['What is on today?', 'What is on this week?', 'Add something to my calendar', 'Open the ledger'], searchChip:'Any news today?', thinking:'Thinking…',
        disclosure:(provider, search, rounds) => `AI is on (${provider}): I can show, add and delete calendar items${search ? ' and search the web for news' : ''}. Your messages and the related items are sent to that service; the last ${rounds} rounds are kept on the server and can be cleared from “⋯”. Nothing is added or deleted until you press Confirm.`,
        add:'Add to calendar', remove:'Delete from calendar', confirm:'Confirm', cancel:'Cancel', added:'Added to your calendar ✓', removed:'Deleted ✓', cancelled:'Cancelled',
        reminder:time => `Daily reminder at ${time}`, sources:'Sources', forget:'Clear conversation', forgotten:'The conversation memory is cleared.',
        remaining:{chat:count => `${count} AI messages left today`, data:count => `${count} calendar requests left today`, search:count => `${count} web searches left today`},
        offline:'The AI is unavailable right now, so here is the site guide.'}}
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
        <div class="tutor-bar" hidden><button class="tutor-toggle" type="button" aria-pressed="false"></button><span class="tutor-hint"></span></div>
        <div class="tutor-consent" hidden><p></p><button class="tutor-accept" type="button"></button><button class="tutor-cancel" type="button"></button></div>
        <div class="log" role="log" aria-live="polite"></div>
        <div class="chips"></div>
        <form class="composer"><input type="text" maxlength="200" autocomplete="off" enterkeyhint="send"><button class="send" type="submit"></button></form>
      </section>
      <button class="launcher" type="button" aria-expanded="false" aria-controls="panel"><span class="avatar" aria-hidden="true"></span></button>`;
    const $ = selector => root.querySelector(selector);
    const panel = $('.panel'), log = $('.log'), input = $('input'), launcher = $('.launcher');
    let lang = window.GaryHubI18n?.language === 'en' ? 'en' : 'zh';
    let user = window.GaryHubIdentity?.user || null, memory = {}, menuItems = [], pickerSpec = null;
    // ai: the server's assistant status for this account, including today's allowances.
    let ai = null, busy = false, disclosed = false, statusTicket = 0;
    let tutor = null, consent = null, tutorTicket = 0, tutorStarting = false, lastAnchor = null, tutorExpiry = null;
    const study = window.GaryHubStudyContext;
    const tutorText = () => lang === 'en' ? {start:'Study Q&A',stop:'Exit Q&A',subscriber:'Subscribers only',open:'Open a Markdown in Study Hub',off:'Enable AI in admin settings first',active:'10 rounds · reasoning when supported',accept:'Authorize this document',cancel:'Cancel',placeholder:'Ask about this document (up to 4,000 characters)',confirm:title=>`Allow the assistant to read “${title}”? When you ask a question, this Markdown and the last 10 rounds will be sent to ${ai?.provider || 'the configured AI provider'}. This session expires after one hour and is cleared from server memory. Switching document, closing the chat or exiting Q&A ends sharing and clears this session. Images and linked documents are not read.`,ended:'Q&A ended. The document is no longer shared.',enabled:title=>`Study Q&A: ${title}. You can ask for explanations, examples or a walkthrough.`,chips:['Explain the key ideas','Walk me through an example','Which prerequisites should I review?']} : {start:'讲义答疑',stop:'退出答疑',subscriber:'订阅用户专享',open:'请在学习中心打开 Markdown 讲义',off:'请先由管理员启用 AI',active:'10 轮记忆 · 按模型能力开启思考',accept:'授权当前讲义并开启',cancel:'取消',placeholder:'针对这篇讲义提问（最多 4,000 字符）',confirm:title=>`允许伙伴读取《${title}》吗？提问时，这篇 Markdown 和最近 10 轮对话会发送给${ai?.provider || '已配置的 AI 服务商'}。本次会话只在服务器内存中暂存，一小时后过期清理；切换讲义、关闭对话或退出答疑会停止共享并清空本次记忆。不读取图片和链接中的其他文档。`,ended:'已结束讲义答疑，当前讲义不再共享。',enabled:title=>`正在答疑：《${title}》。可以问概念、例题或推导步骤。`,chips:['解释这篇讲义的核心概念','用一个例子带我理解','我需要先掌握哪些知识？']};
    const more = $('.more'), menu = $('.menu'), picker = $('.picker');

    const say = (key, replyLang, vars) => voices.line(character, replyLang, key, vars);
    const scrollDown = () => { log.scrollTop = log.scrollHeight; };
    const aiOn = () => !!(assistant && user && ai?.enabled);
    function chrome() {
      const t = ui[lang], who = voices.get(character);
      host.style.setProperty('--companion-accent', who.accent);
      for (const avatar of root.querySelectorAll('.avatar')) avatar.textContent = who.name[lang].slice(0, 1);
      $('.name').textContent = who.name[lang]; $('.subtitle').textContent = tutor ? tutorText().start : aiOn() ? t.ai.subtitle : t.subtitle;
      $('.close').setAttribute('aria-label', t.close); $('.send').textContent = t.send;
      input.maxLength = tutor ? 4000 : 200;
      input.placeholder = tutor ? tutorText().placeholder : aiOn() ? t.ai.placeholder : say('placeholder', lang); input.setAttribute('aria-label', t.input);
      log.setAttribute('aria-label', t.log); panel.setAttribute('aria-label', t.launcher(who.name[lang]));
      launcher.setAttribute('aria-label', t.launcher(who.name[lang])); launcher.title = launcher.getAttribute('aria-label');
      const aiChips = ai?.search ? [...t.ai.chips.slice(0, 3), t.ai.searchChip] : t.ai.chips;
      $('.chips').replaceChildren(...(tutor ? tutorText().chips : aiOn() ? aiChips : t.chips).map(text => chip(text)));
      more.setAttribute('aria-label', t.more); more.title = t.more;
      renderMenu(); renderPicker(); renderTutor();
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
    // Settings menu items come from the pet: [{label:{zh,en}, run}]; the panel adds its own while the AI is on.
    function renderMenu() {
      const items = aiOn() ? [...menuItems, {label:{zh:ui.zh.ai.forget, en:ui.en.ai.forget}, run:forget}] : menuItems;
      more.hidden = !items.length;
      menu.replaceChildren(...items.map(item => {
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
      const node = el('div', `msg ${who}`); node.append(el('div', 'text', text));
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
      if (tutor) askTutor(message); else if (aiOn()) askAI(message); else guide(message);
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
    // Web sources are shown as plain outbound links, never as GaryHub cards.
    function sources(list, replyLang) {
      const links = list.map(item => { try { const url = new URL(item.url); return /^https?:$/.test(url.protocol) ? [url.href, String(item.title || url.hostname)] : null; } catch { return null; } }).filter(Boolean);
      if (!links.length) return null;
      const node = el('p', 'sources'); node.append(el('span', 'sources-label', ui[replyLang].ai.sources));
      for (const [href, title] of links) { const link = el('a', '', title); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; node.append(link); }
      return node;
    }
    async function askAI(message) {
      const replyLang = lang, t = ui[replyLang].ai, account = user;
      busy = true; input.disabled = true;
      const wait = bubble('bot', t.thinking); wait.classList.add('waiting'); scrollDown();
      try {
        const data = await assistant.chat({message, lang:replyLang, character});
        if (account !== user) return;
        const node = bubble('bot', data.reply);
        const cards = [...(data.pages || []).map(id => card(id, replyLang)), ...(data.actions || []).map(action => actionCard(action, replyLang))].filter(Boolean);
        if (cards.length) { const list = el('div', 'cards'); list.append(...cards); node.append(list); }
        const links = sources(data.sources || [], replyLang);
        if (links) node.append(links);
        if (data.quota && ai) ai.quota = data.quota;
        // Only the allowances this message used, once they are nearly gone.
        for (const kind of (data.counted || []).filter(kind => t.remaining[kind])) {
          const q = data.quota?.[kind], left = q ? Math.max(0, q.limit - q.used) : null;
          if (left != null && left <= 5) node.append(el('p', 'quota', t.remaining[kind](left)));
        }
        handlers.onReply?.({kind:data.actions?.length ? 'clarify' : 'recommend', tools:data.pages || [], lang:replyLang});
      } catch (error) {
        if (account !== user) return;
        bubble('bot', error.message || t.offline).classList.add('notice');
        // A busy model or a key problem: keep the AI on and let the user try again later.
        if (['busy', 'config'].includes(error.code)) return;
        // Signed out or switched off: back to the local guide for this page; out of chat allowance: the guide answers today.
        if (error.status === 401 || error.code === 'disabled') { ai = null; chrome(); }
        guide(message);
      } finally {
        wait.remove(); busy = false; input.disabled = false;
        if (!panel.hidden) input.focus({preventScroll:true});
        scrollDown();
      }
    }
    function disclose() {
      if (disclosed || !aiOn() || panel.hidden) return;
      disclosed = true; bubble('bot', ui[lang].ai.disclosure(ai.provider, ai.search, ai.memoryRounds || 5)).classList.add('notice'); scrollDown();
    }
    async function forget() {
      if (tutor) { try { await study.clear(tutor); log.replaceChildren(); bubble('bot', ui[lang].ai.forgotten); } catch (error) { bubble('bot', error.message); } return; }
      try { await assistant.forget(); } catch (error) { bubble('bot', error.message || ui[lang].ai.offline).classList.add('notice'); scrollDown(); return; }
      log.replaceChildren(); memory = {};
      bubble('bot', ui[lang].ai.forgotten).classList.add('notice'); bubble('bot', say('greet', lang)); scrollDown();
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
      stopTutor(); toggleMenu(false); hidePicker();
      panel.hidden = true; launcher.setAttribute('aria-expanded', 'false'); delete host.dataset.open;
      if (host.dataset.launcher === 'off') handlers.onClose?.(); else launcher.focus({preventScroll:true});
    }
    function place(anchor) {
      lastAnchor = anchor;
      const sides = ['left', 'top', 'right', 'bottom'];
      if (!anchor || matchMedia('(max-width:600px)').matches) { for (const side of sides) host.style.removeProperty(side); host.style.removeProperty('--panel-room'); return; }
      const viewWidth = document.documentElement.clientWidth || innerWidth, viewHeight = innerHeight, width = tutor ? Math.min(660, viewWidth - 16) : 340, gap = 10;
      const left = anchor.left - gap - width >= 8 ? anchor.left - gap - width : Math.max(8, Math.min(anchor.right + gap, viewWidth - width - 8));
      const bottom = Math.min(Math.max(8, viewHeight - anchor.bottom), Math.max(8, viewHeight - 240));
      Object.assign(host.style, {left:left + 'px', right:'auto', top:'auto', bottom:bottom + 'px'});
      host.style.setProperty('--panel-room', viewHeight - bottom - 8 + 'px');
    }
    function reset() {
      stopTutor(false);
      log.replaceChildren(); memory = {}; disclosed = false; ai = null; chrome();
      if (!panel.hidden) { bubble('bot', say('greet', lang)); scrollDown(); }
      refreshAI();
    }

    function renderTutor() {
      if (!study) return;
      const t = tutorText(), context = study.current();
      $('.tutor-bar').hidden = false;
      $('.tutor-toggle').textContent = tutor ? t.stop : t.start;
      $('.tutor-toggle').disabled = !tutor && (tutorStarting || busy || !context || !ai?.tutor?.available || context.accountId !== user?.id);
      $('.tutor-toggle').setAttribute('aria-pressed', String(!!tutor));
      $('.tutor-hint').textContent = tutor ? tutor.context.title + ' · ' + t.active : !context ? t.open : ai?.tier === 'standard' ? t.subscriber : !aiOn() ? t.off : t.active;
      panel.classList.toggle('tutoring', !!tutor);
      $('.tutor-consent').hidden = !consent;
      if (consent) $('.tutor-consent p').textContent = t.confirm(consent.title);
      $('.tutor-accept').textContent = t.accept; $('.tutor-cancel').textContent = t.cancel;
      $('.tutor-accept').disabled = tutorStarting;
    }
    function stopTutor(notice = true) {
      const old = tutor; clearTimeout(tutorExpiry); tutor = null; consent = null; tutorStarting = false; ++tutorTicket;
      if (old) { study.stop(old).catch(() => {}); log.replaceChildren(); if (notice) bubble('bot', tutorText().ended); }
      chrome(); place(lastAnchor);
    }
    $('.tutor-toggle').addEventListener('click', async () => {
      if (tutor) return stopTutor();
      if (busy || tutorStarting || !ai?.tutor?.available) return;
      const ticket = ++tutorTicket, account = user; tutorStarting = true; renderTutor();
      await refreshAI();
      if (ticket !== tutorTicket || account !== user) return;
      tutorStarting = false;
      const context = study.current();
      consent = context && ai?.tutor?.available ? {...context, provider:ai.provider} : null;
      renderTutor(); if (consent) $('.tutor-accept').focus();
    });
    $('.tutor-cancel').addEventListener('click', () => { consent = null; renderTutor(); });
    $('.tutor-accept').addEventListener('click', async () => {
      if (!consent || tutorStarting || !ai?.tutor?.available) return;
      const expected = consent, ticket = ++tutorTicket; tutorStarting = true; renderTutor();
      try {
        const grant = await study.start(expected);
        if (ticket !== tutorTicket || expected.key !== study.current()?.key || expected.accountId !== user?.id) { study.stop(grant).catch(() => {}); return; }
        tutor = grant; clearTimeout(tutorExpiry); tutorExpiry = setTimeout(() => { if (tutor === grant) stopTutor(); }, Math.max(0, grant.expiresAt - Date.now())); consent = null; log.replaceChildren(); bubble('bot', tutorText().enabled(grant.title)); chrome(); place(lastAnchor);
      } catch (error) { if (ticket === tutorTicket) { consent = null; bubble('bot', error.message); } }
      finally { if (ticket === tutorTicket) tutorStarting = false; renderTutor(); }
    });
    async function askTutor(message) {
      const grant = tutor, ticket = tutorTicket, replyLang = lang;
      busy = true; input.disabled = true; renderTutor();
      const wait = bubble('bot', ui[lang].ai.thinking); wait.classList.add('waiting'); scrollDown();
      try {
        const data = await study.chat(grant, message, replyLang);
        if (ticket !== tutorTicket || grant !== tutor) return;
        const node = bubble('bot', data.reply);
        // Use existing local Markdown libraries; allow formatting only, no URLs, images, HTML events or embedded content.
        if (window.marked && window.DOMPurify) node.querySelector('.text').innerHTML = DOMPurify.sanitize(marked.parse(data.reply), {
          ALLOWED_TAGS:['p','br','strong','em','ul','ol','li','pre','code','blockquote','h1','h2','h3','h4','table','thead','tbody','tr','th','td','hr','span'], ALLOWED_ATTR:['data-math','data-display'], ALLOW_DATA_ATTR:false});
        for (const math of node.querySelectorAll('[data-math]')) {
          const value = math.getAttribute('data-math');
          try { if (!window.katex) throw Error('math'); katex.render(value, math, {displayMode:math.dataset.display === 'yes', throwOnError:false, trust:false}); }
          catch { math.textContent = value; }
        }
        if (data.reasoning === 'unavailable') node.append(el('p','quota',replyLang === 'en' ? 'This model has no configurable reasoning mode.' : '本次模型不支持配置思考模式。'));
        if (data.fallback) node.append(el('p','quota',replyLang === 'en' ? 'Answered by the fallback model.' : '本次由备用模型回答。'));
        if (ai && data.quota) ai.quota = data.quota;
        handlers.onReply?.({kind:'recommend',tools:[],lang:replyLang});
      } catch (error) {
        if (ticket !== tutorTicket) return;
        if ([401,403,404].includes(error.status) || ['consent','identity','document_changed','subscription','disabled'].includes(error.code)) stopTutor();
        bubble('bot', error.message || ui[lang].ai.offline);
      } finally { wait.remove(); busy = false; input.disabled = false; renderTutor(); scrollDown(); }
    }
    document.addEventListener('garyhub:study-context', () => {
      const context = study?.current();
      if ((tutor && tutor.context.key !== context?.key) || (consent && consent.key !== context?.key)) stopTutor();
      renderTutor();
    });

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
    addEventListener('pagehide', () => { stopTutor(false); memory = {}; });

    if (study) { const mathStyle = el('link'); mathStyle.rel = 'stylesheet'; mathStyle.href = '/academic/vendor/katex.min.css'; root.append(mathStyle); }
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
