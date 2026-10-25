/* UI metadata only. Links and permissions stay with the existing server routes. */
((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GaryHubTools = api;
})(typeof window === 'object' ? window : this, () => {
  'use strict';
  const tools = [
    {id:'grades', name:{zh:'成绩规划',en:'Grade Planner'}, short:{zh:'课程成绩与 GPA',en:'Grades & GPA'}, description:{zh:'查看课程成绩、计算目标分数，规划个人 GPA。',en:'Track course grades, calculate target scores and plan your GPA.'}, keywords:'成绩 等第 分数 课程 学分 gpa grade planner courses scores'},
    {id:'study', name:{zh:'学习中心',en:'Study Hub'}, short:{zh:'讲义与学习进度',en:'Lectures & progress'}, description:{zh:'阅读讲义、记录学习进度，并把学习计划安排到日历。',en:'Read lecture notes, track your progress and schedule study sessions.'}, keywords:'学习 讲义 课件 阅读 进度 study hub lectures notes learning'},
    {id:'lab', name:{zh:'ECE 470 实验室',en:'ECE 470 Lab'}, short:{zh:'机器人编程练习',en:'Robotics practice'}, description:{zh:'使用 NumPy 和 Modern Robotics 练习机器人编程、作业变式，保存代码与进度。',en:'Practice robotics with NumPy and Modern Robotics, work through homework variants and save your code and progress.'}, keywords:'机器人 编程 作业 题库 实验 ece470 ece 470 python numpy modern robotics lab homework'},
    {id:'research', name:{zh:'科研词典',en:'Research Dictionary'}, short:{zh:'双语术语与例句',en:'Terms & examples'}, description:{zh:'按 Research 整理中英文术语、释义和双语例句，导入 AI 词库或逐条修订。',en:'Organize bilingual research terms, meanings and examples by project. Import AI-generated dictionaries or edit individual entries.'}, keywords:'科研 研究 词典 词库 术语 翻译 英文 中文 research dictionary vocabulary terminology translation bilingual prompt'},
    {id:'calendar', name:{zh:'日历',en:'Calendar'}, short:{zh:'日程与私人记录',en:'Plans & records'}, description:{zh:'安排日程和任务，管理待办、日记、健康记录与账本。',en:'Organize events and tasks, and manage Todos, your journal, health records and ledger.'}, keywords:'日历 日程 任务 待办 日记 健康 账本 calendar tasks todo journal health ledger'},
    {id:'files', audience:'admin', name:{zh:'文件',en:'Files'}, short:{zh:'个人文件管理',en:'Your files'}, description:{zh:'登录文件服务，浏览和管理个人文件。',en:'Sign in to the file service to browse and manage your personal files.'}, keywords:'文件 网盘 上传 下载 files filebrowser storage upload download'},
    {id:'reading', audience:'subscriber', name:{zh:'订阅阅读',en:'Reading'}, short:{zh:'RSS 订阅',en:'RSS feeds'}, description:{zh:'集中阅读关注的网站与 RSS 订阅，跟进最新内容。',en:'Read the websites and RSS feeds you follow in one quiet space.'}, keywords:'阅读 新闻 订阅 reading rss miniflux feeds news'},
    {id:'status', audience:'admin', name:{zh:'服务状态',en:'Status'}, short:{zh:'运行与可用性',en:'Service uptime'}, description:{zh:'查看服务运行状态与可用性监控。',en:'Check service availability and uptime monitoring.'}, keywords:'状态 监控 故障 运行 status uptime kuma monitoring services'},
    {id:'server-monitor',audience:'admin',name:{zh:'服务器监控',en:'Server Monitor'},short:{zh:'资源与 VPN',en:'Resources & VPN'},description:{zh:'查看服务器内存、磁盘、目录占用、VPN 状态与用户流量。',en:'Inspect server resources, storage usage, VPN health and user traffic.'},keywords:'服务器 内存 磁盘 流量 server monitor memory disk vpn traffic'},
    {id:'access', name:{zh:'网络访问',en:'Network Access'}, short:{zh:'授权与连接说明',en:'Access & connections'}, description:{zh:'兑换邀请码、查看网络访问授权与连接说明。',en:'Redeem invitations, review your network access and find connection instructions.'}, keywords:'网络 访问 邀请码 授权 连接 network access connection invitation vpn'},
    {id:'totp', name:{zh:'2FA 验证码',en:'2FA Codes'}, short:{zh:'双重验证',en:'Two-factor codes'}, description:{zh:'保存验证器密钥，查看实时验证码，管理限时授权。',en:'Store authenticator keys, view current verification codes and manage time-limited grants.'}, keywords:'验证码 验证器 双重验证 密钥 2fa totp authenticator authentication codes'},
    {id:'eraser', name:{zh:'图片局部消除',en:'Image Eraser'}, short:{zh:'涂抹与修补',en:'Paint & repair'}, description:{zh:'涂抹图片中的干扰区域，修补后下载。图片在本机浏览器处理。',en:'Paint over unwanted areas, repair the image and download it. Processing stays in your browser.'}, keywords:'图片 图像 照片 消除 修补 去水印 橡皮 image photo eraser repair remove'},
    {id:'markdown', name:{zh:'Markdown 预览',en:'Markdown Viewer'}, short:{zh:'文档、公式与 ZIP',en:'Documents & equations'}, description:{zh:'预览 Markdown、数学公式及 ZIP 内的文档配图，编辑源码并实时查看。文件在本机处理。',en:'Preview Markdown, equations and documents with images in ZIP files. Edit the source with live preview, locally.'}, keywords:'文档 预览 公式 源码 编辑 markdown md viewer zip latex math'},
    {id:'pdf', name:{zh:'PDF 浅灰转换',en:'PDF Light Gray'}, short:{zh:'调整深浅以便打印',en:'Prepare for printing'}, description:{zh:'调整 PDF 的深浅与清晰度，导出适合打印的新文件。文件在本机浏览器处理。',en:'Adjust PDF brightness and resolution and export a new file for printing. Processing stays in your browser.'}, keywords:'打印 浅灰 灰度 转换 pdf gray grey print converter brightness'}
  ];
  const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('en').trim().replace(/\s+/g,' ');
  function matches(tool, query) {
    const tokens = normalize(query).split(' ').filter(Boolean);
    const text = normalize([tool.name.zh,tool.name.en,tool.short.zh,tool.short.en,tool.description.zh,tool.description.en,tool.keywords].join(' '));
    return tokens.every(token => text.includes(token));
  }
  return {tools, normalize, matches};
});
