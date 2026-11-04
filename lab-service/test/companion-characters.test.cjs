'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const rigs = require('../public/companion/characters.js');
const voices = require('../public/companion/voices.js');
const dir = path.join(__dirname, '../public/companion');
const unsafe = /<script|<foreignObject|<image|\son\w+\s*=|href="(?!#)/i;

test('all five characters are offered, each with a voice, a blurb and a thumbnail', () => {
  assert.deepEqual(rigs.roster, ['milu', 'lili', 'pudding', 'pagey', 'navi']);
  assert.ok(rigs.roster.includes(rigs.fallback));
  assert.deepEqual(Object.keys(rigs.characters).sort(), [...voices.ids].sort());
  for (const id of rigs.roster) {
    assert.ok(voices.get(id).blurb.zh && voices.get(id).blurb.en, id);
    assert.ok(fs.statSync(path.join(dir, rigs.characters[id].thumbnail)).size > 0, id);
  }
});

test('guests get Milu, signed-in accounts add Lili, subscribers and admins get every character', () => {
  const guest = null, member = {id:2, role:'user', accountTier:'standard'}, subscriber = {id:3, role:'user', accountTier:'subscriber'}, admin = {id:1, role:'admin'};
  const offered = user => rigs.roster.filter(id => rigs.allowed(id, user));
  assert.deepEqual(offered(guest), ['milu']);
  assert.deepEqual(offered(member), ['milu', 'lili']);
  // Servers without subscription tiers send no accountTier: only admins unlock the subscriber set.
  assert.deepEqual(offered({id:4, role:'user'}), ['milu', 'lili']);
  assert.deepEqual(offered(subscriber), rigs.roster);
  assert.deepEqual(offered(admin), rigs.roster);
  assert.equal(rigs.allowed('unknown', admin), false);
});

for (const id of rigs.roster) test(`${id}: geometry sits inside its view box and its artwork is present and safe`, () => {
  const spec = rigs.characters[id], [vx, vy, vw, vh] = spec.viewBox;
  const inside = ([x, y]) => x >= vx && x <= vx + vw && y >= vy && y <= vy + vh;
  assert.equal(vw, vh, 'square pet box');
  assert.ok(inside(spec.ring) && inside(spec.feet) && inside(spec.bounds.slice(0, 2)) && inside(spec.bounds.slice(2)));
  if (spec.kind === 'rig') {
    assert.deepEqual(Object.keys(spec.limits).sort(), Object.keys(spec.pivots).sort());
    for (const part of Object.keys(spec.pivots)) assert.ok(inside(spec.pivots[part]) && spec.limits[part] > 0 && spec.limits[part] <= 10, part);
    const svg = fs.readFileSync(path.join(dir, spec.rig), 'utf8');
    assert.doesNotMatch(svg, unsafe);
    for (const part of ['actor', ...Object.keys(spec.pivots), ...Object.values(spec.eyes), ...Object.values(spec.mouth)])
      assert.match(svg, new RegExp(`id="${part}"`), `${id} rig is missing #${part}`);
    return;
  }
  assert.equal(spec.kind, 'frames');
  // The engine needs these five; wave/curious/decline (reactions) and touchdown/squash/rise (landing) are optional.
  for (const name of ['idle', 'held', 'fall', 'parachute', 'land']) assert.ok(spec.frames[name], `${id} needs ${name}`);
  for (const [name, [file, , , w, h]] of Object.entries(spec.frames)) {
    assert.ok(w > 0 && h > 0, `${id}/${name} size`);
    const bytes = fs.readFileSync(path.join(dir, file));
    if (file.endsWith('.svg')) assert.doesNotMatch(bytes.toString('utf8'), unsafe, `${id}/${name}`);
    else assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', `${id}/${name}`);
  }
});
