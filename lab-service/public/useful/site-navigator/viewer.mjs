/* Original HTML runs only in an opaque sandbox. The parent sends Blobs, never handles, credentials or account data.
   Paths and blob URLs are resolved inside the sandbox so the blobs share the document's opaque origin. */
const policy =
  "default-src 'none'; script-src 'unsafe-inline' blob: data:; style-src 'unsafe-inline' blob: data:; img-src blob: data:; font-src blob: data:; media-src blob: data:; connect-src blob: data:; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
function boot() {
  const receive = async (ev) => {
    if (ev.source !== parent || ev.data?.op !== 'load') return;
    window.removeEventListener('message', receive);
    try {
      const { files, entry, fragment, root, policy } = ev.data;
      const virtual = 'https://package.invalid';
      const urls = new Map(),
        styles = new Map(),
        missing = new Set();
      const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');
      function locate(value, from = entry) {
        if (!value || /^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(value.trim())) return null;
        try {
          const u = new URL(
            value.startsWith('/') ? '/' + encodePath(root) + value : value,
            virtual + '/' + encodePath(from)
          );
          if (u.origin !== virtual) return null;
          return { path: decodeURIComponent(u.pathname.slice(1)).replace(/^\/+/, ''), hash: u.hash };
        } catch {
          return null;
        }
      }
      function resource(value, from) {
        if (!value || /^(?:blob:|data:|#)/i.test(value)) return value;
        const item = locate(value, from);
        if (!item) return 'data:,';
        if (!urls.has(item.path)) {
          if (!missing.has(item.path)) {
            missing.add(item.path);
            parent.postMessage({ op: 'missing' }, '*');
          }
          return 'data:,';
        }
        return urls.get(item.path) + item.hash;
      }
      for (const [path, file] of files) urls.set(path, URL.createObjectURL(file));
      function css(text, path) {
        return text
          .replace(
            /url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi,
            (_, q, v) => 'url("' + resource(v.trim(), path) + '")'
          )
          .replace(
            /(@import\s+)(['"])([^'"]+)\2/gi,
            (_, prefix, q, v) => prefix + '"' + resource(v, path) + '"'
          );
      }
      async function stylesheet(path, trail = new Set()) {
        if (styles.has(path) || trail.has(path)) return;
        trail.add(path);
        const original = await files.get(path).text();
        for (const m of original.matchAll(/@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)/gi)) {
          const ref = locate(m[1], path);
          if (ref && files.get(ref.path)?.type === 'text/css') await stylesheet(ref.path, trail);
        }
        styles.set(path, true);
        urls.set(path, URL.createObjectURL(new Blob([css(original, path)], { type: 'text/css' })));
      }
      for (const [path, file] of files) if (file.type === 'text/css') await stylesheet(path);
      function fix(el) {
        if (el.nodeType !== 1) return;
        const tag = el.localName;
        for (const attr of ['src', 'poster', 'href', 'data-src']) {
          if (
            !el.hasAttribute(attr) ||
            (attr === 'href' && tag !== 'link' && tag !== 'use' && tag !== 'image')
          )
            continue;
          const old = el.getAttribute(attr),
            value = resource(old, entry);
          if (value !== old) el.setAttribute(attr, value);
        }
        if (el.hasAttribute('srcset') && !el.getAttribute('srcset').includes('data:')) {
          const old = el.getAttribute('srcset'),
            value = old
              .split(',')
              .map((s) => {
                const [u, ...rest] = s.trim().split(/\s+/);
                return [resource(u, entry), ...rest].join(' ');
              })
              .join(', ');
          if (old !== value) el.setAttribute('srcset', value);
        }
        const style = el.getAttribute('style');
        if (style && /url\(/i.test(style)) {
          const next = css(style, entry);
          if (next !== style) el.setAttribute('style', next);
        }
        if (tag === 'style' && el.textContent.includes('url(')) {
          const next = css(el.textContent, entry);
          if (el.textContent !== next) el.textContent = next;
        }
      }
      const parsed = new DOMParser().parseFromString(await files.get(entry).text(), 'text/html');
      parsed.querySelectorAll('base,meta[http-equiv]').forEach((el) => el.remove());
      parsed.querySelectorAll('*').forEach(fix);
      // Attach callbacks before the application's first script runs, preserving parser order and DOMContentLoaded.
      window.__startLocalSite = () => {
        delete window.__startLocalSite;
        if (fragment && /^#[^\x00-\x1f]*$/.test(fragment)) location.hash = fragment;
        const nativeFetch = window.fetch.bind(window);
        window.fetch = (input, opts) => {
          if (typeof input === 'string' && locate(input, entry)) {
            const ref = locate(input, entry),
              blob = files.get(ref.path);
            return Promise.resolve(
              blob
                ? new Response(blob, { headers: { 'Content-Type': blob.type } })
                : new Response('', { status: 404 })
            );
          }
          return nativeFetch(input, opts);
        };
        function visited(node) {
          if (node.nodeType !== 1) return;
          fix(node);
          node.querySelectorAll('*').forEach(fix);
        }
        // Resolve generated markup while it is still in a template, before the browser requests its images.
        const htmlProperty = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
        function localMarkup(value) {
          if (typeof value !== 'string' || !/(?:src|href|poster|style)\s*=/i.test(value)) return value;
          const template = document.createElement('template');
          htmlProperty.set.call(template, value);
          template.content.querySelectorAll('*').forEach(fix);
          return htmlProperty.get.call(template);
        }
        Object.defineProperty(Element.prototype, 'innerHTML', {
          ...htmlProperty,
          set(value) {
            htmlProperty.set.call(this, localMarkup(value));
          }
        });
        const insert = Element.prototype.insertAdjacentHTML;
        Element.prototype.insertAdjacentHTML = function (where, value) {
          return insert.call(this, where, localMarkup(value));
        };
        new MutationObserver((records) => {
          for (const m of records) {
            if (m.type === 'attributes') fix(m.target);
            else m.addedNodes.forEach(visited);
          }
        }).observe(document, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['src', 'href', 'poster', 'style', 'srcset']
        });
        document.addEventListener(
          'click',
          (e) => {
            const a = e.target.closest?.('a[href]');
            if (!a) return;
            const raw = a.getAttribute('href');
            if (!raw) return;
            if (raw.startsWith('#')) {
              e.preventDefault();
              location.hash = raw;
              try {
                document.getElementById(decodeURIComponent(raw.slice(1)))?.scrollIntoView();
              } catch {}
              return;
            }
            e.preventDefault();
            const ref = locate(raw, entry);
            if (ref && files.has(ref.path))
              parent.postMessage({ op: 'open', path: ref.path, hash: ref.hash }, '*');
            else parent.postMessage({ op: 'missing' }, '*');
          },
          true
        );
      };
      const meta = parsed.createElement('meta');
      meta.httpEquiv = 'Content-Security-Policy';
      meta.content = policy;
      const setup = parsed.createElement('script');
      setup.textContent = 'window.__startLocalSite()';
      parsed.head.prepend(meta, setup);
      const html = '<!doctype html>' + parsed.documentElement.outerHTML;
      document.open();
      document.write(html);
      document.close();
    } catch {
      parent.postMessage({ op: 'error' }, '*');
    }
  };
  addEventListener('message', receive);
  parent.postMessage({ op: 'ready' }, '*');
}
export function renderSite(host, files, entry, onAsset, onStatus, fragment = '', initialRoot = null) {
  host.replaceChildren();
  const f = document.createElement('iframe');
  f.title = entry;
  f.sandbox = 'allow-scripts';
  f.referrerPolicy = 'no-referrer';
  const root = initialRoot ?? entry.split('/').slice(0, -1).join('/');
  function message(e) {
    if (e.source !== f.contentWindow || e.origin !== 'null') return;
    const m = e.data || {};
    if (m.op === 'ready' && !sent) {
      sent = true;
      f.contentWindow.postMessage({ op: 'load', files, entry, root, fragment, policy }, '*');
    }
    if (m.op === 'open' && typeof m.path === 'string' && files.has(m.path) && typeof m.hash === 'string') {
      onAsset(m.path, m.hash.slice(0, 2048));
    }
    if (m.op === 'missing')
      onStatus('此链接或资源不在所选网站内。如有配套文件，请选择整个网站文件夹或 ZIP。');
    if (m.op === 'error') onStatus('这个入口无法呈现，请尝试选择另一个 HTML。');
  }
  let sent = false;
  window.addEventListener('message', message);
  f.srcdoc =
    '<!doctype html><meta http-equiv="Content-Security-Policy" content="' +
    policy +
    '"><script>(' +
    boot.toString() +
    ')()<' +
    '/script>';
  host.append(f);
  return () => {
    window.removeEventListener('message', message);
    f.remove();
  };
}
