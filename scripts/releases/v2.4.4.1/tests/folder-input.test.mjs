import test from 'node:test';
import assert from 'node:assert/strict';
import {fromFolderInput} from '../../../../lab-service/public/useful/site-navigator/sources.mjs';

const files = paths => paths.map(path => ({name:path.split('/').pop(), webkitRelativePath:path}));

test('directory including its root retains the HTML and its relative assets', async () => {
  const site = await fromFolderInput(files(['ECE_310_题库/章节/index.html', 'ECE_310_题库/图片/a.png']));
  assert.deepEqual(site.entries, ['章节/index.html']);
  assert.equal(site.label, 'ECE_310_题库');
  assert.ok(site.files.has('图片/a.png'));
});

test('root-relative input preserves the complete filenames and nested links', async () => {
  const site = await fromFolderInput(files(['index.html', '章节/第二题.htm', 'assets/font.woff2']));
  assert.deepEqual(site.entries, ['index.html', '章节/第二题.htm']);
  assert.ok(site.files.has('assets/font.woff2'));
});

test('empty selections and missing relative paths get specific recovery instructions', () => {
  assert.throws(() => fromFolderInput([]), /目录为空/);
  assert.throws(() => fromFolderInput([{name:'index.html',webkitRelativePath:''}]), /相对路径.*ZIP/);
});
