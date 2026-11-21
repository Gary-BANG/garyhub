'use strict';
// A small WebSocket client for tests (Node 20 has no built-in one that can send a cookie and an origin).
const http = require('node:http'), crypto = require('node:crypto');

function encode(opcode, payload, {mask = true, fin = true} = {}) {
  const length = payload.length, key = crypto.randomBytes(4);
  const head = length < 126 ? Buffer.from([(fin ? 0x80 : 0) | opcode, (mask ? 0x80 : 0) | length])
    : Buffer.from([(fin ? 0x80 : 0) | opcode, (mask ? 0x80 : 0) | 126, length >> 8, length & 255]);
  if (!mask) return Buffer.concat([head, payload]);
  const body = Buffer.from(payload);
  for (let i = 0; i < body.length; i++) body[i] ^= key[i & 3];
  return Buffer.concat([head, key, body]);
}

// Resolves with {status, socket?, body}: a 101 gives a client; anything else the HTTP status and body.
function connect(url, {cookie = '', origin = '', host, extra = {}} = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = http.request({hostname: target.hostname, port: target.port, path: target.pathname + target.search, method: 'GET',
      headers: {connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': crypto.randomBytes(16).toString('base64'),
        ...(cookie ? {cookie} : {}), ...(origin ? {origin} : {}), ...(host ? {host} : {}), ...extra}});
    req.on('upgrade', (res, socket, head) => resolve({status: 101, headers: res.headers, client: client(socket, head)}));
    req.on('response', res => { const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({status: res.statusCode, body: Buffer.concat(chunks).toString()})); });
    req.on('error', reject);
    req.end();
  });
}

function client(socket, head) {
  let buffer = head && head.length ? Buffer.from(head) : Buffer.alloc(0);
  const inbox = [], waiters = [];
  const c = {socket, messages: inbox, closed: null, raw: [],
    send: object => socket.write(encode(1, Buffer.from(typeof object === 'string' ? object : JSON.stringify(object)))),
    frame: (opcode, payload, options) => socket.write(encode(opcode, Buffer.from(payload), options)),
    // The next message matching the test, from what already arrived or what arrives within the time limit.
    next(test = () => true, ms = 4000) {
      const found = inbox.findIndex(test);
      if (found >= 0) return Promise.resolve(inbox.splice(found, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = {test, resolve, timer: setTimeout(() => { waiters.splice(waiters.indexOf(waiter), 1); reject(Error('no message in time: ' + test)); }, ms)};
        waiters.push(waiter);
      });
    },
    close() { try { socket.write(encode(8, Buffer.from([3, 232]))); } catch {} socket.end(); }
  };
  const deliver = message => {
    const i = waiters.findIndex(w => w.test(message));
    if (i >= 0) { const [w] = waiters.splice(i, 1); clearTimeout(w.timer); w.resolve(message); } else inbox.push(message);
  };
  const parse = () => {
    while (buffer.length >= 2) {
      const opcode = buffer[0] & 0x0f; let length = buffer[1] & 0x7f, offset = 2;
      if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4; }
      else if (length === 127) { if (buffer.length < 10) return; length = Number(buffer.readBigUInt64BE(2)); offset = 10; }
      if (buffer.length < offset + length) return;
      const payload = buffer.subarray(offset, offset + length); buffer = buffer.subarray(offset + length);
      c.raw.push({opcode, payload: Buffer.from(payload)});
      if (opcode === 1) { const text = payload.toString(); let m; try { m = JSON.parse(text); } catch { m = text; } if (m && typeof m === 'object') deliver(m); }
      else if (opcode === 8) c.closed = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
      else if (opcode === 9) socket.write(encode(10, payload));
    }
  };
  socket.on('data', chunk => { buffer = Buffer.concat([buffer, chunk]); parse(); });
  socket.on('error', () => {});
  socket.on('close', () => { if (c.closed == null) c.closed = 1006; });
  parse();
  return c;
}

module.exports = {connect, encode, client};
