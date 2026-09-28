"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const SEND_URL = "https://graph.microsoft.com/v1.0/me/sendMail";
const SCOPE = "https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access";
let refreshing;

function readCredentials(filename, expectedEmail) {
  const file = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (file.account?.toLowerCase() !== expectedEmail.toLowerCase() ||
      !file.refresh_token || !file.access_token || !Number.isFinite(file.expires_at)) {
    throw new Error("Outlook 授权文件无效或发件账号不匹配");
  }
  return file;
}

function saveCredentials(filename, credentials) {
  const temporary = path.join(path.dirname(filename),
    `.${path.basename(filename)}.${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(temporary, JSON.stringify(credentials), { mode: 0o600, flag: "wx" });
  try {
    fs.renameSync(temporary, filename);
    fs.chmodSync(filename, 0o600);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}

async function refreshCredentials({ clientId, filename, expectedEmail, fetchImpl }) {
  const current = readCredentials(filename, expectedEmail);
  if (current.expires_at > Date.now() + 90_000) return current;
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId, grant_type: "refresh_token",
      refresh_token: current.refresh_token, scope: SCOPE
    }),
    signal: AbortSignal.timeout(15_000)
  });
  const result = await response.json();
  if (!response.ok || !result.access_token || !result.refresh_token) {
    throw new Error(`Outlook 授权刷新失败: ${result.error || response.status}`);
  }
  const updated = {
    account: current.account,
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    expires_at: Date.now() + Math.max(1, Number(result.expires_in) || 3600) * 1000
  };
  saveCredentials(filename, updated);
  return updated;
}

async function sendGraphMail({ to, subject, text }, {
  clientId = process.env.GRAPH_CLIENT_ID,
  filename = process.env.GRAPH_TOKEN_FILE,
  from = process.env.GRAPH_FROM_EMAIL,
  fetchImpl = fetch
} = {}) {
  if (!clientId || !filename || !from) throw new Error("Outlook Graph 发件配置不完整");
  if (!refreshing) {
    refreshing = refreshCredentials({ clientId, filename, expectedEmail: from, fetchImpl })
      .finally(() => { refreshing = null; });
  }
  const credentials = await refreshing;
  const response = await fetchImpl(SEND_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${credentials.access_token}`,
      "Content-Type": "application/json" },
    body: JSON.stringify({ message: {
      subject, body: { contentType: "Text", content: text },
      toRecipients: [{ emailAddress: { address: to } }]
    }, saveToSentItems: true }),
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`Outlook Graph 发件失败: HTTP ${response.status}`);
  return { messageId: "graph-accepted" };
}

module.exports = { sendGraphMail, readCredentials, saveCredentials, SCOPE };
