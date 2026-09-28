#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { migrateUnifiedCalendar } = require("../migrations/unified-schema");

function parseArgs(argv) {
  const result = { clearLegacyData: false, confirmIsolatedCopy: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--database") result.database = argv[++index];
    else if (value === "--clear-legacy-data") result.clearLegacyData = true;
    else if (value === "--confirm-isolated-copy") result.confirmIsolatedCopy = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!result.database) throw new Error("--database is required");
  if (!result.confirmIsolatedCopy) {
    throw new Error(
      "--confirm-isolated-copy is required; production migration is intentionally disabled"
    );
  }
  return result;
}

function openDatabase(filename) {
  const raw = new sqlite3.Database(filename);
  raw.configure("busyTimeout", 5000);
  return {
    raw,
    run(sql, params = []) {
      return new Promise((resolve, reject) => {
        raw.run(sql, params, function onRun(error) {
          if (error) reject(error);
          else resolve({ changes: this.changes, lastID: this.lastID });
        });
      });
    },
    get(sql, params = []) {
      return new Promise((resolve, reject) => {
        raw.get(sql, params, (error, row) => {
          if (error) reject(error);
          else resolve(row);
        });
      });
    },
    all(sql, params = []) {
      return new Promise((resolve, reject) => {
        raw.all(sql, params, (error, rows) => {
          if (error) reject(error);
          else resolve(rows);
        });
      });
    },
    exec(sql) {
      return new Promise((resolve, reject) => {
        raw.exec(sql, error => (error ? reject(error) : resolve()));
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        raw.close(error => (error ? reject(error) : resolve()));
      });
    }
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const database = path.resolve(args.database);
  const productionPath = "/opt/my-services/calendar-app/data/calendar.sqlite";

  if (database === productionPath) {
    throw new Error(
      "Refusing the production database path. This command is for an isolated copy only."
    );
  }
  if (!fs.existsSync(database)) throw new Error("Database file does not exist");

  const db = openDatabase(database);
  try {
    const result = await migrateUnifiedCalendar(db, args);
    const integrity = await db.get("PRAGMA integrity_check");
    console.log(JSON.stringify({ ...result, integrity: Object.values(integrity)[0] }));
  } finally {
    await db.close();
  }
}

main().catch(error => {
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
});
