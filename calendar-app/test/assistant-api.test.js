"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const { createSqliteAdapter } = require("./helpers/sqlite-adapter");
const { migrateUnifiedCalendar } = require("../migrations/unified-schema");

const KEY = "synthetic-model-key-7731";
const call = (name, args) => ({ role: "assistant", content: null,
  tool_calls: [{ id: "call_" + name, type: "function", function: { name, arguments: JSON.stringify(args) } }] });
const lastTool = body => JSON.parse(body.messages.filter(m => m.role === "tool").at(-1).content);

test("assistant proposes changes, applies them only after confirmation and never returns the key", async () => {
  const database = createSqliteAdapter();
  await database.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,password_hash TEXT,role TEXT,enabled INTEGER,created_at TEXT);
    CREATE TABLE register_requests(id INTEGER PRIMARY KEY);
    CREATE TABLE events(id INTEGER PRIMARY KEY,user_id INTEGER);
    CREATE TABLE admin_operations(id TEXT PRIMARY KEY,actor_id INTEGER NOT NULL,target_id INTEGER NOT NULL,action TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO users VALUES(1,'admin','hash','admin',1,'2026-01-01'),(2,'alice','hash','user',1,'2026-01-01'),(3,'bob','hash','user',1,'2026-01-01');
  `);
  await migrateUnifiedCalendar(database);
  await database.run("UPDATE users SET timezone='Asia/Shanghai' WHERE id=2");
  await database.run("INSERT INTO categories(id,user_id,name,name_normalized,color) VALUES('cat-a',2,'Health','health','#2266aa')");
  const dbFile = require.resolve("../db");
  require.cache[dbFile] = { id: dbFile, filename: dbFile, loaded: true, exports: database };
  for (const name of ["../tasks-api", "../assistant-api"]) delete require.cache[require.resolve(name)];
  const { migrateAssistant, registerAssistant } = require("../assistant-api");
  await migrateAssistant(database);

  // A scripted stand-in for the chat-completions endpoint records every request it receives.
  const seen = [], script = [];
  const model = http.createServer((req, res) => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; });
    req.on("end", () => {
      const body = JSON.parse(raw);
      seen.push({ auth: req.headers.authorization, body });
      let reply = script.shift();
      if (typeof reply === "function") reply = reply(body);
      res.writeHead(reply.status || 200, { "content-type": "application/json" });
      res.end(JSON.stringify(reply.status ? { error: { code: "1", message: "upstream detail" } } : { choices: [{ message: reply }] }));
    });
  });
  model.listen(0, "127.0.0.1");
  await new Promise(resolve => model.once("listening", resolve));
  process.env.GARYHUB_ASSISTANT_ENDPOINT = `http://127.0.0.1:${model.address().port}/v4/chat/completions`;

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const id = Number(req.get("x-test-user") || 0);
    req.session = { user: id ? { id, role: id === 1 ? "admin" : "user", accountTier: "standard" } : null };
    next();
  });
  registerAssistant(app, {
    requireLogin: (req, res, next) => req.session.user ? next() : res.status(401).json({ message: "未登录" }),
    requireAdmin: (req, res, next) => req.session.user?.role === "admin" ? next() : res.status(403).json({ message: "需要管理员权限" })
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const bodies = [];
  async function api(path, method = "GET", body, user = 2) {
    const response = await fetch(url + path, { method, headers: { "content-type": "application/json", "x-test-user": String(user) },
      body: body ? JSON.stringify(body) : undefined });
    const text = await response.text();
    bodies.push(text);
    return { status: response.status, body: JSON.parse(text) };
  }
  const taskCount = async () => (await database.get("SELECT COUNT(*) AS n FROM tasks WHERE user_id=2")).n;
  const chat = message => api("/api/assistant/chat", "POST", { message, lang: "zh", character: "lili", history: [{ role: "assistant", text: "你好" }, { role: "user", text: "在吗" }, { role: "assistant", text: "在的" }] });

  try {
    assert.equal((await api("/api/assistant/status", "GET", null, 0)).status, 401);
    assert.equal((await api("/api/assistant/status")).body.enabled, false);
    assert.equal((await chat("明天下午三点看牙")).status, 503);
    assert.equal((await api("/api/assistant/admin/settings", "PUT", { enabled: true, provider: "bigmodel", model: "glm-4.7-flash", dailyLimit: 40 }, 1)).status, 400);
    assert.equal((await api("/api/assistant/admin/settings", "PUT", { enabled: true, provider: "bigmodel", model: "glm-4.7-flash", dailyLimit: 40, apiKey: KEY }, 2)).status, 403);
    const saved = await api("/api/assistant/admin/settings", "PUT", { enabled: true, provider: "bigmodel", model: "glm-4.7-flash", dailyLimit: 40, apiKey: KEY }, 1);
    assert.equal(saved.status, 200);
    assert.equal(saved.body.keyHint, "••••7731");
    assert.equal((await api("/api/assistant/status")).body.enabled, true);

    // Adding: the model only prepares a card; nothing is written until the owner confirms.
    script.push(call("add_task", { title: "看牙", start_date: "2026-11-04", time: "3:00", category: "health" }), { content: "帮你准备好了，请确认。" });
    const added = await chat("明天下午三点看牙");
    assert.equal(added.status, 200);
    assert.equal(added.body.reply, "帮你准备好了，请确认。");
    assert.equal(added.body.actions.length, 1);
    assert.deepEqual(added.body.actions[0].summary, { title: "03:00 看牙", start_date: "2026-11-04", end_date: "2026-11-04", category: "Health", reminder_time: null, note: null });
    assert.equal(await taskCount(), 0);
    const first = seen[0];
    assert.equal(first.auth, "Bearer " + KEY);
    assert.deepEqual(first.body.thinking, { type: "disabled" });
    assert.equal(first.body.model, "glm-4.7-flash");
    assert.deepEqual(first.body.tools.map(tool => tool.function.name), ["list_tasks", "add_task", "delete_task", "open_page"]);
    assert.ok(!first.body.tools[3].function.parameters.properties.page.enum.includes("status"), "admin pages are not offered to members");
    assert.match(first.body.messages[0].content, /Asia\/Shanghai/);
    assert.match(first.body.messages[0].content, /“栗栗”/);
    assert.deepEqual(first.body.messages.slice(1).map(m => m.role), ["user", "assistant", "user"]);
    assert.equal(lastTool(seen[1].body).status, "waiting_for_user_confirmation");
    const action = added.body.actions[0].id;
    assert.equal((await api(`/api/assistant/actions/${action}/confirm`, "POST", {}, 3)).status, 404);
    const confirmed = await api(`/api/assistant/actions/${action}/confirm`, "POST", {});
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.task.title, "03:00 看牙");
    assert.equal((await database.get("SELECT category_id FROM tasks WHERE user_id=2")).category_id, "cat-a");
    assert.equal((await api(`/api/assistant/actions/${action}/confirm`, "POST", {})).status, 409);
    assert.equal(await taskCount(), 1);

    // Deleting needs the id from list_tasks; cancelling leaves the task alone.
    const remove = () => script.push(call("list_tasks", { from: "2026-11-01", to: "2026-11-30", keyword: "看牙" }),
      body => call("delete_task", { task_id: lastTool(body).tasks[0].task_id }), { content: "找到了，请确认删除。" });
    remove();
    const proposal = await chat("把看牙删掉");
    assert.equal(proposal.body.actions[0].kind, "delete_task");
    assert.equal(proposal.body.actions[0].summary.title, "03:00 看牙");
    assert.equal((await api(`/api/assistant/actions/${proposal.body.actions[0].id}/cancel`, "POST", {})).status, 200);
    assert.equal((await api(`/api/assistant/actions/${proposal.body.actions[0].id}/confirm`, "POST", {})).status, 409);
    assert.equal(await taskCount(), 1);
    remove();
    const again = await chat("还是删掉吧");
    assert.equal((await api(`/api/assistant/actions/${again.body.actions[0].id}/confirm`, "POST", {})).status, 200);
    assert.equal(await taskCount(), 0);

    // Tool mistakes go back to the model as errors instead of failing the request.
    script.push(call("add_task", { title: "考试", start_date: "2026-12-01", category: "Nope" }),
      body => call("list_tasks", { from: "2026-01-01", to: "2026-12-31", unexpected: lastTool(body).error }), { content: "没有这个分类。" });
    const wrong = await chat("12 月 1 日考试，放到 Nope 分类");
    assert.equal(wrong.status, 200);
    assert.equal(wrong.body.actions.length, 0);
    assert.match(lastTool(seen.at(-2).body).error, /no category named "Nope"; existing categories: Health/);
    assert.match(lastTool(seen.at(-1).body).error, /at most 92 days/);

    script.push(call("open_page", { page: "ledger" }), { content: "记账在这里。" });
    assert.deepEqual((await chat("我想记账")).body.pages, ["ledger"]);

    script.push({ status: 401 });
    const rejected = await chat("今天有什么安排");
    assert.equal(rejected.status, 502);
    assert.doesNotMatch(rejected.body.message, /upstream detail/);

    await api("/api/assistant/admin/settings", "PUT", { enabled: true, provider: "zai", model: "glm-4.7-flash", dailyLimit: 1 }, 1);
    assert.equal((await chat("今天有什么安排")).status, 429);
    const view = await api("/api/assistant/admin/settings", "GET", null, 1);
    assert.equal(view.body.keySet, true);
    assert.equal(view.body.provider, "zai");
    assert.ok(bodies.every(text => !text.includes(KEY)), "the API key never leaves the server");
    assert.equal((await database.get("SELECT COUNT(*) AS n FROM admin_operations WHERE action='assistant-settings'")).n, 2);
  } finally {
    server.close();
    model.close();
    delete process.env.GARYHUB_ASSISTANT_ENDPOINT;
    delete require.cache[dbFile];
    database.close();
  }
});

test("the assistant clock follows the account time zone", () => {
  const { clock } = require("../assistant-api");
  const now = new Date("2026-11-03T20:30:00Z");
  assert.deepEqual(clock("Asia/Shanghai", now), { date: "2026-11-04", weekday: "Wednesday", time: "04:30", zone: "Asia/Shanghai" });
  assert.equal(clock("Not/AZone", now).zone, "Etc/UTC");
});
