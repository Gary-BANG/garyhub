'use strict';
// v2.4.1.3 additions are wired from this one module, so app.js (and its no-TOTP variant) only gains three lines.
// v2.4.1.6 adds the notification centre (notify-api.js) here as well; v2.4.2.0 the games (games-api.js); v2.4.3.0 the
// live game rooms (play-rooms.js), whose WebSocket needs the HTTP server (attachExtras).
const today = require('./today-api');
const feed = require('./calendar-feed');
const push = require('./push-api');
const alerts = require('./stock-alerts');
const preferences = require('./preferences-api');
const notify = require('./notify-api');
const games = require('./games-api');
const play = require('./play-rooms');

let pusher = null;
function registerExtras(app, {db, requireLogin}) {
  today.register(app, {db, requireLogin, dataDir: db.dataDir});
  feed.register(app, {db, requireLogin});
  pusher = push.register(app, {db, requireLogin});
  alerts.register(app, {db});
  preferences.register(app, {db, requireLogin});
  notify.register(app, {db, requireLogin});
  games.register(app, {db, requireLogin, pusher});
  play.register(app, {db, requireLogin, pusher});
}
// Runs after the earlier migrations; the minute timers only start once their tables exist.
async function migrateExtras(db) {
  await feed.migrate(db);
  await push.migrate(db);
  await alerts.migrate(db);
  await preferences.migrate(db);
  await notify.migrate(db);
  await games.migrate(db);
  await play.migrate(db);
  if (pusher) {
    push.start(db, pusher);
    alerts.start(db, pusher.notify);
    notify.start(db, pusher);
    games.start(db);
    play.start(db);
  }
}
// Game-room WebSockets arrive as HTTP upgrades on the server itself, not through Express routing.
function attachExtras(app, server) {
  play.attach(app, server);
}
module.exports = {registerExtras, migrateExtras, attachExtras};
