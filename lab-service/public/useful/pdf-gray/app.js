import * as pdfjs from '../vendor/pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdf.worker.mjs',import.meta.url).href;
const $=id=>document.getElementById(id);let file=null,busy=false,cancelled=false,task=null,renderTask=null;
const status=(s,values)=>ToolUI.text('pdf-status',s,values);
const tick=()=>new Promise(r=>setTimeout(r,0));
function check(){if(cancelled)throw Error('已取消处理，原文件保持不变。');}
function controls(){for(const id of ['pdf-file','pdf-mode','pdf-level','pdf-dpi'])$(id).disabled=busy;for(const id of ['pdf-preview','pdf-convert'])$(id).disabled=busy||!file;$('pdf-cancel').hidden=!busy;$('pdf-progress').hidden=!busy;}
function choose(f){if(busy||!f)return;if(!/\.pdf$/i.test(f.name)||f.size>20*1024*1024){status('请选择不超过 20 MB 的 PDF。');return;}file=f;ToolUI.text('pdf-info','{name} · {size} MB',{name:f.name,size:(f.size/1024/1024).toFixed(2)});for(const id of ['pdf-original','pdf-result']){$(id).width=1;$(id).height=1;}status('文件已选择。可先预览第一页。');controls();}
$('pdf-file').onchange=e=>choose(e.target.files[0]);document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',e=>{e.preventDefault();choose(e.dataTransfer.files[0]);});
$('pdf-level').oninput=()=>{$('pdf-level-value').value=$('pdf-level').value;};
$('pdf-cancel').onclick=()=>{cancelled=true;renderTask?.cancel();status('正在取消…');};
async function recolor(canvas,level,mode){
  const ctx=canvas.getContext('2d',{willReadFrequently:true}),data=ctx.getImageData(0,0,canvas.width,canvas.height),a=data.data;
  const base=mode==='neutral'?[level,level,level]:[Math.max(0,level-14),Math.max(0,level-7),Math.min(255,level+22)];
  const tables=base.map(start=>Uint8Array.from({length:256},(_,i)=>start+Math.floor((255-start)*i/255)));
  const chunk=canvas.width*128*4;
  for(let start=0;start<a.length;start+=chunk){check();const end=Math.min(start+chunk,a.length);for(let i=start;i<end;i+=4){const v=Math.round((299*a[i]+587*a[i+1]+114*a[i+2])/1000);for(let c=0;c<3;c++)a[i+c]=tables[c][v];a[i+3]=255;}await tick();}
  ctx.putImageData(data,0,0);
}
function show(id,canvas){const target=$(id);const scale=Math.min(1,1000/canvas.width);target.width=Math.max(1,Math.round(canvas.width*scale));target.height=Math.max(1,Math.round(canvas.height*scale));target.getContext('2d').drawImage(canvas,0,0,target.width,target.height);}
async function process(download){
  if(busy||!file)return;busy=true;cancelled=false;controls();$('pdf-progress').value=0;let doc,canvas;
  try{
    status('正在读取 PDF…');
    task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,cMapUrl:new URL('../vendor/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('../vendor/standard_fonts/',import.meta.url).href,wasmUrl:new URL('../vendor/wasm/',import.meta.url).href});
    task.onPassword=()=>{task.destroy();};doc=await task.promise;check();
    if(doc.numPages>100)throw Error('最多支持 100 页，请拆分文件后转换。');
    const dpi=Number($('pdf-dpi').value),level=Number($('pdf-level').value),mode=$('pdf-mode').value;
    const count=download?doc.numPages:1,output=download?await PDFLib.PDFDocument.create():null;let pixels=0;
    for(let i=1;i<=count;i++){
      check();status(download?'正在转换：{page}/{count} 页…':'正在预览：{page}/{count} 页…',{page:i,count});
      const page=await doc.getPage(i),viewport=page.getViewport({scale:dpi/72}),size=page.getViewport({scale:1});
      const width=Math.ceil(viewport.width),height=Math.ceil(viewport.height);pixels+=width*height;
      if(width*height>12500000||pixels>150000000)throw Error('文件在当前清晰度下过大，请降低 DPI 或拆分 PDF。');
      canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,background:'rgb(255,255,255)'});await renderTask.promise;renderTask=null;check();
      if(i===1)show('pdf-original',canvas);
      await recolor(canvas,level,mode);if(i===1)show('pdf-result',canvas);
      if(output){const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));if(!blob)throw Error('页面导出失败');check();const image=await output.embedPng(await blob.arrayBuffer());const out=output.addPage([size.width,size.height]);out.drawImage(image,{x:0,y:0,width:size.width,height:size.height});}
      canvas.width=canvas.height=0;page.cleanup();$('pdf-progress').value=100*i/count;await tick();
    }
    check();if(output){status('正在生成 PDF…');const bytes=await output.save();check();const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));const a=document.createElement('a');a.href=url;a.download=file.name.replace(/\.pdf$/i,'')+(GaryHubI18n.language==='en'?'_light-gray.pdf':'_浅灰.pdf');a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status('转换完成：{count} 页，已开始下载。',{count});}else status('预览完成。调整参数后可再次预览，或转换全部页面。');
  }catch(e){status(cancelled?'已取消处理，原文件保持不变。':e.name==='PasswordException'||e.message?.includes('destroyed')?'此 PDF 受密码保护，请先解锁后再转换。':'处理失败：'+e.message);}
  finally{if(canvas)canvas.width=canvas.height=0;try{await task?.destroy();}catch{}task=null;renderTask=null;busy=false;controls();}
}
$('pdf-preview').onclick=()=>process(false);$('pdf-convert').onclick=()=>process(true);controls();
