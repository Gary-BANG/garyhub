const express = require("express");
const session = require("express-session");
const path = require("path");
const crypto = require("crypto");

const { dataDir, initDb, get, all, run } = require("./db");
const { hashPassword, verifyPassword } = require("./auth-utils");
const { createSqliteSessionStore } = require("./session-store");
const registerTasksApi = require("./tasks-api");
const registerEmailApi = require("./email-api");
const registerPersonalApi = require("./personal-api");
const { migratePersonalRecords } = require("./migrations/personal-records");
const { consumeVerification, normalizeEmail } = require("./email-api");
const { rateLimit } = require("./rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

app.set("trust proxy", 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionStore = createSqliteSessionStore(session, {
  filename: path.join(dataDir, "sessions.sqlite")
});

app.use(
  session({
    store: sessionStore,
    name: "garyhub.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  })
);

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.get("/api/csrf", (req, res) => {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  res.set("Cache-Control", "no-store").json({ token: req.session.csrfToken });
});

app.use("/api", (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const supplied = req.get("x-csrf-token") || "";
  const expected = req.session.csrfToken || "";
  if (!/^[0-9a-f]{64}$/.test(supplied) || !expected ||
      !crypto.timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"))) {
    return res.status(403).json({ message: "页面校验已失效，请刷新后重试" });
  }
  next();
});

app.use(express.static(PUBLIC_DIR));

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ message: "未登录" });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ message: "未登录" });
  }
  if (req.session.user.role !== "admin") {
    return res.status(403).json({ message: "需要管理员权限" });
  }
  next();
}

async function findUserById(id) {
  return await get(
    "SELECT id, username, role, enabled, created_at FROM users WHERE id = ?",
    [id]
  );
}

async function findUserByUsername(username) {
  return await get(
    "SELECT id, username, password_hash, role, enabled, created_at FROM users WHERE username = ?",
    [username]
  );
}

async function resolveTargetUserId(req) {
  if (req.session.user.role !== "admin") {
    return req.session.user.id;
  }

  const raw =
    req.query.userId ??
    req.body.userId ??
    req.params.userId ??
    req.session.user.id;

  const targetUserId = Number(raw);

  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    throw new Error("userId 非法");
  }

  const targetUser = await findUserById(targetUserId);
  if (!targetUser) {
    throw new Error("目标用户不存在");
  }

  return targetUserId;
}

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// 登录
app.post("/api/login", rateLimit(12, 15 * 60_000), async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    if (!username || !password) {
      return res.status(400).json({ message: "用户名和密码不能为空" });
    }

    const user = await findUserByUsername(username);
    if (!user) {
      return res.status(401).json({ message: "用户名或密码错误" });
    }

    if (user.enabled !== 1) {
      return res.status(403).json({ message: "该账号已被禁用" });
    }

    const ok = verifyPassword(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "用户名或密码错误" });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role
    };

    res.json({
      message: "登录成功",
      user: req.session.user
    });
  } catch (err) {
    console.error("登录失败:", err);
    res.status(500).json({ message: "服务器错误" });
  }
});

// 申请注册
app.post("/api/register-request", rateLimit(5, 60 * 60_000), async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");
    const note = String(req.body.note || "").trim();
    const requireEmail = process.env.REQUIRE_VERIFIED_EMAIL === "true";

    if (!username || !password) {
      return res.status(400).json({ message: "用户名和密码不能为空" });
    }

    if (username.length < 3 || username.length > 32) {
      return res.status(400).json({ message: "用户名长度需在 3 到 32 之间" });
    }

    const usernameOk = /^[a-zA-Z0-9_\-.]+$/.test(username);
    if (!usernameOk) {
      return res.status(400).json({ message: "用户名只能包含字母、数字、下划线、短横线、点" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "密码至少 6 位" });
    }

    const existingUser = await findUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({ message: "该用户名已存在" });
    }

    const existingPending = await get(
      "SELECT id FROM register_requests WHERE username = ? AND status = 'pending'",
      [username]
    );
    if (existingPending) {
      return res.status(409).json({ message: "该用户名已有待审核申请，请勿重复提交" });
    }

    const passwordHash = hashPassword(password);

    let verified = null;
    if (requireEmail) {
      try {
        const { email } = normalizeEmail(req.body.email);
        verified = await consumeVerification({
          id: req.body.verification_id, token: req.body.verification_token,
          email, purpose: "registration"
        });
      } catch (error) {
        return res.status(400).json({ message: error.message });
      }
    }

    await run(
      `
      INSERT INTO register_requests (username, password_hash, note, status,
        email,email_normalized,email_verified_at)
      VALUES (?, ?, ?, 'pending', ?, ?, ?)
      `,
      [username, passwordHash, note, verified?.email || null,
        verified?.email_normalized || null, verified?.verified_at || null]
    );

    res.status(201).json({
      message: "申请已提交，请等待管理员审核"
    });
  } catch (err) {
    console.error("提交注册申请失败:", err);
    res.status(500).json({ message: "服务器错误" });
  }
});

