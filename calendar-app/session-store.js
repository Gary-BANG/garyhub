"use strict";

const DEFAULT_MAX_AGE = 24 * 60 * 60 * 1000;

function sessionExpiry(value, now = Date.now()) {
  const expires = value?.cookie?.expires;
  if (expires) {
    const timestamp = new Date(expires).getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }
  const maxAge = Number(value?.cookie?.maxAge);
  return now + (Number.isFinite(maxAge) && maxAge > 0 ? maxAge : DEFAULT_MAX_AGE);
}

function createSqliteSessionStore(session, { filename }) {
  const sqlite3 = require("sqlite3").verbose();

  class SqliteSessionStore extends session.Store {
    constructor() {
      super();
      this.db = new sqlite3.Database(filename);
      this.db.configure("busyTimeout", 5000);
      this.db.serialize(() => {
        this.db.run(
          "CREATE TABLE IF NOT EXISTS sessions (sid PRIMARY KEY, expired, sess)"
        );
        this.db.run(
          "CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired)"
        );
      });
    }

    get(sid, callback) {
      this.db.get(
        "SELECT expired, sess FROM sessions WHERE sid = ?",
        [sid],
        (error, row) => {
          if (error) return callback(error);
          if (!row) return callback(null, null);
          if (Number(row.expired) <= Date.now()) {
            return this.destroy(sid, destroyError => callback(destroyError, null));
          }
          try {
            callback(null, JSON.parse(row.sess));
          } catch (parseError) {
            callback(parseError);
          }
        }
      );
    }

    set(sid, value, callback = () => {}) {
      let encoded;
      try {
        encoded = JSON.stringify(value);
      } catch (error) {
        callback(error);
        return;
      }
      this.db.run(
        `INSERT INTO sessions(sid, expired, sess) VALUES(?, ?, ?)
         ON CONFLICT(sid) DO UPDATE SET
           expired = excluded.expired,
           sess = excluded.sess`,
        [sid, sessionExpiry(value), encoded],
        callback
      );
    }

    touch(sid, value, callback = () => {}) {
      this.db.run(
        "UPDATE sessions SET expired = ? WHERE sid = ?",
        [sessionExpiry(value), sid],
        callback
      );
    }

    destroy(sid, callback = () => {}) {
      this.db.run("DELETE FROM sessions WHERE sid = ?", [sid], callback);
    }

    clear(callback = () => {}) {
      this.db.run("DELETE FROM sessions", callback);
    }

    length(callback) {
      this.db.get(
        "SELECT COUNT(*) AS count FROM sessions WHERE expired > ?",
        [Date.now()],
        (error, row) => callback(error, row?.count || 0)
      );
    }
  }

  return new SqliteSessionStore();
}

module.exports = { createSqliteSessionStore, sessionExpiry };
