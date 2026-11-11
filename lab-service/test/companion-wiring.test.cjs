'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const repo = path.join(__dirname, '../..');
const lab = path.join(repo, 'lab-service/public'), calendar = path.join(repo, 'calendar-app/public');
const files = dir => fs.readdirSync(dir, {recursive:true}).filter(name => fs.statSync(path.join(dir, name)).isFile()).map(name => name.split(path.sep).join('/')).sort();
const read = file => fs.readFileSync(file, 'utf8');

test('both services ship the same companion bundle and tool catalogue', () => {
  const bundle = files(path.join(lab, 'companion'));
  assert.deepEqual(files(path.join(calendar, 'companion')), bundle);
  for (const name of bundle) assert.equal(read(path.join(calendar, 'companion', name)), read(path.join(lab, 'companion', name)), name);
  assert.equal(read(path.join(calendar, 'tools-catalog.js')), read(path.join(lab, 'tools-catalog.js')));
});

test('pages load the companion once, with one asset version and the intended default', () => {
  const pages = {
    [path.join(lab, 'homepage.html')]:'open', [path.join(lab, 'developer/index.html')]:'quiet', [path.join(lab, 'index.html')]:'open', [path.join(lab, 'lab/index.html')]:'quiet', [path.join(lab, 'academic/index.html')]:'quiet',
    ...Object.fromEntries(['index.html', 'health-records/index.html', 'journal/index.html', 'ledger/index.html', 'ledger/fixed/index.html', 'todos/index.html', 'research/index.html', 'music/index.html'].map(page => [path.join(calendar, page), 'quiet']))
  };
  const versions = new Set();
  for (const [page, scope] of Object.entries(pages)) {
    const tags = [...read(page).matchAll(/<script src="\/companion\/boot\.js\?v=([\w.-]+)" defer data-companion="(\w+)"><\/script>/g)];
    assert.equal(tags.length, 1, page);
    assert.equal(tags[0][2], scope, page);
    versions.add(tags[0][1]);
  }
  assert.equal(versions.size, 1);
  // Sign-in pages and standalone apps stay untouched.
  for (const page of ['login/index.html', 'register/index.html', 'change-password/index.html', 'reading/index.html'])
    assert.doesNotMatch(read(path.join(calendar, page)), /companion\/boot\.js/, page);
});
