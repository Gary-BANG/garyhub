'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const rigs = require('../public/companion/characters.js');
const voices = require('../public/companion/voices.js');

test('only finished characters are offered, and every character has a voice', () => {
  assert.deepEqual(rigs.roster, ['milu']);
  assert.ok(rigs.roster.includes(rigs.fallback));
  assert.deepEqual(Object.keys(rigs.characters).sort(), [...voices.ids].sort());
});

for (const id of rigs.roster) test(`${id}: geometry sits inside its view box and every animated part is declared`, () => {
  const spec = rigs.characters[id], [vx, vy, vw, vh] = spec.viewBox;
  const inside = ([x, y]) => x >= vx && x <= vx + vw && y >= vy && y <= vy + vh;
  assert.ok(inside(spec.ring) && inside(spec.feet) && inside(spec.bounds.slice(0, 2)) && inside(spec.bounds.slice(2)));
  assert.deepEqual(Object.keys(spec.limits).sort(), Object.keys(spec.pivots).sort());
  for (const part of Object.keys(spec.pivots)) assert.ok(inside(spec.pivots[part]) && spec.limits[part] > 0 && spec.limits[part] <= 10, part);

  const svg = fs.readFileSync(path.join(__dirname, '../public/companion', spec.rig), 'utf8');
  assert.doesNotMatch(svg, /<script|<foreignObject|<image|\son\w+\s*=|href="(?!#)/i);
  for (const part of ['actor', ...Object.keys(spec.pivots), ...Object.values(spec.eyes), ...Object.values(spec.mouth)])
    assert.match(svg, new RegExp(`id="${part}"`), `${id} rig is missing #${part}`);
  assert.match(svg, new RegExp(`viewBox="${spec.viewBox.join(' ')}"`));
});
