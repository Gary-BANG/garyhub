"use strict";

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function invalid(message) {
  const error = new Error(message);
  error.clientError = true;
  throw error;
}

function field(value, max, label) {
  if (typeof value !== "string" || value.trim().length > max) invalid(`${label}长度不能超过 ${max} 字`);
  return value.trim();
}

function dateField(value) {
  if (!validDate(value)) invalid("日期必须是有效的 YYYY-MM-DD");
  return value;
}

function weightToGrams(value, unit) {
  if (unit !== "kg" && unit !== "lb") invalid("单位只能是 kg 或 lb");
  if (typeof value !== "string" && typeof value !== "number") invalid("体重格式无效");
  const input = String(value);
  if (!/^(?:\d{1,4})(?:\.\d{1,3})?$/.test(input)) invalid("体重最多保留三位小数");
  const grams = Math.round(Number(input) * (unit === "kg" ? 1000 : 453.59237));
  if (grams < 1000 || grams > 1000000) invalid("体重须在 1–1000 kg 范围内");
  return grams;
}

function validate(kind, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) invalid("记录格式无效");
  const entry_date = dateField(body.entry_date);
  if (kind === "diary") {
    const title = field(body.title ?? "", 160, "标题");
    const text = field(body.body ?? "", 20000, "正文");
    if (!title && !text) invalid("标题或正文至少填写一项");
    const mood = body.mood ?? "";
    if (!["", "happy", "calm", "excited", "grateful", "tired", "sad", "anxious", "angry"].includes(mood)) invalid("请选择有效的心情");
    return { entry_date, title, body: text, mood };
  }
  const note = field(body.note ?? "", 1000, "备注");
  if (kind === "weight") {
    const grams = body.weight_g !== undefined ? body.weight_g : weightToGrams(body.weight, body.unit);
    if (!Number.isInteger(grams) || grams < 1000 || grams > 1000000) invalid("体重克数无效");
    return { entry_date, weight_g: grams, note };
  }
  const activity_type = field(body.activity_type, 80, "运动类型");
  if (!activity_type) invalid("请填写运动类型");
  if (!Number.isInteger(body.duration_minutes) || body.duration_minutes < 1 || body.duration_minutes > 1440) {
    invalid("时长须为 1–1440 的整数分钟");
  }
  return { entry_date, activity_type, duration_minutes: body.duration_minutes, note };
}

const kinds = {
  diary: { table: "diary_entries", columns: ["entry_date", "title", "body", "mood"] },
  weight: { table: "weight_entries", columns: ["entry_date", "weight_g", "note"] },
  exercise: { table: "exercise_entries", columns: ["entry_date", "activity_type", "duration_minutes", "note"] }
};

