'use strict';
const crypto = require('node:crypto');
const path = require('node:path');
function openConnection() {
  const raw = new (require('sqlite3').Database)(path.join(require('./db').dataDir, 'calendar.sqlite'));
  raw.configure('busyTimeout', 5000);
  return { run:(sql,params=[])=>new Promise((resolve,reject)=>raw.run(sql,params,function(e){e?reject(e):resolve(this);})), get:(sql,params=[])=>new Promise((resolve,reject)=>raw.get(sql,params,(e,row)=>e?reject(e):resolve(row))), all:(sql,params=[])=>new Promise((resolve,reject)=>raw.all(sql,params,(e,rows)=>e?reject(e):resolve(rows))) };
}
async function transaction(db,fn) {
  await db.run('BEGIN IMMEDIATE');
  try { const value=await fn(); await db.run('COMMIT'); return value; } catch(error) { await db.run('ROLLBACK'); throw error; }
}
const { hashPassword, verifyPassword } = require('./auth-utils');
const { findLoginIdentity } = require('./login-identity');
const { rateLimit } = require('./rate-limit');
const mailer = require('./mailer');

const GENERIC = '如果账号已绑定可用的验证邮箱，验证码将发送至该邮箱。未收到邮件或无法使用原邮箱时，请联系管理员。';
const INVALID = '验证码无效或已过期，请重新申请。';
const TTL = 10 * 60_000;

