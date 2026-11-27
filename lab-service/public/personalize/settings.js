/* GaryHub settings centre (v2.4.1.4). Account preferences go through hub-prefs.js (/api/hub/preferences); the Study Hub
   reading settings stay in the Study Hub's own record (/api/academic/preferences). Every control saves on change.
   v2.4.1.6: the homepage cards and entry order, pinned / hidden / recent tools, and the notification centre — channels,
   push quiet hours, the default reminder of new tasks, push devices and the calendar subscription (/api/hub/notify). */
(() => {
  'use strict';
  const root = document.getElementById('settings');
  const TEXT = {
    zh: {
      title: '设置', intro: '设置随账号保存，换手机、换电脑都会跟着你。每一项改动后立即保存。',
      nav: {appearance: '外观', region: '语言与地区', home: '主页', companion: '网站伙伴', study: '学习中心', tools: '记账与工具台', notify: '通知与提醒'},
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
      // v2.4.1.6
      show: '显示', up: '上移', down: '下移',
      cards: '今日卡片', cardsNote: '登录后主页第一屏的卡片：勾选要显示的，用箭头调整顺序。“本月预算”取记账中“全部消费”的月度预算。',
      cardNames: {schedule: '今日日程', todos: '待办', study: '在读讲义', notices: '未读通知', budget: '本月预算'},
      portals: '入口顺序', portalsNote: '主页“从这里出发”中入口卡片的顺序。', portalNames: {tools: '工具台', calendar: '日历与记录', study: '学习中心', sites: '外站与课程'},
      pins: '常用与隐藏', pinsNote: '置顶的工具排在工具台最前面（最多 8 个）；隐藏的工具不在工具台显示，但搜索仍能找到。', pinStates: {pinned: '置顶', normal: '默认', hidden: '隐藏'},
      tooManyPins: '最多置顶 8 个工具。', recent: '最近使用', recentNote: '工具台顶部显示最近打开的工具。', recentNone: '还没有记录。', recentClear: '清除记录',
      channels: '通知渠道', kindHeader: '类别', kinds: {updates: '网站更新', reminders: '事项提醒', alerts: 'A 股到价提醒'}, channelNames: {inApp: '站内', push: '推送', email: '邮件'},
      updatesLocked: '网站更新始终发送站内通知',
      channelsNote: '网站更新始终发站内通知；勾选推送或邮件后，发布后一天内仍未读的更新说明会再发送一次。事项提醒只对开启了提醒的事项发送。',
      emailOk: address => '邮件发送到 ' + address + '。', emailMissing: '账号邮箱尚未验证，勾选了邮件也不会发送。', verify: '去验证邮箱', mailOff: '服务器暂未配置邮件发送，邮件不会发送。',
      noDevices: '还没有设备开启推送，勾选了推送也不会送达。',
      quiet: '推送免打扰', quietNote: zone => '这段时间不发推送，站内通知和邮件照常；网站更新的推送在时段结束后补发。按账号时区（' + zone + '）计算。',
      from: '开始', to: '结束', sameTimes: '开始和结束时间不能相同。',
      reminder: '新建事项的默认提醒', reminders: {off: '不提醒', once: '每天一次', twice: '每天两次'}, time1: '提醒时间', time2: '第二次提醒',
      reminderNote: '在日历新建事项时自动勾选提醒并填好时间，仍可在表单中修改；不影响已有事项。',
      devices: '已开启推送的设备', devicesNone: '还没有设备开启推送。', added: at => '添加于 ' + at, lastSent: at => '最近送达 ' + at, neverSent: '尚未送达', failing: '最近发送失败',
      remove: '移除', removed: '设备已移除。', confirmRemove: '移除后这台设备不再收到推送，直到在它上面重新开启。继续吗？', enableHere: '在当前设备开启推送',
      services: {fcm: 'Chrome / Edge / Android', mozilla: 'Firefox', apple: 'Safari（Apple 设备）', windows: 'Windows', other: '其他浏览器'},
      feed: '日历订阅（ICS）', feedNote: '把日程同步到手机或电脑自带的日历：复制地址，在日历应用里选择“通过 URL 订阅”。地址相当于只读密码，请勿分享；重新生成或关闭后，旧地址立即失效。',
      feedOn: (created, used) => '订阅已开启，创建于 ' + created + '；' + (used ? '最近同步 ' + used + '。' : '还没有日历应用来同步过。'), feedOff: '订阅未开启。',
      create: '生成订阅地址', rotate: '重新生成地址', off: '关闭订阅', copy: '复制', copied: '已复制。', shownOnce: '地址只显示这一次，请现在复制。',
      confirmRotate: '重新生成后，旧地址会立即失效。继续吗？', notifyLoadFailed: '通知设置暂时无法载入，请刷新页面。'
    },
    en: {
      title: 'Settings', intro: 'Settings are saved to your account and follow you to every device. Each change is saved at once.',
      nav: {appearance: 'Appearance', region: 'Language & region', home: 'Homepage', companion: 'Site companion', study: 'Study Hub', tools: 'Ledger & Tools', notify: 'Notifications'},
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
      // v2.4.1.6
      show: 'Show', up: 'Move up', down: 'Move down',
      cards: 'Today cards', cardsNote: 'The cards on the first screen of the homepage once you are signed in: tick the ones to show and order them with the arrows. "Budget this month" uses the ledger’s monthly budget for all spending.',
      cardNames: {schedule: 'Schedule', todos: 'To-dos', study: 'Reading', notices: 'Unread notices', budget: 'Budget this month'},
      portals: 'Entry order', portalsNote: 'The order of the entry cards under "Start here" on the homepage.', portalNames: {tools: 'Tools', calendar: 'Calendar', study: 'Study Hub', sites: 'Elsewhere'},
      pins: 'Pinned and hidden', pinsNote: 'Pinned tools come first on the tools desk (up to 8); hidden tools leave the desk but search still finds them.', pinStates: {pinned: 'Pinned', normal: 'Default', hidden: 'Hidden'},
      tooManyPins: 'Up to 8 tools can be pinned.', recent: 'Recently used', recentNote: 'The tools desk shows the tools you opened last at the top.', recentNone: 'Nothing yet.', recentClear: 'Clear',
      channels: 'Channels', kindHeader: 'Kind', kinds: {updates: 'Site updates', reminders: 'Task reminders', alerts: 'A-share price alerts'}, channelNames: {inApp: 'In-app', push: 'Push', email: 'E-mail'},
      updatesLocked: 'Site updates always appear in the in-app inbox',
      channelsNote: 'Site updates always appear in the in-app inbox; with push or e-mail ticked, release notes still unread a day after publication are sent once more. Task reminders only go out for tasks with a reminder.',
      emailOk: address => 'E-mail goes to ' + address + '.', emailMissing: 'Your e-mail address is not verified, so no e-mail is sent even when ticked.', verify: 'Verify e-mail', mailOff: 'The server has no mail service configured; no e-mail is sent.',
      noDevices: 'No device has push turned on, so push notices reach nobody yet.',
      quiet: 'Push quiet hours', quietNote: zone => 'No push during these hours; in-app notices and e-mail continue, and site-update pushes follow when they end. Uses your account time zone (' + zone + ').',
      from: 'From', to: 'Until', sameTimes: 'Start and end cannot be the same.',
      reminder: 'Default reminder for new tasks', reminders: {off: 'None', once: 'Once a day', twice: 'Twice a day'}, time1: 'Reminder time', time2: 'Second reminder',
      reminderNote: 'A new calendar task starts with the reminder ticked and these times filled in; you can still change them. Existing tasks are not changed.',
      devices: 'Devices with push', devicesNone: 'No device has push turned on.', added: at => 'Added ' + at, lastSent: at => 'last delivered ' + at, neverSent: 'nothing delivered yet', failing: 'recent delivery failed',
      remove: 'Remove', removed: 'Device removed.', confirmRemove: 'This device will stop receiving push until push is turned on there again. Continue?', enableHere: 'Turn on push on this device',
      services: {fcm: 'Chrome / Edge / Android', mozilla: 'Firefox', apple: 'Safari (Apple device)', windows: 'Windows', other: 'Other browser'},
      feed: 'Calendar subscription (ICS)', feedNote: 'Sync your schedule to the calendar app on your phone or computer: copy the address and choose "Subscribe by URL". The address works like a read-only password; do not share it. A new address or turning this off stops the old one at once.',
      feedOn: (created, used) => 'Subscription on, created ' + created + '; ' + (used ? 'last synced ' + used + '.' : 'no calendar app has synced yet.'), feedOff: 'Subscription is off.',
      create: 'Create address', rotate: 'Create a new address', off: 'Turn off', copy: 'Copy', copied: 'Copied.', shownOnce: 'The address is shown only now; copy it.',
      confirmRotate: 'The old address will stop working at once. Continue?', notifyLoadFailed: 'Notification settings cannot be loaded right now. Please refresh.'
    }
  };
  const CHARS = [['milu', 'guest'], ['lili', 'member'], ['pudding', 'subscriber'], ['pagey', 'subscriber'], ['navi', 'subscriber']];
  const lang = () => window.GaryHubI18n?.language === 'en' ? 'en' : 'zh', t = () => TEXT[lang()];
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null && text !== '') n.textContent = text; return n; };
  const store = key => { try { return localStorage.getItem(key); } catch { return null; } };
  let prefs = null, timezone = 'Etc/UTC', user = null, study = null, studyTimer = 0, studyBusy = false, studyMessage = '';
  const statuses = {};
  // v2.4.1.6
  const HALF_HOURS = Array.from({length: 48}, (_, i) => String(Math.floor(i / 2)).padStart(2, '0') + (i % 2 ? ':30' : ':00'));
  const CARD_IDS = ['schedule', 'todos', 'study', 'notices', 'budget'], DEFAULT_CARDS = CARD_IDS.slice(0, 4), PORTAL_IDS = ['tools', 'calendar', 'study', 'sites'];
  const KINDS = ['updates', 'reminders', 'alerts'], CHANNELS = ['inApp', 'push', 'email'];
  const DEFAULT_CHANNELS = {updates: {inApp: true, push: false, email: false}, reminders: {inApp: false, push: true, email: true}, alerts: {inApp: true, push: true, email: false}};
  const CALENDAR_ACCOUNT = 'https://calendar.garyhub.uk/?panel=account';
  let notifyState = null, notifyCsrf = null, feedUrl = '', deviceMessage = '', feedMessage = '';
  const listPref = key => Array.isArray(prefs?.[key]) ? prefs[key] : null;
  const sameList = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);
  const when = value => { if (!value) return ''; const d = new Date(String(value).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? '' : 'Z')); return Number.isNaN(d.getTime()) ? value : d.toLocaleString(lang() === 'en' ? 'en-US' : 'zh-CN'); };
  // Same rule as the tools desk (tools-dock.js) for which tools an account sees.
  const permitted = tool => tool.audience === 'paid-only' ? user?.accountTier === 'subscriber' : !tool.audience || user?.role === 'admin' || tool.audience === 'subscriber' && user?.accountTier === 'subscriber';

  function status(section, kind) {
    const node = statuses[section]; if (!node) return;
    node.textContent = kind === 'saving' ? t().saving : kind === 'saved' ? t().saved : kind === 'failed' ? t().failed : kind || '';
    node.dataset.kind = ['saving', 'saved', 'failed'].includes(kind) ? kind : 'note';
  }
  async function save(section, patch) {
    status(section, 'saving');
    try { const state = await window.GaryHubPrefs.saveNow(patch); prefs = state.prefs; timezone = state.timezone; status(section, 'saved'); }
    // Redraw first (the controls go back to the saved values), then say what went wrong.
    catch (error) { prefs = window.GaryHubPrefs.prefs || prefs; render(); status(section, error.status === 400 && error.message ? error.message : 'failed'); }
  }
  // Lists and other settings whose controls depend on each other: show the change at once, then save it (v2.4.1.6).
  function apply(sectionId, patch) {
    const focus = document.activeElement?.id;
    prefs = {...prefs, ...patch};
    render();
    if (focus) document.getElementById(focus)?.focus();
    save(sectionId, patch);
  }
  // An ordered list with up/down buttons and, when items carry "on", a checkbox to show each one.
  function orderList(name, label, items, note, onChange) {
    const x = t(), box = el('fieldset', 'setting'), list = el('ol', 'order-list');
    box.append(el('legend', '', label));
    items.forEach((item, index) => {
      const row = el('li', 'order-row');
      if (item.on !== undefined) {
        const check = el('input'), tag = el('label', '', item.text);
        check.type = 'checkbox'; check.checked = item.on; check.id = 'ord-' + name + '-' + item.id; tag.htmlFor = check.id;
        check.addEventListener('change', () => onChange(items.map(other => other === item ? {...other, on: check.checked} : other)));
        row.append(check, tag);
      } else row.append(el('span', 'order-name', item.text));
      const move = el('span', 'order-move');
      for (const [delta, symbol, title] of [[-1, '↑', x.up], [1, '↓', x.down]]) {
        const button = el('button', 'order-button', symbol), target = index + delta;
        button.type = 'button'; button.id = 'mv-' + name + '-' + item.id + (delta < 0 ? '-up' : '-down');
        button.title = title; button.setAttribute('aria-label', title + '：' + item.text); button.disabled = target < 0 || target >= items.length;
        button.addEventListener('click', () => { const next = items.slice(); [next[index], next[target]] = [next[target], next[index]]; onChange(next); });
        move.append(button);
      }
      row.append(move); list.append(row);
    });
    box.append(list);
    if (note) box.append(el('p', 'setting-note', note));
    return box;
  }
  function timeSelect(id, value, onChange) {
    const select = el('select'); select.id = id;
    for (const time of HALF_HOURS) select.add(new Option(time, time));
    select.value = value; select.addEventListener('change', () => onChange(select.value));
    return select;
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
  function home() {
    const x = t(), chosen = (listPref('home.cards') || DEFAULT_CARDS).filter(id => CARD_IDS.includes(id));
    const cards = [...chosen, ...CARD_IDS.filter(id => !chosen.includes(id))].map(id => ({id, text: x.cardNames[id], on: chosen.includes(id)}));
    const order = (listPref('home.portals') || PORTAL_IDS).filter(id => PORTAL_IDS.includes(id));
    const portals = [...order, ...PORTAL_IDS.filter(id => !order.includes(id))].map(id => ({id, text: x.portalNames[id]}));
    return section('home',
      orderList('cards', x.cards, cards, x.cardsNote, next => { const ids = next.filter(item => item.on).map(item => item.id); apply('home', {'home.cards': sameList(ids, DEFAULT_CARDS) ? null : ids}); }),
      orderList('portals', x.portals, portals, x.portalsNote, next => { const ids = next.map(item => item.id); apply('home', {'home.portals': sameList(ids, PORTAL_IDS) ? null : ids}); }));
  }
  function companion() {
    const x = t(), tier = user?.role === 'admin' || user?.accountTier === 'subscriber' ? 'subscriber' : user ? 'member' : 'guest';
    const rank = {guest: 0, member: 1, subscriber: 2}, chosen = prefs['companion.char'] || 'milu';
    const box = el('fieldset', 'setting'), grid = el('div', 'companions');
    box.append(el('legend', '', x.companionChar));
    for (const [id, need] of CHARS) {
      const allowed = rank[tier] >= rank[need], input = el('input'), card = el('label', 'companion-card'), image = el('img');
      input.type = 'radio'; input.name = 'char'; input.value = id; input.id = 'char-' + id; input.checked = id === chosen; input.disabled = !allowed;
      image.src = '/companion/characters/' + id + '/thumbnail.webp?v=2.4.4.0'; image.alt = ''; image.loading = 'lazy'; image.width = 72; image.height = 72;
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
    // v2.4.1.6: pin (in order), keep or hide each tool this account can see; clear "recently used".
    const catalog = (window.GaryHubTools?.tools || []).filter(permitted), pinned = listPref('tools.pinned') || [], hidden = listPref('tools.hidden') || [];
    const name = tool => tool.name[lang()] || tool.name.zh;
    const rows = [...pinned.map(id => catalog.find(tool => tool.id === id)).filter(Boolean), ...catalog.filter(tool => !pinned.includes(tool.id))];
    const pins = el('fieldset', 'setting'), list = el('ul', 'pin-list');
    pins.append(el('legend', '', x.pins));
    for (const tool of rows) {
      const row = el('li', 'pin-row'), state = pinned.includes(tool.id) ? 'pinned' : hidden.includes(tool.id) ? 'hidden' : 'normal';
      const group = choice('pin-' + tool.id, '', Object.entries(x.pinStates), state, value => {
        const nextPinned = pinned.filter(id => id !== tool.id), nextHidden = hidden.filter(id => id !== tool.id);
        if (value === 'pinned') { if (nextPinned.length >= 8) { render(); status('tools', x.tooManyPins); return; } nextPinned.push(tool.id); }
        if (value === 'hidden') nextHidden.push(tool.id);
        apply('tools', {'tools.pinned': nextPinned.length ? nextPinned : null, 'tools.hidden': nextHidden.length ? nextHidden : null});
      });
      group.querySelector('legend')?.remove();
      group.classList.add('pin-choice');
      row.append(el('span', 'pin-name', name(tool)), group);
      if (state === 'pinned') {
        const at = pinned.indexOf(tool.id), move = el('span', 'order-move');
        for (const [delta, symbol, title] of [[-1, '↑', x.up], [1, '↓', x.down]]) {
          const button = el('button', 'order-button', symbol), target = at + delta;
          button.type = 'button'; button.id = 'mv-pin-' + tool.id + (delta < 0 ? '-up' : '-down'); button.title = title; button.setAttribute('aria-label', title + '：' + name(tool));
          button.disabled = target < 0 || target >= pinned.length;
          button.addEventListener('click', () => { const next = pinned.slice(); [next[at], next[target]] = [next[target], next[at]]; apply('tools', {'tools.pinned': next}); });
          move.append(button);
        }
        row.append(move);
      }
      list.append(row);
    }
    pins.append(list, el('p', 'setting-note', x.pinsNote));
    const recent = (listPref('tools.recent') || []).map(id => catalog.find(tool => tool.id === id)).filter(Boolean);
    const recentBox = el('div', 'setting'), recentRow = el('div', 'inline');
    recentBox.append(el('span', '', x.recent));
    recentRow.append(el('span', 'recent-names', recent.length ? recent.map(name).join(' · ') : x.recentNone));
    if (recent.length) { const clear = el('button', 'chip', x.recentClear); clear.type = 'button'; clear.id = 'recent-clear'; clear.onclick = () => apply('tools', {'tools.recent': null}); recentRow.append(clear); }
    recentBox.append(recentRow, el('p', 'setting-note', x.recentNote));
    return section('tools', box,
      choice('view', x.toolsView, Object.entries(x.views), prefs['tools.view'] || (store('garyhub.tools.view') === 'dock' ? 'dock' : 'grid'), value => save('tools', {'tools.view': value})),
      pins, recentBox);
  }

  // ---- Notifications (v2.4.1.6) ----
  async function notifyWrite(path, body) {
    if (!notifyCsrf) notifyCsrf = (await (await fetch('/api/csrf', {cache: 'no-store', credentials: 'same-origin'})).json()).token;
    const response = await fetch('/api/hub/' + path, {method: 'POST', cache: 'no-store', credentials: 'same-origin',
      headers: {'Content-Type': 'application/json', 'X-CSRF-Token': notifyCsrf}, body: JSON.stringify(body)});
    if (response.status === 403) notifyCsrf = null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(Error(data.message || t().failed), {status: response.status});
    return data;
  }
  async function notifyAction(path, body, done) {
    try { const data = await notifyWrite(path, body); notifyState = data; done(data, null); }
    catch (error) { done(null, error); }
    render();
  }
  function channelTable() {
    const x = t(), table = el('table', 'channel-table'), head = el('tr'), body = el('tbody'), thead = el('thead');
    head.append(el('th', '', x.kindHeader), ...CHANNELS.map(channel => el('th', '', x.channelNames[channel])));
    thead.append(head);
    for (const kind of KINDS) {
      const row = el('tr'), label = el('th', '', x.kinds[kind]);
      label.scope = 'row'; row.append(label);
      for (const channel of CHANNELS) {
        const cell = el('td'), box = el('input'), key = 'notify.' + kind + '.' + channel, saved = prefs[key];
        box.type = 'checkbox'; box.id = 'ch-' + kind + '-' + channel; box.setAttribute('aria-label', x.kinds[kind] + ' · ' + x.channelNames[channel]);
        if (kind === 'updates' && channel === 'inApp') { box.checked = true; box.disabled = true; box.title = x.updatesLocked; }
        else {
          box.checked = typeof saved === 'boolean' ? saved : DEFAULT_CHANNELS[kind][channel];
          box.addEventListener('change', () => apply('notify', {[key]: box.checked === DEFAULT_CHANNELS[kind][channel] ? null : box.checked}));
        }
        cell.append(box); row.append(cell);
      }
      body.append(row);
    }
    table.append(thead, body);
    const wrap = el('div', 'setting'), scroll = el('div', 'table-scroll');
    scroll.append(table);
    wrap.append(el('span', '', x.channels), scroll, el('p', 'setting-note', x.channelsNote));
    const mail = !notifyState.mail ? x.mailOff : notifyState.email.verified ? x.emailOk(notifyState.email.address) : x.emailMissing;
    const mailNote = el('p', 'setting-note', mail);
    if (notifyState.mail && !notifyState.email.verified) { const link = el('a', '', ' ' + x.verify + ' →'); link.href = CALENDAR_ACCOUNT; mailNote.append(link); }
    wrap.append(mailNote);
    if (!notifyState.devices.length) wrap.append(el('p', 'setting-note', x.noDevices));
    return wrap;
  }
  function quietHours() {
    const x = t(), from = prefs['push.quietFrom'], to = prefs['push.quietTo'], on = !!(from && to);
    const box = toggle(x.quiet, on, value => apply('notify', value ? {'push.quietFrom': '22:00', 'push.quietTo': '07:00'} : {'push.quietFrom': null, 'push.quietTo': null}), x.quietNote(timezone));
    box.querySelector('input').id = 'quiet-switch';
    if (on) {
      const row = el('div', 'inline time-row'), pick = (which, other) => value => {
        const next = {from, to, [which]: value};
        if (next.from === next.to) { render(); status('notify', x.sameTimes); return; }
        apply('notify', {'push.quietFrom': next.from, 'push.quietTo': next.to});
      };
      const a = el('label', '', x.from), b = el('label', '', x.to);
      a.htmlFor = 'quiet-from'; b.htmlFor = 'quiet-to';
      row.append(a, timeSelect('quiet-from', from, pick('from')), b, timeSelect('quiet-to', to, pick('to')));
      box.insertBefore(row, box.querySelector('.setting-note'));
    }
    return box;
  }
  function defaultReminder() {
    const x = t(), kind = prefs['tasks.reminder'] || 'off', first = prefs['tasks.reminderTime1'] || '09:00', second = prefs['tasks.reminderTime2'] || '18:00';
    const box = choice('taskReminder', x.reminder, Object.entries(x.reminders), kind, value => apply('notify', {'tasks.reminder': value === 'off' ? null : value}), x.reminderNote);
    if (kind !== 'off') {
      const row = el('div', 'inline time-row'), a = el('label', '', x.time1);
      a.htmlFor = 'reminder-time1';
      const set = (key, fallback, other) => value => {
        if (kind === 'twice' && value === other) { render(); status('notify', x.sameTimes); return; }
        apply('notify', {[key]: value === fallback ? null : value});
      };
      row.append(a, timeSelect('reminder-time1', first, set('tasks.reminderTime1', '09:00', second)));
      if (kind === 'twice') { const b = el('label', '', x.time2); b.htmlFor = 'reminder-time2'; row.append(b, timeSelect('reminder-time2', second, set('tasks.reminderTime2', '18:00', first))); }
      box.insertBefore(row, box.querySelector('.setting-note'));
    }
    return box;
  }
  function devices() {
    const x = t(), box = el('div', 'setting');
    box.append(el('span', '', x.devices));
    if (!notifyState.devices.length) box.append(el('p', 'setting-note', x.devicesNone));
    else {
      const list = el('ul', 'device-list');
      for (const device of notifyState.devices) {
        const row = el('li', 'device-row'), info = el('div', 'device-info'), remove = el('button', 'chip', x.remove);
        info.append(el('strong', '', device.label || x.services[device.service] || x.services.other),
          el('small', '', [x.added(when(device.createdAt)), device.lastSuccessAt ? x.lastSent(when(device.lastSuccessAt)) : x.neverSent, device.failing ? x.failing : ''].filter(Boolean).join(' · ')));
        remove.type = 'button'; remove.id = 'device-remove-' + device.id;
        remove.onclick = () => { if (!confirm(x.confirmRemove)) return; remove.disabled = true;
          notifyAction('notify/devices/' + device.id + '/remove', {accountId: notifyState.accountId}, (data, error) => { deviceMessage = error ? error.message : x.removed; }); };
        row.append(info, remove); list.append(row);
      }
      box.append(list);
    }
    const message = el('p', 'setting-note block-status', deviceMessage); message.setAttribute('role', 'status');
    const link = el('a', 'chip', x.enableHere + ' →'); link.href = CALENDAR_ACCOUNT;
    box.append(message, link);
    return box;
  }
  function subscription() {
    const x = t(), feed = notifyState.feed, box = el('div', 'setting'), row = el('div', 'inline');
    box.append(el('span', '', x.feed), el('p', 'setting-note', x.feedNote));
    const create = el('button', 'chip', feed.enabled ? x.rotate : x.create);
    create.type = 'button'; create.id = 'feed-create';
    create.onclick = () => { if (feed.enabled && !confirm(x.confirmRotate)) return; create.disabled = true;
      notifyAction('notify/feed', {accountId: notifyState.accountId, action: 'create'}, (data, error) => { if (data) { feedUrl = data.feedUrl; feedMessage = x.shownOnce; } else feedMessage = error.message; }); };
    row.append(create);
    if (feed.enabled) {
      const off = el('button', 'chip', x.off); off.type = 'button'; off.id = 'feed-off';
      off.onclick = () => { off.disabled = true; notifyAction('notify/feed', {accountId: notifyState.accountId, action: 'off'}, (data, error) => { if (data) { feedUrl = ''; feedMessage = ''; } else feedMessage = error.message; }); };
      row.append(off);
    }
    box.append(row);
    if (feedUrl) {
      const line = el('div', 'inline feed-url'), input = el('input'), copy = el('button', 'chip', x.copy);
      input.readOnly = true; input.value = feedUrl; input.id = 'feed-url'; input.setAttribute('aria-label', x.feed); input.onfocus = () => input.select();
      copy.type = 'button';
      copy.onclick = async () => { try { await navigator.clipboard.writeText(feedUrl); } catch { input.select(); document.execCommand('copy'); } feedMessage = x.copied; message.textContent = feedMessage; };
      line.append(input, copy); box.append(line);
    }
    const message = el('p', 'setting-note block-status', [feedMessage, feed.enabled ? x.feedOn(when(feed.createdAt), feed.lastUsedAt && when(feed.lastUsedAt)) : x.feedOff].filter(Boolean).join(' '));
    message.setAttribute('role', 'status');
    box.append(message);
    return box;
  }
  function notify() {
    if (!notifyState || (user && notifyState.accountId !== user.id)) return section('notify', el('p', 'setting-note', t().notifyLoadFailed));
    return section('notify', channelTable(), quietHours(), defaultReminder(), devices(), subscription());
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
    body.append(appearance(), region(), home(), companion(), studySection(), tools(), notify());
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
    const [state] = await Promise.all([window.GaryHubPrefs.ready, studyRequest('preferences').then(v => { study = v; }).catch(() => { study = null; }),
      fetch('/api/hub/notify', {cache: 'no-store', credentials: 'same-origin'}).then(r => r.ok ? r.json() : null).then(v => { notifyState = v; }).catch(() => { notifyState = null; })]);
    // A Study Hub record that never chose a look reports "auto"; show the look it currently gets.
    if (study && !['dark', 'light', 'warm'].includes(study.studyTheme)) study.studyTheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if (study) { study.codeFont = study.codeFont || 'default'; study.mathScale = typeof study.mathScale === 'number' ? study.mathScale : 1; }
    prefs = state ? window.GaryHubPrefs.prefs : null; timezone = window.GaryHubPrefs.timezone || 'Etc/UTC';
    render();
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
  })();
})();
