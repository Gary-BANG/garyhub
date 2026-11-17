'use strict';
// v2.4.1.3 additions are wired from this one module, so app.js (and its no-TOTP variant) only gains three lines.
const today = require('./today-api');
const feed = require('./calendar-feed');
const push = require('./push-api');
const alerts = require('./stock-alerts');

let pusher = null;
function registerExtras(app, {db, requireLogin}) {
  today.register(app, {db, requireLogin});
  feed.register(app, {db, requireLogin});
  pusher = push.register(app, {db, requireLogin});
  alerts.register(app, {db});
}
// Runs after the earlier migrations; the minute timers only start once their tables exist.
async function migrateExtras(db) {
  await feed.migrate(db);
  await push.migrate(db);
  await alerts.migrate(db);
  if (pusher) {
    push.start(db, pusher);
    alerts.start(db, pusher.notify);
  }
}
module.exports = {registerExtras, migrateExtras};
