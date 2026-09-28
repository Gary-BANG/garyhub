"use strict";

const crypto = require("crypto");
const { get, run } = require("./db");
const mailer = require("./mailer");
const { isValidTimeZone } = require("./reminder-utils");
const { rateLimit } = require("./rate-limit");

function normalizeEmail(value) {
  const email = String(value || "").trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("邮箱地址格式不正确");
  }
  return { email, normalized: email.toLowerCase() };
}

function digest(value) {
  const secret = process.env.EMAIL_CODE_PEPPER || process.env.SESSION_SECRET;
  if (!secret || secret.length < 24) throw new Error("EMAIL_CODE_PEPPER 未配置或长度不足");
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function safeDigestMatch(actual, expected) {
  return typeof actual === "string" && typeof expected === "string" &&
    actual.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

async function consumeVerification({ id, token, email, purpose, userId = null }) {
  const { normalized } = normalizeEmail(email);
  if (typeof id !== "string" || typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) {
    throw new Error("邮箱验证票据无效");
  }
  const row = await get(`SELECT * FROM email_verifications WHERE id=? AND email_normalized=?
    AND purpose=? AND (user_id IS ? OR user_id=?) AND verified_at IS NOT NULL
    AND consumed_at IS NULL AND expires_at > ?`,
    [id, normalized, purpose, userId, userId, new Date().toISOString()]);
  if (!row || !safeDigestMatch(row.verification_token_digest, digest(`ticket:${id}:${token}`))) {
    throw new Error("邮箱验证票据无效或已过期");
  }
  const result = await run("UPDATE email_verifications SET consumed_at=? WHERE id=? AND consumed_at IS NULL",
    [new Date().toISOString(), id]);
  if (!result.changes) throw new Error("邮箱验证票据已使用");
  return row;
}

module.exports = function registerEmailApi(app, { requireLogin }) {
  app.get("/api/mail-config", (req, res) => {
    res.json({ available: mailer.mode() !== "disabled",
      registration_required: process.env.REQUIRE_VERIFIED_EMAIL === "true" });
  });
  app.get("/api/account/email", requireLogin, async (req, res) => {
    const row = await get("SELECT email,email_verified_at,timezone FROM users WHERE id=?", [req.session.user.id]);
    res.json({ ...row, mail_enabled: mailer.mode() !== "disabled" });
  });

  app.put("/api/account/timezone", requireLogin, async (req, res) => {
    const zone = String(req.body.timezone || "");
    if (!isValidTimeZone(zone) || zone.length > 80) {
      return res.status(400).json({ message: "请输入有效的 IANA 时区" });
    }
    await run("UPDATE users SET timezone=? WHERE id=?", [zone, req.session.user.id]);
    res.json({ timezone: zone });
  });

  app.post("/api/email-verifications/request", rateLimit(10, 60 * 60_000), async (req, res) => {
    try {
      if (mailer.mode() === "disabled") return res.status(503).json({ message: "邮件发送尚未配置" });
      const { email, normalized } = normalizeEmail(req.body.email);
      const purpose = req.body.purpose;
      if (!["registration", "add_email", "change_email"].includes(purpose)) {
        return res.status(400).json({ message: "验证用途非法" });
      }
      const userId = purpose === "registration" ? null : req.session.user?.id;
      if (purpose !== "registration" && !userId) return res.status(401).json({ message: "未登录" });
      const existing = await get("SELECT id FROM users WHERE email_normalized=?", [normalized]);
      if (existing) return res.status(409).json({ message: "此邮箱已关联账号" });
      const recent = await get(`SELECT last_sent_at FROM email_verifications WHERE email_normalized=?
        ORDER BY created_at DESC LIMIT 1`, [normalized]);
      if (recent && Date.now() - Date.parse(recent.last_sent_at) < 60_000) {
        return res.status(429).json({ message: "请 60 秒后再发送验证码" });
      }
      const id = crypto.randomUUID();
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
      const now = new Date();
      await run(`INSERT INTO email_verifications
        (id,user_id,email,email_normalized,purpose,code_digest,expires_at,last_sent_at)
        VALUES(?,?,?,?,?,?,?,?)`, [id,userId,email,normalized,purpose,digest(`code:${id}:${code}`),
        new Date(now.getTime() + 600_000).toISOString(),now.toISOString()]);
      try {
        await mailer.sendMail({ to: email, subject: "Gary Hub 邮箱验证码",
          text: `你的验证码：${code}\n10 分钟内有效。若不是你本人操作，请忽略此邮件。` });
      } catch (error) {
        await run("DELETE FROM email_verifications WHERE id=?", [id]);
        console.error("发送验证码失败:", error.message);
        return res.status(503).json({ message: "发送失败，请稍后重试" });
      }
      res.status(201).json({ verification_id: id, message: "验证码已发送" });
    } catch (error) {
      if (/邮箱|PEPPER/.test(error.message)) return res.status(400).json({ message: error.message });
      console.error("申请验证码失败:", error);
      res.status(500).json({ message: "服务器错误" });
    }
  });

  app.post("/api/email-verifications/confirm", async (req, res) => {
    try {
      const { normalized } = normalizeEmail(req.body.email);
      const id = String(req.body.verification_id || "");
      const purpose = req.body.purpose;
      const code = String(req.body.code || "");
      if (!/^[0-9]{6}$/.test(code)) return res.status(400).json({ message: "验证码应为 6 位数字" });
      const userId = purpose === "registration" ? null : req.session.user?.id;
      const row = await get(`SELECT * FROM email_verifications WHERE id=? AND email_normalized=?
        AND purpose=? AND (user_id IS ? OR user_id=?)`, [id,normalized,purpose,userId,userId]);
      if (!row || row.consumed_at || row.verified_at || row.attempt_count >= 5 ||
          row.expires_at <= new Date().toISOString()) {
        return res.status(400).json({ message: "验证码无效或已过期" });
      }
      await run("UPDATE email_verifications SET attempt_count=attempt_count+1 WHERE id=?", [id]);
      if (!safeDigestMatch(row.code_digest, digest(`code:${id}:${code}`))) {
        return res.status(400).json({ message: "验证码错误" });
      }
      const token = crypto.randomBytes(32).toString("hex");
      await run(`UPDATE email_verifications SET verified_at=?,verification_token_digest=? WHERE id=?`,
        [new Date().toISOString(),digest(`ticket:${id}:${token}`),id]);
      res.json({ verification_id: id, verification_token: token });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/account/email", requireLogin, async (req, res) => {
    try {
      const { email, normalized } = normalizeEmail(req.body.email);
      const purpose = req.body.purpose === "change_email" ? "change_email" : "add_email";
      const row = await consumeVerification({ id: req.body.verification_id,
        token: req.body.verification_token,email,purpose,userId:req.session.user.id });
      await run(`UPDATE users SET email=?,email_normalized=?,email_verified_at=? WHERE id=?`,
        [email,normalized,row.verified_at,req.session.user.id]);
      res.json({ message: "邮箱已验证并保存", email });
    } catch (error) {
      res.status(/UNIQUE|constraint/i.test(error.message) ? 409 : 400).json({ message: error.message });
    }
  });
};

module.exports.consumeVerification = consumeVerification;
module.exports.normalizeEmail = normalizeEmail;
