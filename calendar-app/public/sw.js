/* GaryHub Calendar service worker (v2.4.1.3): shows push notifications and opens their page when tapped.
   It does not cache or intercept any request. */
'use strict';
const HOSTS = new Set(['garyhub.uk', 'calendar.garyhub.uk', 'tools.garyhub.uk', 'lab.garyhub.uk', 'games.garyhub.uk']);
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {body: event.data ? event.data.text() : ''}; }
  event.waitUntil(self.registration.showNotification(String(data.title || 'Gary Hub').slice(0, 120), {
    body: String(data.body || '').slice(0, 400), tag: data.tag || undefined, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
    data: {url: data.url || '/'}
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  let target = new URL('/', self.location.origin).href;
  try { const url = new URL(event.notification.data?.url || '/', self.location.origin); if (url.protocol === 'https:' && HOSTS.has(url.hostname) || url.origin === self.location.origin) target = url.href; } catch {}
  event.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    for (const client of list) if (client.url === target && 'focus' in client) return client.focus();
    return self.clients.openWindow(target);
  }));
});
