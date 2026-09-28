"use strict";

function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

function localParts(date, timeZone) {
  if (!isValidTimeZone(timeZone)) throw new Error("Invalid IANA time zone");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = name => parts.find(part => part.type === name).value;
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`
  };
}

function dueReminderSlots({ task, settings, timeZone, now = new Date() }) {
  if (!task.reminderEnabled || task.completedAt || task.status === "done") return [];
  const local = localParts(now, timeZone);
  if (local.date < task.startDate || local.date > task.endDate) return [];

  const times = [settings.time1];
  if (settings.frequency === 2) times.push(settings.time2);
  return times.filter(Boolean).filter(time => time === local.time);
}

module.exports = { dueReminderSlots, isValidTimeZone, localParts };
