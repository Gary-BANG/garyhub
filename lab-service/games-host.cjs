'use strict';
// games.garyhub.uk (v2.4.2.0): the games lobby and "白日梦想家 / Daydreamer", served by this container from public/games/.
// Pages need a GaryHub sign-in (they redirect to the shared login page); their scripts and styles are static. The host
// answers only its own files, a few shared page helpers and the account/game APIs; everything else is 404, and other
// hosts never expose /games/. The game itself lives in Calendar (games-api.js) behind the usual origin and CSRF checks.
const PAGES = new Map([['/', '/index.html'], ['/index.html', '/index.html'], ['/dream/', '/dream/index.html'], ['/dream/index.html', '/dream/index.html']]);
const ASSETS = /^\/(?:games\.(?:css|js)|dream\/dream\.(?:css|js))$/;
const SHARED = new Set(['/hub-prefs.js', '/favicon.svg', '/icons/icon-192.png', '/icons/apple-touch-icon.png']);
const API = /^\/api\/(?:csrf|me|hub\/me|hub\/preferences|hub\/games(?:\/[1-9]\d{0,8}(?:\/(?:decline|cancel|choose|open|offer|answer|reveal|honor))?)?)$/;
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const HOST = 'games.garyhub.uk', ORIGIN = 'https://' + HOST;

function createGamesHost({identity, json, auth}) {
  // Returns true when the request was answered; otherwise the caller serves it (with url.pathname possibly rewritten).
  return async function games(req, res, url, host) {
    if (host !== HOST) {
      if (/^\/games(?:\/|$)/i.test(url.pathname)) { json(res, 404, {message: 'Not found'}); return true; }
      return false;
    }
    if (url.pathname.startsWith('/api/')) {
      if (!API.test(url.pathname)) { json(res, 404, {message: 'Not found'}); return true; }
      return false;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { json(res, 405, {message: 'Method not allowed'}); return true; }
    if (url.pathname === '/dream') { res.writeHead(302, {Location: '/dream/' + url.search, 'Cache-Control': 'no-store'}); res.end(); return true; }
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
  };
}

module.exports = {createGamesHost, API, HOST};
