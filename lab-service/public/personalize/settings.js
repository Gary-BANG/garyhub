/* GaryHub settings centre (v2.4.1.4). Account preferences go through hub-prefs.js (/api/hub/preferences); the Study Hub
   reading settings stay in the Study Hub's own record (/api/academic/preferences). Every control saves on change. */
(() => {
  'use strict';
  const root = document.getElementById('settings');
  const TEXT = {
    zh: {
      title: '设置', intro: '设置随账号保存，换手机、换电脑都会跟着你。每一项改动后立即保存。',
      nav: {appearance: '外观', region: '语言与地区', companion: '网站伙伴', study: '学习中心', tools: '记账与工具台', notify: '通知与订阅'},
      saved: '已保存', saving: '正在保存…', failed: '保存失败，请重试。', loadFailed: '设置暂时无法载入，请刷新页面。',
      theme: '日夜主题', themeNote: '各页面右上角的 ◐ 按钮仍可随时切换，切换结果也会保存到这里。主页与开发者页固定为星空深色。',
      themes: {system: '跟随系统', light: '浅色', dark: '深色'},
      sky: '主页星空', skyNote: '“静止”与系统的“减少动态效果”相同，只绘制一帧。', skies: {full: '完整', calm: '安静', still: '静止'},
      accent: '强调色', accentNote: '用于链接、按钮和选中状态；“默认”保留各页面原来的颜色。学习中心与本地工具使用各自的配色。', accents: {default: '默认', blue: '蓝', violet: '紫', teal: '青', brown: '暖棕'},
      density: '界面密度', densityNote: '紧凑会减小页头、卡片、列表和工具图标周围的留白。', densities: {standard: '标准', compact: '紧凑'},
      weekStart: '每周开始于', weekStarts: {monday: '周一', sunday: '周日'}, weekStartNote: '用于日历月视图、周视图和日记的日期格。',
      dateFormat: '日期格式', dateFormatNote: '用于日历事项列表、记账、日记、主页“今日”和搜索结果；输入框仍使用浏览器的日期选择器。',
      calendarView: '日历默认视图', calendarViews: {month: '月', week: '周', list: '列表'}, calendarViewNote: '打开日历时显示的视图；日历上方也可以随时切换。',
      language: '界面语言', timezone: '时区', timezoneNote: '用于日历提醒、主页“今日”和日历订阅。', useDevice: zone => '使用此设备的时区（' + zone + '）',
      companionChar: '伙伴角色', locked: {member: '登录账号可用', subscriber: '订阅用户可用'}, current: '当前',
      openPages: '主页与工具台', quietPages: '其他页面', presence: {on: '展开', min: '收起'},
      gravity: '重力模式', gravityNote: '松手后从高处落下，会打开降落伞。', show: '显示网站伙伴', companionNote: '伙伴设置在下次打开页面时生效。',
      chars: {milu: '米露', lili: '栗栗', pudding: '布丁', pagey: '页芽', navi: '小航'},
      studyTheme: '阅读外观', studyThemes: {dark: '墨夜', light: '纸白', warm: '暖纸'}, fontSize: '正文字号（px）', headingSize: '标题字号（px）',
      lineHeight: '行距', readerWidth: '正文宽度（px）', previewHeading: '讲义标题', previewBody: '正文将以这个字号、行距和宽度显示。学习中心的阅读外观独立于全站日夜主题。',
      codeFont: '代码字体', codeFonts: {default: '默认', consolas: 'Consolas', courier: 'Courier', sans: '与正文一致'}, mathScale: '公式大小', previewCode: 'for (let i = 0; i < n; i++) total += x[i];',
      studyConflict: '学习中心设置已在其他页面更改，已重新载入。', open: '打开学习中心',
      currency: '记账默认币种', currencyNote: '打开记账页时默认使用；记一笔时选择的币种也会更新这里。', toolsView: '工具台布局', views: {grid: '多行图标', dock: '单行 Dock'},
      notifyText: '日历订阅地址、浏览器推送和邮件提醒在 Calendar 的“账号与提醒设置”中管理。', notifyLink: '前往日历设置'
    },
    en: {
      title: 'Settings', intro: 'Settings are saved to your account and follow you to every device. Each change is saved at once.',
      nav: {appearance: 'Appearance', region: 'Language & region', companion: 'Site companion', study: 'Study Hub', tools: 'Ledger & Tools', notify: 'Notifications'},
      saved: 'Saved', saving: 'Saving…', failed: 'Could not save. Please try again.', loadFailed: 'Settings cannot be loaded right now. Please refresh.',
      theme: 'Day / night', themeNote: 'The ◐ button on each page still switches it, and that choice is saved here too. The homepage and developer page always use the dark starfield.',
      themes: {system: 'Match system', light: 'Light', dark: 'Dark'},
      sky: 'Homepage starfield', skyNote: '"Still" works like the system reduced-motion setting and draws one frame.', skies: {full: 'Full', calm: 'Calm', still: 'Still'},
      accent: 'Accent colour', accentNote: 'Used for links, buttons and selections; "Default" keeps each page’s own colour. The Study Hub and the local tools keep their own palettes.', accents: {default: 'Default', blue: 'Blue', violet: 'Violet', teal: 'Teal', brown: 'Warm brown'},
      density: 'Density', densityNote: 'Compact tightens the space around headers, cards, lists and tool icons.', densities: {standard: 'Standard', compact: 'Compact'},
      weekStart: 'Week starts on', weekStarts: {monday: 'Monday', sunday: 'Sunday'}, weekStartNote: 'Used by the calendar month and week views and the journal date grid.',
      dateFormat: 'Date format', dateFormatNote: 'Used in the calendar task list, ledger, journal, homepage Today and search results; date inputs keep the browser’s picker.',
      calendarView: 'Calendar opens in', calendarViews: {month: 'Month', week: 'Week', list: 'List'}, calendarViewNote: 'The view shown when the calendar opens; the toolbar can switch at any time.',
      language: 'Language', timezone: 'Time zone', timezoneNote: 'Used for reminders, the homepage Today panel and the calendar subscription.', useDevice: zone => 'Use this device’s time zone (' + zone + ')',
      companionChar: 'Companion', locked: {member: 'For signed-in accounts', subscriber: 'For subscribers'}, current: 'Current',
      openPages: 'Homepage and Tools', quietPages: 'Other pages', presence: {on: 'Out', min: 'Tucked away'},
      gravity: 'Gravity mode', gravityNote: 'Dropped from high up, it opens a parachute.', show: 'Show the site companion', companionNote: 'Companion settings apply the next time a page opens.',
      chars: {milu: 'Milu', lili: 'Lili', pudding: 'Pudding', pagey: 'Pagey', navi: 'Navi'},
      studyTheme: 'Reading look', studyThemes: {dark: 'Ink night', light: 'Paper white', warm: 'Warm paper'}, fontSize: 'Body size (px)', headingSize: 'Heading size (px)',
      lineHeight: 'Line height', readerWidth: 'Text width (px)', previewHeading: 'Lecture heading', previewBody: 'Body text uses this size, line height and width. The Study Hub reading look is separate from the site day/night setting.',
      codeFont: 'Code font', codeFonts: {default: 'Default', consolas: 'Consolas', courier: 'Courier', sans: 'Same as text'}, mathScale: 'Formula size', previewCode: 'for (let i = 0; i < n; i++) total += x[i];',
      studyConflict: 'Study Hub settings changed elsewhere and were reloaded.', open: 'Open Study Hub',
      currency: 'Default ledger currency', currencyNote: 'Used when the ledger opens; the currency of each new entry also updates it.', toolsView: 'Tools layout', views: {grid: 'Icon grid', dock: 'Single-row dock'},
      notifyText: 'Calendar subscription, browser push and e-mail reminders are managed in Calendar → Account & reminders.', notifyLink: 'Open Calendar settings'
    }
  };
  const CHARS = [['milu', 'guest'], ['lili', 'member'], ['pudding', 'subscriber'], ['pagey', 'subscriber'], ['navi', 'subscriber']];
  const lang = () => window.GaryHubI18n?.language === 'en' ? 'en' : 'zh', t = () => TEXT[lang()];
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null && text !== '') n.textContent = text; return n; };
  const store = key => { try { return localStorage.getItem(key); } catch { return null; } };
  let prefs = null, timezone = 'Etc/UTC', user = null, study = null, studyTimer = 0, studyBusy = false, studyMessage = '';
  const statuses = {};

  function status(section, kind) {
    const node = statuses[section]; if (!node) return;
    node.textContent = kind === 'saving' ? t().saving : kind === 'saved' ? t().saved : kind === 'failed' ? t().failed : kind || '';
    node.dataset.kind = ['saving', 'saved', 'failed'].includes(kind) ? kind : 'note';
  }
  async function save(section, patch) {
    status(section, 'saving');
    try { const state = await window.GaryHubPrefs.saveNow(patch); prefs = state.prefs; timezone = state.timezone; status(section, 'saved'); }
    // Redraw first (the controls go back to the saved values), then say what went wrong.
    catch (error) { render(); status(section, error.status === 400 && error.message ? error.message : 'failed'); }
  }
  // A labelled group of radio buttons drawn as a segmented control.
  function choice(name, label, options, value, onChange, note) {
    const box = el('fieldset', 'setting'), legend = el('legend', '', label), group = el('div', 'segmented');
    for (const [key, text, swatch] of options) {
      const id = 'opt-' + name + '-' + key, input = el('input'), tag = el('label', '', text);
      if (swatch) { tag.dataset.swatch = ''; tag.style.setProperty('--swatch', swatch); }
      input.type = 'radio'; input.name = name; input.id = id; input.value = key; input.checked = key === value; tag.htmlFor = id;
      input.addEventListener('change', () => { if (input.checked) onChange(key); });
      group.append(input, tag);
    }
    box.append(legend, group);
    if (note) box.append(el('p', 'setting-note', note));
    return box;
  }
  function toggle(label, checked, onChange, note) {
    const box = el('div', 'setting setting-switch'), tag = el('label'), input = el('input');
    input.type = 'checkbox'; input.checked = checked; input.setAttribute('role', 'switch');
    input.addEventListener('change', () => onChange(input.checked));
    tag.append(input, el('span', '', label)); box.append(tag);
    if (note) box.append(el('p', 'setting-note', note));
    return box;
  }
  function section(id, ...children) {
    const box = el('section', 'settings-section'); box.id = id; box.setAttribute('aria-labelledby', id + '-title');
    const head = el('div', 'section-head'), title = el('h2', '', t().nav[id]); title.id = id + '-title';
    const note = el('p', 'section-status'); note.setAttribute('role', 'status'); statuses[id] = note;
    head.append(title, note); box.append(head, ...children);
    return box;
  }

  // Display settings apply at once in this page (hub-prefs.js) and are saved to the account.
  const SWATCH = {default: 'conic-gradient(#2f6fba 0 25%,#7a55b8 0 50%,#1d7f7a 0 75%,#a56d40 0)', blue: '#2f6fba', violet: '#7a55b8', teal: '#1d7f7a', brown: '#a56d40'};
  function display(section, key, value) { window.GaryHubPrefs.setDisplay(key, value, {save: false}); save(section, {[key]: value}); }
  function appearance() {
    const x = t();
    return section('appearance',
      choice('theme', x.theme, Object.entries(x.themes), window.GaryHubTheme.mode(), value => { window.GaryHubTheme.setMode(value, {save: false}); save('appearance', {'appearance.theme': value}); }, x.themeNote),
      choice('sky', x.sky, Object.entries(x.skies), prefs['appearance.sky'] || document.documentElement.dataset.ghSky || 'full', value => { window.GaryHubPrefs.setSky(value, {save: false}); save('appearance', {'appearance.sky': value}); }, x.skyNote),
      choice('accent', x.accent, Object.entries(x.accents).map(([key, label]) => [key, label, SWATCH[key]]), prefs['appearance.accent'] || 'default', value => display('appearance', 'appearance.accent', value === 'default' ? null : value), x.accentNote),
      choice('density', x.density, Object.entries(x.densities), prefs['appearance.density'] || 'standard', value => display('appearance', 'appearance.density', value === 'standard' ? null : value), x.densityNote));
  }
  function region() {
    const x = t(), box = el('div', 'setting'), label = el('label', '', x.timezone), row = el('div', 'inline');
    const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let field;
    if (zones.length) { field = el('select'); for (const zone of new Set([timezone, ...zones])) field.add(new Option(zone, zone)); }
    else { field = el('input'); field.maxLength = 64; field.spellcheck = false; }
    field.id = 'timezone'; field.value = timezone; label.htmlFor = 'timezone';
    field.addEventListener('change', () => save('region', {'region.timezone': field.value.trim()}));
    row.append(field);
    if (device && device !== timezone) {
      const use = el('button', 'chip', x.useDevice(device)); use.type = 'button';
      use.onclick = () => { if (zones.length && !zones.includes(device)) field.add(new Option(device, device)); field.value = device; save('region', {'region.timezone': device}); };
      row.append(use);
    }
    box.append(label, row, el('p', 'setting-note', x.timezoneNote));
    const today = new Date().toISOString().slice(0, 10), sample = {iso: today, zh: today.replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_, y, m, d) => y + '年' + Number(m) + '月' + Number(d) + '日'),
      us: today.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$2/$3/$1'), eu: today.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1')};
    return section('region',
      choice('language', x.language, [['zh', '中文'], ['en', 'English']], lang(), value => { window.GaryHubI18n?.setLanguage(value); save('region', {language: value}); }),
      box,
      choice('weekStart', x.weekStart, Object.entries(x.weekStarts), prefs['region.weekStart'] || 'monday', value => display('region', 'region.weekStart', value === 'monday' ? null : value), x.weekStartNote),
      choice('dateFormat', x.dateFormat, Object.entries(sample), prefs['region.dateFormat'] || 'iso', value => display('region', 'region.dateFormat', value === 'iso' ? null : value), x.dateFormatNote),
      choice('calendarView', x.calendarView, Object.entries(x.calendarViews), prefs['calendar.view'] || 'month', value => display('region', 'calendar.view', value === 'month' ? null : value), x.calendarViewNote));
  }
  function companion() {
    const x = t(), tier = user?.role === 'admin' || user?.accountTier === 'subscriber' ? 'subscriber' : user ? 'member' : 'guest';
    const rank = {guest: 0, member: 1, subscriber: 2}, chosen = prefs['companion.char'] || 'milu';
    const box = el('fieldset', 'setting'), grid = el('div', 'companions');
    box.append(el('legend', '', x.companionChar));
    for (const [id, need] of CHARS) {
      const allowed = rank[tier] >= rank[need], input = el('input'), card = el('label', 'companion-card'), image = el('img');
      input.type = 'radio'; input.name = 'char'; input.value = id; input.id = 'char-' + id; input.checked = id === chosen; input.disabled = !allowed;
      image.src = '/companion/characters/' + id + '/thumbnail.webp?v=2.4.1.5'; image.alt = ''; image.loading = 'lazy'; image.width = 72; image.height = 72;
      card.htmlFor = input.id; card.append(image, el('strong', '', x.chars[id]));
      if (!allowed) card.append(el('small', '', x.locked[need]));
      input.addEventListener('change', () => { if (input.checked) save('companion', {'companion.char': id}); });
      grid.append(input, card);
    }
    box.append(grid);
    return section('companion', box,
      choice('open', x.openPages, Object.entries(x.presence), prefs['companion.open'] || 'on', value => save('companion', {'companion.open': value})),
      choice('quiet', x.quietPages, Object.entries(x.presence), prefs['companion.quiet'] || 'min', value => save('companion', {'companion.quiet': value})),
      toggle(x.gravity, prefs['companion.mode'] === 'gravity', on => save('companion', {'companion.mode': on ? 'gravity' : 'free'}), x.gravityNote),
      toggle(x.show, prefs['companion.off'] !== true, on => save('companion', {'companion.off': !on}), x.companionNote));
  }

  async function studyRequest(path, options) {
    const response = await fetch('/api/academic/' + path, {cache: 'no-store', credentials: 'same-origin', ...options});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(Error(data.message || 'request'), {status: response.status});
    return data;
  }
  async function saveStudy() {
    if (studyBusy) { clearTimeout(studyTimer); studyTimer = setTimeout(saveStudy, 300); return; }
    studyBusy = true; status('study', 'saving');
    try {
      const {token} = await studyRequest('csrf');
      const result = await studyRequest('preferences', {method: 'PUT', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': token},
        body: JSON.stringify({accountId: study.accountId, revision: study.revision, studyTheme: study.studyTheme, fontSize: study.fontSize,
          headingSize: study.headingSize, lineHeight: study.lineHeight, readerWidth: study.readerWidth, codeFont: study.codeFont, mathScale: study.mathScale})});
      study.revision = result.revision; status('study', 'saved');
    } catch (error) {
      if (error.status === 409) { try { study = await studyRequest('preferences'); } catch {} studyMessage = t().studyConflict; render(); }
      else status('study', error.status === 400 && error.message !== 'request' ? error.message : 'failed');
    } finally { studyBusy = false; }
  }
  // Same stacks as the Study Hub reader (academic/app.js).
  const CODE_FONTS = {default: '"Cascadia Code",Consolas,"Liberation Mono",monospace', consolas: 'Consolas,"Cascadia Mono","Liberation Mono",monospace', courier: '"Courier New",Courier,monospace', sans: 'inherit'};
  function studySection() {
    const x = t();
    if (!study) return section('study', el('p', 'setting-note', x.loadFailed));
    const preview = el('div', 'study-preview');
    const paint = () => { preview.dataset.look = study.studyTheme; preview.style.setProperty('--sample-body', study.fontSize + 'px'); preview.style.setProperty('--sample-heading', study.headingSize + 'px');
      preview.style.setProperty('--sample-leading', study.lineHeight); preview.style.setProperty('--sample-width', study.readerWidth + 'px');
      preview.style.setProperty('--sample-code', CODE_FONTS[study.codeFont] || CODE_FONTS.default); preview.style.setProperty('--sample-math', study.mathScale); };
    const code = el('pre', 'sample-code'), formula = el('p', 'sample-math');
    code.append(el('code', '', x.previewCode));
    formula.innerHTML = '<i>E</i> = <i>mc</i><sup>2</sup>, &nbsp; ∫<sub>0</sub><sup>1</sup> <i>x</i><sup>2</sup> d<i>x</i> = 1/3';
    preview.append(el('h3', '', x.previewHeading), el('p', '', x.previewBody), code, formula);
    const grid = el('div', 'number-grid');
    for (const [key, label, min, max, step] of [['fontSize', x.fontSize, 14, 28, 1], ['headingSize', x.headingSize, 20, 54, 1], ['lineHeight', x.lineHeight, 1.4, 2.5, 0.05], ['readerWidth', x.readerWidth, 600, 1400, 50]]) {
      const tag = el('label', 'setting'), input = el('input'); input.type = 'number'; input.min = min; input.max = max; input.step = step; input.value = study[key]; input.required = true;
      tag.append(el('span', '', label), input);
      input.addEventListener('input', () => { if (!input.validity.valid || input.value === '') return; study[key] = key === 'lineHeight' ? Math.round(input.valueAsNumber * 100) / 100 : input.valueAsNumber; paint(); clearTimeout(studyTimer); studyTimer = setTimeout(saveStudy, 600); });
      grid.append(tag);
    }
    {
      const tag = el('label', 'setting'), input = el('input'); input.type = 'number'; input.min = 80; input.max = 150; input.step = 5; input.value = Math.round(study.mathScale * 100); input.required = true;
      tag.append(el('span', '', x.mathScale + ' (%)'), input);
      input.addEventListener('input', () => { if (!input.validity.valid || input.value === '') return; study.mathScale = input.valueAsNumber / 100; paint(); clearTimeout(studyTimer); studyTimer = setTimeout(saveStudy, 600); });
      grid.append(tag);
    }
    paint();
    const link = el('a', 'chip', x.open); link.href = '/study/';
    const box = section('study',
      choice('studyTheme', x.studyTheme, Object.entries(x.studyThemes), study.studyTheme, value => { study.studyTheme = value; paint(); saveStudy(); }),
      choice('codeFont', x.codeFont, Object.entries(x.codeFonts), study.codeFont, value => { study.codeFont = value; paint(); saveStudy(); }),
      grid, preview, link);
    if (studyMessage) { status('study', studyMessage); studyMessage = ''; }
    return box;
  }
  function tools() {
    const x = t(), box = el('div', 'setting'), label = el('label', '', x.currency), select = el('select');
    for (const code of ['CNY', 'USD', 'CAD', 'HKD']) select.add(new Option(code, code));
    select.id = 'currency'; label.htmlFor = 'currency'; select.value = prefs['ledger.currency'] || 'CNY';
    select.addEventListener('change', () => save('tools', {'ledger.currency': select.value}));
    box.append(label, select, el('p', 'setting-note', x.currencyNote));
    return section('tools', box,
      choice('view', x.toolsView, Object.entries(x.views), prefs['tools.view'] || (store('garyhub.tools.view') === 'dock' ? 'dock' : 'grid'), value => save('tools', {'tools.view': value})));
  }
  function notify() {
    const x = t(), link = el('a', 'chip', x.notifyLink); link.href = 'https://calendar.garyhub.uk/?panel=account';
    return section('notify', el('p', 'setting-note', x.notifyText), link);
  }

  function render() {
    const x = t(), y = scrollY;
    document.title = x.title + ' · GaryHub';
    const head = el('header', 'settings-head');
    head.append(el('h1', '', x.title), el('p', '', x.intro));
    if (!prefs) { root.replaceChildren(head, el('p', 'setting-note', x.loadFailed)); return; }
    const nav = el('nav', 'settings-nav'); nav.setAttribute('aria-label', x.title);
    for (const [id, label] of Object.entries(x.nav)) { const a = el('a', '', label); a.href = '#' + id; nav.append(a); }
    const body = el('div', 'settings-body');
    body.append(appearance(), region(), companion(), studySection(), tools(), notify());
    const layout = el('div', 'settings-layout'); layout.append(nav, body);
    root.replaceChildren(head, layout);
    scrollTo(0, y);
  }
  document.addEventListener('garyhub:identity', event => { const next = event.detail?.user || null; if (next?.id !== user?.id) { user = next; if (prefs) render(); } });
  document.addEventListener('garyhub:language', () => { if (prefs) render(); });
  document.addEventListener('garyhub:theme', () => { const current = document.querySelector('input[name="theme"]:checked'); if (current && current.value !== window.GaryHubTheme.mode()) render(); });
  addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  (async () => {
    user = window.GaryHubIdentity?.user || null;
    const [state] = await Promise.all([window.GaryHubPrefs.ready, studyRequest('preferences').then(v => { study = v; }).catch(() => { study = null; })]);
    // A Study Hub record that never chose a look reports "auto"; show the look it currently gets.
    if (study && !['dark', 'light', 'warm'].includes(study.studyTheme)) study.studyTheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if (study) { study.codeFont = study.codeFont || 'default'; study.mathScale = typeof study.mathScale === 'number' ? study.mathScale : 1; }
    prefs = state ? window.GaryHubPrefs.prefs : null; timezone = window.GaryHubPrefs.timezone || 'Etc/UTC';
    render();
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
  })();
})();