module.exports = function registerPersonalApi(app, { requireLogin, db = require("./db") }) {
  const route = handler => async (req, res) => {
    try {
      const expected = req.get ? req.get("X-GaryHub-User") : undefined;
      if (expected !== undefined && expected !== String(req.session.user.id)) return res.status(409).json({ message: "账号已变化，请刷新页面后继续。" });
      await handler(req, res);
    }
    catch (error) {
      if (error.clientError) return res.status(400).json({ message: error.message });
      if (/SQLITE_CONSTRAINT/.test(error.code || "") || /UNIQUE constraint failed/.test(error.message || "")) {
        return res.status(409).json({ message: "该日期已有日记，请编辑已有记录" });
      }
      console.error("私人记录接口失败:", error.code || error.name);
      res.status(500).json({ message: "服务器错误" });
    }
  };

  for (const [kind, { table, columns }] of Object.entries(kinds)) {
    const base = `/api/personal/${kind}`;
    // All reads and writes use the session identity. Supplied userId is ignored.
    app.get(base, requireLogin, route(async (req, res) => {
      const userId = req.session.user.id;
      const query = req.query.q;
      if (query !== undefined && (kind !== "diary" || typeof query !== "string" || query.length > 100)) invalid("搜索词无效");
      let where = "user_id = ?";
      const params = [userId];
      if (kind === "diary" && query?.trim()) {
        where += " AND (instr(lower(title), lower(?)) > 0 OR instr(lower(body), lower(?)) > 0)";
        params.push(query.trim(), query.trim());
      }
      if (kind === "diary") {
        if (req.query.title !== undefined) {
          if (typeof req.query.title !== "string" || req.query.title.length > 100) invalid("标题搜索词无效");
          if (req.query.title.trim()) { where += " AND instr(lower(title), lower(?)) > 0"; params.push(req.query.title.trim()); }
        }
        if (req.query.date !== undefined) { where += " AND entry_date = ?"; params.push(dateField(req.query.date)); }
        if (req.query.page !== undefined) {
          const page = Number(req.query.page), size = Number(req.query.page_size ?? 10);
          if (typeof req.query.page !== "string" || !Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(size) || size < 1 || size > 100) invalid("分页参数无效");
          const total = (await db.get(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, params)).n;
          const items = await db.all(`SELECT id,entry_date,title,mood,updated_at FROM ${table} WHERE ${where} ORDER BY entry_date DESC,id DESC LIMIT ? OFFSET ?`, [...params,size,(page-1)*size]);
          return res.set("Cache-Control", "no-store").json({items,total,page,page_size:size});
        }
      }
      const rows = await db.all(`SELECT * FROM ${table} WHERE ${where} ORDER BY entry_date DESC,id DESC LIMIT 500`, params);
      res.set("Cache-Control", "no-store").json(rows);
    }));
    app.post(base, requireLogin, route(async (req, res) => {
      const item = validate(kind, req.body);
      const names = ["user_id", ...columns];
      const result = await db.run(`INSERT INTO ${table}(${names.join(",")}) VALUES(${names.map(() => "?").join(",")})`,
        [req.session.user.id, ...columns.map(name => item[name])]);
      res.status(201).set("Cache-Control", "no-store").json(await db.get(`SELECT * FROM ${table} WHERE id=? AND user_id=?`,
        [result.lastID ?? Number(result.lastInsertRowid), req.session.user.id]));
    }));
    app.put(`${base}/:id`, requireLogin, route(async (req, res) => {
      const item = validate(kind, req.body);
      // Older open pages do not send mood. Preserve the stored value in that case.
      const updateColumns = columns.filter(name => name !== "mood" || req.body.mood !== undefined);
      const result = await db.run(`UPDATE ${table} SET ${updateColumns.map(name => `${name}=?`).join(",")}, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`,
        [...updateColumns.map(name => item[name]), req.params.id, req.session.user.id]);
      if (!result.changes) return res.status(404).json({ message: "记录不存在" });
      res.set("Cache-Control", "no-store").json(await db.get(`SELECT * FROM ${table} WHERE id=? AND user_id=?`,
        [req.params.id, req.session.user.id]));
    }));
    app.delete(`${base}/:id`, requireLogin, route(async (req, res) => {
      const result = await db.run(`DELETE FROM ${table} WHERE id=? AND user_id=?`, [req.params.id, req.session.user.id]);
      if (!result.changes) return res.status(404).json({ message: "记录不存在" });
      res.json({ message: "删除成功" });
    }));
  }

  app.get("/api/personal/diary/dates", requireLogin, route(async (req,res) => {
    const {month,title=""} = req.query;
    if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !validDate(month+"-01")) invalid("月份无效");
    if (typeof title !== "string" || title.length > 100) invalid("标题搜索词无效");
    const rows = await db.all("SELECT entry_date FROM diary_entries WHERE user_id=? AND substr(entry_date,1,7)=? AND instr(lower(title),lower(?))>0 ORDER BY entry_date",[req.session.user.id,month,title.trim()]);
    res.set("Cache-Control","no-store").json(rows);
  }));
  app.get("/api/personal/diary/:id", requireLogin, route(async (req,res) => {
    if (!/^\d+$/.test(req.params.id)) invalid("记录编号无效");
    const row = await db.get("SELECT * FROM diary_entries WHERE id=? AND user_id=?",[req.params.id,req.session.user.id]);
    if (!row) return res.status(404).json({message:"记录不存在"});
    res.set("Cache-Control","no-store").json(row);
  }));

  app.get("/api/personal/exercise/summary", requireLogin, route(async (req, res) => {
    const { period, start } = req.query;
    if (!["week", "month"].includes(period) || !validDate(start)) invalid("汇总日期或周期无效");
    const date = new Date(`${start}T00:00:00Z`);
    if (period === "week" && date.getUTCDay() !== 1) invalid("周汇总从周一开始");
    if (period === "month" && date.getUTCDate() !== 1) invalid("月汇总从每月一日开始");
    if (period === "week") date.setUTCDate(date.getUTCDate() + 7);
    else date.setUTCMonth(date.getUTCMonth() + 1);
    const end = date.toISOString().slice(0, 10);
    const rows = await db.all(`SELECT activity_type, COUNT(*) AS count, SUM(duration_minutes) AS total_minutes
      FROM exercise_entries WHERE user_id=? AND entry_date>=? AND entry_date<?
      GROUP BY activity_type ORDER BY total_minutes DESC,activity_type`, [req.session.user.id, start, end]);
    res.set("Cache-Control", "no-store").json({ period, start, end_exclusive: end,
      count: rows.reduce((n, row) => n + row.count, 0),
      total_minutes: rows.reduce((n, row) => n + row.total_minutes, 0), by_type: rows });
  }));
};

module.exports.weightToGrams = weightToGrams;
module.exports.validate = validate;