app.post("/api/logout", requireLogin, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("退出失败:", err);
      return res.status(500).json({ message: "退出失败" });
    }
    res.clearCookie("garyhub.sid");
    res.json({ message: "已退出登录" });
  });
});

app.get("/api/me", requireLogin, (req, res) => {
  res.json({
    user: req.session.user
  });
});

// 管理员：用户列表
app.get("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const users = await all(
      "SELECT id, username, role, enabled, created_at FROM users ORDER BY id ASC"
    );
    res.json(users);
  } catch (err) {
    console.error("获取用户列表失败:", err);
    res.status(500).json({ message: "服务器错误" });
  }
});

// 管理员：创建用户
app.post("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");
    const role = req.body.role === "admin" ? "admin" : "user";

    if (!username || !password) {
      return res.status(400).json({ message: "用户名和密码不能为空" });
    }

    const existing = await findUserByUsername(username);
    if (existing) {
      return res.status(409).json({ message: "用户名已存在" });
    }

    const passwordHash = hashPassword(password);

    const result = await run(
      "INSERT INTO users (username, password_hash, role, enabled) VALUES (?, ?, ?, 1)",
      [username, passwordHash, role]
    );

    const newUser = await findUserById(result.lastID);

    res.status(201).json({
      message: "用户创建成功",
      user: newUser
    });
  } catch (err) {
    console.error("创建用户失败:", err);
    res.status(500).json({ message: "服务器错误" });
  }
});

// 管理员：待审核注册申请列表
app.get("/api/admin/register-requests", requireAdmin, async (req, res) => {
  try {
    const rows = await all(
      `
      SELECT
        id,
        username,
        note,
        status,
        reviewed_by,
        reviewed_at,
        created_at
      FROM register_requests
      WHERE status = 'pending'
      ORDER BY id ASC
      `
    );
    res.json(rows);
  } catch (err) {
    console.error("获取注册申请失败:", err);
    res.status(500).json({ message: "服务器错误" });
  }
});