async function migratePasswordReset(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS password_reset_requests (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_normalized TEXT NOT NULL, email_verified_at TEXT NOT NULL, auth_version INTEGER NOT NULL,
    code_digest TEXT NOT NULL, ticket_digest TEXT, created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    verified_at INTEGER, consumed_at INTEGER
  )`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_requests(user_id,created_at)');
}

function registerPasswordReset(app, { sessionStore, db = openConnection(), sendMail = mailer.sendMail, clock = Date.now }) {
  let queue = db.run('PRAGMA foreign_keys=ON');
  const route = fn => (req, res, next) => {
    const task = queue.then(() => fn(req, res));
    queue = task.catch(() => {});
    task.catch(next);
  };
  function digest(value) {
    const key = process.env.EMAIL_CODE_PEPPER || process.env.SESSION_SECRET;
    if (!key || key.length < 24) throw Error('Password recovery configuration unavailable');
    return crypto.createHmac('sha256', key).update(value).digest('hex');
  }
  const matches = (a, b) => typeof a === 'string' && /^[0-9a-f]{64}$/.test(a) &&
    typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  const active = u => u && u.enabled === 1 && !u.deletion_pending && u.email_verified_at && u.email_normalized && u.email;
  async function current(row) {
    if (!row || row.consumed_at || row.expires_at <= clock()) return null;
    const user = await db.get('SELECT * FROM users WHERE id=?', [row.user_id]);
    return active(user) && user.email_normalized === row.email_normalized && user.email_verified_at === row.email_verified_at &&
      user.auth_version === row.auth_version ? user : null;
  }
  function deliver(message, id) {
    // Return the same response before delivery for both existing and unknown accounts.
    setImmediate(() => Promise.resolve().then(() => sendMail(message)).catch(() => {
      if (id) {
        const pending = queue.then(() => db.run('UPDATE password_reset_requests SET consumed_at=? WHERE id=?', [clock(), id]));
        queue = pending.catch(() => {});
      }
      console.error('GaryHub account recovery email delivery failed.');
    }));
  }
  app.post('/api/password-reset/request', rateLimit(20, 60 * 60_000), route(async (req, res) => {
    const id = crypto.randomUUID(), now = clock(), started = Date.now();
    digest('configuration-check');
    const user = await findLoginIdentity(db, req.body.identifier);
    const result = { requestId: id, message: GENERIC, retryAfter: 60 };
    if (active(user)) {
      const recent = await db.get('SELECT MAX(created_at) AS last,COUNT(*) AS n FROM password_reset_requests WHERE user_id=? AND created_at>?', [user.id, now - 3600_000]);
      if ((!recent.last || now - recent.last >= 60_000) && recent.n < 10) {
        const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
        const codeDigest = digest(`reset-code:${id}:${code}`);
        await transaction(db, async () => {
          await db.run('DELETE FROM password_reset_requests WHERE created_at<?', [now - 86400_000]);
          await db.run('UPDATE password_reset_requests SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL', [now, user.id]);
          await db.run(`INSERT INTO password_reset_requests(id,user_id,email_normalized,email_verified_at,auth_version,code_digest,created_at,expires_at)
            VALUES(?,?,?,?,?,?,?,?)`, [id, user.id, user.email_normalized, user.email_verified_at, user.auth_version, codeDigest, now, now + TTL]);
        });
        deliver({ to: user.email, subject: 'GaryHub · 密码重置验证码 / Password reset code',
          text: `密码重置验证码 / Password reset code: ${code}\n10 分钟内有效，仅可使用一次。Valid for 10 minutes, single use.\n如果不是你本人申请，请忽略此邮件，你的密码尚未改变。If you did not request this, ignore this email. Your password has not changed.` }, id);
      }
    }
    setTimeout(() => res.json(result), Math.max(0, 150 - (Date.now() - started)));
  }));
  app.post('/api/password-reset/verify', rateLimit(40, 15 * 60_000), route(async (req, res) => {
    const { requestId, code } = req.body;
    if (typeof requestId !== 'string' || !/^[0-9a-f-]{36}$/.test(requestId) || typeof code !== 'string' || !/^\d{6}$/.test(code)) return res.status(400).json({ message: INVALID });
    const result = await transaction(db, async () => {
      const row = await db.get('SELECT * FROM password_reset_requests WHERE id=?', [requestId]);
      if (!await current(row) || row.verified_at || row.attempts >= 5) return null;
      // Failed attempts are committed too; throwing here would roll the counter back.
      await db.run('UPDATE password_reset_requests SET attempts=attempts+1 WHERE id=?', [requestId]);
      if (!matches(row.code_digest, digest(`reset-code:${requestId}:${code}`))) return null;
      const token = crypto.randomBytes(32).toString('hex');
      await db.run('UPDATE password_reset_requests SET verified_at=?,ticket_digest=? WHERE id=?', [clock(), digest(`reset-ticket:${requestId}:${token}`), requestId]);
      return token;
    });
    if (!result) return res.status(400).json({ message: INVALID });
    res.json({ resetToken: result, message: '验证通过，请设置新密码。' });
  }));
  app.post('/api/password-reset/complete', rateLimit(20, 15 * 60_000), route(async (req, res) => {
    const { requestId, resetToken, password, confirmPassword } = req.body;
    if (typeof password !== 'string' || password.length < 10 || password.length > 128 || !password.trim() || password !== confirmPassword) return res.status(400).json({ message: '新密码应为10–128个字符，两次输入须一致。' });
    if (typeof requestId !== 'string' || !/^[0-9a-f-]{36}$/.test(requestId) || typeof resetToken !== 'string' || !/^[0-9a-f]{64}$/.test(resetToken)) return res.status(400).json({ message: INVALID });
    const result = await transaction(db, async () => {
      const row = await db.get('SELECT * FROM password_reset_requests WHERE id=?', [requestId]);
      const user = await current(row);
      if (!user || !row.verified_at || !matches(row.ticket_digest, digest(`reset-ticket:${requestId}:${resetToken}`))) return null;
      if (verifyPassword(password, user.password_hash)) return { samePassword: true };
      await db.run('UPDATE users SET password_hash=?,auth_version=auth_version+1,must_change_password=0 WHERE id=?', [hashPassword(password), user.id]);
      await db.run('UPDATE password_reset_requests SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL', [clock(), user.id]);
      return user;
    });
    if (!result) return res.status(400).json({ message: INVALID });
    if (result.samePassword) return res.status(400).json({ message: '请设置与原密码不同的新密码。' });
    // auth_version already invalidates every shared session, including concurrent stale saves.
    if (sessionStore?.db) {
      try {
        const raw = sessionStore.db;
        const rows = await new Promise((resolve, reject) => raw.all('SELECT sid,sess FROM sessions', (e, rows) => e ? reject(e) : resolve(rows)));
        for (const row of rows) {
          let value; try { value = JSON.parse(row.sess); } catch { continue; }
          if (value.user?.id === result.id) await new Promise((resolve, reject) => raw.run('DELETE FROM sessions WHERE sid=?', [row.sid], e => e ? reject(e) : resolve()));
        }
      } catch { console.error('Password changed; revoked sessions will be removed on their next request.'); }
    }
    deliver({ to: result.email, subject: 'GaryHub · 密码已重置 / Password changed', text: '你的 GaryHub 密码已成功重置，原有登录已失效。请使用新密码重新登录。\nYour GaryHub password has been reset and previous sessions revoked. Sign in with your new password.\n如非你本人操作，请立即联系管理员。If you did not make this change, contact the administrator immediately.' });
    res.json({ ok: true, message: '密码已重置，请使用新密码重新登录。' });
  }));
}
module.exports = { migratePasswordReset, registerPasswordReset, GENERIC, INVALID };
