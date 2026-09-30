"use strict";

const { randomUUID } = require("crypto");
const database = require("./db");
const mailer = require("./mailer");
const { dueReminderSlots, localParts } = require("./reminder-utils");

async function runCycle({ db = database, sendMail = mailer.sendMail, now = new Date() } = {}) {
  const tasks = await db.all(`SELECT t.id,t.title,t.start_date,t.end_date,t.status,t.completed_at,
    t.reminder_enabled,u.id AS user_id,u.email,u.timezone,
    r.frequency,r.time_1,r.time_2
    FROM tasks t JOIN users u ON u.id=t.user_id
    JOIN reminder_settings r ON r.task_id=t.id
    WHERE t.reminder_enabled=1 AND t.status<>'done' AND t.completed_at IS NULL
      AND u.email_verified_at IS NOT NULL AND u.email IS NOT NULL AND u.enabled=1`);
  const minute = Math.floor(now.getTime() / 60000) * 60000;
  let created = 0;
  for (const row of tasks) {
    for (let offset = 4; offset >= 0; offset--) {
      const instant = new Date(minute - offset * 60000);
      let local;
      try { local = localParts(instant, row.timezone); } catch { continue; }
      const slots = dueReminderSlots({
        task: { reminderEnabled: true, completedAt: row.completed_at,
          status: row.status, startDate: row.start_date, endDate: row.end_date },
        settings: { frequency: row.frequency, time1: row.time_1, time2: row.time_2 },
        timeZone: row.timezone, now: instant
      });
      for (const time of slots) {
        const result = await db.run(`INSERT OR IGNORE INTO reminder_deliveries
          (id,task_id,user_id,scheduled_for_utc,local_date,local_time,status)
          VALUES(?,?,?,?,?,?,'pending')`,
        [randomUUID(),row.id,row.user_id,instant.toISOString(),local.date,time]);
        if (result.changes) created++;
      }
    }
  }

  const due = await db.all(`SELECT d.*,t.title,u.email FROM reminder_deliveries d
    JOIN tasks t ON t.id=d.task_id AND t.user_id=d.user_id JOIN users u ON u.id=d.user_id
    WHERE d.status IN ('pending','failed') AND d.scheduled_for_utc<=?
      AND (d.next_retry_at IS NULL OR d.next_retry_at<=?) AND d.attempt_count<3
      AND t.reminder_enabled=1 AND t.status<>'done' AND t.completed_at IS NULL
      AND u.email_verified_at IS NOT NULL AND u.enabled=1
    ORDER BY d.scheduled_for_utc,d.id LIMIT 100`, [now.toISOString(),now.toISOString()]);
  let sent = 0;
  for (const delivery of due) {
    const claim = await db.run(`UPDATE reminder_deliveries
      SET status='processing',attempt_count=attempt_count+1,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND status IN ('pending','failed') AND attempt_count<3
        AND (next_retry_at IS NULL OR next_retry_at<=?)`, [delivery.id,now.toISOString()]);
    if (!claim.changes) continue;
    try {
      const active = await db.get(`SELECT t.id,t.note FROM tasks t JOIN users u ON u.id=t.user_id
        WHERE t.id=? AND t.user_id=? AND t.reminder_enabled=1 AND t.status<>'done' AND t.completed_at IS NULL
          AND u.email_verified_at IS NOT NULL AND u.enabled=1`, [delivery.task_id,delivery.user_id]);
      if (!active) {
        await db.run("UPDATE reminder_deliveries SET status='cancelled' WHERE id=?", [delivery.id]);
        continue;
      }
      await sendMail({ to: delivery.email, subject: `Gary Hub 提醒：${delivery.title}`,
        text: `事项：${delivery.title}\n日期：${delivery.local_date}\n提醒时间：${delivery.local_time}\n` +
          (active.note ? `备注：\n${active.note}\n` : "") });
      await db.run(`UPDATE reminder_deliveries SET status='sent',sent_at=?,next_retry_at=NULL,
        last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [new Date().toISOString(),delivery.id]);
      sent++;
    } catch (error) {
      const retry = delivery.attempt_count + 1;
      const nextRetry = retry >= 3 ? null :
        new Date(now.getTime() + Math.pow(4, retry - 1) * 60000).toISOString();
      await db.run(`UPDATE reminder_deliveries SET status='failed',next_retry_at=?,
        last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [nextRetry,String(error.code || "SEND_FAILED").slice(0, 80),delivery.id]);
      console.error("提醒发送失败:", delivery.id, error.code || "SEND_FAILED");
    }
  }
  return { created, sent };
}

async function main() {
  if (mailer.mode() === "disabled") throw new Error("邮件发送未配置，提醒 worker 不会启动");
  await database.initDb();
  const tick = async () => {
    try {
      const result = await runCycle();
      if (result.created || result.sent) console.log("reminder cycle", result);
    } catch (error) { console.error("提醒扫描失败:", error); }
  };
  await tick();
  setInterval(tick, 60_000);
}

if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });
module.exports = { runCycle };
