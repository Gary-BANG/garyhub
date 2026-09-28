"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createSqliteAdapter } = require("./helpers/sqlite-adapter");
const { migrateUnifiedCalendar } = require("../migrations/unified-schema");

test("worker sends one reminder on an inclusive boundary and repeated scans do not resend", async () => {
  const db = createSqliteAdapter();
  await db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,password_hash TEXT,role TEXT,enabled INTEGER,created_at TEXT);
    CREATE TABLE register_requests(id INTEGER PRIMARY KEY);
    CREATE TABLE events(id INTEGER PRIMARY KEY,user_id INTEGER);
    INSERT INTO users VALUES(1,'alice','hash','user',1,'2026-01-01');`);
  await migrateUnifiedCalendar(db);
  await db.run(`UPDATE users SET email='a@example.com',email_normalized='a@example.com',
    email_verified_at='2026-09-01T00:00:00Z',timezone='America/Chicago' WHERE id=1`);
  await db.run(`INSERT INTO tasks(id,user_id,title,start_date,end_date,reminder_enabled)
    VALUES('t1',1,'Study','2026-09-27','2026-09-27',1)`);
  await db.run(`INSERT INTO reminder_settings(task_id,frequency,time_1) VALUES('t1',1,'09:00')`);
  const dbFile = require.resolve("../db");
  require.cache[dbFile] = { id: dbFile,filename:dbFile,loaded:true,exports:db };
  delete require.cache[require.resolve("../reminder-worker")];
  const { runCycle } = require("../reminder-worker");
  const messages = [];
  try {
    const args = { db, now: new Date("2026-09-27T14:00:00Z"),
      sendMail: async message => { messages.push(message); } };
    assert.deepEqual(await runCycle(args), { created: 1, sent: 1 });
    assert.deepEqual(await runCycle(args), { created: 0, sent: 0 });
    assert.equal(messages.length, 1);
    assert.equal((await db.get("SELECT status FROM reminder_deliveries WHERE task_id='t1'")).status, "sent");
    await db.run("UPDATE tasks SET status='done',completed_at=CURRENT_TIMESTAMP WHERE id='t1'");
    assert.deepEqual(await runCycle({ ...args, now: new Date("2026-09-28T14:00:00Z") }),
      { created: 0, sent: 0 });
  } finally {
    delete require.cache[dbFile]; db.close();
  }
});
