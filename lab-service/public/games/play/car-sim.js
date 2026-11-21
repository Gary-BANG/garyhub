/* GaryHub Games (v2.4.3.1): "合作小车 / Co-op Car" — tracks and car physics shared by the server and the page.
   Calendar runs it (play-car.js) as the only authority; the page loads a byte-identical copy (games/play/car-sim.js) to
   draw the same track and to read hazards ahead. Units are metres and seconds; x grows to the right and y downwards;
   heading 0 points along +x and grows clockwise, so a positive steer turns right. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CarSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var STEP = 1 / 60, SAMPLE = 2, CAR_RADIUS = 1.1, AIR_TIME = 0.95, GRASS = 5;
  var MAX_SPEED = 22, BOOST_SPEED = 30, ACCEL = 6.5, BOOST_ACCEL = 11, BRAKE = 18, COAST = 2, GRASS_SPEED = 7;
  var WHEELBASE = 2.8, STEER_MAX = 0.55;

  // Each level: road segments (length, total turn in degrees), then everything placed along the road by distance s
  // and sideways offset d (positive = right of the direction of travel).
  var LEVELS = [
    {id: 1, name: ['直道起步', 'First drive'], width: 18, time: 75, par: 36,
      segments: [[70, 0], [60, 45], [50, 0], [60, -45], [60, 0], [90, 90], [70, 0]],
      cones: [[150, -3], [245, 4], [330, 0]], boosts: [[40, 0]], checkpoints: [160, 320], finish: 450,
      coins: [[30, 0], [55, -4], [80, 4], [105, 0], [130, -4], [175, 4], [200, 0], [225, -4], [270, 4], [295, 0], [350, -4], [375, 4], [400, 0], [425, -4]]},
    {id: 2, name: ['S 弯与锥桶', 'S bends and cones'], width: 14, time: 80, par: 37,
      segments: [[50, 0], [50, 70], [90, -140], [50, 70], [80, 0], [60, 90], [60, 0]],
      cones: [[110, 2], [165, -2], [250, -3.5], [266, 3.5], [282, -3.5], [298, 3.5], [314, -3.5]], boosts: [[385, 0]], checkpoints: [150, 330], finish: 430,
      coins: [[30, 0], [70, 3], [95, -3], [130, 0], [185, 3], [215, -3], [240, 0], [258, 3], [284, -3], [310, 3], [345, 0], [370, -3], [400, 0], [420, 3]]},
    {id: 3, name: ['窄桥与跳台', 'Bridge and jump'], width: 14, time: 100, par: 47,
      segments: [[120, 0], [60, -60], [110, 0], [40, 0], [70, 100], [60, 0]],
      bridges: [[60, 115, 6, 10]], ramps: [[255, 16, 269]], oils: [[330, 360]],
      cones: [[150, 3], [205, -3], [395, 2]], boosts: [[215, 0]], checkpoints: [125, 280, 380], finish: 450,
      coins: [[30, 0], [50, 4], [75, 0], [95, 0], [140, -3], [170, 3], [230, 0], [262, 0], [300, -3], [345, 0], [375, 3], [420, 0], [440, -3]]}
  ];

  function level(id) {
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return LEVELS[i];
    return null;
  }

  // The road as points every two metres, with each point's distance along the road, heading and half width.
  function build(id, easy) {
    var lv = level(id);
    if (!lv) return null;
    var wide = easy ? 1.2 : 1, points = [], x = 0, y = 0, h = -Math.PI / 2, s = 0;
    points.push({x: x, y: y, h: h, s: 0});
    for (var k = 0; k < lv.segments.length; k++) {
      var len = lv.segments[k][0], turn = lv.segments[k][1] * Math.PI / 180, n = Math.max(1, Math.round(len / SAMPLE)), ds = len / n, dh = turn / n;
      for (var j = 0; j < n; j++) {
        var mid = h + dh / 2;
        x += Math.cos(mid) * ds; y += Math.sin(mid) * ds; h += dh; s += ds;
        points.push({x: x, y: y, h: h, s: s});
      }
    }
    var track = {id: lv.id, name: lv.name, easy: !!easy, points: points, length: s, half: lv.width * wide / 2, time: lv.time * 1000, par: lv.par * 1000,
      finish: lv.finish, checkpoints: lv.checkpoints.slice(),
      bridges: (lv.bridges || []).map(function (b) { return {from: b[0], to: b[1], half: b[2] * (easy ? 1.25 : 1) / 2, max: b[3] + (easy ? 2 : 0)}; }),
      ramps: (lv.ramps || []).map(function (r) { return {at: r[0], min: r[1] - (easy ? 2 : 0), to: r[2]}; }),
      oils: (lv.oils || []).map(function (o) { return {from: o[0], to: o[1]}; }),
      boosts: (lv.boosts || []).map(function (b) { return {at: b[0], d: b[1]}; }),
      cones: lv.cones.map(function (c) { return {s: c[0], d: c[1] * wide}; }),
      coins: lv.coins.map(function (c) { return {s: c[0], d: c[1] * wide}; })};
    var place = function (item) { var p = pose(track, item.s, item.d); item.x = p.x; item.y = p.y; item.h = p.h; return item; };
    track.cones.forEach(place); track.coins.forEach(place); track.boosts.forEach(function (b) { b.s = b.at; place(b); });
    return track;
  }

  // Position and heading of a point s metres along the road and d metres to its right.
  function pose(track, s, d) {
    var pts = track.points, i = Math.max(0, Math.min(pts.length - 2, Math.floor(s / SAMPLE)));
    while (i < pts.length - 2 && pts[i + 1].s < s) i++;
    while (i > 0 && pts[i].s > s) i--;
    var a = pts[i], b = pts[i + 1], t = Math.max(0, Math.min(1, (s - a.s) / (b.s - a.s || 1)));
    var h = a.h + (b.h - a.h) * t, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
    return {x: x - Math.sin(h) * d, y: y + Math.cos(h) * d, h: h};
  }

  // The nearest point of the road to (x, y), searched around the last known index: distance along it, offset, index.
  function locate(track, x, y, hint) {
    var pts = track.points, best = -1, bestD = Infinity, from = Math.max(0, (hint || 0) - 12), to = Math.min(pts.length - 2, (hint || 0) + 24);
    for (var i = from; i <= to; i++) {
      var a = pts[i], b = pts[i + 1], ex = b.x - a.x, ey = b.y - a.y, len2 = ex * ex + ey * ey;
      var t = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / len2));
      var px = a.x + ex * t, py = a.y + ey * t, dist = (x - px) * (x - px) + (y - py) * (y - py);
      if (dist < bestD) { bestD = dist; best = i; }
    }
    var p = pts[best], q = pts[best + 1], fx = q.x - p.x, fy = q.y - p.y, l = Math.sqrt(fx * fx + fy * fy);
    var along = Math.max(0, Math.min(l, ((x - p.x) * fx + (y - p.y) * fy) / l));
    var side = ((x - p.x) * -fy + (y - p.y) * fx) / l;
    return {i: best, s: p.s + along, d: side};
  }

  function zone(list, s) { for (var i = 0; i < list.length; i++) if (s >= list[i].from && s <= list[i].to) return list[i]; return null; }

  function car(track, s) {
    var p = pose(track, s || 0, 0), at = locate(track, p.x, p.y, Math.floor((s || 0) / SAMPLE));
    return {x: p.x, y: p.y, h: p.h, v: 0, w: 0, s: at.s, d: 0, i: at.i, air: 0, wobble: 0, boost: 0, pad: 0, grass: 0, oil: 0, over: 0};
  }

  // One fixed step. input = {steer: -1..1, gas: 0|1, brake: 0|1}. Returns what happened, in order:
  // ['cone', i] ['coin', i] ['jump'] ['fall', why] ['checkpoint', i] ['finish'].
  function step(track, c, input, hit, got, cp) {
    var dt = STEP, events = [], before = c.s;
    var steer = Math.max(-1, Math.min(1, Number(input.steer) || 0));
    var bridge = zone(track.bridges, c.s), oil = zone(track.oils, c.s);
    c.oil = oil && !c.air ? 1 : 0;
    if (c.air > 0) {
      c.air = Math.max(0, c.air - dt);
    } else {
      var top = c.boost > 0 || c.pad > 0 ? BOOST_SPEED : MAX_SPEED;
      if (input.gas) c.v = Math.min(top, c.v + (c.boost > 0 ? BOOST_ACCEL : ACCEL) * dt);
      else c.v = Math.max(0, c.v - COAST * dt);
      if (input.brake) c.v = Math.max(0, c.v - BRAKE * dt);
      if (c.v > top) c.v = Math.max(top, c.v - BRAKE * dt);
      if (c.grass && c.v > GRASS_SPEED) c.v = Math.max(GRASS_SPEED, c.v - 14 * dt);
      // The wheels follow the steering with a short delay, and turn less the faster the car goes.
      var limit = STEER_MAX / (1 + c.v / 9), target = steer * limit, rate = limit * 4 * dt;
      c.w += Math.max(-rate, Math.min(rate, target - c.w));
      if (Math.abs(c.w) > limit) c.w = Math.sign(c.w) * limit;
      c.h += c.v * Math.tan(c.w) / WHEELBASE * dt * (c.oil ? 0.3 : 1);
    }
    c.boost = Math.max(0, c.boost - dt); c.pad = Math.max(0, c.pad - dt);
    c.x += Math.cos(c.h) * c.v * dt; c.y += Math.sin(c.h) * c.v * dt;
    var at = locate(track, c.x, c.y, c.i);
    c.i = at.i; c.s = at.s; c.d = at.d;
    // Ramps: fast enough and the car flies over the gap; too slow and it drops in.
    for (var r = 0; r < track.ramps.length; r++) {
      var ramp = track.ramps[r];
      // A fast enough car stays in the air until two metres past the gap.
      if (before < ramp.at && c.s >= ramp.at && c.v >= ramp.min && c.air <= 0) { c.air = Math.max(AIR_TIME, (ramp.to + 2 - c.s) / c.v); events.push(['jump']); }
      if (c.s > ramp.at + 1 && c.s < ramp.to && c.air <= 0) { events.push(['fall', 'gap']); return events; }
    }
    if (bridge && c.air <= 0) {
      c.grass = 0;
      if (Math.abs(c.d) > bridge.half) { events.push(['fall', 'bridge']); return events; }
      // Too fast on the narrow bridge: half a second over the limit and the car slides off.
      c.over = c.v > bridge.max ? 1 : 0;
      c.wobble = c.over ? c.wobble + dt : Math.max(0, c.wobble - dt);
      if (c.wobble > 0.5) { events.push(['fall', 'fast']); return events; }
    } else {
      c.over = 0; c.wobble = 0;
      c.grass = Math.abs(c.d) > track.half && c.air <= 0 ? 1 : 0;
      if (Math.abs(c.d) > track.half + GRASS && c.air <= 0) { events.push(['fall', 'edge']); return events; }
    }
    if (c.air <= 0) {
      for (var b = 0; b < track.boosts.length; b++) { var pad = track.boosts[b]; if (Math.abs(c.s - pad.s) < 3 && Math.abs(c.d - pad.d) < 3) { if (c.pad <= 0) c.v = Math.min(BOOST_SPEED, c.v + 6); c.pad = 1; } }
      for (var k = 0; k < track.cones.length; k++) { var cone = track.cones[k]; if (hit.indexOf(k) < 0 && Math.abs(c.s - cone.s) < 1.8 && Math.abs(c.d - cone.d) < 1.5) events.push(['cone', k]); }
    }
    for (var m = 0; m < track.coins.length; m++) { var coin = track.coins[m]; if (got.indexOf(m) < 0 && Math.abs(c.s - coin.s) < 2.4 && Math.abs(c.d - coin.d) < 2.4) events.push(['coin', m]); }
    for (var n = cp + 1; n < track.checkpoints.length; n++) if (c.s >= track.checkpoints[n]) events.push(['checkpoint', n]);
    if (c.s >= track.finish) events.push(['finish']);
    return events;
  }

  // What lies ahead within `range` metres, for the hints on the page.
  function ahead(track, s, range) {
    var out = [];
    track.bridges.forEach(function (b) { if (b.to >= s && b.from - s < range) out.push({kind: 'bridge', at: b.from, max: b.max}); });
    track.ramps.forEach(function (r) { if (r.at >= s && r.at - s < range) out.push({kind: 'ramp', at: r.at, min: r.min}); });
    track.oils.forEach(function (o) { if (o.to >= s && o.from - s < range) out.push({kind: 'oil', at: o.from}); });
    track.cones.forEach(function (c, i) { if (c.s >= s && c.s - s < range) out.push({kind: 'cone', at: c.s, i: i}); });
    var turn = 0, pts = track.points, first = Math.floor(s / SAMPLE);
    for (var i = first; i < pts.length - 1 && pts[i].s - s < range; i++) turn += pts[i + 1].h - pts[i].h;
    if (Math.abs(turn) > Math.PI / 3) out.push({kind: 'bend', at: s, dir: turn > 0 ? 1 : -1});
    return out.sort(function (a, b) { return a.at - b.at; });
  }

  return {VERSION: 1, STEP: STEP, CAR_RADIUS: CAR_RADIUS, MAX_SPEED: MAX_SPEED, BOOST_SPEED: BOOST_SPEED, LEVELS: LEVELS,
    level: level, build: build, pose: pose, locate: locate, car: car, step: step, ahead: ahead};
});
