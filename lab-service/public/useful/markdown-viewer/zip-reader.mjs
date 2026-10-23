/* Standard ZIP (stored/DEFLATE), read in memory. No filesystem or network access.
 * Format: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
 * DEFLATE: https://compression.spec.whatwg.org/#decompression-stream
 */
export const LIMITS = Object.freeze({archive:20*1024*1024, total:50*1024*1024, entry:10*1024*1024, markdown:4*1024*1024, files:500});
const fail = message => { throw new Error(message); };
const damaged = () => fail('ZIP 已损坏或结构不受支持');
const unsafe = () => fail('ZIP 内存在不安全或重复的文件路径');
const unsupported = () => fail('暂不支持加密、多卷或 ZIP64 压缩包，请使用普通 ZIP');
const utf8 = new TextDecoder('utf-8', {fatal:true});
const crcTable = Uint32Array.from({length:256}, (_, n) => {
  for(let i=0;i<8;i++) n=n&1?0xedb88320^(n>>>1):n>>>1;
  return n>>>0;
});
export function crc32(bytes) {
  let crc=0xffffffff;
  for(const n of bytes) crc=crcTable[(crc^n)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
export function archivePath(value) {
  if(!value || value.length>1024 || /[\u0000-\u001f\u007f]/.test(value) || /^[\\/]|^[a-z]:/i.test(value)) unsafe();
  const parts=[];
  for(const part of value.replace(/\\/g,'/').split('/')) {
    if(part==='..') unsafe();
    if(part && part!=='.') parts.push(part);
  }
  if(!parts.length) unsafe();
  return parts.join('/');
}
function filename(bytes, flags, extra) {
  // Honour Info-ZIP Unicode paths only when they match the original name CRC.
  const view=new DataView(extra.buffer,extra.byteOffset,extra.byteLength);
  for(let p=0;p<extra.length;) {
    if(p+4>extra.length) damaged();
    const id=view.getUint16(p,true),size=view.getUint16(p+2,true);p+=4;
    if(p+size>extra.length) damaged();
    if(id===1) unsupported();
    if(id===0x7075 && size>=5 && extra[p]===1 && view.getUint32(p+1,true)===crc32(bytes)) {
      try { return utf8.decode(extra.subarray(p+5,p+size)); } catch { damaged(); }
    }
    p+=size;
  }
  try { return utf8.decode(bytes); }
  catch {
    if(flags&0x800) damaged();
    // Common older Chinese ZIP tools use GBK/GB18030 without the UTF-8 flag.
    try { return new TextDecoder('gb18030',{fatal:true}).decode(bytes); } catch { damaged(); }
  }
}
export function isMarkdown(name) { return /\.(md|markdown|txt)$/i.test(name); }
function imageType(bytes) {
  if(bytes.length>=8 && [137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)) return 'image/png';
  if(bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return 'image/jpeg';
  const head=new TextDecoder().decode(bytes.subarray(0,12));
  if(/^GIF8[79]a/.test(head)) return 'image/gif';
  if(head.startsWith('RIFF') && head.slice(8)==='WEBP') return 'image/webp';
  return null;
}
export function relativeImagePath(reference, documentPath) {
  if(!reference || /[\u0000-\u001f\u007f]/.test(reference)) return null;
  let path=reference.trim();
  if(/^[a-z][a-z0-9+.-]*:|^[\\/]/i.test(path)) return null;
  path=path.split(/[?#]/,1)[0];
  try { path=decodeURIComponent(path); } catch { return null; }
  if(/^[a-z][a-z0-9+.-]*:|^[\\/]|[\u0000-\u001f\u007f]/i.test(path)) return null;
  const parts=documentPath.split('/').slice(0,-1);
  for(const part of path.replace(/\\/g,'/').split('/')) {
    if(!part || part==='.') continue;
    if(part==='..') { if(!parts.length) return null; parts.pop(); }
    else parts.push(part);
  }
  return parts.join('/');
}
async function expand(bytes, method, expected) {
  if(method===0) return bytes.slice();
  let decompressor;
  try { decompressor=new DecompressionStream('deflate-raw'); }
  catch { fail('当前浏览器不支持 ZIP 解压，请使用新版 Chrome、Edge、Firefox 或 Safari'); }
  const reader=new Blob([bytes]).stream().pipeThrough(decompressor).getReader();
  const chunks=[];let length=0;
  try {
    for(;;) {
      const {value,done}=await reader.read();
      if(done) break;
      length+=value.length;
      if(length>expected || length>LIMITS.entry) {
        await reader.cancel();
        fail('ZIP 文件校验失败，请重新打包');
      }
      chunks.push(value);
    }
  } catch(error) {
    if(error.message==='ZIP 文件校验失败，请重新打包') throw error;
    damaged();
  } finally { reader.releaseLock(); }
  const output=new Uint8Array(length);let pos=0;
  for(const chunk of chunks) { output.set(chunk,pos);pos+=chunk.length; }
  return output;
}
export function decodeMarkdown(bytes) {
  if(bytes.length>LIMITS.markdown) fail('文件过大，Markdown 最多支持 4 MB');
  try { return utf8.decode(bytes).replace(/^\uFEFF/,''); }
  catch { fail('文档不是有效的 UTF-8 文本，请另存为 UTF-8'); }
}
export async function readZip(input) {
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  if(bytes.length>LIMITS.archive) fail('ZIP 文件最多支持 20 MB');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let end=-1;
  for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--) {
    if(v.getUint32(p,true)===0x06054b50 && p+22+v.getUint16(p+20,true)===bytes.length) {end=p;break;}
  }
  if(end<0) damaged();
  const count=v.getUint16(end+10,true),size=v.getUint32(end+12,true),offset=v.getUint32(end+16,true);
  if(v.getUint16(end+4,true) || v.getUint16(end+6,true) || count!==v.getUint16(end+8,true) || count===65535 || size===0xffffffff || offset===0xffffffff) unsupported();
  if(count>LIMITS.files) fail('ZIP 内文件数量超过 500 个');
  if(offset+size!==end) damaged();
  let pos=offset,total=0;const entries=[],names=new Set(),ranges=[];
  for(let i=0;i<count;i++) {
    if(pos+46>end || v.getUint32(pos,true)!==0x02014b50) damaged();
    const flags=v.getUint16(pos+8,true),method=v.getUint16(pos+10,true),crc=v.getUint32(pos+16,true);
    const compressed=v.getUint32(pos+20,true),original=v.getUint32(pos+24,true);
    const nameSize=v.getUint16(pos+28,true),extraSize=v.getUint16(pos+30,true),commentSize=v.getUint16(pos+32,true);
    const local=v.getUint32(pos+42,true),stop=pos+46+nameSize+extraSize+commentSize;
    if(stop>end || !nameSize) damaged();
    if(flags&0x2041 || v.getUint16(pos+34,true) || original===0xffffffff || compressed===0xffffffff || local===0xffffffff) unsupported();
    if(method!==0 && method!==8) fail('ZIP 使用了不支持的压缩方式，请使用标准 ZIP');
    const rawName=bytes.subarray(pos+46,pos+46+nameSize);
    const name=filename(rawName,flags,bytes.subarray(pos+46+nameSize,pos+46+nameSize+extraSize));
    const path=archivePath(name),directory=/[\\/]$/.test(name);
    if(names.has(path)) unsafe();
    names.add(path);
    if(((v.getUint32(pos+38,true)>>>16)&0xf000)===0xa000) unsafe();
    total+=original;
    if(original>LIMITS.entry || isMarkdown(path) && original>LIMITS.markdown) fail('ZIP 内单个文件不能超过 10 MB，Markdown 不能超过 4 MB');
    if(total>LIMITS.total) fail('ZIP 解压后总大小不能超过 50 MB');
    if(local+30>offset || v.getUint32(local,true)!==0x04034b50) damaged();
    const localNameSize=v.getUint16(local+26,true),start=local+30+localNameSize+v.getUint16(local+28,true);
    if(start+compressed>offset || v.getUint16(local+6,true)!==flags || v.getUint16(local+8,true)!==method || localNameSize!==nameSize) damaged();
    if(!rawName.every((b,j)=>bytes[local+30+j]===b)) damaged();
    if(!(flags&8) && (v.getUint32(local+14,true)!==crc || v.getUint32(local+18,true)!==compressed || v.getUint32(local+22,true)!==original)) damaged();
    ranges.push([local,start+compressed]);
    entries.push({path,directory,method,crc,original,start,compressed});pos=stop;
  }
  if(pos!==end) damaged();
  ranges.sort((a,b)=>a[0]-b[0]);
  if(ranges.some((range,i)=>i && range[0]<ranges[i-1][1])) damaged();
  const documents=new Map(),images=new Map();
  for(const e of entries) {
    if(e.directory || e.path.startsWith('__MACOSX/') || e.path.split('/').some(p=>p.startsWith('._'))) continue;
    if(!isMarkdown(e.path) && !/\.(png|jpe?g|gif|webp)$/i.test(e.path)) continue;
    const data=await expand(bytes.subarray(e.start,e.start+e.compressed),e.method,e.original);
    if(data.length!==e.original || crc32(data)!==e.crc) fail('ZIP 文件校验失败，请重新打包');
    if(isMarkdown(e.path)) documents.set(e.path,decodeMarkdown(data));
    else { const type=imageType(data); if(type) images.set(e.path,{bytes:data,type}); }
  }
  if(!documents.size) fail('ZIP 内没有 Markdown 文档');
  return {documents,images};
}
