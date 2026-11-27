import { fromFile, fromFolderInput, fromHandle, titleOf, packageFiles } from './sources.mjs';
import { json, mutate, listSites, binding, link, forget, report, audit } from './permissions.mjs';
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
const deep = new URLSearchParams(location.search).get('site');
let followed = false,
  draftId = null;
function say(id, message) {
  const e = $(id);
  e.textContent = message;
  if (id === 'reader-status') e.hidden = !message;
}
function error(e) {
  if (e?.name !== 'AbortError') say($('drawer').open ? 'form-status' : 'status', e.message || String(e));
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
  if ($('reader').open) $('reader').close();
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
  const id = account,
    data = await listSites();
  if (token !== refreshSeq || id !== account || data.accountId !== id) return;
  const bindings = await Promise.all(
    data.sites.map(async (item) => [item.id, await binding(id, item.id).catch(() => null)])
  );
  if (token !== refreshSeq || id !== account) return;
  records = new Map(bindings);
  sites = data.sites;
  paint();
  if (deep && !followed) {
    followed = true;
    const target = sites.find((s) => s.id === deep);
    if (target) {
      const el = document.getElementById('site-' + target.id);
      el?.scrollIntoView({ block: 'center' });
      el?.querySelector('button')?.focus();
      say(
        'status',
        t(
          '点网站名称，可在本机重新授权或关联文件。',
          'Select the site to renew access or link a file on this device.'
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
        : !rec?.handle
          ? t('关联本机文件', 'Link local file')
          : rec.last === 'attention'
            ? t('需要重新授权', 'Renew access')
            : '';
    const actions = document.createElement('div');
    if (item.kind !== 'url') actions.append(button(t('关联', 'Relink'), () => editor(item)));
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
              t('」？本机文件会保留。', '”? Your local files are kept.')
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
  $('submit').textContent = wanted
    ? t('关联并打开 →', 'Link and open →')
    : $('remember').checked
      ? t('保存并打开 →', 'Save and open →')
      : t('只打开一次 →', 'Open once →');
}
function editor(item = null) {
  pickSeq++;
  source = null;
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
    ? t('关联本机文件', 'Link on this device')
    : t('添加网站', 'Add a site');
  $('storage-note').textContent = account
    ? t(
        '文件保留在本机，账号只保存导航信息。',
        'Files stay on this device. Your account stores bookmark details.'
      )
    : t('文件保留在本机。登录后可保存导航。', 'Files stay on this device. Sign in to save a bookmark.');
  setMode('local');
  if (!$('drawer').open) $('drawer').showModal();
}
async function selectSource(promise) {
  const seq = ++pickSeq;
  source = null;
  $('chosen').hidden = true;
  $('entry-label').hidden = true;
  $('submit').disabled = true;
  say('form-status', t('正在读取本机文件…', 'Reading local files…'));
  try {
    const s = await promise;
    if (seq !== pickSeq || !$('drawer').open) return;
    if (wanted && s.kind !== wanted.kind)
      throw Error(t('请选择与原导航相同类型的文件或文件夹', 'Select the same source type as the bookmark'));
    source = s;
    $('chosen').textContent = s.label;
    $('chosen').hidden = false;
    $('entry').replaceChildren(...s.entries.map((p) => new Option(p, p)));
    const prior = wanted && (records.get(wanted.id)?.entry || wanted.entry);
    if (prior && s.entries.includes(prior)) $('entry').value = prior;
    $('entry-label').hidden = false;
    if (!wanted) $('name').value = await titleOf(s, $('entry').value);
    if (seq === pickSeq)
      say(
        'form-status',
        s.kind === 'html'
          ? t(
              '如果网页还有图片或脚本，请选择它所在的文件夹。',
              'For additional images or scripts choose the website folder.'
            )
          : ''
      );
  } finally {
    if (seq === pickSeq) $('submit').disabled = false;
  }
}
async function choose(folder) {
  if (folder && window.showDirectoryPicker) {
    const h = await window.showDirectoryPicker({ mode: 'read' });
    return selectSource(fromHandle(h));
  }
  if (!folder && window.showOpenFilePicker) {
    const [h] = await window.showOpenFilePicker({
      types: [
        { description: 'HTML / ZIP', accept: { 'text/html': ['.html', '.htm'], 'application/zip': ['.zip'] } }
      ]
    });
    return selectSource(fromHandle(h));
  }
  const input = $(folder ? 'folder' : 'file');
  input.value = '';
  input.click();
}
async function openItem(item) {
  const uid = account;
  if (item.kind === 'url') {
    await verify(uid);
    location.assign(item.url);
    return;
  }
  const rec = records.get(item.id);
  if (!rec?.handle) {
    editor(item);
    return;
  }
  try {
    const p = await rec.handle.queryPermission({ mode: 'read' });
    if (p !== 'granted') {
      // The permission prompt belongs to the user's click. Report the observation concurrently.
      const [decision] = await Promise.all([
        rec.handle.requestPermission({ mode: 'read' }),
        report(rec, 'attention')
      ]);
      if (decision !== 'granted') {
        editor(item);
        say(
          'form-status',
          t(
            '未获得读取授权。你可以重新选择本机文件。',
            'Read access was declined. Choose a local file to relink.'
          )
        );
        return;
      }
    }
    await verify(uid);
    await report(rec, 'ready');
    await showSite(await fromHandle(rec.handle), rec.entry || item.entry, item.name);
    paint();
  } catch (e) {
    if (e.name === 'NotFoundError' || e.name === 'NotAllowedError' || e.name === 'SecurityError') {
      if (e.name !== 'NotFoundError') await report(rec, 'attention').catch(() => {});
      editor(item);
      say(
        'form-status',
        t(
          '文件已移动，或需要重新允许读取。请选择原网站。',
          'The file moved or needs permission. Choose the site again.'
        )
      );
      return;
    }
    throw e;
  }
}
async function showSite(s, entry, name) {
  if (!s.files.has(entry)) throw Error('已保存的入口不存在，请点“关联”重新选择。');
  finishReader();
  const seq = ++openSeq;
  $('reader-title').textContent = name;
  $('reader').showModal();
  say('reader-status', t('正在本机准备网站…', 'Preparing website on this device…'));
  try {
    const files = await packageFiles(s);
    if (seq !== openSeq) return;
    currentFiles = files;
    root = entry.split('/').slice(0, -1).join('/');
    showHTML(entry, '');
  } catch (e) {
    if (seq === openSeq) {
      finishReader();
      throw e;
    }
  }
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
  $('submit').disabled = true;
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
    if (item || keep) {
      await verify(uid);
      const id = draftId,
        canonical = { id, name, kind: url ? 'url' : s.kind, entry: url ? '' : entry, url };
      if (!item) await mutate('', uid, canonical);
      if (!url) {
        try {
          await link(uid, id, s.handle, entry);
        } catch {
          say('status', '导航已保存，此浏览器暂时无法记住文件。下次可重新关联。');
        }
      }
      await refresh();
    }
    $('drawer').close();
    if (url) location.assign(url);
    else await showSite(s, entry, name);
  } finally {
    $('submit').disabled = false;
  }
});
$('search').oninput = paint;
$('add').onclick = () => editor();
$('drop').onclick = () => {
  editor();
};
$('cancel').onclick = () => $('drawer').close();
$('drawer').addEventListener('close', () => {
  pickSeq++;
  source = wanted = null;
  $('submit').disabled = false;
});
$('tab-local').onclick = () => setMode('local');
$('tab-url').onclick = () => setMode('url');
$('remember').onchange = setAction;
$('pick-file').onclick = run(() => choose(false));
$('pick-folder').onclick = run(() => choose(true));
$('file').onchange = run(() => {
  if ($('file').files[0]) return selectSource(fromFile($('file').files[0]));
});
$('folder').onchange = run(() => {
  if ($('folder').files.length) return selectSource(fromFolderInput($('folder').files));
});
$('entry').onchange = run(async () => {
  if (source && !wanted) $('name').value = await titleOf(source, $('entry').value);
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
    const dt = e.dataTransfer,
      first = dt.items[0],
      handle = first?.getAsFileSystemHandle?.(),
      raw = dt.files[0];
    if (!$('drawer').open) editor();
    setMode('local');
    const h = handle ? await handle : null;
    if (h) return selectSource(fromHandle(h));
    if (raw && /\.(html?|zip)$/i.test(raw.name)) return selectSource(fromFile(raw));
    say('form-status', '请用“选择文件夹”打开网站目录。');
  });
}
$('leave').onclick = finishReader;
$('reader').addEventListener('cancel', (e) => {
  e.preventDefault();
  finishReader();
});
$('full').onclick = run(() =>
  document.fullscreenElement ? document.exitFullscreen() : $('reader').requestFullscreen()
);
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
