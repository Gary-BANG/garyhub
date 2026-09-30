"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { matchesTaskFilters } = require("../public/task-filter");

test("inclusive spanning dates combine with category, status, and title", () => {
  const task = { title: "Doctor visit", category_id: "health", start_date: "2026-09-27", end_date: "2026-10-02" };
  const filters = { categories: new Set(["health"]), status: "doing", effectiveStatus: "doing", search: "doctor", date: "2026-09-30" };
  for (const date of ["2026-09-27", "2026-09-30", "2026-10-02"]) {
    assert.equal(matchesTaskFilters(task, { ...filters, date }), true);
  }
  for (const date of ["2026-09-26", "2026-10-03"]) {
    assert.equal(matchesTaskFilters(task, { ...filters, date }), false);
  }
  assert.equal(matchesTaskFilters(task, { ...filters, categories: new Set(["work"]) }), false);
  assert.equal(matchesTaskFilters(task, { ...filters, status: "done" }), false);
  assert.equal(matchesTaskFilters(task, { ...filters, search: "dentist" }), false);
  assert.equal(matchesTaskFilters(task, { ...filters, date: "" }), true);
});
