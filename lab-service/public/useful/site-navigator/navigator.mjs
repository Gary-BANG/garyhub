import { fromFile, fromFolderInput, fromHandle, titleOf, packageFiles } from './sources.mjs?v=2.4.4.2';
import {
  json,
  mutate,
  listSites,
  bindingsFor,
  readCopy,
  link,
  forget,
  report,
  audit
} from './permissions.mjs?v=2.4.4.2';
import { renderSite } from './viewer.mjs';

const $ = (id) => document.getElementById(id);
const en = /(?:^|;\s*)garyhub_language=en(?:;|$)/.test(document.cookie);
const t = (zh, english) => (en ? english : zh);
if (en) {
  document.documentElement.lang = 'en';
  document.title = 'Personal sites · GaryHub';
  document.querySelectorAll('[data-en]').forEach((el) => (el.textContent = el.dataset.en));
  $('search').placeholder = 'Search websites';
  $('leave').textContent = '← Back to sites';
  $('back-asset').textContent = '← Back to website';
}
window.GaryHubTheme?.bind((v) => document.documentElement.toggleAttribute('data-dark', v === 'dark'));
$('theme').onclick = () =>
  window.GaryHubTheme ? GaryHubTheme.toggle() : document.documentElement.toggleAttribute('data-dark');
$('login').href =
  'https://calendar.garyhub.uk/login/?next=' +
  encodeURIComponent('https://tools.garyhub.uk/useful/site-navigator/' + location.search);
const labels = {
  html: t('本地网页', 'Local HTML'),
  folder: t('本地文件夹', 'Local folder'),
  zip: t('ZIP 网站', 'ZIP website'),
  url: t('网址', 'Web address')
};
let account = 0,
  sites = [],
  records = new Map(),
  wanted = null,
  source = null,
  mode = 'local',
  pickSeq = 0,
  refreshSeq = 0,
  openSeq = 0;
let currentFiles = null,
  root = '',
  dispose = null,
  pdf = null,
  page = 1,
  renderSeq = 0;
let reading = false,
  saving = false,
  nameEdited = false;
const useBasicNext = new Set();
const deep = new URLSearchParams(location.search).get('site');
let followed = false,
  draftId = null;
function say(id, message) {
  const e = $(id);
  e.textContent = message;
  if (id === 'reader-status') e.hidden = !message;
}
function error(e) {
  if (e?.name !== 'AbortError')
    say(
      $('drawer').open ? 'form-status' : $('reader').open ? 'reader-status' : 'status',
      e.message || String(e)
    );
}
const run =
  (fn) =>
  (...args) =>
    Promise.resolve(fn(...args)).catch(error);
