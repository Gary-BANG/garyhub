/* Companion knowledge: what each destination is for and how people ask for it.
   Names and descriptions come from tools-catalog.js; links mirror the existing routes.
   The server still authorizes every destination; `access` only decides what to suggest. */
((root, factory) => {
  const catalog = typeof module === 'object' && module.exports ? require('../tools-catalog.js') : root.GaryHubTools;
  const api = factory(catalog);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GaryHubCompanionKnowledge = api;
})(typeof window === 'object' ? window : this, catalog => {
  'use strict';
  // access: login = any signed-in account; subscriber/admin mirror tool-access.js.
  const extra = {
    grades:{url:'https://tools.garyhub.uk/grades/', category:'study', access:'login',
      zh:['成绩','分数','考多少分','要考多少','期末要考','绩点','学分','挂科','及格','目标分','算分','加权','平均分','课程成绩'],
      en:['grade','grades','gpa','final exam score','what score do i need','pass the class','credit hours','weighted average','course grade'],
      howto:{zh:'先添加课程和各项成绩权重，再填入已知分数，页面会算出剩下的考试需要多少分。',en:'Add a course with its grading weights, enter the scores you already have, and it works out what you need on the rest.'}},
    study:{url:'https://tools.garyhub.uk/study/', category:'study', access:'login',
      zh:['讲义','课件','学习进度','复习','学习计划','课堂笔记','课程资料','预习','上课的资料'],
      en:['lecture','lectures','lecture notes','slides','study plan','study progress','review for','course materials','revise'],
      howto:{zh:'建好课程后导入讲义，阅读时会记录进度，也可以把学习时段安排进日历。',en:'Create a course, import your lecture notes, and your reading progress is tracked. You can also schedule study sessions into the calendar.'}},
    lab:{url:'https://lab.garyhub.uk/lab/', category:'study', access:'login',
      zh:['机器人','ece470','ece 470','编程练习','写代码','python练习','numpy','运动学','作业题','题库','刷题','练习题'],
      en:['robot','robotics','ece470','ece 470','coding practice','python practice','numpy','kinematics','homework problems','practice problems','modern robotics'],
      howto:{zh:'选一道题，在编辑器里写 Python 代码并运行，提交后会保存代码和进度。',en:'Pick a problem, write Python in the editor and run it. Submitting saves your code and progress.'}},
    research:{url:'https://calendar.garyhub.uk/research/', category:'study', access:'login',
      zh:['科研','术语','专业词汇','论文词汇','翻译术语','单词本','生词','词典','例句','双语','论文'],
      en:['research','terminology','glossary','vocabulary','academic terms','paper writing','translate a term','bilingual','dictionary'],
      howto:{zh:'先建一个 Research，再逐条添加术语、释义和例句，也可以导入 AI 生成的词库。',en:'Create a research project, then add terms, meanings and example sentences, or import an AI-generated dictionary.'}},
    calendar:{url:'https://calendar.garyhub.uk/', category:'life', access:'login',
      zh:['日程','日历','安排时间','会议','约会','截止日期','ddl','提醒我','行程','排期'],
      en:['calendar','schedule','event','meeting','appointment','deadline','remind me','plan my week'],
      howto:{zh:'在日历上点选日期即可新建日程，可以设置提醒；待办、日记、账本等记录都在顶部导航里。',en:'Click a date to create an event and set a reminder. Todos, the journal, the ledger and other records are in the top navigation.'}},
    files:{url:'https://files.garyhub.uk/', category:'admin', access:'admin',
      zh:['网盘','云盘','存文件','上传文件','下载文件','文件管理'],
      en:['files','file storage','cloud drive','upload files','download files','file manager'],
      howto:{zh:'用 GaryHub 账号进入文件服务，在网页里浏览、上传和下载文件。',en:'Open the file service with your GaryHub account to browse, upload and download files.'}},
    reading:{url:'https://rss.garyhub.uk/', category:'life', access:'subscriber',
      zh:['rss','订阅源','新闻','博客','资讯','阅读器','看文章'],
      en:['rss','feeds','news','blogs','feed reader','read articles'],
      howto:{zh:'添加想关注的网站或 RSS 地址，新文章会集中出现在列表里。',en:'Add the sites or RSS feeds you follow and new articles appear in one list.'}},
    status:{url:'https://kuma.garyhub.uk/', category:'admin', access:'admin',
      zh:['服务状态','宕机','挂了','打不开','可用性','uptime'],
      en:['status','uptime','outage','is it down','service down'],
      howto:{zh:'打开后可以看到每个服务是否在线以及最近的可用率。',en:'It shows whether each service is up and its recent availability.'}},
    'server-monitor':{url:'https://tools.garyhub.uk/server-monitor/', category:'admin', access:'admin',
      zh:['服务器','内存','磁盘','cpu','流量','vpn流量','资源占用','硬盘空间'],
      en:['server','memory','disk','cpu','bandwidth','traffic','disk space','vpn traffic'],
      howto:{zh:'页面会显示内存、磁盘和目录占用，以及 VPN 状态与用户流量。',en:'It shows memory, disk and directory usage, VPN health and per-user traffic.'}},
    access:{url:'https://lab.garyhub.uk/access/', category:'account', access:'login',
      zh:['邀请码','网络访问','连接说明','怎么连接','节点','订阅链接','代理','vpn'],
      en:['invitation code','invite code','network access','connection setup','how to connect','proxy','vpn'],
      howto:{zh:'先兑换邀请码，页面会显示你的访问授权和对应的连接说明。',en:'Redeem an invitation code, then the page shows your access and the matching connection instructions.'}},
    totp:{url:'https://tools.garyhub.uk/totp/', category:'account', access:'login',
      zh:['验证码','两步验证','双重验证','二次验证','2fa','谷歌验证器','身份验证器','动态码','otp'],
      en:['2fa','two-factor','two factor','authenticator','otp','verification code','totp','one-time code'],
      howto:{zh:'添加验证器密钥后，页面会显示实时验证码；也可以给别人发限时授权。',en:'Add an authenticator key and the current code appears. You can also issue time-limited grants.'}},
    eraser:{url:'https://tools.garyhub.uk/useful/image-eraser/', category:'documents', access:'login',
      zh:['去水印','修图','p掉','p图','抹掉','路人','去掉图片','照片里','图片里','消除','杂物'],
      en:['remove object','erase','watermark','photo','clean up an image','remove from a picture','retouch','inpaint'],
      howto:{zh:'上传图片，用画笔涂住想去掉的区域，点修补后下载。图片只在你的浏览器里处理。',en:'Open an image, paint over what you want gone, repair it and download. The image never leaves your browser.'}},
    markdown:{url:'https://tools.garyhub.uk/useful/markdown-viewer/', category:'documents', access:'login',
      zh:['markdown','md文件','.md','公式','latex','数学公式','渲染','readme','预览文档'],
      en:['markdown','md file','.md','latex','equation','equations','render','readme','preview a document'],
      howto:{zh:'打开 .md 文件或带配图的 ZIP，左边可以改源码，右边实时预览，公式会自动排版。',en:'Open a .md file or a ZIP with images. Edit the source on one side and see the live preview, with equations typeset.'}},
    pdf:{url:'https://tools.garyhub.uk/useful/pdf-gray/', category:'documents', access:'login',
      zh:['pdf','打印','太黑','太深','省墨','浅一点','淡一点','变淡','灰度','墨水','碳粉'],
      en:['pdf','print','printing','too dark','save ink','lighter','grayscale','greyscale','toner'],
      howto:{zh:'选择 PDF，拖动滑块调整深浅和清晰度，预览满意后导出新文件。文件只在你的浏览器里处理。',en:'Choose a PDF, adjust brightness and resolution with the sliders, then export a new file. Processing stays in your browser.'}}
  };
  // Sections of Calendar that people usually ask for by name.
  const pages = [
    {id:'ledger', parent:'calendar', url:'https://calendar.garyhub.uk/ledger/', category:'life', access:'login',
      name:{zh:'账本',en:'Ledger'}, short:{zh:'收支记录与汇总',en:'Income & spending'},
      zh:['记账','账本','花了多少钱','开销','支出','收入','花销','预算','消费记录'],
      en:['ledger','expense','expenses','spending','budget','bookkeeping','income','track money'],
      howto:{zh:'每笔收支记一条，选好分类和币种，页面会按月汇总。',en:'Log each income or expense with a category and currency; the page summarizes by month.'}},
    {id:'fixed', parent:'ledger', url:'https://calendar.garyhub.uk/ledger/fixed/', category:'life', access:'login',
      name:{zh:'固定支出',en:'Fixed Expenses'}, short:{zh:'房租、订阅等周期开销',en:'Rent, subscriptions…'},
      zh:['固定支出','房租','月租','订阅费','会员费','每月扣费','周期支出','话费'],
      en:['fixed expenses','rent','subscription fee','recurring','monthly bill','bills'],
      howto:{zh:'把房租、会员等周期开销登记一次，到期时可以一键记入账本。',en:'Register rent, memberships and other recurring costs once, then post them to the ledger when they are due.'}},
    {id:'todos', parent:'calendar', url:'https://calendar.garyhub.uk/todos/', category:'life', access:'login',
      name:{zh:'待办',en:'Todos'}, short:{zh:'待办清单',en:'Your to-do list'},
      zh:['待办','todo','任务清单','要做的事','清单','打卡'],
      en:['todo','todos','to-do','to do list','task list','checklist'],
      howto:{zh:'添加待办事项，完成后勾掉；也可以批量导入清单。',en:'Add items, tick them off when done, or import a list in bulk.'}},
    {id:'journal', parent:'calendar', url:'https://calendar.garyhub.uk/journal/', category:'life', access:'login',
      name:{zh:'日记',en:'Journal'}, short:{zh:'私人日记',en:'Private journal'},
      zh:['日记','写日记','心情','随笔','记录今天'],
      en:['journal','diary','mood','write about my day'],
      howto:{zh:'选一天写下当天的记录，只有你自己能看到。',en:'Pick a day and write. Only you can see it.'}},
    {id:'health', parent:'calendar', url:'https://calendar.garyhub.uk/health-records/', category:'life', access:'login',
      name:{zh:'健康记录',en:'Health Records'}, short:{zh:'体重、睡眠等',en:'Weight, sleep…'},
      zh:['健康','体重','睡眠','运动','血压','身体状况'],
      en:['health','weight','sleep','exercise','blood pressure','workout'],
      howto:{zh:'按日期记录体重、睡眠等数据，方便回看变化。',en:'Record weight, sleep and other measurements by date to see how they change.'}},
    {id:'music', parent:'calendar', url:'https://calendar.garyhub.uk/music/', category:'life', access:'login',
      name:{zh:'音乐库',en:'Music Library'}, short:{zh:'上传与管理背景音乐',en:'Your background music'},
      zh:['音乐','歌','歌单','背景音乐','上传音乐','mp3'],
      en:['music','song','songs','playlist','background music','upload music','mp3'],
      howto:{zh:'上传自己的 MP3，之后在各页面的播放器里就能选这些曲目。',en:'Upload your own MP3s and pick them from the player on other pages.'}},
    // Public sites outside GaryHub, listed on the Elsewhere page.
    {id:'sites', url:'https://sites.garyhub.uk/', category:'study', access:'public',
      name:{zh:'外站链接',en:'Elsewhere'}, short:{zh:'课程网站与作品',en:'Course sites & projects'},
      zh:['外站','外部链接','其他网站','别的网站','课程网站','公开课程','摄影','拍照','摄影课','光影手记','作品集','motion notes'],
      en:['elsewhere','external links','other sites','other websites','course site','course website','photography','photo course','field notes','portfolio','motion notes'],
      howto:{zh:'这里汇总了 GaryHub 之外的公开网站，比如 ECE 470 机器人学笔记和摄影课程，点开即可浏览，不需要登录。',en:'A list of public sites outside GaryHub, such as the ECE 470 robotics notes and the photography course. Open any of them; no sign-in needed.'}}
  ];
  const categories = [
    {id:'study', name:{zh:'学习',en:'Study'}, zh:['学习','学业','上课','课程','考试','作业'], en:['study','school','class','course','exam','homework']},
    {id:'documents', name:{zh:'文档与图片',en:'Documents & images'}, zh:['文档','文件处理','图片','照片','处理文件'], en:['document','documents','image','images','file tools']},
    {id:'life', name:{zh:'日常记录',en:'Everyday records'}, zh:['生活','日常','记录','个人'], en:['life','daily','everyday','personal','records']},
    {id:'account', name:{zh:'账号与连接',en:'Account & access'}, zh:['账号','安全','连接','登录'], en:['account','security','connect','sign in']},
    {id:'admin', name:{zh:'管理',en:'Admin'}, zh:['管理','运维'], en:['admin','operations']}
  ];
  const entries = [
    ...catalog.tools.filter(tool => extra[tool.id]).map(tool => {
      const {zh, en, ...rest} = extra[tool.id];
      return {id:tool.id, name:tool.name, short:tool.short, description:tool.description, keywords:tool.keywords, phrases:{zh, en}, ...rest};
    }),
    ...pages.map(({zh, en, ...page}) => ({description:page.short, keywords:'', ...page, phrases:{zh, en}}))
  ];
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const permitted = (entry, user) => entry.access === 'admin' ? user?.role === 'admin'
    : entry.access === 'subscriber' ? user?.role === 'admin' || user?.accountTier === 'subscriber' : true;
  return {entries, byId, categories, permitted, normalize:catalog.normalize};
});
