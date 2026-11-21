'use strict';
// games.garyhub.uk (v2.4.2.0): the games lobby and "白日梦想家 / Daydreamer", served by this container from public/games/.
// Pages need a GaryHub sign-in (they redirect to the shared login page); their scripts and styles are static. The host
// answers only its own files, a few shared page helpers and the account/game APIs; everything else is 404, and other
// hosts never expose /games/. The game itself lives in Calendar (games-api.js) behind the usual origin and CSRF checks.
//
// v2.4.3.0 adds the live game rooms (/play/, Calendar play-rooms.js): their one WebSocket path is passed through to
// Calendar byte for byte, which checks the session and the origin itself; no other upgrade is accepted.
// v2.4.3.1 adds the co-op car: car.js and car-sim.js (a byte-identical copy of Calendar's play-car-sim.js).
const http = require('node:http');
const PAGES = new Map([['/', '/index.html'], ['/index.html', '/index.html'], ['/dream/', '/dream/index.html'], ['/dream/index.html', '/dream/index.html'],
  ['/play/', '/play/index.html'], ['/play/index.html', '/play/index.html']]);
const ASSETS = /^\/(?:games\.(?:css|js)|dream\/dream\.(?:css|js)|play\/(?:play\.(?:css|js)|word\.js|digits\.js|car\.js|car-sim\.js))$/;
const SHARED = new Set(['/hub-prefs.js', '/favicon.svg', '/icons/icon-192.png', '/icons/apple-touch-icon.png']);
const API = /^\/api\/(?:csrf|me|hub\/me|hub\/preferences|hub\/play|hub\/games(?:\/[1-9]\d{0,8}(?:\/(?:decline|cancel|choose|open|offer|answer|reveal|honor))?)?)$/;
const SOCKET = '/api/hub/play/socket';
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' wss://games.garyhub.uk; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const HOST = 'games.garyhub.uk', ORIGIN = 'https://' + HOST;

function createGamesHost({identity, json, auth, calendarUrl = 'http://calendar-app:3000'}) {
  // Returns true when the request was answered; otherwise the caller serves it (with url.pathname possibly rewritten).
  async function games(req, res, url, host) {
    if (host !== HOST) {
      if (/^\/games(?:\/|$)/i.test(url.pathname)) { json(res, 404, {message: 'Not found'}); return true; }
      return false;
    }
    if (url.pathname.startsWith('/api/')) {
      if (!API.test(url.pathname)) { json(res, 404, {message: 'Not found'}); return true; }
      return false;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { json(res, 405, {message: 'Method not allowed'}); return true; }
    if (url.pathname === '/dream' || url.pathname === '/play') { res.writeHead(302, {Location: url.pathname + '/' + url.search, 'Cache-Control': 'no-store'}); res.end(); return true; }
    if (SHARED.has(url.pathname)) return false;
    res.setHeader('Content-Security-Policy', CSP);
    const page = PAGES.get(url.pathname);
    if (page) {
      if (!await identity(req)) {
        res.writeHead(302, {Location: auth.loginUrl(ORIGIN + url.pathname.replace(/index\.html$/, '') + url.search), 'Cache-Control': 'no-store'});
        res.end();
        return true;
      }
      url.pathname = '/games' + page;
      return false;
    }
    if (ASSETS.test(url.pathname)) { url.pathname = '/games' + url.pathname; return false; }
    json(res, 404, {message: 'Not found'});
    return true;
  }

  // WebSocket upgrades: only games.garyhub.uk and only the room socket. Calendar answers the handshake (101, or an HTTP
  // error such as 401/403); both directions are then piped unchanged. Extensions are not offered upstream.
  const reply = (socket, status, text) => {
    const body = JSON.stringify({message: text});
    socket.end('HTTP/1.1 ' + status + ' ' + (http.STATUS_CODES[status] || '') + '\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: ' + Buffer.byteLength(body) + '\r\nConnection: close\r\n\r\n' + body);
  };
  games.upgrade = function upgrade(req, socket, head) {
    socket.on('error', () => socket.destroy());
    const host = (req.headers.host || '').split(':')[0];
    if (host !== HOST || req.url !== SOCKET || req.method !== 'GET') return reply(socket, 404, 'Not found');
    const target = new URL(calendarUrl);
    const headers = {host: target.host, connection: 'Upgrade', upgrade: String(req.headers.upgrade || ''),
      'sec-websocket-key': String(req.headers['sec-websocket-key'] || ''), 'sec-websocket-version': String(req.headers['sec-websocket-version'] || ''),
      cookie: req.headers.cookie || '', origin: req.headers.origin || '', 'x-forwarded-proto': 'https',
      'x-forwarded-for': (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',').at(-1).trim()};
    const upstream = http.request({hostname: target.hostname, port: target.port || 80, path: SOCKET, method: 'GET', headers});
    upstream.setTimeout(10_000, () => upstream.destroy(Error('timeout')));
    upstream.on('upgrade', (res, remote, remoteHead) => {
      upstream.setTimeout(0);
      const lines = ['HTTP/1.1 101 Switching Protocols'];
      for (let i = 0; i < res.rawHeaders.length; i += 2) lines.push(res.rawHeaders[i] + ': ' + res.rawHeaders[i + 1]);
      socket.write(lines.join('\r\n') + '\r\n\r\n');
      if (remoteHead && remoteHead.length) socket.write(remoteHead);
      if (head && head.length) remote.write(head);
      // Either side going away (close, or FIN on these half-open sockets) ends both.
      const end = () => { socket.destroy(); remote.destroy(); };
      for (const side of [remote, socket]) { side.on('error', end); side.on('end', end); side.on('close', end); }
      remote.setNoDelay(true); socket.setNoDelay(true);
      remote.pipe(socket); socket.pipe(remote);
    });
    upstream.on('response', res => {
      const chunks = []; let size = 0;
      res.on('data', chunk => { size += chunk.length; if (size <= 4096) chunks.push(chunk); });
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        socket.end('HTTP/1.1 ' + res.statusCode + ' ' + (http.STATUS_CODES[res.statusCode] || '') + '\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: ' + body.length + '\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n' + body.toString('utf8'));
      });
    });
    upstream.on('error', () => { if (!socket.destroyed) reply(socket, 503, '服务暂时不可用，请稍后重试'); });
    socket.on('close', () => upstream.destroy());
    upstream.end();
  };
  return games;
}

module.exports = {createGamesHost, API, HOST, SOCKET};
