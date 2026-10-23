/* UI copy only. File names, document text and image descriptions are never translated. */
(() => {
  'use strict';
  const translations = {
    '图片局部消除 · GaryHub':'Image Eraser · GaryHub',
    '图片局部消除':'Image Eraser',
    'Markdown 预览器':'Markdown Viewer',
    'Markdown 实时预览':'Live Markdown Preview',
    'Markdown 实时预览 · GaryHub':'Live Markdown Preview · GaryHub',
    'PDF 浅灰转换器 · GaryHub':'PDF Light-Gray Converter · GaryHub',
    'PDF 浅灰转换器':'PDF Light-Gray Converter',
    '涂抹干扰区域，修补并下载图片。':'Paint over unwanted areas, repair and download the image.',
    '文件在本机浏览器处理。':'Files are processed in your browser.',
    '查看文档排版、源码与数学公式。':'Read document layouts, source and equations.',
    '调整深浅与清晰度，准备打印文件。':'Adjust brightness and resolution for printing.',
    '← GaryHub Tools':'← GaryHub Tools',
    '文件在本机处理':'Processed on your device',
    '◐ 日夜主题':'◐ Light / Dark',
    '切换日夜主题':'Switch light / dark theme',
    '实用工具导航':'Useful tools navigation',
    '涂掉干扰，让画面回归干净。':'Remove distractions from your image.',
    '本地处理 · 图片不上传':'Local processing · Images stay on your device',
    '＋ 打开图片':'＋ Open image',
    '也可以拖拽或粘贴图片':'You can also drag or paste an image',
    '01 ／ 标记要消除的区域':'01 / Mark the area to remove',
    '画笔 B':'Brush B', '橡皮 E':'Eraser E', '移动 H':'Pan H',
    '画笔直径':'Brush diameter', '清空标记':'Clear marks',
    '02 ／ 自动修补':'02 / Repair the image',
    '把物体连同边缘涂满，再点击消除。建议一次处理一个小区域。':'Cover the object and its edges, then remove it. Work on one small area at a time.',
    '✦ 消除并修补':'✦ Remove and repair', '取消本次处理':'Cancel processing',
    '撤销':'Undo', '重做':'Redo', '03 ／ 检查与保存':'03 / Review and save',
    '按住查看原图':'Hold to compare', '下载 PNG':'Download PNG',
    '使用说明与效果范围':'Instructions and limitations',
    '滚轮缩放；空格＋拖动平移。Ctrl / ⌘ + Z 撤销笔画或修补，Shift + Z 重做修补。':'Scroll to zoom; hold Space and drag to pan. Ctrl / ⌘ + Z undoes marks or repairs; Shift + Z redoes a repair.',
    '本地纹理匹配会从周围复制相似图块来填补选区，不含生成式 AI 模型。适合墙面、草地、天空上的小物体或水印；无法理解并重建复杂人脸、文字或被遮挡的建筑。复杂路人建议分块尝试。':'Local texture matching copies nearby patches to fill the selection. It works best for small objects on walls, grass or sky. It cannot reconstruct complex faces, text or hidden buildings. Try small sections for complex subjects.',
    '为保证运行流畅，超大图片会缩小至最长边 1800 px，导出为处理后尺寸。透明图片先合成到白色背景。撤销最多保留 5 步修补。':'Large images are resized to a maximum edge of 1,800 px and exported at that size. Transparent images are composited on white. Up to five repairs can be undone.',
    '把图片放在这里':'Drop your image here', '上传 · 拖拽 · Ctrl / ⌘ + V':'Upload · Drag · Ctrl / ⌘ + V',
    '无需安装，无需联网':'No installation or network required', '适应窗口':'Fit to window',
    '打开一张图片开始编辑':'Open an image to start editing',
    '请选择浏览器支持的图片文件。':'Choose an image supported by your browser.',
    '{width} × {height} px · 已缩小':'{width} × {height} px · Resized',
    '涂满要消除的物体，建议稍微覆盖边缘。':'Paint over the object, including a little beyond its edges.',
    '无法读取图片，请使用 PNG、JPG 或 WebP。':'Could not read the image. Use PNG, JPG or WebP.',
    '已取消，图片和标记保持不变。':'Cancelled. Your image and marks are retained.',
    '先用画笔涂满要消除的区域。':'First paint over the area you want to remove.',
    '选区超过图片的 45%，请分成更小的区域处理。':'The selection exceeds 45% of the image. Work on smaller areas.',
    '浏览器阻止了本地修补，请下载文件后用 Chrome 或 Edge 打开。':'Local repair was blocked. Try Chrome or Edge.',
    '正在匹配周围纹理… 可随时取消':'Matching nearby textures… You can cancel at any time.',
    '处理失败，请缩小选区后重试。':'Processing failed. Try a smaller selection.',
    '修补完成。可以撤销、继续修补或下载 PNG。':'Repair complete. Undo, repair another area or download the PNG.',
    '正在修补 {progress}%':'Repairing {progress}%',
    '选区太大或图片太小，没有足够背景用于修补。':'The selection is too large or the image too small to find enough background.',
    '没有可用边界，请缩小选区。':'No usable boundary was found. Reduce the selection.',
    '导出失败，请重试。':'Export failed. Please try again.',
    '已导出 PNG（不包含红色标记）。':'PNG exported without the red marks.', '修补':'repaired',
    '把深色内容调浅，为打印准备一份新文件。':'Lighten dark content to prepare a new file for printing.',
    '01 / 选择文件':'01 / Choose a file', '选择 PDF 或拖到这里':'Choose a PDF or drop it here',
    '文件不会上传到服务器。最多 20 MB、100 页。':'Files stay on your device. Maximum 20 MB and 100 pages.',
    '02 / 调整输出':'02 / Adjust output', '输出颜色':'Output color',
    '偏彩色浅灰 / Tinted gray':'Tinted light gray', '纯灰色 / Neutral gray':'Neutral gray',
    '深浅':'Brightness', '数值越大，深色内容越浅':'Higher values lighten dark content more',
    '清晰度':'Resolution', '预览第一页':'Preview first page', '转换并下载 PDF':'Convert and download PDF',
    '取消处理':'Cancel processing', '选择 PDF 开始。':'Choose a PDF to begin.',
    '03 / 效果预览':'03 / Preview', '原图 / Original':'Original', '转换后 / Converted':'Converted',
    '保留页面尺寸与显示方向，导出为图片型 PDF；文字不再可选中，链接和表单交互不保留。偏彩色浅灰不能保证打印机使用彩色墨盒。原文件不受影响。':'Page size and displayed orientation are retained in an image-based PDF. Text selection, links and interactive forms are not retained. Tinted gray does not guarantee color-ink printing. Your original file is unchanged.',
    '请选择不超过 20 MB 的 PDF。':'Choose a PDF no larger than 20 MB.',
    '文件已选择。可先预览第一页。':'File selected. You can preview the first page.',
    '已取消处理，原文件保持不变。':'Cancelled. Your original file is unchanged.',
    '正在取消…':'Cancelling…', '正在读取 PDF…':'Reading PDF…',
    '最多支持 100 页，请拆分文件后转换。':'Maximum 100 pages. Split the file before converting.',
    '正在转换：{page}/{count} 页…':'Converting page {page}/{count}…',
    '正在预览：{page}/{count} 页…':'Previewing page {page}/{count}…',
    '文件在当前清晰度下过大，请降低 DPI 或拆分 PDF。':'The file is too large at this resolution. Lower the DPI or split the PDF.',
    '页面导出失败':'Page export failed', '正在生成 PDF…':'Generating PDF…',
    '转换完成：{count} 页，已开始下载。':'Conversion complete: {count} pages. Download started.',
    '预览完成。调整参数后可再次预览，或转换全部页面。':'Preview complete. Adjust the settings or convert all pages.',
    '此 PDF 受密码保护，请先解锁后再转换。':'This PDF is password-protected. Unlock it before converting.',
    '处理失败：':'Processing failed: ',
    '选择或拖入文件，立即查看排版与公式':'Choose or drop a document or ZIP to preview layouts and equations',
    '展开源码':'Show source', '收起源码':'Hide source', '选择 Markdown / ZIP':'Open Markdown / ZIP',
    '拖入或选择 Markdown / ZIP 文件':'Drop or choose a Markdown / ZIP file',
    '将 Markdown 或 ZIP 拖到这里':'Drop a Markdown file or ZIP here',
    '支持 Markdown 与含配图的 ZIP；本地处理，外部图片不加载':'Open Markdown or a ZIP with images. Local processing; remote images are blocked.',
    '尚未选择文件':'No file selected', 'Markdown 源码':'Markdown source',
    'Markdown 原文（可编辑）':'Markdown source (editable)', '渲染预览区':'Rendered preview',
    '渲染预览':'Rendered preview', 'Markdown + 数学公式':'Markdown + Equations',
    '拖入或选择文件后，预览会显示在这里':'Choose or drop a file to see its preview here',
    '预览会显示在这里':'Your preview will appear here', '准备就绪':'Ready',
    'Markdown / ZIP · 可离线使用 · 本地处理':'Markdown / ZIP · Works offline · Local processing',
    '松开鼠标以打开 Markdown / ZIP':'Release to open Markdown / ZIP',
    '包内文档':'Documents in ZIP', '请选择包内的 Markdown 文档':'Choose a Markdown document in the ZIP',
    '{count} 字符':'{count} characters', '预览已更新':'Preview updated',
    '预览已更新 · {count} 张图片缺失或不支持':'Preview updated · {count} missing or unsupported images',
    '渲染失败：{error}':'Rendering failed: {error}', '读取文件失败：{error}':'Could not read file: {error}',
    '文件过大，Markdown 最多支持 4 MB':'Markdown files must be no larger than 4 MB',
    '请选择 .md、.markdown、.txt 或 .zip 文件':'Choose a .md, .markdown, .txt or .zip file',
    '正在读取 ZIP…':'Reading ZIP…', '正在读取文档…':'Reading document…',
    '公式解析失败：':'Could not render equation: ',
    'ZIP 文件最多支持 20 MB':'ZIP files must be no larger than 20 MB',
    'ZIP 已损坏或结构不受支持':'The ZIP is damaged or has an unsupported structure',
    '暂不支持加密、多卷或 ZIP64 压缩包，请使用普通 ZIP':'Encrypted, split and ZIP64 archives are not supported. Use a standard ZIP.',
    'ZIP 内文件数量超过 500 个':'The ZIP contains more than 500 entries',
    'ZIP 解压后总大小不能超过 50 MB':'The ZIP must expand to no more than 50 MB',
    'ZIP 内单个文件不能超过 10 MB，Markdown 不能超过 4 MB':'Each ZIP entry must be at most 10 MB; Markdown must be at most 4 MB',
    'ZIP 内存在不安全或重复的文件路径':'The ZIP contains an unsafe or duplicate path',
    'ZIP 内没有 Markdown 文档':'No Markdown document was found in the ZIP',
    'ZIP 使用了不支持的压缩方式，请使用标准 ZIP':'Unsupported compression method. Use standard ZIP compression.',
    '当前浏览器不支持 ZIP 解压，请使用新版 Chrome、Edge、Firefox 或 Safari':'ZIP decompression is unavailable. Use a current Chrome, Edge, Firefox or Safari browser.',
    'ZIP 文件校验失败，请重新打包':'ZIP file integrity check failed. Create a new archive.',
    '文档不是有效的 UTF-8 文本，请另存为 UTF-8':'The document is not valid UTF-8. Save it as UTF-8 and try again.'
  };
  window.GARYHUB_TRANSLATIONS = Object.assign({}, window.GARYHUB_TRANSLATIONS, translations);
  const messages = new Map();
  function string(source, values = {}) {
    const translated = window.GaryHubI18n?.t(source) ?? source;
    return translated.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
  }
  function text(target, source, values = {}) {
    const node = typeof target === 'string' ? document.getElementById(target) : target;
    if (!node) return;
    node.dataset.i18nIgnore = '';
    messages.set(node, {source, values});
    node.textContent = string(source, values);
  }
  window.ToolUI = {string, text};
  document.addEventListener('garyhub:language', () => {
    for (const [node, value] of messages) {
      if (node.isConnected) node.textContent = string(value.source, value.values);
      else messages.delete(node);
    }
  });
})();