// 管理员：批准注册申请
app.post("/api/admin/register-requests/:id/approve", requireAdmin, async (req, res) => {
  try {
    const requestId = Number(req.params.id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({ message: "申请ID非法" });
    }

    const requestRow = await get(
      "SELECT * FROM register_requests WHERE id = ?",
      [requestId]
    );

    if (!requestRow) {
      return res.status(404).json({ message: "申请不存在" });
    }

    if (requestRow.status !== "pending") {
      return res.status(400).json({ message: "该申请已处理" });
    }

    const existingUser = await findUserByUsername(requestRow.username);
    if (existingUser) {
      await run(
        `
        UPDATE register_requests
        SET status = 'rejected',
            reviewed_by = ?,
            reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [req.session.user.id, requestId]
      );

      return res.status(409).json({ message: "批准失败：该用户名已被占用，申请已自动标记为拒绝" });
    }

    const result = await run(
      `
      INSERT INTO users (username, password_hash, role, enabled,
        email,email_normalized,email_verified_at,timezone)
      VALUES (?, ?, 'user', 1, ?, ?, ?, ?)
      `,
      [requestRow.username, requestRow.password_hash, requestRow.email,
        requestRow.email_normalized, requestRow.email_verified_at,
        requestRow.timezone || "Etc/UTC"]
    );

    await run(
      `
      UPDATE register_requests
      SET status = 'approved',
          reviewed_by = ?,
          reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [req.session.user.id, requestId]
    );

    const newUser = await findUserById(result.lastID);

    res.json({
      message: "已批准并创建用户",
      user: newUser
    });
  } catch (err) {
    console.error("批准注册申请失败:", err);
    res.status(500).json({ message: "服务器错误" });
  }
});

// 管理员：拒绝注册申请
app.post("/api/admin/register-requests/:id/reject", requireAdmin, async (req, res) => {
  try {
    const requestId = Number(req.params.id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({ message: "申请ID非法" });
    }

    const requestRow = await get(
      "SELECT * FROM register_requests WHERE id = ?",
      [requestId]
    );

    if (!requestRow) {
      return res.status(404).json({ message: "申请不存在" });
    }

    if (requestRow.status !== "pending") {
      return res.status(400).json({ message: "该申请已处理" });
    }

    await run(
      `
      UPDATE register_requests
      SET status = 'rejected',
          reviewed_by = ?,
          reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [req.session.user.id, requestId]
    );

    res.json({
      message: "已拒绝该申请"
    });
  } catch (err) {
    console.error("拒绝注册申请失败:", err);
    res.status(500).json({ message: "服务器错误" });
  }
});

app.put("/api/admin/users/:id/status", requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const enabled = req.body.enabled === 1 || req.body.enabled === true ? 1 : 0;

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "用户ID非法" });
    }

    const target = await findUserById(userId);
    if (!target) {
      return res.status(404).json({ message: "用户不存在" });
    }

    await run("UPDATE users SET enabled = ? WHERE id = ?", [enabled, userId]);

    const updated = await findUserById(userId);
    res.json({
      message: enabled ? "用户已启用" : "用户已禁用",
      user: updated
    });
  } catch (err) {
    console.error("修改用户状态失败:", err);
    res.status(500).json({ message: "服务器错误" });
  }
});

// 事件接口
app.get("/api/events", requireLogin, async (req, res) => {
  try {
    const userId = await resolveTargetUserId(req);

    const events = await all(
      `
      SELECT
        id,
        user_id,
        title,
        start_date AS start,
        notes
      FROM events
      WHERE user_id = ?
      ORDER BY start_date ASC, id ASC
      `,
      [userId]
    );

    const fullcalendarEvents = events.map(item => ({
      id: String(item.id),
      title: item.title,
      start: item.start,
      allDay: true,
      notes: item.notes,
      userId: item.user_id
    }));

    res.json(fullcalendarEvents);
  } catch (err) {
    console.error("获取事项失败:", err);
    res.status(400).json({ message: err.message || "获取事项失败" });
  }
});

app.post("/api/events", requireLogin, async (req, res) => {
  try {
    const userId = await resolveTargetUserId(req);
    const title = String(req.body.title || "").trim();
    const start = String(req.body.start || "").trim();
    const notes = String(req.body.notes || "").trim();

    if (!title || !start) {
      return res.status(400).json({ message: "title 和 start 不能为空" });
    }

    const result = await run(
      `
      INSERT INTO events (user_id, title, start_date, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      [userId, title, start, notes]
    );

    const created = await get(
      `
      SELECT
        id,
        user_id,
        title,
        start_date AS start,
        notes
      FROM events
      WHERE id = ?
      `,
      [result.lastID]
    );

    res.status(201).json({
      id: String(created.id),
      title: created.title,
      start: created.start,
      allDay: true,
      notes: created.notes,
      userId: created.user_id
    });
  } catch (err) {
    console.error("创建事项失败:", err);
    res.status(400).json({ message: err.message || "创建事项失败" });
  }
});

app.put("/api/events/:id", requireLogin, async (req, res) => {
  try {
    const eventId = Number(req.params.id);
    const title = String(req.body.title || "").trim();
    const start = String(req.body.start || "").trim();
    const notes = String(req.body.notes || "").trim();

    if (!Number.isInteger(eventId) || eventId <= 0) {
      return res.status(400).json({ message: "事项ID非法" });
    }

    if (!title || !start) {
      return res.status(400).json({ message: "title 和 start 不能为空" });
    }

    const existing = await get(
      "SELECT id, user_id FROM events WHERE id = ?",
      [eventId]
    );

    if (!existing) {
      return res.status(404).json({ message: "事项不存在" });
    }

    if (
      req.session.user.role !== "admin" &&
      existing.user_id !== req.session.user.id
    ) {
      return res.status(403).json({ message: "无权修改该事项" });
    }

    await run(
      `
      UPDATE events
      SET title = ?, start_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [title, start, notes, eventId]
    );

    const updated = await get(
      `
      SELECT
        id,
        user_id,
        title,
        start_date AS start,
        notes
      FROM events
      WHERE id = ?
      `,
      [eventId]
    );

    res.json({
      id: String(updated.id),
      title: updated.title,
      start: updated.start,
      allDay: true,
      notes: updated.notes,
      userId: updated.user_id
    });
  } catch (err) {
    console.error("修改事项失败:", err);
    res.status(500).json({ message: "服务器错误" });
  }
});

app.delete("/api/events/:id", requireLogin, async (req, res) => {
  try {
    const eventId = Number(req.params.id);

    if (!Number.isInteger(eventId) || eventId <= 0) {
      return res.status(400).json({ message: "事项ID非法" });
    }

    const existing = await get(
      "SELECT id, user_id, title FROM events WHERE id = ?",
      [eventId]
    );

    if (!existing) {
      return res.status(404).json({ message: "事项不存在" });
    }

    if (
      req.session.user.role !== "admin" &&
      existing.user_id !== req.session.user.id
    ) {
      return res.status(403).json({ message: "无权删除该事项" });
    }

    await run("DELETE FROM events WHERE id = ?", [eventId]);

    res.json({
      message: "删除成功",
      deleted: {
        id: existing.id,
        title: existing.title,
        userId: existing.user_id
      }
    });
  } catch (err) {
    console.error("删除事项失败:", err);
    res.status(500).json({ message: "服务器错误" });
  }
});

registerTasksApi(app, { requireLogin, resolveTargetUserId });
registerEmailApi(app, { requireLogin });
registerPersonalApi(app, { requireLogin });

initDb()
  .then(() => migratePersonalRecords(require("./db")))
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Calendar app listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("数据库初始化失败:", err);
    process.exit(1);
  });
