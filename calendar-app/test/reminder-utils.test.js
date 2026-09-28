"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  dueReminderSlots,
  isValidTimeZone,
  localParts
} = require("../reminder-utils");

const baseTask = {
  reminderEnabled: true,
  status: "todo",
  completedAt: null,
  startDate: "2026-09-27",
  endDate: "2026-09-29"
};

test("validates IANA time zones", () => {
  assert.equal(isValidTimeZone("America/Chicago"), true);
  assert.equal(isValidTimeZone("not/a-zone"), false);
});

test("converts the current instant to the user's local date and time", () => {
  assert.deepEqual(
    localParts(new Date("2026-09-27T15:00:00Z"), "America/Chicago"),
    { date: "2026-09-27", time: "10:00" }
  );
});

test("includes both task boundary dates", () => {
  const settings = { frequency: 1, time1: "10:00", time2: null };
  assert.deepEqual(
    dueReminderSlots({
      task: baseTask,
      settings,
      timeZone: "America/Chicago",
      now: new Date("2026-09-27T15:00:00Z")
    }),
    ["10:00"]
  );
  assert.deepEqual(
    dueReminderSlots({
      task: baseTask,
      settings,
      timeZone: "America/Chicago",
      now: new Date("2026-09-29T15:00:00Z")
    }),
    ["10:00"]
  );
});

test("supports two distinct reminder times", () => {
  const settings = { frequency: 2, time1: "09:00", time2: "18:30" };
  assert.deepEqual(
    dueReminderSlots({
      task: baseTask,
      settings,
      timeZone: "America/Chicago",
      now: new Date("2026-09-27T23:30:00Z")
    }),
    ["18:30"]
  );
});

test("does not remind outside the date range or after completion", () => {
  const settings = { frequency: 1, time1: "10:00", time2: null };
  assert.deepEqual(
    dueReminderSlots({
      task: baseTask,
      settings,
      timeZone: "America/Chicago",
      now: new Date("2026-09-30T15:00:00Z")
    }),
    []
  );
  assert.deepEqual(
    dueReminderSlots({
      task: { ...baseTask, status: "done", completedAt: "2026-09-27T12:00:00Z" },
      settings,
      timeZone: "America/Chicago",
      now: new Date("2026-09-27T15:00:00Z")
    }),
    []
  );
});
