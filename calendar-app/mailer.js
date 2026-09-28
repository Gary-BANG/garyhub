"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { sendGraphMail } = require("./graph-mailer");

function mode() {
  if (process.env.MAIL_CAPTURE_DIR) return "capture";
  if (process.env.GRAPH_CLIENT_ID || process.env.GRAPH_TOKEN_FILE ||
      process.env.GRAPH_FROM_EMAIL) {
    if (!process.env.GRAPH_CLIENT_ID || !process.env.GRAPH_TOKEN_FILE ||
        !process.env.GRAPH_FROM_EMAIL) throw new Error("Outlook Graph 发件配置不完整");
    return "graph";
  }
  if (process.env.SMTP_HOST && process.env.SMTP_FROM_EMAIL) return "smtp";
  return "disabled";
}

let transport;
async function sendMail({ to, subject, text }) {
  if (mode() === "disabled") throw new Error("邮件发送未配置");
  if (mode() === "capture") {
    const directory = path.resolve(process.env.MAIL_CAPTURE_DIR);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const filename = `${Date.now()}-${crypto.randomUUID()}.json`;
    fs.writeFileSync(path.join(directory, filename), JSON.stringify({ to, subject, text }),
      { encoding: "utf8", flag: "wx", mode: 0o600 });
    return { messageId: filename };
  }
  if (mode() === "graph") return sendGraphMail({ to, subject, text });
  if (!transport) transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    requireTLS: process.env.SMTP_SECURE !== "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
    disableFileAccess: true,
    disableUrlAccess: true
  });
  return transport.sendMail({
    from: { name: process.env.SMTP_FROM_NAME || "Gary Hub", address: process.env.SMTP_FROM_EMAIL },
    to, subject, text
  });
}

module.exports = { mode, sendMail };
