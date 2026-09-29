"use strict";

const VERSION = "20260929_personal_records_v1";

async function migratePersonalRecords(db) {
  await db.exec("PRAGMA foreign_keys = ON");
  await db.exec("BEGIN IMMEDIATE");
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS diary_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        entry_date TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, entry_date)
      );
      CREATE INDEX IF NOT EXISTS idx_diary_user_date ON diary_entries(user_id, entry_date DESC);
      CREATE TABLE IF NOT EXISTS weight_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        entry_date TEXT NOT NULL,
        weight_g INTEGER NOT NULL CHECK(weight_g BETWEEN 1000 AND 1000000),
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_weight_user_date ON weight_entries(user_id, entry_date DESC, id DESC);
      CREATE TABLE IF NOT EXISTS exercise_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        entry_date TEXT NOT NULL,
        activity_type TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 1 AND 1440),
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_exercise_user_date ON exercise_entries(user_id, entry_date DESC, id DESC);
    `);
    await db.run("INSERT OR IGNORE INTO schema_migrations(version) VALUES(?)", [VERSION]);
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

module.exports = { VERSION, migratePersonalRecords };
