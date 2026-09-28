"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { sendGraphMail, readCredentials, saveCredentials } = require("../graph-mailer");

test("expired Outlook authorization refreshes securely and sends as the selected account", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "garyhub-graph-"));
  const filename = path.join(dir, "outlook-token.json");
  try {
    saveCredentials(filename, {
      account: "garyhub2026@outlook.com", access_token: "expired",
      refresh_token: "old-refresh", expires_at: 1
    });
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      if (url.includes("/token")) return {
        ok: true, json: async () => ({
          access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600
        })
      };
      return { ok: true, status: 202 };
    };
    await sendGraphMail({ to: "someone@example.com", subject: "验证码", text: "123456" },
      { clientId: "client", filename, from: "garyhub2026@outlook.com", fetchImpl });
    assert.equal(calls.length, 2);
    assert.equal(new URLSearchParams(calls[0].options.body).get("refresh_token"), "old-refresh");
    assert.equal(calls[1].options.headers.Authorization, "Bearer new-access");
    assert.equal(JSON.parse(calls[1].options.body).message.toRecipients[0].emailAddress.address,
      "someone@example.com");
    assert.equal(readCredentials(filename, "garyhub2026@outlook.com").refresh_token, "new-refresh");
    if (process.platform !== "win32") {
      assert.equal(fs.statSync(filename).mode & 0o777, 0o600);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Outlook sender mismatch is rejected before any mail request", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "garyhub-graph-"));
  const filename = path.join(dir, "outlook-token.json");
  try {
    saveCredentials(filename, {
      account: "different@outlook.com", access_token: "valid",
      refresh_token: "refresh", expires_at: Date.now() + 3600_000
    });
    await assert.rejects(sendGraphMail({ to: "x@example.com", subject: "x", text: "x" },
      { clientId: "client", filename, from: "garyhub2026@outlook.com",
        fetchImpl: () => { throw new Error("should not reach network"); } }), /不匹配/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
