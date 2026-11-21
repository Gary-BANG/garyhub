'use strict';
// v2.4.3.0: games.garyhub.uk passes exactly one WebSocket path through to Calendar and serves the room page and scripts.
const test = require('node:test'), assert = require('node:assert/strict'), http = require('node:http'), net = require('node:net');
const {createGamesHost, SOCKET} = require('../games-host.cjs');
// Every connection either server accepted, so each test can close them all (upgraded sockets are not the server's any more).
const open = new Set();
const track = server => { server.on('connection', socket => { open.add(socket); socket.on('close', () => open.delete(socket)); }); return server; };
const shut = (...servers) => { for (const socket of open) socket.destroy(); for (const server of servers) server.close(); };

function upstream() {
  const seen = [];
  const server = track(http.createServer((req, res) => { res.writeHead(404); res.end(); }));
  server.on('upgrade', (req, socket) => {
    seen.push({url: req.url, headers: req.headers});
    // Like Calendar, the fake upstream counts the FIN that ends the connection.
    socket.on('end', () => { seen.closed = (seen.closed || 0) + 1; });
    if (!req.headers.cookie) { socket.end('HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nContent-Length: 22\r\nConnection: close\r\n\r\n{"message":"未登录"}'.replace('22', Buffer.byteLength('{"message":"未登录"}'))); return; }
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: test\r\n\r\n');
    socket.on('data', chunk => socket.write(Buffer.concat([Buffer.from('echo:'), chunk])));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({server, seen, url: 'http://127.0.0.1:' + server.address().port})));
}
function front(calendarUrl) {
  const games = createGamesHost({identity: async req => req.headers.cookie ? {id: 1} : null, json: (res, status, value) => { res.writeHead(status, {'content-type': 'application/json'}); res.end(JSON.stringify(value)); },
    auth: {loginUrl: next => 'https://calendar.garyhub.uk/login/?next=' + encodeURIComponent(next)}, calendarUrl});
  const server = track(http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (await games(req, res, url, (req.headers.host || '').split(':')[0])) return;
    res.writeHead(200, {'x-path': url.pathname}); res.end();
  }));
  server.on('upgrade', games.upgrade);
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({server, port: server.address().port})));
}
// A raw upgrade request; resolves with the response head and the socket.
function knock(port, {host = 'games.garyhub.uk', path = SOCKET, cookie = 'sid=1', extra = ''} = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    let text = '';
    socket.on('data', function on(chunk) {
      text += chunk.toString();
      if (text.includes('\r\n\r\n')) { socket.off('data', on); resolve({head: text, socket}); }
    });
    socket.on('error', reject);
    socket.write('GET ' + path + ' HTTP/1.1\r\nHost: ' + host + '\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
      'Sec-WebSocket-Extensions: permessage-deflate\r\nOrigin: https://games.garyhub.uk\r\nX-Forwarded-For: 203.0.113.9, 198.51.100.7\r\n' + (cookie ? 'Cookie: ' + cookie + '\r\n' : '') + extra + '\r\n');
  });
}
function get(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({host: '127.0.0.1', port, path, agent: false, headers: {host: 'games.garyhub.uk', ...headers}}, res => { res.resume(); res.on('end', () => resolve(res)); }).on('error', reject);
  });
}

test('games host: the room socket is piped to Calendar with the session, origin and client address', async () => {
  const cal = await upstream(), lab = await front(cal.url);
  try {
    const {head, socket} = await knock(lab.port);
    assert.match(head, /^HTTP\/1\.1 101 /); assert.match(head, /Sec-WebSocket-Accept: test/);
    const echoed = new Promise(resolve => socket.once('data', chunk => resolve(chunk.toString())));
    socket.write('ping-bytes');
    assert.equal(await echoed, 'echo:ping-bytes');
    // The page going away with only a FIN closes Calendar's side too.
    socket.end();
    for (let i = 0; i < 100 && !cal.seen.closed; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(cal.seen.closed, 1);
    const sent = cal.seen[0];
    assert.equal(sent.url, SOCKET); assert.equal(sent.headers.cookie, 'sid=1'); assert.equal(sent.headers.origin, 'https://games.garyhub.uk');
    assert.equal(sent.headers['x-forwarded-for'], '198.51.100.7'); assert.equal(sent.headers['x-forwarded-proto'], 'https');
    assert.equal(sent.headers['sec-websocket-key'], 'dGhlIHNhbXBsZSBub25jZQ=='); assert.equal(sent.headers['sec-websocket-extensions'], undefined);
    // Calendar's refusal reaches the page as an ordinary HTTP answer.
    const refused = await knock(lab.port, {cookie: ''});
    assert.match(refused.head, /^HTTP\/1\.1 401 /); refused.socket.destroy();
    // No other host or path is upgraded, and nothing reaches Calendar for them.
    for (const options of [{host: 'tools.garyhub.uk'}, {host: 'garyhub.uk'}, {path: '/api/hub/play'}, {path: SOCKET + '?x=1'}, {path: '/api/hub/games'}]) {
      const r = await knock(lab.port, options); assert.match(r.head, /^HTTP\/1\.1 404 /, JSON.stringify(options)); r.socket.destroy();
    }
    assert.equal(cal.seen.length, 2);
  } finally { shut(lab.server, cal.server); }
});

test('games host: Calendar unavailable gives 503; the room page and scripts are served, the socket path is not plain HTTP', async () => {
  const lab = await front('http://127.0.0.1:9');
  try {
    const r = await knock(lab.port); assert.match(r.head, /^HTTP\/1\.1 503 /); r.socket.destroy();
    let res = await get(lab.port, '/play/?room=ABCDEF');
    assert.equal(res.statusCode, 302); assert.equal(res.headers.location, 'https://calendar.garyhub.uk/login/?next=' + encodeURIComponent('https://games.garyhub.uk/play/?room=ABCDEF'));
    res = await get(lab.port, '/play/?room=ABCDEF', {cookie: 'sid=1'});
    assert.equal(res.headers['x-path'], '/games/play/index.html'); assert.match(res.headers['content-security-policy'], /connect-src 'self' wss:\/\/games\.garyhub\.uk;/);
    assert.equal((await get(lab.port, '/play?room=ABCDEF')).headers.location, '/play/?room=ABCDEF');
    for (const asset of ['/play/play.js', '/play/play.css', '/play/word.js', '/play/digits.js', '/play/car.js', '/play/car-sim.js', '/play/board.js', '/play/treasure.js', '/play/monopoly.js'])
      assert.equal((await get(lab.port, asset)).headers['x-path'], '/games' + asset);
    for (const path of ['/play/other.js', '/play/car-sim.cjs', SOCKET, '/api/hub/play/1', '/games/play/play.js']) assert.equal((await get(lab.port, path)).statusCode, 404, path);
    assert.equal((await get(lab.port, '/api/hub/play')).headers['x-path'], '/api/hub/play');
  } finally { shut(lab.server); }
});
