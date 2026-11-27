import { indexZip, archivePath } from '../markdown-viewer/zip-reader.mjs';

const MiB = 1024 * 1024;
const limits = { archive: 96 * MiB, total: 192 * MiB, entry: 48 * MiB, markdown: 48 * MiB, files: 4096 };
const types = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  avif: 'image/avif',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  pdf: 'application/pdf',
  txt: 'text/plain',
  py: 'text/plain',
  csv: 'text/plain',
  md: 'text/plain',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm'
};
export const mime = (name) => types[name.split('.').pop().toLowerCase()];
const hidden = (path) =>
  path.split('/').some((part) => part.startsWith('.') || ['node_modules', '__MACOSX'].includes(part));
function site(kind, files, handle, label) {
  const score = (p) => (/(^|\/)index\.html?$/i.test(p) ? 0 : 1);
  const entries = [...files.keys()]
    .filter((p) => /\.html?$/i.test(p))
    .sort((a, b) => score(a) - score(b) || a.split('/').length - b.split('/').length || a.localeCompare(b));
  if (!entries.length) throw Error('未找到 HTML 入口，请选择包含网页的文件夹或 ZIP。');
  return { kind, files, handle, label, entries };
}
export async function fromFile(file, handle = null) {
  if (/\.zip$/i.test(file.name)) {
    if (file.size > limits.archive) throw Error('ZIP 最大支持 96 MiB');
    const files = new Map();
    for (const [path, read] of indexZip(await file.arrayBuffer(), limits)) {
      if (!hidden(path) && mime(path))
        files.set(path, async () => new Blob([await read()], { type: mime(path) }));
    }
    return site('zip', files, handle, file.name);
  }
  if (!/\.html?$/i.test(file.name) || file.size > limits.entry) throw Error('请选择 HTML 或普通 ZIP 文件');
  return site('html', new Map([[archivePath(file.name), async () => file]]), handle, file.name);
}
async function* directoryFiles(dir, prefix = '') {
  for await (const h of dir.values()) {
    if (hidden(h.name)) continue;
    const path = prefix + h.name;
    if (h.kind === 'directory') yield* directoryFiles(h, path + '/');
    else yield [path, () => h.getFile()];
  }
}
async function folder(pairs, handle, label) {
  const files = new Map();
  let count = 0;
  for await (const [path, read] of pairs) {
    if (++count > limits.files) throw Error('文件夹超过 4096 个文件，请选择网站所在的子目录');
    if (!hidden(path) && mime(path)) files.set(archivePath(path), read);
  }
  return site('folder', files, handle, label);
}
export function fromHandle(h) {
  return h.kind === 'directory'
    ? folder(directoryFiles(h), h, h.name)
    : h.getFile().then((f) => fromFile(f, h));
}
export function fromFolderInput(list) {
  const files = Array.from(list),
    root = files[0]?.webkitRelativePath.split('/')[0] || '';
  return folder(
    files.map((f) => [f.webkitRelativePath.slice(root.length + 1), () => f]),
    null,
    root
  );
}
export async function titleOf(source, entry) {
  const file = await source.files.get(entry)();
  const head = await file.slice(0, 65536).text(),
    title = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (!title) return source.label.replace(/\.(zip|html?)$/i, '');
  const text = document.createElement('textarea');
  text.innerHTML = title.replace(/</g, '&lt;');
  return text.value.trim().slice(0, 120);
}
export async function packageFiles(source) {
  const out = new Map();
  let total = 0;
  for (const [path, read] of source.files) {
    const blob = await read();
    total += blob.size;
    if (blob.size > limits.entry || total > limits.total)
      throw Error('网站文件过大，请仅选择发布目录（最多 192 MiB）');
    out.set(path, blob.slice(0, blob.size, mime(path)));
  }
  return out;
}
