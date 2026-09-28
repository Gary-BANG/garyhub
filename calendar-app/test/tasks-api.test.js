"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createSqliteAdapter } = require("./helpers/sqlite-adapter");
const { migrateUnifiedCalendar } = require("../migrations/unified-schema");

test("unified tasks enforce ownership, dates, category isolation and preserve tasks on category deletion", async () => {
  const database = createSqliteAdapter();
  await database.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,password_hash TEXT,role TEXT,enabled INTEGER,created_at TEXT);
    CREATE TABLE register_requests(id INTEGER PRIMARY KEY);
    CREATE TABLE events(id INTEGER PRIMARY KEY,user_id INTEGER);
    INSERT INTO users VALUES(1,'alice','hash','user',1,'2026-01-01'),(2,'bob','hash','user',1,'2026-01-01');
  `);
  await migrateUnifiedCalendar(database);
  const dbFile = require.resolve("../db");
  require.cache[dbFile] = { id: dbFile, filename: dbFile, loaded: true, exports: database };
  delete require.cache[require.resolve("../tasks-api")];
  const registerTasksApi = require("../tasks-api");
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { user: { id: Number(req.get("x-test-user") || 1), role: "user" } };
    next();
  });
  registerTasksApi(app, {
    requireLogin: (req, res, next) => next(),
    resolveTargetUserId: req => req.session.user.id
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  async function call(path, method = "GET", body, user = 1) {
    const response = await fetch(url + path, {
      method, headers: { "content-type": "application/json", "x-test-user": String(user) },
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: response.status, body: await response.json() };
  }
  try {
    const category = await call("/api/categories", "POST", { name: "School", color: "#2266aa" });
    assert.equal(category.status, 201);
    assert.equal((await call("/api/categories", "POST", { name: "school", color: "#2266aa" })).status, 409);
    const payload = {
      title: "跨日学习", start_date: "2026-09-27", end_date: "2026-09-30",
      category_id: category.body.id, status: "todo", note: "笔记",
      reminder_enabled: true, reminder: { frequency: 2, time_1: "09:00", time_2: "18:00" }
    };
    assert.equal((await call("/api/tasks", "POST", { ...payload, end_date: "2026-09-26" })).status, 400);
    const created = await call("/api/tasks", "POST", payload);
    assert.equal(created.status, 201);
    assert.equal(created.body.reminder_frequency, 2);
    assert.equal((await call("/api/tasks", "GET", null, 2)).body.length, 0);
    assert.equal((await call(`/api/tasks/${created.body.id}`, "PUT", payload, 2)).status, 404);
    assert.equal((await call(`/api/tasks/${created.body.id}`, "DELETE", null, 2)).status, 404);
    assert.equal((await call("/api/tasks", "POST", payload, 2)).status, 400);
    assert.equal((await call(`/api/categories/${category.body.id}`, "DELETE", null, 2)).status, 404);
    assert.equal((await call(`/api/categories/${category.body.id}`, "DELETE")).status, 200);
    const tasks = (await call("/api/tasks")).body;
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].category_id, null);
    assert.equal((await call(`/api/tasks/${created.body.id}`, "PUT", {
      ...payload, category_id: null, status: "done", reminder_enabled: false
    })).body.status, "done");
    assert.equal((await call(`/api/tasks/${created.body.id}`, "DELETE")).status, 200);
    assert.equal((await call("/api/tasks")).body.length, 0);
  } finally {
    server.close();
    delete require.cache[dbFile];
    database.close();
  }
});
