const API = '/api/hub/site-navigator';
let database;
function db() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const req = indexedDB.open('garyhub-personal-sites', 1);
      req.onupgradeneeded = () => {
        req.result
          .createObjectStore('bindings', { keyPath: ['account', 'site'] })
          .createIndex('account', 'account');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        database = null;
        reject(req.error);
      };
    });
  return database;
}
async function access(mode, fn) {
  const tx = (await db()).transaction('bindings', mode),
    request = fn(tx.objectStore('bindings'));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error || Error('本机文件关联无法保存'));
  });
}
export const binding = (account, site) => access('readonly', (s) => s.get([account, site]));
// Keep the v1 key and index for old tabs. A separate, typed owner key lets permission
// checks enumerate only small binding records. The copy and its binding share a transaction.
const copyOwner = (account) => ['local-copy', account];
export const bindingsFor = (account) => access('readonly', (s) => s.index('account').getAll(account));
export const readCopy = (account, site) => access('readonly', (s) => s.get([copyOwner(account), site]));
export const forget = (account, site) =>
  access('readwrite', (s) => {
    s.delete([copyOwner(account), site]);
    return s.delete([account, site]);
  });
export async function json(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const data = await response.json();
  if (!response.ok) throw Object.assign(Error(data.message || '请求失败'), { status: response.status });
  return data;
}
export const listSites = () => json(API);
export async function mutate(suffix, account, data) {
  const { token } = await json('/api/csrf');
  return json(API + suffix, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
    body: JSON.stringify({ ...data, accountId: account })
  });
}
export async function link(account, site, handle, entry, files = null) {
  const tx = (await db()).transaction('bindings', 'readwrite');
  const store = tx.objectStore('bindings');
  const previous = store.get([account, site]);
  let record, failure;
  previous.onsuccess = () => {
    try {
      const old = previous.result;
      record = {
        account,
        site,
        entry,
        handle,
        hasCopy: !!files,
        device: old?.device || crypto.randomUUID(),
        last: old?.last || 'ready'
      };
      try {
        store.put(record);
      } catch (e) {
        if (e.name !== 'DataCloneError' || !files || !handle) throw e;
        record.handle = null;
        store.put(record);
      }
      if (files) store.put({ account: copyOwner(account), site, entry, files });
      else store.delete([copyOwner(account), site]);
    } catch (e) {
      failure = e;
      tx.abort();
    }
  };
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = () => reject(failure || tx.error || Error('无法保存本机文件'));
  });
  if (record.last === 'attention') await report(record, 'ready').catch(() => {});
  return record;
}
export async function report(record, state) {
  if (record.last === state) return;
  try {
    await mutate('/permission', record.account, { id: record.site, device: record.device, state });
  } catch (e) {
    if (e.status === 404) {
      await forget(record.account, record.site);
      return;
    }
    throw e;
  }
  // An asynchronous permission probe must never replace a newly selected handle.
  const tx = (await db()).transaction('bindings', 'readwrite'),
    store = tx.objectStore('bindings');
  const r = store.get([record.account, record.site]);
  r.onsuccess = () => {
    const current = r.result;
    if (current?.device === record.device && current.last === record.last)
      store.put({ ...current, last: state });
  };
  await new Promise((ok, no) => {
    tx.oncomplete = ok;
    tx.onabort = () => no(tx.error);
  });
  record.last = state;
}
let probing = false;
export async function audit() {
  if (probing || document.hidden || !('indexedDB' in window)) return;
  probing = true;
  try {
    const me = await json('/api/hub/me');
    if (!me.user) return;
    const records = await bindingsFor(me.user.id);
    for (const rec of records) {
      if (!rec.handle?.queryPermission) continue; // Another device or plain file-input fallback has no grant to expire.
      try {
        const p = await rec.handle.queryPermission({ mode: 'read' });
        await report(rec, p === 'granted' ? 'ready' : 'attention');
      } catch {
        /* Retry transient or offline failures on the next visible check. */
      }
    }
  } catch {
    /* Signed out or offline. No paths or handles are sent. */
  } finally {
    probing = false;
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('focus', audit);
  document.addEventListener('visibilitychange', audit);
  setInterval(audit, 60000);
  audit();
}
