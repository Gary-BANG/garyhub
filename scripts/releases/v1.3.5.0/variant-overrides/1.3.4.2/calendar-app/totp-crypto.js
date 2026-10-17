'use strict';
const crypto = require('node:crypto');
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function normalizeSecret(input) {
  if (typeof input !== 'string' || input.length > 512) throw Error('请输入有效的 Base32 密钥');
  const secret = input.replace(/\s/g, '').toUpperCase().replace(/=+$/, '');
  if (!/^[A-Z2-7]{16,208}$/.test(secret) || [1,3,6].includes(secret.length % 8)) throw Error('请输入有效的 Base32 密钥（至少 16 个字符）');
  // Reject incomplete/noncanonical trailing bits, rather than changing the key.
  decodeSecret(secret);
  return secret;
}
function decodeSecret(secret) {
  let value = 0, bits = 0; const bytes = [];
  for (const character of secret) {
    const n = ALPHABET.indexOf(character); if (n < 0) throw Error('密钥格式无效');
    value = (value << 5) | n; bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255); value &= (1 << bits) - 1; }
  }
  if (value !== 0 || bytes.length < 10 || bytes.length > 128) throw Error('密钥格式无效');
  return Buffer.from(bytes);
}
function totp(secret, now = Date.now()) {
  const key = decodeSecret(secret), counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  try {
    const hash = crypto.createHmac('sha1', key).update(counter).digest(), offset = hash[hash.length - 1] & 15;
    return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
  } finally { key.fill(0); }
}
function secretBox(encoded = process.env.GARYHUB_TOTP_ENCRYPTION_KEY) {
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw Error('TOTP encryption is unavailable');
  const key = Buffer.from(encoded, 'base64'); if (key.length !== 32 || key.toString('base64') !== encoded) throw Error('TOTP encryption is unavailable');
  const keyId = crypto.createHash('sha256').update(key).digest('hex').slice(0,16);
  const aad = (id, owner) => Buffer.from(`GaryHub/TOTP/v1:${id}:${owner}`);
  return {
    keyId,
    encrypt(secret, id, owner) {
      const nonce = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
      cipher.setAAD(aad(id, owner));
      const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
      return {ciphertext: ciphertext.toString('base64'), nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'), key_id: keyId};
    },
    decrypt(row) {
      if (row.key_id !== keyId) throw Error('TOTP encryption is unavailable');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(row.nonce, 'base64'));
      decipher.setAAD(aad(row.id, row.user_id)); decipher.setAuthTag(Buffer.from(row.tag, 'base64'));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(row.ciphertext, 'base64')), decipher.final()]);
      try { return plaintext.toString('utf8'); } finally { plaintext.fill(0); }
    },
    destroy() { key.fill(0); }
  };
}
module.exports = {normalizeSecret, totp, secretBox};
