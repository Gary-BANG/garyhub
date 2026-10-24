'use strict';
/* Runs against synthetic local fixtures or internal Docker test containers. */
const assert=require('node:assert/strict');
const LAB=process.env.CHECK_LAB||'http://lab-check:3000';
const version=process.env.CHECK_VERSION||'1.4.0.0';
(async()=>{
  const r=await fetch(LAB+'/');assert.equal(r.status,200);const html=await r.text();
  assert.ok(html.includes('data-tools-release="'+version+'"'));
  for(const marker of ['id="sky"','/hub.js','/hub-account.js','/i18n/i18n.js','id="tool-search"','id="tool-count"','id="detail-copy"','data-view-button="grid"','data-view-button="dock"'])assert.ok(html.includes(marker),marker);
  const ids=[...html.matchAll(/<li data-tool="([a-z]+)">/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length);assert.ok([11,12].includes(ids.length));
  for(const id of ['grades','study','lab','calendar','files','reading','status','access','eraser','markdown','pdf'])assert.ok(ids.includes(id),id);
  for(const route of ['/tools-catalog.js','/tools-dock.js','/tools-dock.css']){
    assert.ok(html.includes(route));const asset=await fetch(LAB+route);assert.equal(asset.status,200);
    assert.match(asset.headers.get('content-type'),route.endsWith('.css')?/text\/css/:/javascript/);assert.ok((await asset.text()).length>100);
  }
  assert.equal((await(await fetch(LAB+'/health')).json()).hubVersion,version);
  assert.equal((await(await fetch(LAB+'/privacy-ledger-release.json')).json()).version,version);
  const source=await(await fetch(LAB+'/tools-catalog.js')).text();assert.ok(source.includes('Modern Robotics')&&source.includes('验证码'));
  console.log('DOCK HTTP PASS: markup, '+ids.length+' direct links, SVG icons, language hooks, asset MIME and release version.');
})().catch(error=>{console.error(error);process.exit(1);});
