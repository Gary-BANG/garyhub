'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'../../../..'),{tools,matches}=require(ROOT+'/lab-service/public/tools-catalog');
test('Tools search finds the dictionary in Chinese and English without hiding existing tools',()=>{
 for(const q of ['科研 词典','Research Dictionary','术语 翻译','prompt'])assert.ok(tools.filter(t=>matches(t,q)).some(t=>t.id==='research'),q);
 for(const q of ['Modern Robotics','PDF 打印','验证码','MD','RSS'])assert.ok(tools.some(t=>matches(t,q)),q);
 assert.equal(new Set(tools.map(t=>t.id)).size,tools.length);
});
test('both capability variants expose a valid dictionary icon and keep TOTP capability',()=>{
 for(const [folder,totp]of [['lab-service/public',true],['scripts/releases/v1.4.1.0/variant-overrides/1.3.4.1/lab-service/public',false]]){
  const html=fs.readFileSync(ROOT+'/'+folder+'/index.html','utf8');assert.ok(html.includes('data-tool="research"'));assert.ok(html.includes('href="https://calendar.garyhub.uk/research/"'));assert.ok(html.includes('id="tool-research"'));assert.equal(html.includes('href="/totp/"'),totp);
 }
});
