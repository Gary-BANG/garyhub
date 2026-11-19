'use strict';
// Notification channels (v2.4.1.6): which of in-app, push and e-mail each kind of notice uses, and the push quiet
// hours, read from the account preferences. A choice the account never made keeps what that kind did before v2.4.1.6:
// release notes in-app only, task reminders by push and e-mail, price alerts in-app and by push.
const mailer = require('./mailer');
const {parse} = require('./preferences-api');
const {localParts} = require('./reminder-utils');

const DEFAULTS = {
  updates: {inApp: true, push: false, email: false},
  reminders: {inApp: false, push: true, email: true},
  alerts: {inApp: true, push: true, email: false}
};
const KINDS = Object.keys(DEFAULTS), CHANNELS = ['inApp', 'push', 'email'];

function fromPrefs(prefs, timezone) {
  const out = {timezone: timezone || 'Etc/UTC'};
  for (const kind of KINDS) {
    out[kind] = {};
    for (const channel of CHANNELS) {
      const value = prefs?.['notify.' + kind + '.' + channel];
      out[kind][channel] = typeof value === 'boolean' ? value : DEFAULTS[kind][channel];
    }
  }
  // Release notes always reach every account's in-app inbox (docs/RELEASE_POLICY.md).
  out.updates.inApp = true;
  const from = prefs?.['push.quietFrom'], to = prefs?.['push.quietTo'];
  out.quiet = from && to && from !== to ? {from, to} : null;
  return out;
}
async function channels(db, userId) {
  const row = await db.get('SELECT p.prefs,u.timezone FROM users u LEFT JOIN user_preferences p ON p.user_id=u.id WHERE u.id=?', [userId]);
  return fromPrefs(parse(row?.prefs), row?.timezone);
}
// Quiet hours run from "from" up to (not including) "to" in the account's time zone, across midnight when from > to.
function quiet(settings, now = new Date()) {
  if (!settings?.quiet) return false;
  let time;
  try { time = localParts(now, settings.timezone).time; } catch { time = localParts(now, 'Etc/UTC').time; }
  const {from, to} = settings.quiet;
  return from < to ? time >= from && time < to : time >= from || time < to;
}
// Best effort: only to a verified address, only when mail is configured, and a failure never stops the caller.
async function email(db, userId, message, mail = mailer) {
  try {
    if (mail.mode() === 'disabled') return false;
    const user = await db.get('SELECT email FROM users WHERE id=? AND enabled=1 AND email IS NOT NULL AND email_verified_at IS NOT NULL', [userId]);
    if (!user) return false;
    await mail.sendMail({to: user.email, subject: String(message.subject).slice(0, 200), text: String(message.text)});
    return true;
  } catch (error) {
    console.error('Notification e-mail failed:', error.code || error.name || 'error');
    return false;
  }
}

module.exports = {DEFAULTS, KINDS, CHANNELS, fromPrefs, channels, quiet, email};
