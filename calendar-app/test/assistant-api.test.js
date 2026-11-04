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
const quotas = (data = 30, search = 5, chat = 200) => ({ chat: { standard: chat, subscriber: 200, admin: 500 },
  data: { standard: data, subscriber: 50, admin: 200 }, search: { standard: search, subscriber: 30, admin: 100 } });
const settings = (extra = {}) => ({ enabled: true, provider: "bigmodel", model: "glm-4.7-flash", fallbackModel: "glm-4-flashx-250414",
  search: true, quotas: quotas(), ...extra });

test("assistant proposes changes, falls back, counts by kind and never returns the key", async () => {
  const database = createSqliteAdapter();
  await database.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,password_hash TEXT,role TEXT,enabled INTEGER,created_at TEXT,account_tier TEXT NOT NULL DEFAULT 'standard');
    CREATE TABLE register_requests(id INTEGER PRIMARY KEY);
    CREATE TABLE events(id INTEGER PRIMARY KEY,user_id INTEGER);
    CREATE TABLE admin_operations(id TEXT PRIMARY KEY,actor_id INTEGER NOT NULL,target_id INTEGER NOT NULL,action TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO users(id,username,password_hash,role,enabled,created_at) VALUES(1,'admin','hash','admin',1,'2026-01-01'),(2,'alice','hash','user',1,'2026-01-01'),(3,'bob','hash','user',1,'2026-01-01');
  `);
  await migrateUnifiedCalendar(database);
  await database.run("UPDATE users SET timezone='Asia/Shanghai' WHERE id=2");
  await database.run("UPDATE users SET account_tier='subscriber' WHERE id=3");
  await database.run("INSERT INTO categories(id,user_id,name,name_normalized,color) VALUES('cat-a',2,'Health','health','#2266aa')");
  const dbFile = require.resolve("../db");
  require.cache[dbFile] = { id: dbFile, filename: dbFile, loaded: true, exports: database };
  for (const name of ["../tasks-api", "../assistant-api"]) delete require.cache[require.resolve(name)];
  const { migrateAssistant, registerAssistant } = require("../assistant-api");
  await migrateAssistant(database);
  await migrateAssistant(database);

  // A scripted stand-in for the chat-completions and web-search endpoints records every request.
  const seen = [], script = [], searches = [], searchScript = [];
  const model = http.createServer((req, res) => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; });
    req.on("end", () => {
      const body = JSON.parse(raw);
      if (req.url.endsWith("/web_search")) {
        searches.push(body);
        const reply = searchScript.shift() || { results: [{ title: "Election update", link: "https://news.example/vote", media: "Example News", content: "Counting continues." }] };
        res.writeHead(reply.status || 200, { "content-type": "application/json" });
        return res.end(JSON.stringify(reply.status ? { error: { code: "1234", message: "search down" } } : { search_result: reply.results }));
      }
      seen.push({ auth: req.headers.authorization, body });
      let reply = script.shift();
      if (typeof reply === "function") reply = reply(body);
      res.writeHead(reply.status || 200, { "content-type": "application/json" });
      res.end(JSON.stringify(reply.status ? { error: { code: reply.code || "1", message: reply.message || `upstream detail ${KEY}` } }
        : { choices: [{ message: reply }], usage: { prompt_tokens: 100, completion_tokens: 10 } }));
    });
  });
  model.listen(0, "127.0.0.1");
  await new Promise(resolve => model.once("listening", resolve));
  const base = `http://127.0.0.1:${model.address().port}/v4`;
  process.env.GARYHUB_ASSISTANT_ENDPOINT = base + "/chat/completions";
  process.env.GARYHUB_ASSISTANT_SEARCH_ENDPOINT = base + "/web_search";

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
  const chat = (message, user = 2) => api("/api/assistant/chat", "POST", { message, lang: "zh", character: "lili", history: [{ role: "user", text: "ignored" }] }, user);
  const used = async kind => (await api("/api/assistant/status")).body.quota[kind].used;
  const save = (extra, user = 1) => api("/api/assistant/admin/settings", "PUT", settings(extra), user);

  try {
    assert.equal((await api("/api/assistant/status", "GET", null, 0)).status, 401);
    assert.equal((await api("/api/assistant/status")).body.enabled, false);
    const off = await chat("明天下午三点看牙");
    assert.equal(off.status, 503);
    assert.equal(off.body.code, "disabled");
    assert.equal((await save({})).status, 400, "enabling needs a key");
    assert.equal((await save({ apiKey: KEY }, 2)).status, 403);
    assert.equal((await save({ apiKey: KEY, quotas: { ...quotas(), chat: { standard: 0, subscriber: 1, admin: 1 } } })).status, 400, "chat needs at least one message");
    const saved = await save({ apiKey: KEY });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.keyHint, "••••7731");
    assert.equal(saved.body.fallbackModel, "glm-4-flashx-250414");
    const status = (await api("/api/assistant/status")).body;
    assert.equal(status.enabled, true);
    assert.equal(status.tier, "standard");
    assert.equal(status.search, true);
    assert.deepEqual(status.quota.data, { used: 0, limit: 30 });
    assert.equal((await api("/api/assistant/status", "GET", null, 3)).body.quota.data.limit, 50, "subscribers get their own allowance");
    assert.equal((await api("/api/assistant/status", "GET", null, 1)).body.quota.search.limit, 100);

    // Adding: the model only prepares a card; nothing is written until the owner confirms.
    script.push(call("add_task", { title: "看牙", start_date: "2026-11-04", time: "3:00", category: "health" }), { content: "帮你准备好了，请确认。" });
    const added = await chat("明天下午三点看牙");
    assert.equal(added.status, 200);
    assert.equal(added.body.reply, "帮你准备好了，请确认。");
    assert.deepEqual(added.body.actions[0].summary, { title: "03:00 看牙", start_date: "2026-11-04", end_date: "2026-11-04", category: "Health", reminder_time: null, note: null });
    assert.deepEqual(added.body.counted, ["chat", "data"]);
    assert.equal(added.body.fallback, false);
    assert.equal(await taskCount(), 0);
    const first = seen[0];
    assert.equal(first.auth, "Bearer " + KEY);
    assert.deepEqual(first.body.thinking, { type: "disabled" });
    assert.equal(first.body.model, "glm-4.7-flash");
    assert.deepEqual(first.body.tools.map(tool => tool.function.name), ["list_tasks", "add_task", "delete_task", "open_page", "web_search"]);
    assert.ok(!first.body.tools[3].function.parameters.properties.page.enum.includes("status"), "admin pages are not offered to members");
    assert.match(first.body.messages[0].content, /Asia\/Shanghai/);
    assert.match(first.body.messages[0].content, /“栗栗”/);
    assert.deepEqual(first.body.messages.slice(1).map(m => m.role), ["user"], "browser-sent history is ignored");
    const action = added.body.actions[0].id;
    assert.equal((await api(`/api/assistant/actions/${action}/confirm`, "POST", {}, 3)).status, 404);
    const confirmed = await api(`/api/assistant/actions/${action}/confirm`, "POST", {});
    assert.equal(confirmed.status, 200);
    assert.equal((await database.get("SELECT category_id FROM tasks WHERE user_id=2")).category_id, "cat-a");
    assert.equal((await api(`/api/assistant/actions/${action}/confirm`, "POST", {})).status, 409);
    assert.equal(await taskCount(), 1);

    // The next message carries the previous round from server memory, including the card it produced.
    const remove = () => script.push(call("list_tasks", { from: "2026-11-01", to: "2026-11-30", keyword: "看牙" }),
      body => call("delete_task", { task_id: lastTool(body).tasks[0].task_id }), { content: "找到了，请确认删除。" });
    remove();
    const proposal = await chat("把看牙删掉");
    const remembered = seen.at(-3).body.messages;
    assert.deepEqual(remembered.slice(1, 3).map(m => m.content.slice(0, 8)), ["明天下午三点看牙", "帮你准备好了，请"]);
    assert.match(remembered[2].content, /待确认卡片：添加 03:00 看牙 2026-11-04/);
    assert.equal(proposal.body.actions[0].kind, "delete_task");
    assert.deepEqual(proposal.body.counted, ["chat", "data"], "data counts once per message even with two calendar tools");
    assert.equal((await api(`/api/assistant/actions/${proposal.body.actions[0].id}/cancel`, "POST", {})).status, 200);
    assert.equal((await api(`/api/assistant/actions/${proposal.body.actions[0].id}/confirm`, "POST", {})).status, 409);
    remove();
    const again = await chat("还是删掉吧");
    assert.equal((await api(`/api/assistant/actions/${again.body.actions[0].id}/confirm`, "POST", {})).status, 200);
    assert.equal(await taskCount(), 0);
    assert.equal(await used("data"), 3);

    // Tool mistakes go back to the model as errors instead of failing the request.
    script.push(call("add_task", { title: "考试", start_date: "2026-12-01", category: "Nope" }),
      body => call("list_tasks", { from: "2026-01-01", to: "2026-12-31", unexpected: lastTool(body).error }), { content: "没有这个分类。" });
    const wrong = await chat("12 月 1 日考试，放到 Nope 分类");
    assert.equal(wrong.status, 200);
    assert.equal(wrong.body.actions.length, 0);
    assert.match(lastTool(seen.at(-2).body).error, /no category named "Nope"; existing categories: Health/);
    assert.match(lastTool(seen.at(-1).body).error, /at most 92 days/);

    // Small talk and navigation use only the chat guard.
    script.push(call("open_page", { page: "ledger" }), { content: "记账在这里。" });
    const page = await chat("我想记账");
    assert.deepEqual(page.body.pages, ["ledger"]);
    assert.deepEqual(page.body.counted, ["chat"]);

    // Memory keeps five rounds: after more messages the oldest drop out.
    for (const text of ["一", "二", "三", "四", "五"]) { script.push({ content: "好的" + text }); await chat("第" + text); }
    script.push({ content: "嗯" });
    await chat("第六");
    const window = seen.at(-1).body.messages.slice(1, -1);
    assert.equal(window.length, 10);
    assert.deepEqual(window.filter(m => m.role === "user").map(m => m.content), ["第一", "第二", "第三", "第四", "第五"]);
    assert.equal((await api("/api/assistant/memory/clear", "POST", {})).status, 200);
    script.push({ content: "你好" });
    await chat("你好");
    assert.equal(seen.at(-1).body.messages.length, 2, "cleared memory starts fresh");

    // The free model is busy: the same message moves to the fallback model, which has no thinking switch.
    const chatsBefore = await used("chat");
    script.push({ status: 429, code: "1302" }, { content: "备用模型来回答。" });
    const rescued = await chat("今天天气怎么样");
    assert.equal(rescued.status, 200);
    assert.equal(rescued.body.reply, "备用模型来回答。");
    assert.equal(rescued.body.fallback, true);
    assert.equal(seen.at(-1).body.model, "glm-4-flashx-250414");
    assert.equal(seen.at(-1).body.thinking, undefined);
    assert.equal(await used("chat"), chatsBefore + 1);
    const recovered = await database.get("SELECT * FROM assistant_errors ORDER BY created_at DESC LIMIT 1");
    assert.equal(recovered.code, "1302");
    assert.equal(recovered.recovered, 1);
    assert.equal(recovered.model, "glm-4.7-flash");
    assert.doesNotMatch(recovered.message, new RegExp(KEY), "the key is redacted from provider text");

    // Both models fail: the user gets a busy message and nothing is counted.
    script.push({ status: 503 }, { status: 500 });
    const busy = await chat("今天有什么安排");
    assert.equal(busy.status, 503);
    assert.equal(busy.body.code, "busy");
    assert.match(busy.body.message, /不计次数/);
    assert.doesNotMatch(busy.body.message, /upstream detail/);
    assert.equal(await used("chat"), chatsBefore + 1);
    assert.equal((await database.get("SELECT COUNT(*) AS n FROM assistant_errors WHERE recovered=0")).n, 2);

    // A rejected key is not retried on the fallback model.
    const before401 = seen.length;
    script.push({ status: 401 });
    const rejected = await chat("今天有什么安排");
    assert.equal(rejected.status, 502);
    assert.equal(rejected.body.code, "config");
    assert.equal(seen.length, before401 + 1);

    // Web search: results come back with sources, and calendar tools are refused in the same message.
    script.push(call("web_search", { query: "美国大选 最新" }), call("list_tasks", { from: "2026-11-01", to: "2026-11-02" }), { content: "据网络搜索，计票仍在进行。" });
    const searched = await chat("美国大选现在怎么样了");
    assert.equal(searched.status, 200);
    assert.deepEqual(searched.body.sources, [{ title: "Election update", url: "https://news.example/vote" }]);
    assert.deepEqual(searched.body.counted, ["chat", "search"]);
    assert.deepEqual(searches.at(-1), { search_query: "美国大选 最新", search_engine: "search_std", search_intent: false, count: 5, content_size: "medium" });
    assert.match(lastTool(seen.at(-1).body).error, /not available after a web search/);
    assert.equal(await used("search"), 1);
    searchScript.push({ status: 500 });
    script.push(call("web_search", { query: "股市" }), { content: "暂时搜不到。" });
    const failedSearch = await chat("今天股市如何");
    assert.deepEqual(failedSearch.body.counted, ["chat"], "a failed search is not counted");
    assert.equal(await used("search"), 1);
    assert.equal((await database.get("SELECT source FROM assistant_errors ORDER BY created_at DESC LIMIT 1")).source, "search");

    // Models that always think get reasoning_effort instead of thinking; a refusal teaches the server the same.
    await save({ model: "glm-5.3-flash" });
    script.push({ content: "低强度思考。" });
    assert.equal((await chat("你好呀")).body.reply, "低强度思考。");
    assert.equal(seen.at(-1).body.reasoning_effort, "low");
    assert.equal(seen.at(-1).body.thinking, undefined);
    assert.equal(seen.at(-1).body.max_tokens, 3072);
    await save({ model: "glm-5.9-flash" });
    const errorsBefore = (await database.get("SELECT COUNT(*) AS n FROM assistant_errors")).n;
    script.push({ status: 400, code: "1210", message: "该模型始终思考，不支持关闭思考；请使用 low、high 或 max。" }, { content: "重试成功。" });
    const learned = await chat("再试一次");
    assert.equal(learned.body.reply, "重试成功。");
    assert.equal(learned.body.fallback, false);
    assert.deepEqual(seen.at(-2).body.thinking, { type: "disabled" });
    assert.equal(seen.at(-1).body.reasoning_effort, "low");
    assert.equal((await database.get("SELECT COUNT(*) AS n FROM assistant_errors")).n, errorsBefore, "a corrected request is not an error");
    script.push({ content: "记住了。" });
    await chat("第三次");
    assert.equal(seen.at(-1).body.reasoning_effort, "low", "the refusal is remembered");
    assert.equal(seen.at(-1).body.thinking, undefined);
    // Other 400s still move to the fallback model.
    script.push({ status: 400, code: "1214", message: "messages 参数非法" }, { content: "备用。" });
    assert.equal((await chat("第四次")).body.fallback, true);

    // Allowances: data runs out with a fixed reply and the model is not asked again; search can be switched off per tier.
    await save({ quotas: quotas(3, 0) });
    assert.ok(!(await api("/api/assistant/status")).body.search);
    const beforeLimit = seen.length;
    script.push(call("list_tasks", { from: "2026-11-01", to: "2026-11-02" }), { content: "不该出现" });
    const limited = await chat("明天有什么");
    assert.equal(limited.body.reply, "今天的日程操作次数（3 次）已用完，明天再来吧。");
    assert.equal(seen.length, beforeLimit + 1);
    assert.ok(!seen.at(-1).body.tools.some(tool => tool.function.name === "web_search"));
    script.length = 0;
    await save({ quotas: quotas(30, 5, (await used("chat"))) });
    const capped = await chat("你好");
    assert.equal(capped.status, 429);
    assert.equal(capped.body.code, "quota");

    // Admin logs: metadata only, with errors linked to their call.
    assert.equal((await api("/api/assistant/admin/calls", "GET", null, 2)).status, 403);
    const logs = (await api("/api/assistant/admin/calls?limit=200", "GET", null, 1)).body;
    assert.ok(logs.calls.length >= 15);
    assert.deepEqual(new Set(logs.calls.map(c => c.outcome)), new Set(["ok", "error", "limited"]));
    const fallbackCall = logs.calls.find(c => c.fallback);
    assert.equal(fallbackCall.model, "glm-4-flashx-250414");
    assert.equal(fallbackCall.errors, 1);
    assert.equal(logs.people[0].username, "alice");
    assert.ok(logs.summary.fallbacks >= 1 && logs.summary.errors >= 4 && logs.summary.searches >= 2);
    const errorLog = (await api("/api/assistant/admin/errors?source=chat", "GET", null, 1)).body.errors;
    assert.ok(errorLog.every(e => e.source === "chat"));
    assert.ok(errorLog.some(e => e.code === "1302" && e.recovered));
    const logText = JSON.stringify([logs, errorLog]);
    assert.doesNotMatch(logText, /看牙|美国大选/, "conversation text is never logged");

    // The connection test tries both models and the search API.
    script.push({ content: "pong" }, { status: 429, code: "1305" });
    const checked = (await api("/api/assistant/admin/test", "POST", {}, 1)).body;
    assert.equal(checked.ok, false);
    assert.deepEqual(checked.checks.map(c => [c.role, c.ok]), [["model", true], ["fallback", false], ["search", true]]);
    assert.equal(checked.checks[1].code, "1305");

    const view = await api("/api/assistant/admin/settings", "GET", null, 1);
    assert.equal(view.body.keySet, true);
    assert.ok(bodies.every(text => !text.includes(KEY)), "the API key never leaves the server");
    assert.ok((await database.get("SELECT COUNT(*) AS n FROM admin_operations WHERE action='assistant-settings'")).n >= 3);
  } finally {
    server.close();
    model.close();
    delete process.env.GARYHUB_ASSISTANT_ENDPOINT;
    delete process.env.GARYHUB_ASSISTANT_SEARCH_ENDPOINT;
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

test("saved allowances fall back to the defaults when missing or invalid", () => {
  const { quotasOf, DEFAULT_QUOTAS } = require("../assistant-api");
  assert.deepEqual(quotasOf({ quotas: null }), DEFAULT_QUOTAS);
  assert.equal(quotasOf({ quotas: JSON.stringify({ data: { standard: 7, admin: -1 } }) }).data.standard, 7);
  assert.equal(quotasOf({ quotas: JSON.stringify({ data: { admin: -1 } }) }).data.admin, 200);
  assert.deepEqual(quotasOf({ quotas: "{oops" }), DEFAULT_QUOTAS);
});
