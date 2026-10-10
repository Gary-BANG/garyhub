const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DURATIONS = new Set([7, 30, 365, 'permanent']);
const DAY = 24 * 60 * 60 * 1000;

function createAccessStore(dataDir) {
  const file = path.join(dataDir, 'access-entitlements.json');
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  function read() {
    if (!fs.existsSync(file)) return { version: 1, codes: [], grants: {}, audit: [] };
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (value.version !== 1 || !Array.isArray(value.codes) || !value.grants || !Array.isArray(value.audit)) throw Error('Invalid access data');
    return value;
  }
  function save(value) {
    const tmp = `${file}.${process.pid}.tmp`;
    const fd = fs.openSync(tmp, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(tmp, file);
  }
  function createCodes(adminId, duration, count) {
    if (!DURATIONS.has(duration) || !Number.isSafeInteger(count) || count < 1 || count > 20) throw Object.assign(Error('期限或数量无效'), { status: 400 });
    const db = read(), now = new Date().toISOString(), codes = [];
    for (let i = 0; i < count; i++) {
      const code = `GH-${crypto.randomBytes(18).toString('base64url')}`;
      db.codes.push({ hash: crypto.createHash('sha256').update(code).digest('hex'), duration, createdBy: adminId, createdAt: now, redeemedBy: null, redeemedAt: null });
      codes.push(code);
    }
    db.audit.push({ action: 'create', adminId, duration, count, at: now });
    save(db);
    return codes;
  }
  function redeem(userId, rawCode, now = Date.now()) {
    if (typeof rawCode !== 'string' || !/^GH-[A-Za-z0-9_-]{24}$/.test(rawCode)) throw Object.assign(Error('邀请码格式不正确'), { status: 400 });
    const db = read(), hash = crypto.createHash('sha256').update(rawCode).digest('hex');
    const entry = db.codes.find(x => x.hash === hash);
    if (!entry || entry.redeemedBy !== null) throw Object.assign(Error('邀请码无效或已使用'), { status: 400 });
    const key = String(userId), old = db.grants[key];
    const permanent = entry.duration === 'permanent' || (!old?.revoked && old?.permanent === true);
    const base = Math.max(now, !old?.revoked && old?.expiresAt ? Date.parse(old.expiresAt) || 0 : 0);
    const expiresAt = permanent ? null : new Date(base + entry.duration * DAY).toISOString();
    const grant = { userId, permanent, expiresAt, revoked: false, updatedAt: new Date(now).toISOString(), connectionStatus: 'pending',
      clientId: (!old?.revoked && old?.clientId) || crypto.randomUUID(), subscriptionToken: (!old?.revoked && old?.subscriptionToken) || crypto.randomBytes(32).toString('base64url') };
    db.grants[key] = grant;
    entry.redeemedBy = userId;
    entry.redeemedAt = grant.updatedAt;
    db.audit.push({ action: 'redeem', userId, codeHash: hash, duration: entry.duration, at: grant.updatedAt });
    save(db);
    return grant;
  }
  function status(userId, now = Date.now()) {
    const grant = read().grants[String(userId)] || null;
    if (!grant) return null;
    const { clientId, subscriptionToken, ...publicGrant } = grant;
    return { ...publicGrant, active: !grant.revoked && (grant.permanent || (Date.parse(grant.expiresAt) > now)) };
  }
  function listCodes() {
    return read().codes.map(({ hash, duration, createdAt, redeemedBy, redeemedAt }) => ({ fingerprint: hash.slice(0, 10), duration, createdAt, redeemedBy, redeemedAt }));
  }
  function privateGrant(userId) { return read().grants[String(userId)] || null; }
  function byToken(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    return Object.values(read().grants).find(g => typeof g.subscriptionToken === 'string' && g.subscriptionToken.length === token.length && crypto.timingSafeEqual(Buffer.from(g.subscriptionToken), Buffer.from(token))) || null;
  }
  function rotate(userId) {
    const db=read(), g=db.grants[String(userId)];
    if(!g) throw Object.assign(Error('请先兑换邀请码'),{status:400});
    g.clientId=crypto.randomUUID(); g.subscriptionToken=crypto.randomBytes(32).toString('base64url');
    g.updatedAt=new Date().toISOString();
    db.audit.push({action:'rotate',userId,at:g.updatedAt});save(db);
  }
  function revoke(adminId,userId) {
    if(!Number.isSafeInteger(userId)||userId<1) throw Object.assign(Error('用户编号无效'),{status:400});
    const db=read(), g=db.grants[String(userId)];
    if(!g) throw Object.assign(Error('未找到授权'),{status:404});
    g.revoked=true;g.updatedAt=new Date().toISOString();
    db.audit.push({action:'revoke',adminId,userId,at:g.updatedAt});save(db);
  }
  function settings() { return read().settings || {}; }
  function setStore(adminId,storeUrl) {
    if(typeof storeUrl!=='string'||storeUrl.length>2048) throw Object.assign(Error('店铺地址无效'),{status:400});
    if(storeUrl) {
      let u;try {u=new URL(storeUrl);}catch {throw Object.assign(Error('请输入完整 HTTPS 链接'),{status:400});}
      if(u.protocol!=='https:'||u.username||u.password) throw Object.assign(Error('请输入不含账号密码的 HTTPS 链接'),{status:400});
      storeUrl=u.href;
    }
    const db=read();db.settings={...db.settings,storeUrl};
    db.audit.push({action:'store',adminId,at:new Date().toISOString()});save(db);
  }
  function listGrants() { return Object.values(read().grants).map(g=>status(g.userId)); }
  return { createCodes, redeem, status, listCodes, privateGrant, byToken, rotate, revoke, settings, setStore, listGrants };
}

module.exports = { createAccessStore };
