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
  await db.run(`INSERT INTO tasks(id,user_id,title,start_date,end_date,note,reminder_enabled)
    VALUES('t1',1,'Study','2026-09-27','2026-09-27','First line\nSecond line',1)`);
  await db.run(`INSERT INTO reminder_settings(task_id,frequency,time_1) VALUES('t1',1,'09:00')`);
  await db.run(`INSERT INTO users(id,username,password_hash,role,enabled,created_at,email,email_verified_at,timezone)
    VALUES(2,'bob','hash','user',1,'2026-01-01','b@example.com','2026-09-01','America/Chicago')`);
  await db.run(`INSERT INTO tasks(id,user_id,title,start_date,end_date,note,reminder_enabled)
    VALUES('other',2,'Other user','2026-09-27','2026-09-27','Bob secret',1)`);
  await db.run(`INSERT INTO reminder_settings(task_id,frequency,time_1) VALUES('other',1,'10:00')`);
  // A malformed delivery must never use Alice's address for Bob's task or note.
  await db.run(`INSERT INTO reminder_deliveries
    (id,task_id,user_id,scheduled_for_utc,local_date,local_time,status)
    VALUES('mismatched','other',1,'2026-09-27T14:00:00Z','2026-09-27','09:00','pending')`);
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
    assert.match(messages[0].text, /备注：\nFirst line\nSecond line\n$/);
    assert.equal(messages[0].to, "a@example.com");
    assert.equal((await db.get("SELECT status FROM reminder_deliveries WHERE task_id='t1'")).status, "sent");
    await db.run("UPDATE tasks SET status='done',completed_at=CURRENT_TIMESTAMP WHERE id='t1'");
    assert.deepEqual(await runCycle({ ...args, now: new Date("2026-09-28T14:00:00Z") }),
      { created: 0, sent: 0 });
    await db.run(`INSERT INTO tasks(id,user_id,title,start_date,end_date,reminder_enabled)
      VALUES('t2',1,'No note','2026-09-28','2026-09-28',1)`);
    await db.run(`INSERT INTO reminder_settings(task_id,frequency,time_1) VALUES('t2',1,'09:00')`);
    assert.deepEqual(await runCycle({ ...args, now: new Date("2026-09-28T14:00:00Z") }),
      { created: 1, sent: 1 });
    assert.equal(messages[1].text.includes("备注："), false);
  } finally {
    delete require.cache[dbFile]; db.close();
  }
});
