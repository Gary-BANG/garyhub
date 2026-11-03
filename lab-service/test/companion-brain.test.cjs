'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const brain = require('../public/companion/brain.js');
const knowledge = require('../public/companion/knowledge.js');
const voices = require('../public/companion/voices.js');
const {single, flows} = require('./companion-cases.cjs');

// One check shared by single messages and conversation steps.
function check(result, expected, previous) {
  const want = typeof expected === 'string' ? {kind:'recommend', only:expected} : expected;
  assert.equal(result.kind, want.kind);
  if (want.only) assert.deepEqual(result.tools, [want.only]);
  if (want.includes) assert.ok(result.tools.includes(want.includes), `expected ${want.includes} in ${result.tools}`);
  if (want.excludes) assert.ok(!result.tools.includes(want.excludes), `did not expect ${want.excludes}`);
  if (want.lang) assert.equal(result.lang, want.lang);
  if (want.from) assert.deepEqual(result.tools, [previous.memory[want.from][want.index]]);
}

for (const [message, expected, context = {}] of single)
  test(`reply: ${message || '(empty)'}${context.user ? ' as ' + (context.user.role === 'admin' ? 'admin' : context.user.accountTier) : ''}`, () => check(brain.reply(message, context), expected));

for (const flow of flows) test(`conversation: ${flow.name}`, () => {
  let memory = {}, previous = null;
  for (const [message, expected] of flow.steps) {
    const result = brain.reply(message, {memory});
    check(result, expected, previous);
    previous = result; memory = result.memory;
  }
});

test('restricted destinations never appear for guests, whatever is asked', () => {
  const hidden = knowledge.entries.filter(entry => !knowledge.permitted(entry, null)).map(entry => entry.id);
  for (const entry of knowledge.entries) for (const phrase of [...entry.phrases.zh, ...entry.phrases.en]) {
    const {tools} = brain.reply(phrase);
    assert.ok(!tools.some(id => hidden.includes(id)), `${phrase} leaked ${tools}`);
  }
});

test('every destination is a GaryHub https link and every phrase reaches its own entry', () => {
  for (const entry of knowledge.entries) {
    const url = new URL(entry.url);
    assert.equal(url.protocol, 'https:');
    assert.ok(url.hostname === 'garyhub.uk' || url.hostname.endsWith('.garyhub.uk'), entry.url);
    assert.ok(entry.howto.zh && entry.howto.en && entry.name.zh && entry.name.en, entry.id);
    for (const phrase of [...entry.phrases.zh, ...entry.phrases.en]) {
      const {tools} = brain.reply(phrase, {user:{role:'admin'}});
      assert.ok(tools.includes(entry.id) || tools.some(id => knowledge.byId.get(id)?.parent === entry.id), `${phrase} → ${tools} (expected ${entry.id})`);
    }
  }
});

test('all five characters cover every line in both languages', () => {
  assert.deepEqual(voices.ids, ['milu', 'pudding', 'lili', 'pagey', 'navi']);
  const keys = Object.keys(voices.characters.milu.zh);
  for (const id of voices.ids) for (const lang of ['zh', 'en']) assert.deepEqual(Object.keys(voices.characters[id][lang]).sort(), [...keys].sort(), `${id}/${lang}`);
  assert.equal(voices.line('pagey', 'en', 'howto', {tool:'PDF Light Gray'}), 'PDF Light Gray: instructions');
  assert.equal(voices.get('unknown').name.zh, '米露');
});
