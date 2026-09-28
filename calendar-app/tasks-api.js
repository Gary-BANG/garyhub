"use strict";

const { randomUUID } = require("crypto");
const { get, all, run } = require("./db");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function validDate(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateCategory(body) {
  const name = String(body.name || "").trim();
  const color = String(body.color || "").trim().toLowerCase();
  if (!name || name.length > 40 || !COLOR_RE.test(color)) {
    throw new Error("分类名称需为 1–40 字，颜色需为 #RRGGBB");
  }
  return { name, nameNormalized: name.toLocaleLowerCase("und"), color };
}

function validateTask(body) {
  const title = String(body.title || "").trim();
  const startDate = body.start_date;
  const endDate = body.end_date;
  const note = String(body.note || "").trim();
  const categoryId = body.category_id || null;
  const done = body.status === "done";
  const reminderEnabled = body.reminder_enabled === true;
  if (!title || title.length > 160 || note.length > 4000 ||
      !validDate(startDate) || !validDate(endDate) || endDate < startDate) {
    throw new Error("请填写标题及有效的开始、结束日期（结束日期不可早于开始日期）");
  }
  if (body.status !== undefined && !["todo", "doing", "done"].includes(body.status)) {
    throw new Error("事项状态非法");
  }
  if (categoryId !== null && (typeof categoryId !== "string" || categoryId.length > 80)) {
    throw new Error("分类非法");
  }
  let reminder = null;
  if (reminderEnabled) {
    const frequency = Number(body.reminder?.frequency);
    const time1 = body.reminder?.time_1;
    const time2 = body.reminder?.time_2 || null;
    if (![1, 2].includes(frequency) || !TIME_RE.test(time1 || "") ||
        (frequency === 2 && (!TIME_RE.test(time2 || "") || time1 === time2)) ||
        (frequency === 1 && time2 !== null)) {
      throw new Error("请选择每天一次或两次，以及不同的有效提醒时间");
    }
    reminder = { frequency, time1, time2 };
  }
  return { title, startDate, endDate, note, categoryId, done, reminderEnabled, reminder };
}

async function taskWithDetails(id, userId) {
  return get(`
    SELECT t.*, c.name AS category_name, c.color AS category_color,
           r.frequency AS reminder_frequency, r.time_1 AS reminder_time_1,
           r.time_2 AS reminder_time_2
    FROM tasks t
    LEFT JOIN categories c ON c.id = t.category_id AND c.user_id = t.user_id
    LEFT JOIN reminder_settings r ON r.task_id = t.id
    WHERE t.id = ? AND t.user_id = ?`, [id, userId]);
}

module.exports = function registerTasksApi(app, { requireLogin, resolveTargetUserId }) {
  function route(handler) {
    return async (req, res) => {
      try { await handler(req, res); }
      catch (error) {
        if (error.code === "SQLITE_CONSTRAINT" ||
            (error.code === "ERR_SQLITE_ERROR" && /constraint failed/i.test(error.message))) {
          return res.status(409).json({ message: "名称重复或与现有数据冲突" });
        }
        if (error.clientError) return res.status(400).json({ message: error.message });
        console.error("统一事项接口失败:", error);
        res.status(500).json({ message: "服务器错误" });
      }
    };
  }
  function bad(message) {
    const error = new Error(message);
    error.clientError = true;
    throw error;
  }
  async function target(req) {
    try { return await resolveTargetUserId(req); }
    catch (error) { return bad(error.message); }
  }
  async function ownedCategory(id, userId) {
    if (!id) return;
    const row = await get("SELECT id FROM categories WHERE id = ? AND user_id = ?", [id, userId]);
    if (!row) bad("所选分类不存在");
  }

  app.get("/api/categories", requireLogin, route(async (req, res) => {
    const userId = await target(req);
    res.json(await all("SELECT * FROM categories WHERE user_id = ? ORDER BY created_at, id", [userId]));
  }));

  app.post("/api/categories", requireLogin, route(async (req, res) => {
    const userId = await target(req);
    let item;
    try { item = validateCategory(req.body); } catch (e) { return bad(e.message); }
    const id = randomUUID();
    await run("INSERT INTO categories(id,user_id,name,name_normalized,color) VALUES(?,?,?,?,?)",
      [id, userId, item.name, item.nameNormalized, item.color]);
    res.status(201).json(await get("SELECT * FROM categories WHERE id = ?", [id]));
  }));

  app.put("/api/categories/:id", requireLogin, route(async (req, res) => {
    const userId = await target(req);
    let item;
    try { item = validateCategory(req.body); } catch (e) { return bad(e.message); }
    const result = await run(`UPDATE categories SET name=?,name_normalized=?,color=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND user_id=?`, [item.name, item.nameNormalized, item.color, req.params.id, userId]);
    if (!result.changes) return res.status(404).json({ message: "分类不存在" });
    res.json(await get("SELECT * FROM categories WHERE id = ? AND user_id = ?", [req.params.id, userId]));
  }));

  app.delete("/api/categories/:id", requireLogin, route(async (req, res) => {
    const userId = await target(req);
    const result = await run("DELETE FROM categories WHERE id=? AND user_id=?", [req.params.id, userId]);
    if (!result.changes) return res.status(404).json({ message: "分类不存在" });
    res.json({ message: "分类已删除，关联事项保留为未分类" });
  }));

  app.get("/api/tasks", requireLogin, route(async (req, res) => {
    const userId = await target(req);
    res.json(await all(`SELECT t.*, c.name AS category_name, c.color AS category_color,
      r.frequency AS reminder_frequency, r.time_1 AS reminder_time_1,
      r.time_2 AS reminder_time_2
      FROM tasks t LEFT JOIN categories c ON c.id=t.category_id AND c.user_id=t.user_id
      LEFT JOIN reminder_settings r ON r.task_id=t.id
      WHERE t.user_id=? ORDER BY t.start_date, t.created_at, t.id`, [userId]));
  }));

  async function saveTask(req, res, updating) {
    const userId = await target(req);
    let item;
    try { item = validateTask(req.body); } catch (e) { return bad(e.message); }
    const id = updating ? req.params.id : randomUUID();
    const existing = updating ? await taskWithDetails(id, userId) : null;
    if (updating && !existing) return res.status(404).json({ message: "事项不存在" });
    await ownedCategory(item.categoryId, userId);
    if (updating) {
      await run(`UPDATE tasks SET title=?,start_date=?,end_date=?,category_id=?,
        status=?,completed_at=?,reminder_enabled=?,note=?,updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND user_id=?`, [item.title,item.startDate,item.endDate,item.categoryId,
        item.done ? "done" : "todo",item.done ? (existing.completed_at || new Date().toISOString()) : null,
        Number(item.reminderEnabled),item.note,id,userId]);
    } else {
      await run(`INSERT INTO tasks(id,user_id,title,start_date,end_date,category_id,status,completed_at,
        reminder_enabled,note) VALUES(?,?,?,?,?,?,?,?,?,?)`, [id,userId,item.title,item.startDate,
        item.endDate,item.categoryId,item.done ? "done" : "todo",
        item.done ? new Date().toISOString() : null,Number(item.reminderEnabled),item.note]);
    }
    if (item.reminder) {
      await run(`INSERT INTO reminder_settings(task_id,frequency,time_1,time_2) VALUES(?,?,?,?)
        ON CONFLICT(task_id) DO UPDATE SET frequency=excluded.frequency,time_1=excluded.time_1,
        time_2=excluded.time_2,updated_at=CURRENT_TIMESTAMP`,
        [id,item.reminder.frequency,item.reminder.time1,item.reminder.time2]);
    } else {
      await run("DELETE FROM reminder_settings WHERE task_id=?", [id]);
    }
    res.status(updating ? 200 : 201).json(await taskWithDetails(id, userId));
  }
  app.post("/api/tasks", requireLogin, route((req,res) => saveTask(req,res,false)));
  app.put("/api/tasks/:id", requireLogin, route((req,res) => saveTask(req,res,true)));
  app.delete("/api/tasks/:id", requireLogin, route(async (req,res) => {
    const userId = await target(req);
    const result = await run("DELETE FROM tasks WHERE id=? AND user_id=?", [req.params.id,userId]);
    if (!result.changes) return res.status(404).json({ message: "事项不存在" });
    res.json({ message: "删除成功" });
  }));
  app.get("/api/notifications", requireLogin, route(async (req,res) => {
    const userId = req.session.user.id;
    res.json(await all(`SELECT id,type,title,body,action_url,read_at,created_at FROM notifications
      WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 100`, [userId]));
  }));
  app.post("/api/notifications/:id/read", requireLogin, route(async (req,res) => {
    const result = await run(`UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP)
      WHERE id=? AND user_id=?`, [req.params.id,req.session.user.id]);
    if (!result.changes) return res.status(404).json({ message: "通知不存在" });
    res.json({ message: "已读" });
  }));
};

module.exports.validDate = validDate;
module.exports.validateTask = validateTask;
