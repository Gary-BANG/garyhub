#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { readCredentials, saveCredentials, SCOPE } = require("../graph-mailer");

const BASE = "https://login.microsoftonline.com/consumers/oauth2/v2.0";
const args = process.argv.slice(2);
function option(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const clientId = option("--client-id");
const account = option("--account");
const filename = option("--token-file");
if (!clientId || !account || !filename || !/^[0-9a-f-]{36}$/i.test(clientId) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account)) {
  console.error("Usage: node scripts/connect-outlook.js --client-id UUID --account email --token-file /app/data/outlook-token.json");
  process.exit(2);
}
if (fs.existsSync(filename)) {
  try { readCredentials(filename, account); } catch (error) { console.error(error.message); process.exit(2); }
  console.error("An Outlook authorization file already exists. Do not overwrite it.");
  process.exit(2);
}

async function post(endpoint, params) {
  const response = await fetch(`${BASE}/${endpoint}`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params), signal: AbortSignal.timeout(15_000)
  });
  return { ok: response.ok, value: await response.json() };
}

async function main() {
  const start = await post("devicecode", { client_id: clientId, scope: SCOPE });
  if (!start.ok) throw new Error(`Microsoft device authorization failed: ${start.value.error}`);
  const { device_code, user_code, verification_uri, expires_in } = start.value;
  if (!device_code || !user_code || !verification_uri) throw new Error("Incomplete device authorization response");
  console.log(`Open ${verification_uri} and enter code ${user_code}`);
  console.log(`Sign in as ${account}; the code expires in about ${Math.ceil(expires_in / 60)} minutes.`);
  const end = Date.now() + expires_in * 1000;
  let interval = Math.max(5, Number(start.value.interval) || 5);
  while (Date.now() < end) {
    await new Promise(resolve => setTimeout(resolve, interval * 1000));
    const reply = await post("token", {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: clientId, device_code
    });
    if (!reply.ok) {
      if (reply.value.error === "authorization_pending") continue;
      if (reply.value.error === "slow_down") { interval += 5; continue; }
      throw new Error(`Microsoft authorization failed: ${reply.value.error}`);
    }
    const token = reply.value;
    if (!token.access_token || !token.refresh_token) throw new Error("Microsoft did not issue a refresh token");
    // Confirm the Microsoft account before storing any credential.
    const identity = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(15_000)
    });
    if (!identity.ok) throw new Error(`Microsoft account check failed: HTTP ${identity.status}`);
    const profile = await identity.json();
    const addresses = [profile.mail, profile.userPrincipalName].filter(Boolean)
      .map(value => value.toLowerCase());
    if (!addresses.includes(account.toLowerCase())) {
      throw new Error("Signed-in Microsoft account does not match the requested sender");
    }
    fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    saveCredentials(filename, {
      account, access_token: token.access_token, refresh_token: token.refresh_token,
      expires_at: Date.now() + (Number(token.expires_in) || 3600) * 1000
    });
    console.log(`Outlook authorization saved for ${account}. Token values were not printed.`);
    return;
  }
  throw new Error("Microsoft device authorization expired");
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