const button = (text, fn) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.onclick = run(fn);
  return b;
};
function finishReader() {
  openSeq++;
  dispose?.();
  dispose = null;
  currentFiles = null;
  endAsset();
  if (document.fullscreenElement === $('reader-content')) document.exitFullscreen().catch(() => {});
  $('reader').classList.remove('maximized');
  if ($('reader').open) $('reader').close();
  syncFullscreen();
  say('reader-status', '');
}
function endAsset() {
  renderSeq++;
  if (pdf) {
    pdf.destroy().catch(() => {});
    pdf = null;
  }
  $('asset').hidden = true;
  $('asset-body').replaceChildren();
  $('frame').hidden = false;
}
function applyIdentity(uid, name) {
  if (account !== uid) {
    sites = [];
    records.clear();
    finishReader();
    if ($('drawer').open) $('drawer').close();
    pickSeq++;
    source = wanted = null;
    account = uid;
    paint();
  }
  $('who').textContent = name || '';
  $('login').hidden = !!uid;
}
async function refresh() {
  const token = ++refreshSeq,
    me = await json('/api/hub/me');
  if (token !== refreshSeq) return;
  applyIdentity(me.user?.id || 0, me.user?.username);
  if (!account) {
    paint();
    return;
  }
  const id = account;
  // Only prune bindings observed before this authenticated list request. Another tab may be adding one.
  const previous = await bindingsFor(id).catch(() => []);
  const data = await listSites();
  if (token !== refreshSeq || id !== account || data.accountId !== id) return;
  const listed = new Set(data.sites.map((item) => item.id));
  await Promise.all(
    previous.filter((r) => !listed.has(r.site)).map((r) => forget(id, r.site).catch(() => {}))
  );
  const bindings = await bindingsFor(id).catch(() => []);
  if (token !== refreshSeq || id !== account) return;
  records = new Map(bindings.map((record) => [record.site, record]));
  sites = data.sites;
  paint();
  if (deep && !followed) {
    followed = true;
    const target = sites.find((s) => s.id === deep);
    if (target) {
      const el = document.getElementById('site-' + target.id);
      el?.scrollIntoView({ block: 'center' });
      (el?.querySelector('.renew') || el?.querySelector('button'))?.focus();
      say(
        'status',
        t(
          '点「重新授权」可恢复读取原文件。已保留副本的网站仍可点名称打开。',
          'Choose Renew access to read the original again. Sites with a local copy still open by name.'
        )
      );
    }
  }
}
async function verify(id) {
  if (!id) return;
  const me = await json('/api/hub/me');
  if (me.user?.id !== id || account !== id) {
    applyIdentity(me.user?.id || 0, me.user?.username);
    throw Error('账号已切换，请刷新导航');
  }
}
function paint() {
  const query = $('search').value.trim().toLocaleLowerCase(),
    found = sites.filter((s) => s.name.toLocaleLowerCase().includes(query));
  $('count').textContent = sites.length ? found.length + ' / ' + sites.length : '';
  const list = $('sites');
  list.replaceChildren();
  if (!found.length) {
    const line = document.createElement('li');
    line.className = 'empty';
    line.textContent = query
      ? t('没有匹配的网站', 'No matching websites')
      : account
        ? t('收藏的网站会出现在这里。', 'Your saved sites appear here.')
        : t(
            '可以直接打开文件，登录后可保存私人导航。',
            'Open a local site now, or sign in to keep bookmarks.'
          );
    list.append(line);
  }
  for (const item of found) {
    const rec = records.get(item.id),
      li = document.createElement('li');
    li.className = 'card';
    li.id = 'site-' + item.id;
    const main = button('', () => openItem(item));
    main.className = 'card-main';
    const art = document.createElement('span');
    art.className = 'cover';
    art.setAttribute('aria-hidden', 'true');
    const title = document.createElement('strong');
    title.className = 'card-name';
    title.textContent = item.name;
    const kind = document.createElement('small');
    kind.className = 'card-kind';
    kind.textContent = labels[item.kind];
    main.append(art, title, kind);
    const foot = document.createElement('footer'),
      state = document.createElement('span');
    state.textContent =
      item.kind === 'url'
        ? ''
        : rec?.hasCopy
          ? t('已存本机副本', 'Copy on this device')
          : !rec?.handle
            ? t('待关联本机文件', 'Link on this device')
            : rec.last === 'attention'
              ? t('需要重新授权', 'Access expired')
              : '';
    const actions = document.createElement('div');
    if (item.kind !== 'url') {
      if (rec?.handle && (rec.last === 'attention' || deep === item.id)) {
        const renew = button(t('重新授权', 'Renew access'), () => openItem(item, true));
        renew.className = 'renew';
        actions.append(renew);
      }
      actions.append(
        button(rec?.hasCopy ? t('更新副本', 'Update copy') : t('关联', 'Relink'), () => editor(item))
      );
    }
    actions.append(
      button(t('改名', 'Rename'), async () => {
        const uid = account,
          name = prompt(t('网站名称', 'Website name'), item.name);
        if (!name?.trim() || name === item.name) return;
        await mutate('/edit', uid, { id: item.id, revision: item.revision, name });
        await refresh();
      }),
      button(t('移除', 'Remove'), async () => {
        const uid = account;
        if (
          !confirm(
            t('从导航移除「', 'Remove “') +
              item.name +
              t(
                '」？同时删除此浏览器保存的副本，原文件保留。',
                '” and its browser copy? The original files are kept.'
              )
          )
        )
          return;
        await mutate('/remove', uid, { id: item.id, revision: item.revision });
        await forget(uid, item.id).catch(() => {});
        await refresh();
      })
    );
    foot.append(state, actions);
    li.append(main, foot);
    list.append(li);
  }
}
function setMode(value) {
  if (mode !== value) {
    pickSeq++;
    reading = false;
    $('basic-choice').hidden = true;
  }
  mode = value;
  $('local-pane').hidden = value === 'url';
  $('url-label').hidden = value !== 'url';
  $('tab-local').setAttribute('aria-pressed', String(value === 'local'));
  $('tab-url').setAttribute('aria-pressed', String(value === 'url'));
  $('url').required = value === 'url';
  say('form-status', '');
  setAction();
}
function setAction() {
  $('submit').disabled = saving || (mode === 'local' && (reading || !source?.files.has($('entry').value)));
  $('submit').textContent = wanted
    ? t('关联并打开 →', 'Link and open →')
    : $('remember').checked
      ? t('保存并打开 →', 'Save and open →')
      : t('只打开一次 →', 'Open once →');
  const localBookmark = mode === 'local' && !!account && $('remember').checked;
  $('copy-option').hidden = !localBookmark;
  $('storage-note').textContent = !account
    ? t('文件保留在本机。登录后可保存导航。', 'Files stay here. Sign in to save a bookmark.')
    : localBookmark && $('keep-copy').checked
      ? t(
          '下次点名称即可打开。副本占用本机空间，账号只同步书签。',
          'Open by name next time. The copy uses space on this device. Only the bookmark syncs.'
        )
      : localBookmark && source && !source.handle
        ? t(
            '普通选择只保存书签，下次打开需要重新选择本机文件。',
            'Only the bookmark will be saved. Select the files again next time.'
          )
        : localBookmark
          ? t('原文件授权有效时可直接打开。', 'Open directly while access to the original is available.')
          : mode === 'local'
            ? t('本次打开后不会保存文件。', 'Files are used for this visit only.')
            : '';
  $('storage-note').hidden = !$('storage-note').textContent;
}
function editor(item = null) {
  openSeq++;
  pickSeq++;
  source = null;
  reading = saving = nameEdited = false;
  useBasicNext.clear();
  $('basic-choice').hidden = true;
  $('entry').replaceChildren();
  wanted = item;
  draftId = item?.id || crypto.randomUUID();
  $('editor').reset();
  $('entry-label').hidden = true;
  $('chosen').hidden = true;
  $('name').value = item?.name || '';
  $('name').readOnly = !!item;
  $('remember').disabled = !account || !!item;
  $('remember').checked = !!item;
  $('tab-url').disabled = !!item;
  $('drawer-title').textContent = item
    ? records.get(item.id)?.hasCopy
      ? t('更新本机副本', 'Update local copy')
      : t('关联本机文件', 'Link on this device')
    : t('添加网站', 'Add a site');
  setMode('local');
  if (item && !records.get(item.id)?.hasCopy && !records.get(item.id)?.handle) {
    say(
      'form-status',
      t(
        '此浏览器还没有这份网站。选择一次并保留副本，以后点名称即可打开。',
        'Choose the original once and keep a copy to open it by name in this browser.'
      )
    );
  }
  if (!$('drawer').open) $('drawer').showModal();
}
function showBasicChoice(kind) {
  $('basic-choice').hidden = false;
  $('file').hidden = kind !== 'file';
  $('folder').hidden = kind !== 'folder';
}
function basicPicker(kind) {
  showBasicChoice(kind);
  $(kind).click();
}
function selectionError(e) {
  if (e.name === 'AbortError') return t('未收到新的文件选择。', 'No new selection was received.');
  if (e.name === 'SecurityError' || e.name === 'NotAllowedError')
    return t('浏览器未允许直接读取所选文件。', 'The browser did not allow direct access.');
  if (e.name === 'NotReadableError' || e.name === 'NotFoundError')
    return t('所选内容已移动或暂时无法读取。', 'The selected files moved or cannot be read.');
  return e.message || t('读取所选内容失败。', 'The selection could not be read.');
}
async function selectSource(load, kind, native = false) {
  const seq = ++pickSeq;
  const active = () => seq === pickSeq && $('drawer').open && mode === 'local';
  reading = true;
  setAction();
  if (native) showBasicChoice(kind);
  say(
    'form-status',
    native
      ? t(
          '请选择本机文件。也可以使用上面的普通选择。',
          'Choose local files or use the standard picker above.'
        )
      : t('正在读取本机文件…', 'Reading local files…')
  );
  try {
    const next = await load();
    if (!active()) return;
    if (wanted && next.kind !== wanted.kind)
      throw Error(t('请选择与原导航相同类型的文件或文件夹', 'Select the same source type as the bookmark'));
    const prior = wanted && (records.get(wanted.id)?.entry || wanted.entry);
    const entry = next.entries.includes(prior) ? prior : next.entries[0];
    const title = await titleOf(next, entry);
    if (!active()) return;
    source = next;
    $('entry').replaceChildren(...next.entries.map((path) => new Option(path, path)));
    $('entry').value = entry;
    $('chosen').textContent = t('已选择 · ', 'Selected · ') + next.label;
    $('chosen').hidden = $('entry-label').hidden = false;
    $('basic-choice').hidden = true;
    if (!wanted && !nameEdited) $('name').value = title;
    say(
      'form-status',
      next.kind === 'html'
        ? t(
            '如果网页还有图片或脚本，请选择它所在的文件夹。',
            'For additional images or scripts choose the website folder.'
          )
        : ''
    );
  } catch (e) {
    if (!active()) return;
    const message = selectionError(e);
    if (native) {
      useBasicNext.add(kind);
      showBasicChoice(kind);
      say('form-status', message + ' ' + t('请用上面的普通选择重试。', 'Try the standard picker above.'));
    } else {
      say('form-status', message);
    }
  } finally {
    if (active()) {
      reading = false;
      setAction();
    }
  }
}
function choose(kind) {
  const directory = kind === 'folder';
  const picker = directory ? window.showDirectoryPicker : window.showOpenFilePicker;
  if (typeof picker !== 'function' || useBasicNext.has(kind)) return basicPicker(kind);
  return selectSource(
    async () => {
      const handle = directory
        ? await window.showDirectoryPicker({ mode: 'read' })
        : (
            await window.showOpenFilePicker({
              types: [
                {
                  description: 'HTML / ZIP',
                  accept: { 'text/html': ['.html', '.htm'], 'application/zip': ['.zip'] }
                }
              ]
            })
          )[0];
      if (!handle) throw new DOMException('No selection', 'AbortError');
      return fromHandle(handle);
    },
    kind,
    true
  );
}
async function openItem(item, renew = false) {
  const uid = account,
    seq = ++openSeq;
  const active = () => uid === account && seq === openSeq;
  if (item.kind === 'url') {
    await verify(uid);
    if (active()) location.assign(item.url);
    return;
  }
  const rec = records.get(item.id);
  if (!rec?.handle && !rec?.hasCopy) return editor(item);
  say('status', t('正在打开网站…', 'Opening website…'));
  let files,
    entry = rec.entry || item.entry;
  if (rec.handle) {
    try {
      let permission = await rec.handle.queryPermission({ mode: 'read' });
      if (!active()) return;
      if (permission !== 'granted') {
        // Only explicit renewal (or a bookmark with no copy) should interrupt the user's click.
        const decision =
          renew || !rec.hasCopy
            ? rec.handle.requestPermission({ mode: 'read' })
            : Promise.resolve(permission);
        [permission] = await Promise.all([decision, report(rec, 'attention').catch(() => {})]);
      }
      if (!active()) return;
      if (permission === 'granted') {
        await report(rec, 'ready').catch(() => {});
        const live = await fromHandle(rec.handle);
        if (live.files.has(entry)) files = await packageFiles(live);
      }
    } catch (e) {
      if (!active()) return;
      if (['NotAllowedError', 'SecurityError'].includes(e.name))
        await report(rec, 'attention').catch(() => {});
      else if (!rec.hasCopy && !['NotFoundError', 'NotReadableError'].includes(e.name)) throw e;
    }
  }
  if (!active()) return;
  const useCopy = !files;
  if (useCopy && rec.hasCopy) {
    const copy = await readCopy(uid, item.id);
    if (copy?.files?.has(copy.entry)) {
      files = copy.files;
      entry = copy.entry;
    }
  }
  if (!active()) return;
  await verify(uid);
  if (!active()) return;
  say('status', '');
  paint();
  if (files) return showSite(files, entry, item.name, useCopy);
  editor(item);
  say(
    'form-status',
    t(
      '此浏览器暂时无法读取原文件。选择一次并保留副本，以后点名称即可打开。',
      'Choose the original and keep a local copy to open it by name in this browser.'
    )
  );
}
function showSite(files, entry, name, isCopy = false) {
  finishReader();
  $('reader-title').textContent = name;
  $('copy-badge').hidden = !isCopy;
  $('reader').showModal();
  currentFiles = files;
  root = entry.split('/').slice(0, -1).join('/');
  showHTML(entry, '');
}
function showHTML(path, hash) {
  dispose?.();
  endAsset();
  say('reader-status', '');
  dispose = renderSite(
    $('frame'),
    currentFiles,
    path,
    (path, hash) => displayAsset(path, hash).catch((e) => say('reader-status', e.message)),
    (message) => say('reader-status', message),
    hash,
    root
  );
}
async function pdfPage(n) {
  if (!pdf) return;
  const token = ++renderSeq,
    doc = pdf;
  page = Math.max(1, Math.min(n, doc.numPages));
  const p = await doc.getPage(page);
  if (token !== renderSeq) return;
  $('page-num').textContent = page + ' / ' + doc.numPages;
  $('prev').disabled = page === 1;
  $('next').disabled = page === doc.numPages;
  const v = p.getViewport({ scale: 1.4 }),
    canvas = document.createElement('canvas');
  canvas.width = v.width;
  canvas.height = v.height;
  $('asset-body').replaceChildren(canvas);
  await p.render({ canvasContext: canvas.getContext('2d'), viewport: v }).promise;
}
async function displayAsset(path, hash) {
  const file = currentFiles?.get(path);
  if (!file) return;
  if (file.type === 'text/html') {
    showHTML(path, hash);
    return;
  }
  endAsset();
  const seq = renderSeq;
  $('frame').hidden = true;
  $('asset').hidden = false;
  $('pages').hidden = true;
  $('asset-name').textContent = path.split('/').pop();
  if (file.type === 'application/pdf') {
    const lib = await import('../vendor/pdf.mjs');
    lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.mjs', import.meta.url).href;
    const doc = await lib.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false
    }).promise;
    if (seq !== renderSeq) {
      await doc.destroy();
      return;
    }
    pdf = doc;
    $('pages').hidden = false;
    await pdfPage(Number(hash.match(/page=(\d+)/i)?.[1]) || 1);
  } else if (file.type.startsWith('image/')) {
    const img = document.createElement('img'),
      url = URL.createObjectURL(file);
    img.onload = img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
    img.alt = path;
    $('asset-body').append(img);
  } else if (file.type.startsWith('text/')) {
    const pre = document.createElement('pre');
    pre.textContent = await file.text();
    if (seq === renderSeq) $('asset-body').append(pre);
  } else {
    say('reader-status', t('此文件类型暂不支持预览。', 'This file type has no preview.'));
  }
}
$('editor').onsubmit = run(async (e) => {
  e.preventDefault();
  if ($('submit').disabled) return;
  saving = true;
  setAction();
  try {
    const uid = account,
      name = $('name').value.trim();
    if (!name) throw Error('请输入网站名称');
    const keep = $('remember').checked,
      item = wanted,
      entry = $('entry').value,
      s = source;
    let url = '';
    if (mode === 'url') {
      let u;
      try {
        u = new URL($('url').value.trim());
      } catch {}
      if (!u || !['http:', 'https:'].includes(u.protocol) || u.username || u.password)
        throw Error('请输入 http(s) 网址。本机磁盘路径请切换到「本地文件」。');
      url = u.href;
    } else if (!s || !s.files.has(entry)) throw Error('请先选择本机文件或文件夹');
    const id = draftId,
      seq = pickSeq;
    const active = () => $('drawer').open && seq === pickSeq && uid === account;
    const copy = !url && keep && $('keep-copy').checked;
    if (!url)
      say(
        'form-status',
        copy ? t('正在准备本机副本…', 'Preparing local copy…') : t('正在读取网站…', 'Reading website…')
      );
    const files = url ? null : await packageFiles(s, copy);
    if (!active()) return;
    if (item || keep) {
      await verify(uid);
      if (!active()) return;
      if (!item) {
        const created = await mutate('', uid, {
          id,
          name,
          kind: url ? 'url' : s.kind,
          entry: url ? '' : entry,
          url
        });
        if (!active()) return;
        // An IDB failure can be retried on this same bookmark.
        if (!url) {
          wanted = created.site;
          $('remember').disabled = $('name').readOnly = $('tab-url').disabled = true;
        }
      }
      if (!url && (records.get(id) || s.handle || copy)) {
        try {
          await link(uid, id, s.handle, entry, copy ? files : null);
        } catch (e) {
          const reason =
            e.name === 'QuotaExceededError'
              ? t('本机存储空间不足。', 'This device is out of storage.')
              : t('浏览器无法写入本机存储。', 'Browser storage is unavailable.');
          throw Error(
            reason +
              t(
                '书签已保留。可释放空间再试，或取消保留副本。',
                'Your bookmark is saved. Free up space or turn off the local copy.'
              )
          );
        }
      }
      await refresh();
      if (!active()) return;
    }
    $('drawer').close();
    if (url) location.assign(url);
    else showSite(files, entry, name, copy && !s.handle);
  } finally {
    saving = false;
    setAction();
  }
});
$('search').oninput = paint;
$('add').onclick = () => editor();
$('drop').onclick = () => {
  editor();
};
$('cancel').onclick = () => $('drawer').close();
$('drawer').addEventListener('close', () => {
  if ($('drawer').open) return;
  if (!$('reader').open && account) refresh().catch(error);
  pickSeq++;
  source = wanted = null;
  reading = false;
  setAction();
});
$('tab-local').onclick = () => setMode('local');
$('tab-url').onclick = () => setMode('url');
$('remember').onchange = $('keep-copy').onchange = setAction;
$('name').oninput = () => {
  nameEdited = !!$('name').value.trim();
};
$('pick-file').onclick = run(() => choose('file'));
$('pick-folder').onclick = run(() => choose('folder'));
for (const kind of ['file', 'folder']) {
  const input = $(kind);
  input.onclick = () => {
    // Selecting again (including the same file) supersedes any unresolved native picker.
    pickSeq++;
    reading = false;
    input.value = '';
    setAction();
    say(
      'form-status',
      kind === 'folder'
        ? t('请选择包含 HTML 的网站文件夹。', 'Choose a website folder containing an HTML file.')
        : t('请选择 HTML 或 ZIP 文件。', 'Choose an HTML or ZIP file.')
    );
  };
  const empty = () => {
    if (!$('drawer').open || mode !== 'local') return;
    say(
      'form-status',
      source
        ? t('已保留上一次的选择。', 'Your previous selection is still ready.')
        : kind === 'folder'
          ? t(
              '没有收到文件，请选择包含 HTML 的网站文件夹。',
              'No files received. Choose a folder containing HTML.'
            )
          : t('没有收到文件，请重新选择 HTML 或 ZIP。', 'No file received. Choose an HTML or ZIP file again.')
    );
    setAction();
  };
  input.oncancel = empty;
  input.onchange = run(() => {
    const files = Array.from(input.files);
    if (!files.length) return empty();
    return selectSource(() => (kind === 'folder' ? fromFolderInput(files) : fromFile(files[0])), kind);
  });
}
$('entry').onchange = run(async () => {
  const selected = source,
    entry = $('entry').value;
  if (!selected || wanted || nameEdited) return;
  const title = await titleOf(selected, entry);
  if (source === selected && $('entry').value === entry && !nameEdited) $('name').value = title;
});
$('url').onchange = () => {
  try {
    if (!$('name').value) $('name').value = new URL($('url').value).hostname;
  } catch {}
};
for (const el of [$('drop'), $('local-pane')]) {
  el.ondragover = (e) => {
    e.preventDefault();
    el.classList.add('drag');
  };
  el.ondragleave = () => el.classList.remove('drag');
  el.ondrop = run(async (e) => {
    e.preventDefault();
    el.classList.remove('drag');
    const item = e.dataTransfer.items[0],
      raw = e.dataTransfer.files[0];
    const kind = item?.webkitGetAsEntry?.()?.isDirectory ? 'folder' : 'file';
    if (!$('drawer').open) editor();
    setMode('local');
    return selectSource(async () => {
      let handle;
      try {
        handle = await item?.getAsFileSystemHandle?.();
      } catch (e) {
        if (!raw || kind === 'folder') throw e;
      }
      if (handle) return fromHandle(handle);
      if (raw && kind === 'file') return fromFile(raw);
      showBasicChoice('folder');
      throw Error(
        t('请用普通文件选择打开网站目录。', 'Use the standard folder picker to open the website directory.')
      );
    }, kind);
  });
}
$('leave').onclick = finishReader;
$('reader').addEventListener('cancel', (e) => {
  e.preventDefault();
  if ($('reader').classList.contains('maximized')) {
    $('reader').classList.remove('maximized');
    syncFullscreen();
  } else finishReader();
});
function syncFullscreen() {
  const on = !!document.fullscreenElement || $('reader').classList.contains('maximized');
  const label = on ? t('退出全屏', 'Exit fullscreen') : t('全屏', 'Fullscreen');
  $('full').setAttribute('aria-label', label);
  $('full').setAttribute('aria-pressed', String(on));
  $('full').title = label;
}
document.addEventListener('fullscreenchange', syncFullscreen);
$('full').onclick = run(async () => {
  const reader = $('reader'),
    content = $('reader-content');
  if (document.fullscreenElement === content) await document.exitFullscreen();
  else if (reader.classList.contains('maximized')) reader.classList.remove('maximized');
  else {
    try {
      await content.requestFullscreen();
    } catch {
      if (reader.open) reader.classList.add('maximized');
    }
  }
  syncFullscreen();
});
$('back-asset').onclick = endAsset;
$('prev').onclick = run(() => pdfPage(page - 1));
$('next').onclick = run(() => pdfPage(page + 1));
window.addEventListener('focus', () => {
  if (!$('drawer').open) refresh().catch(error);
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh().catch(error);
});
window.addEventListener('pageshow', () => {
  refresh().catch(error);
  audit();
});
refresh().catch(error);
