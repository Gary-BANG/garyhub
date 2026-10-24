'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../../..');
const {tools,matches,normalize}=require(root+'/lab-service/public/tools-catalog.js');
test('search accepts Chinese, English, aliases, full-width text and independent terms',()=>{
  const find=query=>tools.filter(tool=>matches(tool,query)).map(tool=>tool.id);
  for(const [query,id] of [['验证码','totp'],['2FA','totp'],[' gPa ','grades'],['ＭＤ','markdown'],['modern robotics','lab'],['pdf 打印','pdf'],['去水印','eraser'],['讲义','study'],['rss','reading']])assert.ok(find(query).includes(id),query);
  assert.equal(find('不存在的工具').length,0);assert.equal(find('<img src=x onerror=alert(1)>').length,0);
  assert.equal(find('  ').length,12);assert.deepEqual(find('GPA pdf'),[]);assert.equal(normalize(null),'');
});
test('catalog has complete bilingual copy and each shipped link keeps its original route',()=>{
  assert.equal(new Set(tools.map(t=>t.id)).size,12);
  for(const tool of tools)for(const field of ['name','short','description'])for(const lang of ['zh','en'])assert.ok(tool[field][lang].length>0);
  const html=fs.readFileSync(root+'/lab-service/public/index.html','utf8');
  const expected={grades:'/grades/',study:'/study/',lab:'https://lab.garyhub.uk/lab/',calendar:'https://calendar.garyhub.uk',files:'https://files.garyhub.uk',reading:'https://rss.garyhub.uk',status:'https://kuma.garyhub.uk',access:'https://lab.garyhub.uk/access/',totp:'/totp/',eraser:'/useful/image-eraser/',markdown:'/useful/markdown-viewer/',pdf:'/useful/pdf-gray/'};
  for(const [id,url]of Object.entries(expected)){
    assert.ok(html.includes(`<li data-tool="${id}"><a class="tool-link" href="${url}">`),id);
    assert.ok(html.includes(`id="tool-${id}"`)&&html.includes(`href="#tool-${id}"`));
  }
  const variant=fs.readFileSync(root+'/scripts/releases/v1.4.0.0/variant-overrides/1.3.4.1/lab-service/public/index.html','utf8');
  assert.equal(variant.includes('href="/totp/"'),false);assert.equal((variant.match(/<li data-tool=/g)||[]).length,11);
});
