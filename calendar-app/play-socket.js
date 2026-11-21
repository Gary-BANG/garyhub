'use strict';
// Game rooms (v2.4.3.0): the server side of a WebSocket (RFC 6455), without a dependency so the image still builds
// offline. Text messages only, no extensions; client frames must be masked; one message is at most MAX bytes
// (fragments included). Anything else closes the connection with the matching status code.
const crypto = require('node:crypto');
const {EventEmitter} = require('node:events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX = 8192, MAX_BUFFERED = 1 << 20;
const decoder = new TextDecoder('utf-8', {fatal: true});

// The handshake is valid only for a GET with the WebSocket upgrade headers and a 16-byte key.
function handshakeKey(req) {
  const upgrade = String(req.headers.upgrade || '').toLowerCase(), key = String(req.headers['sec-websocket-key'] || '');
  if (req.method !== 'GET' || upgrade !== 'websocket' || req.headers['sec-websocket-version'] !== '13') return null;
  if (!/^[A-Za-z0-9+/]{22}==$/.test(key) || Buffer.from(key, 'base64').length !== 16) return null;
  return key;
}
const acceptKey = key => crypto.createHash('sha1').update(key + GUID).digest('base64');

function frame(opcode, payload) {
  const length = payload.length;
  const head = length < 126 ? Buffer.from([0x80 | opcode, length])
    : length < 65536 ? Buffer.from([0x80 | opcode, 126, length >> 8, length & 255])
    : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | opcode; b[1] = 127; b.writeBigUInt64BE(BigInt(length), 2); return b; })();
  return Buffer.concat([head, payload]);
}

class Connection extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket; this.buffer = Buffer.alloc(0); this.parts = []; this.partBytes = 0; this.partial = false;
    this.closed = false; this.closing = false; this.lastSeen = Date.now();
    socket.setNoDelay(true);
    socket.on('data', chunk => this.receive(chunk));
    socket.on('error', () => this.destroy());
    // HTTP server sockets allow half-open connections: a peer that just goes away (a killed app, a proxy closing)
    // sends FIN without a close frame, and only 'end' says so.
    socket.on('end', () => this.destroy());
    socket.on('close', () => this.destroy());
  }
  receive(chunk) {
    if (this.closed) return;
    this.lastSeen = Date.now();
    // Every frame's length is checked before waiting for its payload, so the buffer stays below MAX + 14 bytes.
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    while (!this.closed) {
      const b = this.buffer;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0, opcode = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0;
      let length = b[1] & 0x7f, offset = 2;
      if (b[0] & 0x70) return this.close(1002, 'reserved bits');
      if (!masked) return this.close(1002, 'unmasked');
      if (length === 126) { if (b.length < 4) return; length = b.readUInt16BE(2); offset = 4; }
      else if (length === 127) {
        if (b.length < 10) return;
        const big = b.readBigUInt64BE(2);
        if (big > BigInt(MAX)) return this.close(1009, 'too big');
        length = Number(big); offset = 10;
      }
      if (length > MAX) return this.close(1009, 'too big');
      if (b.length < offset + 4 + length) return;
      const mask = b.subarray(offset, offset + 4), payload = Buffer.from(b.subarray(offset + 4, offset + 4 + length));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buffer = b.subarray(offset + 4 + length);
      if (opcode >= 8) {
        if (!fin || length > 125) return this.close(1002, 'bad control frame');
        if (opcode === 8) return this.closeReceived(payload);
        if (opcode === 9) { this.write(frame(10, payload)); continue; }
        if (opcode === 10) continue;
        return this.close(1002, 'unknown opcode');
      }
      if (opcode === 2) return this.close(1003, 'text only');
      if (opcode === 1) { if (this.partial) return this.close(1002, 'interleaved message'); this.partial = true; this.parts = []; this.partBytes = 0; }
      else if (opcode !== 0 || !this.partial) return this.close(1002, 'unexpected frame');
      this.parts.push(payload); this.partBytes += payload.length;
      if (this.partBytes > MAX) return this.close(1009, 'too big');
      if (!fin) continue;
      const whole = Buffer.concat(this.parts);
      this.partial = false; this.parts = []; this.partBytes = 0;
      let text;
      try { text = decoder.decode(whole); } catch { return this.close(1007, 'invalid text'); }
      this.emit('message', text);
    }
  }
  write(data) {
    if (this.closed || !this.socket.writable) return;
    // A client that stops reading is dropped instead of growing the buffer.
    if (this.socket.writableLength > MAX_BUFFERED) return this.destroy();
    this.socket.write(data);
  }
  send(text) { if (!this.closing) this.write(frame(1, Buffer.from(String(text), 'utf8'))); }
  ping() { if (!this.closing) this.write(frame(9, Buffer.alloc(0))); }
  close(code = 1000, reason = '') {
    if (this.closed || this.closing) return;
    const body = Buffer.alloc(2); body.writeUInt16BE(code, 0);
    this.write(frame(8, Buffer.concat([body, Buffer.from(String(reason).slice(0, 60), 'utf8')])));
    this.closing = true;
    this.socket.end();
    setTimeout(() => this.destroy(), 2000).unref();
  }
  closeReceived(payload) {
    if (!this.closing) {
      const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1000;
      this.write(frame(8, payload.length >= 2 ? payload.subarray(0, 2) : Buffer.alloc(0)));
      this.closing = true;
      this.emit('peerclose', code);
      this.socket.end();
    }
    setTimeout(() => this.destroy(), 1000).unref();
  }
  destroy() {
    if (this.closed) return;
    this.closed = true; this.closing = true;
    this.socket.destroy();
    this.emit('close');
  }
}

// Completes the handshake on a socket taken from an HTTP upgrade request; returns null if it is not a valid one.
function accept(req, socket, head) {
  const key = handshakeKey(req);
  if (!key) return null;
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acceptKey(key) + '\r\n\r\n');
  const connection = new Connection(socket);
  if (head && head.length) connection.receive(head);
  return connection;
}

module.exports = {accept, handshakeKey, acceptKey, frame, Connection, MAX};
