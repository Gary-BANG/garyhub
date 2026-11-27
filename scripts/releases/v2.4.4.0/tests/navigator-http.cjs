'use strict';
// Use the same two synthetic services and dedicated login IPs as the other isolation checks.
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const CAL = process.env.CHECK_CALENDAR || 'http://calendar-check:3000',
  LAB = process.env.CHECK_LAB || 'http://lab-check:3000';
const origin = 'https://tools.garyhub.uk',
  path = '/api/hub/site-navigator',
  checks = require('./asset-checks.json');
let n = 0;
function eq(a, b) {
  assert.deepEqual(a, b);
  n++;
}
async function login(name, ip) {
  const cookies = new Map();
  async function call(base, route, method = 'GET', body, csrf) {
    const headers = {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
      origin,
      cookie: [...cookies].map(([k, v]) => k + '=' + v).join('; ')
    };
    if (csrf) headers['x-csrf-token'] = csrf;
    const r = await fetch(base + route, { method, headers, body: body ? JSON.stringify(body) : undefined });
    for (const raw of r.headers.getSetCookie()) {
      const pair = raw.split(';')[0],
        cut = pair.indexOf('=');
      cookies.set(pair.slice(0, cut), pair.slice(cut + 1));
    }
    return { status: r.status, data: await r.json() };
  }
  const { token } = (await call(CAL, '/api/csrf')).data;
  eq(
    (
      await call(
        CAL,
        '/api/login',
        'POST',
        { username: 'check_' + name, password: 'Synthetic-Only-2026!' },
        token
      )
    ).status,
    200
  );
  const account = (await call(CAL, '/api/me')).data.user.id;
  const csrf = (await call(LAB, '/api/csrf')).data.token;
  return {
    account,
    clear: () =>
      call(LAB, '/api/hub/notifications/delete-all', 'POST', { userId: account, scope: 'tools' }, csrf),
    read: (p) => call(LAB, p),
    post: (suffix, data, valid = true) =>
      call(LAB, path + suffix, 'POST', { accountId: account, ...data }, valid ? csrf : undefined)
  };
}
(async () => {
  for (const a of checks.asset_checksums.filter((a) => a.route.startsWith('/useful/site-navigator/'))) {
    const res = await fetch(LAB + a.route);
    eq(res.status, 200);
    eq(
      createHash('sha256')
        .update(Buffer.from(await res.arrayBuffer()))
        .digest('hex'),
      a.sha256
    );
    if (a.route.endsWith('/'))
      eq(res.headers.get('content-security-policy').includes("object-src 'none'"), true);
  }
  eq((await fetch(LAB + path)).status, 401);
  const a = await login('alice', '192.0.2.241'),
    b = await login('bob', '192.0.2.242');
  const id = randomUUID(),
    m = { id, name: 'Synthetic study site', kind: 'zip', entry: 'study-site/dist/index.html' },
    d = randomUUID(),
    d2 = randomUUID();
  eq((await a.post('', m, false)).status, 403);
  eq((await a.post('', { ...m, accountId: b.account })).status, 409);
  eq((await a.post('', { ...m, entry: 'C:/private/site.html' })).status, 400);
  eq((await a.post('', { ...m, kind: 'url', url: 'file:///local.html' })).status, 400);
  eq((await a.post('', m)).status, 200);
  eq((await a.post('', m)).status, 200);
  eq((await a.read(path)).data.sites.filter((s) => s.id === id).length, 1);
  eq(
    (await b.read(path)).data.sites.some((s) => s.id === id),
    false
  );
  const state = (device, value) => a.post('/permission', { id, device, state: value });
  const notices = async (who) =>
    (await who.read('/api/hub/notifications?scope=all')).data.items.filter(
      (x) => x.type === 'site_permission' && x.action_url?.endsWith(id)
    );
  eq((await b.post('/permission', { id, device: d, state: 'attention' })).status, 404);
  await Promise.all([state(d, 'attention'), state(d, 'attention')]);
  let notes = await notices(a);
  eq(notes.length, 1);
  eq(notes[0].read_at, null);
  eq(notes[0].scope, 'tools');
  eq((await notices(b)).length, 0);
  await state(d2, 'attention');
  eq((await notices(a)).length, 2);
  await state(d, 'ready');
  eq((await notices(a)).length, 1);
  await state(d2, 'ready');
  eq((await notices(a)).length, 0);
  await state(d, 'attention');
  eq((await notices(a)).length, 1);
  eq((await a.clear()).status, 200);
  eq((await notices(a)).length, 0);
  await state(d, 'attention');
  eq((await notices(a)).length, 0);
  await state(d, 'ready');
  await state(d, 'attention');
  eq((await notices(a)).length, 1);
  eq((await a.post('/edit', { id, revision: 1, name: 'Updated site' })).data.site.revision, 2);
  eq((await a.post('/remove', { id, revision: 1 })).status, 409);
  eq((await a.post('/remove', { id, revision: 2 })).status, 200);
  eq((await notices(a)).length, 0);
  eq(
    (await a.read(path)).data.sites.some((s) => s.id === id),
    false
  );
  console.log('NAVIGATOR HTTP PASS: ' + n + ' checks');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
