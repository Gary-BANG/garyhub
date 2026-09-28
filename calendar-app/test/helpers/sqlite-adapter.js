"use strict";

const { DatabaseSync } = require("node:sqlite");

function createSqliteAdapter(filename = ":memory:") {
  const raw = new DatabaseSync(filename);
  return {
    raw,
    async run(sql, params = []) {
      return raw.prepare(sql).run(...params);
    },
    async get(sql, params = []) {
      return raw.prepare(sql).get(...params);
    },
    async all(sql, params = []) {
      return raw.prepare(sql).all(...params);
    },
    async exec(sql) {
      raw.exec(sql);
    },
    close() {
      raw.close();
    }
  };
}

module.exports = { createSqliteAdapter };
