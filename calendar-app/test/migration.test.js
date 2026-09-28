"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  EMAIL_NOTICE_KEY,
  migrateUnifiedCalendar,
  userFingerprint
} = require("../migrations/unified-schema");
const { createSqliteAdapter } = require("./helpers/sqlite-adapter");

function createLegacyFixture({ legacyTasks = false } = {}) {
  const db = createSqliteAdapter();
  db.raw.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      start_date TEXT NOT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE register_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      note TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by INTEGER,
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(username, status)
    );
    INSERT INTO users(username,password_hash,role) VALUES
      ('admin','salt-a:hash-a','admin'),
      ('member','salt-b:hash-b','user');
    INSERT INTO events(user_id,title,start_date) VALUES(1,'old event','2026-09-27');
  `);
  if (legacyTasks) {
    db.raw.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        category TEXT NOT NULL,
        status TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      INSERT INTO tasks VALUES
        ('legacy',1,'old task','2026-09-27','2026-09-28','Coding','todo','',1,1);
    `);
  }
  return db;
}

async function legacyUsers(db) {
  return db.all(`
    SELECT id, username, password_hash, role, enabled, created_at
    FROM users ORDER BY id
  `);
}

test("migration preserves every login-critical user field", async () => {
  const db = createLegacyFixture();
  const before = await legacyUsers(db);
  const result = await migrateUnifiedCalendar(db);
  const after = await legacyUsers(db);
  assert.deepEqual(after, before);
  assert.equal(result.userFingerprint, userFingerprint(before));
  assert.equal(result.usersPreserved, 2);
  db.close();
});

test("migration creates one email notice per legacy user and is idempotent", async () => {
  const db = createLegacyFixture();
  await migrateUnifiedCalendar(db);
  await migrateUnifiedCalendar(db);
  const notices = await db.all(
    "SELECT user_id, dedupe_key, read_at FROM notifications ORDER BY user_id"
  );
  assert.equal(notices.length, 2);
  assert.ok(notices.every(row => row.dedupe_key === EMAIL_NOTICE_KEY));
  assert.ok(notices.every(row => row.read_at === null));
  db.close();
});

test("normal migration never clears legacy calendar events", async () => {
  const db = createLegacyFixture();
  await migrateUnifiedCalendar(db);
  assert.equal((await db.get("SELECT COUNT(*) AS count FROM events")).count, 1);
  db.close();
});

test("explicit rehearsal mode clears old events and incompatible tasks", async () => {
  const db = createLegacyFixture({ legacyTasks: true });
  await migrateUnifiedCalendar(db, { clearLegacyData: true });
  assert.equal((await db.get("SELECT COUNT(*) AS count FROM events")).count, 0);
  assert.equal((await db.get("SELECT COUNT(*) AS count FROM tasks")).count, 0);
  const columns = await db.all("PRAGMA table_info(tasks)");
  assert.ok(columns.some(column => column.name === "category_id"));
  db.close();
});

test("legacy tasks require an explicit destructive flag", async () => {
  const db = createLegacyFixture({ legacyTasks: true });
  await assert.rejects(
    migrateUnifiedCalendar(db),
    /Legacy tasks table detected/
  );
  assert.equal((await db.get("SELECT COUNT(*) AS count FROM tasks")).count, 1);
  assert.equal((await db.get("SELECT COUNT(*) AS count FROM events")).count, 1);
  db.close();
});

test("category deletion keeps the task and marks it uncategorized", async () => {
  const db = createLegacyFixture();
  await migrateUnifiedCalendar(db);
  await db.run(
    "INSERT INTO categories(id,user_id,name,name_normalized,color) VALUES(?,?,?,?,?)",
    ["cat-1", 1, "Course", "course", "#3366CC"]
  );
  await db.run(
    `INSERT INTO tasks
     (id,user_id,title,start_date,end_date,category_id)
     VALUES(?,?,?,?,?,?)`,
    ["task-1", 1, "Test", "2026-09-27", "2026-09-28", "cat-1"]
  );
  await db.run("DELETE FROM categories WHERE id = ?", ["cat-1"]);
  assert.equal((await db.get("SELECT category_id FROM tasks")).category_id, null);
  db.close();
});

test("delivery uniqueness prevents duplicate reminders", async () => {
  const db = createLegacyFixture();
  await migrateUnifiedCalendar(db);
  await db.run(
    "INSERT INTO tasks(id,user_id,title,start_date,end_date) VALUES(?,?,?,?,?)",
    ["task-1", 1, "Test", "2026-09-27", "2026-09-28"]
  );
  const values = [
    "delivery-1", "task-1", 1, "2026-09-27T15:00:00Z", "2026-09-27", "10:00"
  ];
  await db.run(
    `INSERT INTO reminder_deliveries
     (id,task_id,user_id,scheduled_for_utc,local_date,local_time)
     VALUES(?,?,?,?,?,?)`,
    values
  );
  await assert.rejects(
    db.run(
      `INSERT INTO reminder_deliveries
       (id,task_id,user_id,scheduled_for_utc,local_date,local_time)
       VALUES(?,?,?,?,?,?)`,
      ["delivery-2", ...values.slice(1)]
    ),
    /UNIQUE constraint failed/
  );
  db.close();
});
