"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { hashPassword, verifyPassword } = require("../auth-utils");

test("keeps the existing scrypt password format compatible", () => {
  const password = "test-password";
  const hash = hashPassword(password);
  assert.match(hash, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.equal(verifyPassword(password, hash), true);
  assert.equal(verifyPassword("wrong-password", hash), false);
});
