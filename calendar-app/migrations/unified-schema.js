"use strict";

const crypto = require("crypto");

const MIGRATION_VERSION = "20260927_unified_calendar_v1";
const EMAIL_NOTICE_KEY = "email-required-v1";

async function tableExists(db, table) {
  return Boolean(
    await db.get(
      "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?",
      [table]
    )
  );
}

async function tableColumns(db, table) {
  if (!(await tableExists(db, table))) return [];
  return db.all(`PRAGMA table_info(${table})`);
}

async function ensureColumn(db, table, column, definition) {
  const columns = await tableColumns(db, table);
  if (!columns.some(item => item.name === column)) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function canonicalUsers(rows) {
  return rows.map(row => ({
    id: row.id,
    username: row.username,
    password_hash: row.password_hash,
    role: row.role,
    enabled: row.enabled,
    created_at: row.created_at
  }));
}

function userFingerprint(rows) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalUsers(rows)))
    .digest("hex");
}

async function readUsers(db) {
  return db.all(`
    SELECT id, username, password_hash, role, enabled, created_at
    FROM users
    ORDER BY id
  `);
}

async function prepareTasksTable(db, clearLegacyData) {
  const columns = await tableColumns(db, "tasks");
  if (!columns.length) return;

  const names = new Set(columns.map(item => item.name));
  const unified = names.has("category_id") && names.has("completed_at");
  if (unified) return;

  if (!clearLegacyData) {
    throw new Error(
      "Legacy tasks table detected. Use --clear-legacy-data only on an approved database copy."
    );
  }

  await db.exec("DROP TABLE tasks");
}

async function createUnifiedTables(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_normalized
    ON users(email_normalized)
    WHERE email_normalized IS NOT NULL;

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      name_normalized TEXT NOT NULL,
      color TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, name_normalized)
    );

    CREATE INDEX IF NOT EXISTS idx_categories_user
    ON categories(user_id, created_at);

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      category_id TEXT,
      status TEXT NOT NULL DEFAULT 'todo'
        CHECK(status IN ('todo', 'doing', 'done')),
      completed_at TEXT,
      reminder_enabled INTEGER NOT NULL DEFAULT 0
        CHECK(reminder_enabled IN (0, 1)),
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK(end_date >= start_date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_user_dates
    ON tasks(user_id, start_date, end_date);

    CREATE INDEX IF NOT EXISTS idx_tasks_user_status
    ON tasks(user_id, status);

    CREATE TABLE IF NOT EXISTS reminder_settings (
      task_id TEXT PRIMARY KEY,
      frequency INTEGER NOT NULL CHECK(frequency IN (1, 2)),
      time_1 TEXT NOT NULL,
      time_2 TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK(
        (frequency = 1 AND time_2 IS NULL) OR
        (frequency = 2 AND time_2 IS NOT NULL AND time_1 <> time_2)
      ),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reminder_deliveries (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      scheduled_for_utc TEXT NOT NULL,
      local_date TEXT NOT NULL,
      local_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_retry_at TEXT,
      sent_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(task_id, local_date, local_time)
    );

    CREATE INDEX IF NOT EXISTS idx_reminder_deliveries_due
    ON reminder_deliveries(status, scheduled_for_utc, next_retry_at);

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      action_url TEXT,
      dedupe_key TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, dedupe_key)
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON notifications(user_id, read_at, created_at DESC);

    CREATE TABLE IF NOT EXISTS email_verifications (
      id TEXT PRIMARY KEY,
      user_id INTEGER,
      email TEXT NOT NULL,
      email_normalized TEXT NOT NULL,
      purpose TEXT NOT NULL
        CHECK(purpose IN ('registration', 'add_email', 'change_email')),
      code_digest TEXT NOT NULL,
      verification_token_digest TEXT,
      expires_at TEXT NOT NULL,
      verified_at TEXT,
      consumed_at TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      send_count INTEGER NOT NULL DEFAULT 1,
      last_sent_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_email_verifications_lookup
    ON email_verifications(email_normalized, purpose, expires_at);
  `);
}

async function migrateUnifiedCalendar(db, options = {}) {
  const clearLegacyData = options.clearLegacyData === true;
  const before = await readUsers(db);
  const beforeFingerprint = userFingerprint(before);

  await db.exec("PRAGMA foreign_keys = ON");
  await db.exec("BEGIN IMMEDIATE");

  try {
    await ensureColumn(db, "users", "email", "TEXT");
    await ensureColumn(db, "users", "email_normalized", "TEXT");
    await ensureColumn(db, "users", "email_verified_at", "TEXT");
    await ensureColumn(
      db,
      "users",
      "timezone",
      "TEXT NOT NULL DEFAULT 'Etc/UTC'"
    );

    await ensureColumn(db, "register_requests", "email", "TEXT");
    await ensureColumn(db, "register_requests", "email_normalized", "TEXT");
    await ensureColumn(db, "register_requests", "email_verified_at", "TEXT");
    await ensureColumn(
      db,
      "register_requests",
      "timezone",
      "TEXT NOT NULL DEFAULT 'Etc/UTC'"
    );

    await prepareTasksTable(db, clearLegacyData);
    await createUnifiedTables(db);

    await db.run(
      `INSERT OR IGNORE INTO notifications
       (user_id, type, title, body, action_url, dedupe_key)
       SELECT id, 'account', '请补充并验证邮箱',
              '请补充并验证您的邮箱，以便使用事项邮件提醒功能。',
              '/settings/email', ?
       FROM users
       WHERE email_verified_at IS NULL`,
      [EMAIL_NOTICE_KEY]
    );

    if (clearLegacyData) {
      if (await tableExists(db, "events")) {
        await db.run("DELETE FROM events");
      }
      await db.run("DELETE FROM tasks");
    }

    await db.run(
      "INSERT OR IGNORE INTO schema_migrations(version) VALUES(?)",
      [MIGRATION_VERSION]
    );

    const after = await readUsers(db);
    const afterFingerprint = userFingerprint(after);
    if (
      before.length !== after.length ||
      beforeFingerprint !== afterFingerprint
    ) {
      throw new Error("User identity or password data changed during migration");
    }

    const foreignKeyErrors = await db.all("PRAGMA foreign_key_check");
    if (foreignKeyErrors.length) {
      throw new Error(`Foreign-key check failed (${foreignKeyErrors.length} rows)`);
    }

    await db.exec("COMMIT");
    return {
      migration: MIGRATION_VERSION,
      usersPreserved: after.length,
      userFingerprint: afterFingerprint,
      clearedLegacyData: clearLegacyData
    };
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

module.exports = {
  EMAIL_NOTICE_KEY,
  MIGRATION_VERSION,
  migrateUnifiedCalendar,
  userFingerprint
};
