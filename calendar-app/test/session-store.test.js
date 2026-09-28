"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { sessionExpiry } = require("../session-store");

test("session expiry preserves an existing cookie expiry", () => {
  assert.equal(
    sessionExpiry({ cookie: { expires: "2026-09-27T12:00:00.000Z" } }, 1),
    Date.parse("2026-09-27T12:00:00.000Z")
  );
});

test("session expiry respects maxAge for new sessions", () => {
  assert.equal(sessionExpiry({ cookie: { maxAge: 5000 } }, 1000), 6000);
});
