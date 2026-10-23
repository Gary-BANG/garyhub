import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readZip,relativeImagePath,archivePath,decodeMarkdown,crc32,LIMITS} from '../public/useful/markdown-viewer/zip-reader.mjs';
const require=createRequire(import.meta.url);
const {zipSync,strToU8}=require('../public/lab/vendor/fflate.js');
// Node 20 lacks native deflate-raw streams. Browser behavior is checked in
// Chromium; use Node's native zlib stream for this unit-test harness only.
try { new DecompressionStream('deflate-raw'); }
catch {
 const {Duplex}=await import('node:stream'),{createInflateRaw}=await import('node:zlib');
 globalThis.DecompressionStream=class {
  constructor(format){assert.equal(format,'deflate-raw');const pair=Duplex.toWeb(createInflateRaw());this.readable=pair.readable;this.writable=pair.writable;}
 };
}
const md=strToU8('# 中文文档\n\n![图](../图片/a%20b.png)');
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvXcAAAAASUVORK5CYII=','base64'));
const zip=(files,level=6)=>zipSync(files,{level});
function mutate(data,local,central){
 const result=data.slice(),v=new DataView(result.buffer);let p=result.length-22;
 while(v.getUint32(p,true)!==0x06054b50)p--;
 const directory=v.getUint32(p+16,true);local?.(v,0);central?.(v,directory);return result;
}
for(const level of [0,6])test(`ZIP method ${level?'DEFLATE':'stored'}: nested Chinese names, image bytes and multiple documents`,async()=>{
 const result=await readZip(zip({'project/docs/说明.md':md,'project/图片/a b.png':png,'README.md':strToU8('main')},level));
 assert.equal(result.documents.get('project/docs/说明.md'),new TextDecoder().decode(md));
 assert.deepEqual(result.images.get('project/图片/a b.png').bytes,png);
 assert.equal(result.images.get('project/图片/a b.png').type,'image/png');assert.equal(result.documents.size,2);
});
test('relative references use the selected document directory and decode spaces/Chinese',()=>{
 assert.equal(relativeImagePath('../图片/a%20b.png?x=1#p','project/docs/说明.md'),'project/图片/a b.png');
 assert.equal(relativeImagePath('./图.png','说明.md'),'图.png');
 assert.equal(relativeImagePath('images\\图.png','说明.md'),'images/图.png');
 for(const ref of ['../../escape.png','/etc/x','//tracker/x','https://tracker/x','data:text/html,x','blob:https://example/x','%2f%2ftracker/x','%00bad','javascript:bad'])assert.equal(relativeImagePath(ref,'docs/a.md'),null,ref);
});
test('unsafe archive paths, normalized duplicates and links are rejected',async()=>{
 for(const name of ['../outside.md','/abs.md','C:\\abs.md','bad\u0000.md'])assert.throws(()=>archivePath(name));
 await assert.rejects(readZip(zip({'a.md':md,'./a.md':md})),/不安全或重复/);
 await assert.rejects(readZip(zip({'../a.md':md})),/不安全或重复/);
 const linked=mutate(zip({'a.md':md}),null,(v,p)=>v.setUint32(p+38,0xa1ff0000,true));await assert.rejects(readZip(linked),/不安全/);
});
test('corruption, local/central disagreements and CRC failures are rejected',async()=>{
 await assert.rejects(readZip(new Uint8Array([1,2,3])),/已损坏/);
 const good=zip({'a.md':md},0);
 await assert.rejects(readZip(good.subarray(0,good.length-2)),/已损坏/);
 await assert.rejects(readZip(mutate(good,v=>v.setUint16(8,8,true))),/已损坏/);
 const badCRC=mutate(good,v=>v.setUint32(14,0,true),(v,p)=>v.setUint32(p+16,0,true));await assert.rejects(readZip(badCRC),/校验失败/);
});
test('encryption, split disks, unsupported compression and ZIP64 stop with a useful error',async()=>{
 const good=zip({'a.md':md});
 await assert.rejects(readZip(mutate(good,v=>v.setUint16(6,1,true),(v,p)=>v.setUint16(p+8,1,true))),/加密/);
 await assert.rejects(readZip(mutate(good,null,(v,p)=>v.setUint16(p+10,99,true))),/压缩方式/);
 await assert.rejects(readZip(mutate(good,null,(v,p)=>v.setUint32(p+24,0xffffffff,true))),/ZIP64/);
 const split=good.slice();new DataView(split.buffer).setUint16(split.length-22+4,1,true);await assert.rejects(readZip(split),/多卷/);
});
test('declared and actual expansion limits are both enforced',async()=>{
 await assert.rejects(readZip(new Uint8Array(LIMITS.archive+1)),/20 MB/);
 await assert.rejects(readZip(zip(Object.fromEntries(Array.from({length:501},(_,i)=>[i+'.md',strToU8('a')])))),/500/);
 await assert.rejects(readZip(mutate(zip({'a.md':md}),null,(v,p)=>v.setUint32(p+24,LIMITS.markdown+1,true))),/单个文件/);
 const bomb=zip({'a.md':new Uint8Array(2*1024*1024).fill(97)});
 const forged=mutate(bomb,v=>v.setUint32(22,1,true),(v,p)=>v.setUint32(p+24,1,true));
 await assert.rejects(readZip(forged),/校验失败/);
});
test('no Markdown and executable image formats do not become displayable resources',async()=>{
 await assert.rejects(readZip(zip({'image.png':png})),/没有 Markdown/);
 const result=await readZip(zip({'a.md':md,'bad.png':strToU8('<svg onload="bad()"/>'),'x.svg':strToU8('<svg/>'),'script.js':strToU8('bad()')}));
 assert.equal(result.images.size,0);
});
test('Markdown decoding is bounded, BOM-aware and rejects invalid UTF-8',()=>{
 assert.equal(decodeMarkdown(strToU8('\uFEFF中文')),'中文');
 assert.throws(()=>decodeMarkdown(new Uint8Array([255,254,253])),/UTF-8/);
 assert.throws(()=>decodeMarkdown(new Uint8Array(LIMITS.markdown+1)),/4 MB/);
 assert.equal(crc32(strToU8('123456789')),0xcbf43926);
});
