"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");
const { createSqliteAdapter } = require("./helpers/sqlite-adapter");
const { migrateUnifiedCalendar } = require("../migrations/unified-schema");

test("email code is single-use and account email is stored only after verification", async () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), "garyhub-mail-"));
  process.env.MAIL_CAPTURE_DIR = captureDir;
  process.env.EMAIL_CODE_PEPPER = "test-only-pepper-with-at-least-24-characters";
  const database = createSqliteAdapter();
  await database.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,password_hash TEXT,role TEXT,enabled INTEGER,created_at TEXT);
    CREATE TABLE register_requests(id INTEGER PRIMARY KEY);
    CREATE TABLE events(id INTEGER PRIMARY KEY,user_id INTEGER);
    INSERT INTO users VALUES(1,'alice','hash','user',1,'2026-01-01');`);
  await migrateUnifiedCalendar(database);
  const dbFile = require.resolve("../db");
  require.cache[dbFile] = { id: dbFile, filename: dbFile, loaded: true, exports: database };
  delete require.cache[require.resolve("../email-api")];
  const registerEmailApi = require("../email-api");
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = { user: { id: 1 } }; next(); });
  registerEmailApi(app, { requireLogin: (req, res, next) => next() });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(pathname, method, body) {
    const response = await fetch(base + pathname, { method,
      headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() };
  }
  try {
    const reqBody = { email: "Alice@example.com", purpose: "add_email" };
    const request = await call("/api/email-verifications/request", "POST", reqBody);
    assert.equal(request.status, 201);
    assert.equal((await call("/api/email-verifications/request", "POST", reqBody)).status, 429);
    const message = JSON.parse(fs.readFileSync(path.join(captureDir, fs.readdirSync(captureDir)[0]), "utf8"));
    const code = message.text.match(/\d{6}/)[0];
    assert.equal((await call("/api/email-verifications/confirm", "POST",
      { ...reqBody, verification_id: request.body.verification_id, code: "999999" })).status, 400);
    const confirmed = await call("/api/email-verifications/confirm", "POST",
      { ...reqBody, verification_id: request.body.verification_id, code });
    assert.equal(confirmed.status, 200);
    const ticket = { ...reqBody, verification_id: confirmed.body.verification_id,
      verification_token: confirmed.body.verification_token };
    assert.equal((await call("/api/account/email", "PUT", ticket)).status, 200);
    assert.equal((await call("/api/account/email", "PUT", ticket)).status, 400);
    assert.equal((await call("/api/account/email", "GET")).body.email, "Alice@example.com");
  } finally {
    server.close(); database.close(); delete require.cache[dbFile];
    delete process.env.MAIL_CAPTURE_DIR; delete process.env.EMAIL_CODE_PEPPER;
    fs.rmSync(captureDir, { recursive: true, force: true });
  }
});
