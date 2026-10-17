'use strict';
// A private connection keeps a feature's queued transactions separate from
// unrelated requests on the application's shared SQLite connection.
function openConnection() {
  const path = require('node:path');
  const raw = new (require('sqlite3').Database)(path.join(require('./db').dataDir, 'calendar.sqlite'));
  raw.configure('busyTimeout', 5000);
  const db = {
    run: (sql, params = []) => new Promise((resolve, reject) => raw.run(sql, params, function (err) { err ? reject(err) : resolve(this); })),
    get: (sql, params = []) => new Promise((resolve, reject) => raw.get(sql, params, (err, row) => err ? reject(err) : resolve(row))),
    all: (sql, params = []) => new Promise((resolve, reject) => raw.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)))
  };
  return db;
}
function queuedRoutes(db) {
  let queue = db.run('PRAGMA foreign_keys=ON');
  return fn => (req, res, next) => {
    const task = queue.then(() => fn(req, res));
    queue = task.catch(() => {});
    task.catch(next);
  };
}
async function transaction(db, fn) {
  await db.run('BEGIN IMMEDIATE');
  try { const value = await fn(); await db.run('COMMIT'); return value; }
  catch (error) { await db.run('ROLLBACK'); throw error; }
}
module.exports = {openConnection, queuedRoutes, transaction};
