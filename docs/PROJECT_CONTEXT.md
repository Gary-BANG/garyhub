# GaryHub 项目档案

维护日期：2026-11-21（America/Chicago）。首次阅读本文件及 UPDATE_WORKFLOW.md，按任务范围读取相关源码。

## 当前源码与部署证据

- **v2.4.3.4（当前源码，本地已验证）** 基于 PR #54 的 main `2c51ae729aa8047c30e1f5624cbeb3f6ff1b6e71`（树与 v2.4.3.3 提交 `76fd59f` 相同），独立分支 `update/garyhub-v2.4.3.4`；清单 `releases/2.4.3.4.json`，适配器 `scripts/releases/v2.4.3.4/`（baseline_adapter v2.4.3.3，安装器 v2.4.3.4-r1，严格要求实际 v2.4.3.3）。按维护者 2026-11-21／22 的意见重做大富翁电脑的判断标准并改破产规则（方案经维护者确认）：破产清算——房子半价、地六成、抵押地一成卖给银行，连同现金付给债主、最多到欠款，地产退回银行（`state.liquidate`，放在 `rules` 之外；旧房间仍交给债主）；电脑——剩余回合 H（限定回合计数、限时按节奏估算并扣除暂停、经典按 20）与进度；留钱 = 底线 + 前方一掷（新手）或两掷（普通、精明，含场上倍数）的期望过路费，精明再加最贵一格的 25%，上限为总资产 35%；三档都盖到酒店、都拦人凑组，新手不再随机放弃；交易估值 = 现金（缺钱时权重升到 2）+ 地价 + 自己以后的过路费 ×30% − 对方以后从自己这里收的 ×60% × 威胁系数（精明 1.5，对方领先 ×1.5）；接受门槛新手 0、普通 5%→20%、精明 10%→25%（60% 进度后保持），凑组或更近一步时 0／5%；还价精确求出满足门槛的现金，只在收钱时加 5%／15%；缺钱时三档都把地卖给那组已有地的人（新手可吃亏两成）；普通与精明缺一到两块时向同一持有人要（互换只在普通电脑站在对方位置不吃亏时提，否则现金，开价随进度与卖方现金，向对方能接受的价靠拢、不超过自己的上限）；精明后半局分别向两人收购同一组；拍卖在留一半底线时跟到地价 70%／85%／95%。新增理由 closer、sale、swap2、plan、cheap。只改 `play-monopoly.js` 与 Lab `monopoly.js`（及版本号）；无新表、无新依赖、不改 Caddy。隔离检查 20 组（新增 `tycoon-bots-http.cjs`，登录地址 192.0.2.234）。站内通知一条：home。本地验证：Calendar 161、Lab 115；电脑对局模拟（三档对普通电脑、混坐）。源码已准备／本地已验证，尚未推送、合并或部署。详见 GARYHUB_V2_4_3_4.md 与 _TESTS.md。

- **v2.4.3.3（PR #54 已合并为 main `2c51ae7`；生产版本未取证；以下为交付时记录）** 基于 PR #53 的 main `731e8bcac1935c2f45e496d085fa8cc571d35304`（树与 v2.4.3.2 提交 `a52d929` 相同），独立分支 `update/garyhub-v2.4.3.3`；清单 `releases/2.4.3.3.json`，适配器 `scripts/releases/v2.4.3.3/`（baseline_adapter v2.4.3.2，安装器 v2.4.3.3-r1，严格要求实际 v2.4.3.2）。按维护者 2026-11-21 的六项要求升级大富翁：胜负方式（限定回合；经典只剩一人，第 25 回合起每 10 回合过路费加基础的一半，第 100 回合保险结算；限时 30／60／90 分钟，暂停顺延，到时打完当前回合）；玩家交易（地与现金，一方出钱，有房色组不能交易，每方 ≤6 块，每回合 ≤3 次提议，最多还价 3 次，接受时复核，超时视为拒绝）；拍卖（轮流出价，至少加 100，现金为限，放弃即退出）；电脑交易（只差一块时提议现金 1.5／1.3 倍或精明互换，被拒 3 回合内不再提；按“凑齐 ×2.5、送对方凑齐 ×2／×2.5”估值，精明不让对方单方面凑齐，差额还价）、竞价、盖房优先对手下一掷最可能踩中的色组，每个决定在记录写理由（只在电脑行动时保存，`ctx.bot`）；托管座位不交易不竞拍。页面：格子序号与“#序号 名称”、按服务器事件列表顺序播放动画（掷骰、走棋、金币、翻牌、交易）、玩家自选动画速度（`board.js`，两款棋盘游戏通用，存本机）、资产走势图（座位色线条与序号，悬停读数，数据表）、交易与拍卖面板（电脑在棋盘下方，手机在底部抽屉，抽屉挂在 body 下）。`play-rooms.js` 传 `ctx.bot`、`bot(…, {auto})` 与暂停时长；`play.js` 的设置支持文字值、按条件显示与旧房间默认值。旧房间与 v2.4.3.2 存档保持旧规则。无新表、无新依赖、不改 Caddy；`app.js`、`server.cjs` 只改版本号。隔离检查 19 组（新增 `tycoon-http.cjs`，登录地址 192.0.2.232–233，先离开账号遗留的房间）。站内通知一条：home。本地验证：Calendar 154、Lab 115；浏览器经典局中交易成交、拍卖轮流出价、金币与翻牌、走势图、手机抽屉。源码已准备／本地已验证，尚未推送、合并或部署。详见 GARYHUB_V2_4_3_3.md 与 _TESTS.md。

- **v2.4.3.2（PR #53 已合并为 main `731e8bc`；2026-11-21 tools／calendar `/health` 返回 2.4.3.2（维护者告知已部署），安装输出与通知人数未收录；以下为交付时记录）** 基于 PR #52 的 main `81ec1923e3d1ce8cecd2b3d8cbd935ba10d4e198`（树与 v2.4.3.1 提交 `52bb82c` 相同），独立分支 `update/garyhub-v2.4.3.2`；清单 `releases/2.4.3.2.json`，适配器 `scripts/releases/v2.4.3.2/`（baseline_adapter v2.4.3.1，安装器 v2.4.3.2-r1，严格要求实际 v2.4.3.1）。按维护者 2026-11-21 要求一起做设计稿第 3 节**骰子抢宝箱**与第 2 节**大富翁**，棋盘、骰子动画、电脑与托管两款共用。骰子抢宝箱 2–4 人：固定 7×7 地图、四角基地，掷一颗骰子走不超过点数，带箱 −1 步，回基地才开箱计分（木 2–4／银 4–6／金 7–9，别人只见材质），抢夺（平局防守方胜、站在自己基地 +1），流沙、尖刺掉箱，道具疾风靴／暗夹（只有放置者可见）／护盾／回城卷轴，最多持 2 个；目标 12（双人）／15 金币，或 8／12／16 回合后比金币（设计稿的 20／15 试玩后下调）。大富翁 2–5 人：原创 32 格（20 城 7 组、高铁站与机场、机会 10 张、新闻 8 张、税务局、休息站），初始 15000，对子再掷、三次对子进休息站，整组翻倍、均衡盖房到酒店（×5／×12／×20／×28），卖房半价、抵押 50%／赎回 55%、卖回银行 60%，欠款先变现否则破产；15–30 轮后比总资产。没有玩家交易与拍卖。Calendar 新文件 `play-treasure.js`、`play-monopoly.js`（规则、按座位隐藏的视图、新手／普通／精明三档电脑只看公开信息、超时由电脑代走一步、连续两次超时转托管）；`play-rooms.js`：游戏可声明 `seatCount(config)`（房主改人数时增减座位，减少时须末座无人）与 `away: 'autoplay'`（掉线宽限后由“普通”电脑托管，只有所有真人离开才暂停，恢复时仍不在的人继续托管），新增 `takeover` 动作（托管／接管），托管状态随房间存入 `play_rooms`。页面：`board.js`（格子棋盘、棋子逐格走、骰子滚动，动画按状态序号只播一次）、`treasure.js`、`monopoly.js`；`play.js` 显示托管与“接管”。Lab `games-host.cjs` 放行三个脚本；`app.js`、`server.cjs` 只改版本号；无新表、无新依赖、不改 Caddy。隔离检查 18 组（新增 `boards-http.cjs`，登录地址 192.0.2.229–230）。站内通知一条：home。本地验证：Calendar 148、Lab 115；浏览器骰子抢宝箱 3 人局与大富翁 4 座 15 轮局打到结束、托管与接管、375 px。源码已准备／本地已验证，尚未推送、合并或部署。详见 GARYHUB_V2_4_3_2.md 与 _TESTS.md。

本节只保留最近三个版本的完整条目。更早版本的完整记录在各自的版本文档末尾“项目档案历史记录”一节；发新版时，把最旧的一条原样移入其版本文档，并在下表补一行。


## 版本索引

状态只摘录已有记录；“未收录”指安装输出与通知人数不在本仓库。GitHub 合并不等于生产部署。

| 版本 | 内容 | GitHub | 生产证据 | 记录 |
|---|---|---|---|---|
| 2.4.3.4 | 大富翁：破产清算、电脑按剩余回合与前方过路费判断、缺钱卖地、分批收购、拍卖跟价 | 未推送 | 未部署 | 上文，GARYHUB_V2_4_3_4.md |
| 2.4.3.3 | 大富翁：三种胜负方式、交易与还价、拍卖、电脑理由与盖房位置、走势图与动画、动画速度 | PR #54，main `2c51ae7` | 未取证 | 上文，GARYHUB_V2_4_3_3.md |
| 2.4.3.2 | 骰子抢宝箱与大富翁：共用棋盘与骰子、三档电脑、托管与接管、按设置决定座位数 | PR #53，main `731e8bc` | 2026-11-21 `/health`；未收录 | 上文，GARYHUB_V2_4_3_2.md |
| 2.4.3.1 | 合作小车：实时循环与帧、方向／油门分工、3 关、掉线松键与倒数恢复、操作回显 | PR #52，main `81ec192` | 2026-11-21 `/health`；未收录 | GARYHUB_V2_4_3_1.md |
| 2.4.3.0 | 实时房间（WebSocket、房间码、掉线暂停与重连、延迟），词语默契、对战猜数字与电脑对手 | PR #51，main `e61b200` | 2026-11-20 `/health`、socket 门 401／403／404；未收录 | GARYHUB_V2_4_3_0.md |
| 2.4.2.0 | 游戏厅 games.garyhub.uk 与双人游戏“白日梦想家” | PR #50，main `4511bd7` | 2026-11-20 `/health`；未收录 | GARYHUB_V2_4_2_0.md |
| 2.4.1.6 | 主页卡片与入口排序、工具台置顶／隐藏／最近使用、通知渠道／免打扰／默认提醒／设备列表／订阅 | PR #49，main `ca696d2` | 2026-11-20 `/health`；未收录 | GARYHUB_V2_4_1_6.md |
| 2.4.1.5 | 补齐设置：强调色、密度、周起始日、日期格式、日历默认视图、代码字体、公式大小 | PR #48，main `d0e49a9` | 2026-11-18 `/health`；未收录 | GARYHUB_V2_4_1_5.md |
| 2.4.1.4 | 设置中心：账号偏好跨设备同步、全站日夜、学习中心行距与宽度 | PR #47，main `0041a4e` | 2026-11-17 `/health`；未收录 | GARYHUB_V2_4_1_4.md |
| 2.4.1.3 | 统一页头与图标、今日面板、全站搜索、免登录工具、日历订阅、推送、预算、到价提醒 | PR #46，main `5306dd9` | 2026-11-17 `/health`、维护者报告已安装；未收录 | GARYHUB_V2_4_1_3.md |
| 2.4.1.2 | 讲义答疑代码块不换行、横向滚动 | PR #45，main `2d19775` | 2026-11-16 `/health`；未收录 | GARYHUB_V2_4_1_2.md |
| 2.4.1.1 | 修复答疑气泡内公式被拆列 | PR #44，main `3b7f794` | 2026-11-12 `/health`、手机截图；未收录 | GARYHUB_V2_4_1_1.md |
| 2.4.1.0 | 星空主页、开发者档案页 | PR #43，main `289662f` | 2026-11-12 `/health`；r2 未收录 | GARYHUB_V2_4_1_0.md |
| 2.4.0.4 | 讲义答疑授权随提问续期 | PR #42，main `97ad2f2` | 2026-11-10 `/health`；r2 未收录 | GARYHUB_V2_4_0_4.md |
| 2.4.0.3 | 伙伴输入框多行、外部单击收起、答疑等待延长 | PR #41，main `0a5e86e` | 2026-11-10 `/health`；r2 未收录 | GARYHUB_V2_4_0_3.md |
| 2.4.0.2 | A 股行情新布局、模糊搜索、A 股 VIP | PR #40，main `aa0bd19` | 2026-11-10 `/health`；未收录 | GARYHUB_V2_4_0_2.md |
| 2.4.0.1 | A 股详情指标、盘口、分时、日 K、财报 | PR #39，main `8df0911` | 自身证据未收录 | GARYHUB_V2_4_0_1.md |
| 2.4.0.0 | 独立 A 股行情工具 | 专用同步包（PR #38 起点） | **2026-11-06 已核验**：8/8，8 个账号收到通知 | GARYHUB_V2_4_0_0.md |
| 2.3.2.3 | 伙伴记录体重、运动与待办 | PR #38 | 未收录 | GARYHUB_V2_3_2_3.md |
| 2.3.2.2 | 伙伴修改日程、记账、固定开支 | PR #37 | 未收录 | GARYHUB_V2_3_2_2.md |
| 2.3.2.1 | 学习中心四图标控制、个性化页 | 见版本文档 | 未收录 | GARYHUB_V2_3_2_1.md |
| 2.3.2.0 | 学习中心吸顶入口、层级目录、阅读外观 | PR #35，main `c5c0b86` | r1 第 1 阶段停止；r2 未收录 | GARYHUB_V2_3_2_0.md |
| 2.3.1.1 | 隐藏面板不再撤销答疑 | PR #34，main `1527368` | 未收录 | GARYHUB_V2_3_1_1.md |
| 2.3.1.0 | 讲义答疑 | PR #33，main `ea6a6d8` | 未收录 | GARYHUB_V2_3_1_0.md |
| 2.3.0.4 | 管理员图标、通知 14 天到期与批量操作 | PR #32，main `c87e7ef` | 未收录 | GARYHUB_V2_3_0_4.md |
| 2.3.0.3 | 布丁骨骼化（puppet.js） | PR #31，main `c909680` | **2026-11-04**：8/8，8 个账号 | GARYHUB_V2_3_0_3.md |
| 2.3.0.2 | 栗栗骨骼化、降落收敛 | 见版本文档 | 由 v2.3.0.3 第 1 阶段核对间接证明 | GARYHUB_V2_3_0_2.md |
| 2.3.0.1 | GLM-5.3 思考参数兼容 | 审查分支 `update/garyhub-v2.3.0.1` | **2026-11-03**：8/8，8 个账号 | GARYHUB_V2_3_0_1.md |
| 2.3.0.0 | 助手分级额度、备用模型、联网搜索、AI 日志 | PR #28，main `b783804` | 管理页测试结果间接证明；未收录 | GARYHUB_V2_3_0_0.md |
| 2.2.0.0 | 伙伴 AI 日程助手 | PR #27，main `a75a1e3` | 使用反馈间接证明；未收录 | GARYHUB_V2_2_0_0.md |
| 2.1.0.0 | 外站链接页 sites.garyhub.uk | PR #26，main `62f430a` | 维护者 2026-11-03 报告已安装；未收录 | GARYHUB_V2_1_0_0.md |
| 2.0.1.0 | 新增四个伙伴角色与等级 | PR #25，main `d21eecd` | **2026-11-03**：8/8，8 个账号 | GARYHUB_V2_0_1_0.md |
| 2.0.0.0 | 网站伙伴米露 | 见版本文档 | r1 第 3 阶段停止；r2 未收录 | GARYHUB_V2_0_0_0.md |
| 1.4.3.2 | Lab 公式排版、更多页面接入音乐播放器 | PR #23，main `aec0312` | 未收录 | GARYHUB_V1_4_3_2.md |
| 1.4.3.1 | 见版本文档 | PR #22，main `2b3d597` | r1 回滚、r2 停止、r3 最终输出未取得 | GARYHUB_V1_4_3_1.md |

## 沿用的约定与教训

这些来自已移出的旧条目，对以后的版本仍然有效；出处版本的文档里有完整经过。

- **隔离套件与页面标记**：改动页面标记前，先在全部隔离套件中搜索该标记的字面量（v2.4.0.3-r1）；页面资源的 `?v=` 要随版本更新，`sites-http.cjs` 会核对（v2.2.0.0-r1）；首页主机上受保护路径的既有行为是 302 登录跳转而不是 404（v2.0.0.0-r1）。
- **登录限流**：新增需要登录的隔离套件使用自己的 `X-Forwarded-For` 测试地址，不占共享地址的 12 次额度（v2.4.1.0-r1）。
- **部署核对**：`deploy.py` 的 curl 重试包装（连接／超时／429／5xx 间隔 5 秒最多 4 次，失败时报出主机、路径、退出码与状态）可直接沿用（v2.4.0.4）。受登录保护的页面放在 `admin_asset_checksums`，不与公开资源混核（v2.3.0.0）。
- **伙伴面板**：`lab-service/public/companion/` 与 `calendar-app/public/companion/` 须逐字节相同，由 `companion-wiring.test.cjs` 检查（v2.0.0.0）；气泡样式只用子选择器 `.msg>.text`，不用后代通用类名（v2.4.1.1）。
- **本地测试环境**（v2.4.1.3 起）：Windows 有 Node 24（`D:\Downloads\nodejs`，系统 PATH 指向的 `D:\download\nodejs` 不存在）可跑 Calendar 单元测试（需要 `node:sqlite`）；WSL 有 Node 20 与 bwrap，可把两个服务放在 `/app`、`/lab` 跑全部隔离套件。依赖装在仓库外，不入库。
- **共享页头资源**：`brand.css`、`hub-nav.js`、`hub-search.js`／`.css`、图标在两个服务各有一份逐字节相同的副本（适配器测试检查）；新页面加 `data-gh-header`／`data-gh-menu` 即可获得手机菜单。
- **账号偏好**（v2.4.1.4 起）：新的用户偏好加进 `calendar-app/preferences-api.js` 的 `SCHEMA`（固定取值），页面经 `GaryHubPrefs.get/save` 读写，`hub-prefs.js` 负责写入页面原有缓存；不要再给单个子站新开 localStorage 偏好。设置页在 Tools 样式（hub.css）下，它的全局 `nav`／`label`／`input` 规则需要在 `.settings` 内重置。
- **升级包只能新增或替换文件**，不能删除；弃用的静态文件会留在镜像里（v2.3.0.2）。
- **新表**：无外键的按用户表须加入 `account-admin.js` 的账号删除清单（v2.2.0.0、v2.3.0.0、v2.4.0.2）。
- **安装器结束语**是按版本写的，每次发版重写（v2.3.0.3）。
- **新子域名**（v2.1.0.0 sites、v2.4.2.0 games）：维护者先在 Cloudflare 加 A 记录（仅 DNS）；安装器第 1 阶段核对解析并 `caddy validate` 追加站点块的候选文件，新镜像健康后才写入，回滚时恢复（他人改过则停止）。需要登录写入的新主机，在 Calendar `app.js` 与 Lab `TRUSTED` 中**明确加入一项**来源（不改 Compose 的 `TRUSTED_ORIGINS`、不放开子域），页面加入两份 `auth-redirect.js` 的 routes。新主机受登录保护的页面不能放进 `protected_asset_checksums`（`asset-response.cjs` 用 fetch，设不了 Host），单独成组核对（v2.4.2.0）。
- **实时连接**（v2.4.3.0）：游戏房间的 WebSocket 由 Lab `games-host.cjs` 的 upgrade 原样转发到 Calendar `play-rooms.js`，握手先走 Express 中间件（会话、账号、428）再接管套接字；不能为此加需要在线安装的 npm 依赖（离线构建），协议层用 Node 原生实现。HTTP 服务器的套接字允许半关闭：升级后的连接必须在 `end`（只收到 FIN）时关闭，否则对端被杀或网络断开要等心跳才发现。新游戏按 `play-word.js` 的函数接口写规则，在 `play-rooms.js` 的 `GAMES` 与 `games-host.cjs` 资源列表登记。
- **改动旧版运行标记的文本**（v2.4.3.0）：先查上一版适配器的 `RUNNING`，在新适配器里显式改写那一项（如 `auth-redirect.js` 的 games 路由），由适配器测试核对；games 主机新增需要登录的页面要加入两份 `auth-redirect.js` 的 routes，否则登录后回不到原页面。
- **实时游戏**（v2.4.3.1）：在游戏模块声明 `realtime`，由 `play-rooms.js` 的循环推进并发帧；高频操作走 `in` 消息（不回复、不存盘），只把关键时刻存盘。服务器与页面都要用的逻辑放在一个 UMD 文件里，两服务各一份逐字节相同的副本，由单元测试、适配器测试和安装后的容器哈希核对。帧率按“每次循环发一帧”设计：Windows 计时器粒度约 15 毫秒，本机测到的帧率会比 Linux 低。预览面板隐藏时浏览器暂停动画帧，自动化脚本不要读取页面上随动画刷新的数值。
- **回合制房间游戏**（v2.4.3.2）：人数可变的游戏在模块里声明 `seatCount(config)`；适合电脑代打的游戏声明 `away: 'autoplay'`，掉线与连续超时由平台转为托管，游戏自己只需在 `timeout` 里调用 `ctx.auto(seat)`。电脑只用 `view` 能给出的信息；同一状态可能多次触发 `bot`，用 `botKey` 区分“同一步”。页面动画按 `state.last.seq` 只播一次，持久 DOM 按房间与局数复用。socket 测试要读“最新到达的状态”，不要等某个中间状态（电脑会连续行动，中间状态可能被合并）。
- **游戏规则改版**（v2.4.3.3）：新规则放进新设置字段，缺省值等于旧规则（旧房间、旧检查脚本、旧存档都按旧规则继续），新页面显式开启；之前的隔离检查（如 `boards-http`）原样保留并且必须通过。电脑的节奏要等页面动画（服务器估算动画时长并加到电脑延迟和计时上，封顶 3 秒），否则玩家看不清；动画用服务器给的有序事件列表逐条播放，而不是只看最后一步。房间卡片有 `backdrop-filter`，会让里面的 `position:fixed` 元素相对卡片定位，所以手机抽屉要挂在 body 下。每个账号同时最多 3 个房间：新隔离检查要先离开账号遗留的房间。经典（只剩一人）模式先用电脑对局模拟能否收敛，再定规则。
- **电脑策略调整**（v2.4.3.4）：先写可调的参数，再用电脑对局模拟比较——一档对两台固定的普通电脑看胜率（电脑之间互付溢价是零和，三档混坐的胜负会误导），每种模式数百到上千局，差 2–3 个百分点以内视为噪声；主动报价前用“普通电脑站在对方位置”估一下能否成交，否则电脑之间会反复提出注定被拒的交易。给旧状态加字段时放在已有对象之外（例如 `state.liquidate` 而不是 `rules.liquidate`），因为旧隔离检查会整体比较这些对象。
- **构建机**没有 Node 与 Docker：页面与前端逻辑在浏览器中验证，Node 单元测试与隔离 HTTP 检查由安装器在新镜像中执行；验证记录里要写明哪些没在本机跑。
- **额度**：普通账号 5 项固定开支／5 条 Todo／每条 10 points，订阅／管理员 300 项和 100 points；音乐每人 10 首／单首 20 MiB／合计 100 MiB，应用对象总限额 8 GiB（v1.4.3.2）。助手额度按 chat／data／search × standard／subscriber／admin 存在 `assistant_settings.quotas`（v2.3.0.0）。普通通知 14 天到期，`account`／`security`／`required` 保留（v2.3.0.4）。

## 模块定位

| 需求 | 首先读取 |
|---|---|
| 登录、会话、账号、通知 | calendar-app/app.js、auth-utils.js、account-admin.js、hub-api.js |
| 日历、Todo、私人记录 | calendar-app/ 对应 API 文件和 public/ 对应页面 |
| 账本、汇率、固定支出 | calendar-app/ledger-api.js、fixed-expenses.js、fx-rates.js |
| 工具权限、Reading 关联、每日金句 | calendar-app/tool-access.js、daily-quote.js；lab-service/reading-proxy.cjs |
| 服务器监控 | server-monitor/collect.py、lab-service/server-monitor.cjs、public/server-monitor/ |
| 粒子与音乐 | calendar-app/music-api.js、music-storage.js、public/music/；两个服务 public/ambient-music.* |
| 订阅额度 | calendar-app/entitlements.js、fixed-expenses.js、todos-api.js |
| Research Dictionary | calendar-app/research-api.js、public/research/、account-admin.js |
| 讲义答疑（v2.3.1.0） | calendar-app/assistant-tutor.js、assistant-api.js；lab-service/academic.cjs、public/academic/app.js（`installMath`）、public/companion/panel.js、panel.css（气泡规则只用 `.msg>.text`；代码块 `pre` 不换行、横向滚动） |
| 学习中心阅读偏好 | lab-service/academic.cjs 的 preferences 接口（设置中心“学习中心”一节） |
| 学习中心与讲义 | lab-service/public/academic/；Viewer study-document.mjs 使用既有 academic/state 接口 |
| Markdown 阅读、章节与目录 | lab-service/public/useful/markdown-viewer/，避免打印 index.html 内嵌第三方 bundle |
| 主页（星空）与开发者档案 | lab-service/public/homepage.html、home/、developer/；homepage-privacy.cjs；calendar-app/profile-access.js；私有 lab-service/developer-profile.json（不入库） |
| Tools 入口、搜索与 Dock | lab-service/public/index.html、tools-catalog.js、tools-dock.js、tools-dock.css |
| 跨站跳转 | 两服务的 public/auth-redirect.js |
| ECE 470 Lab | lab-service/server.cjs、public/lab/app.js、math-markdown.mjs、cloud.js、core.js |
| 作业题库分发 | lab-service/lab-distribution.cjs、public/lab/distribution.js、pack-validation.mjs |
| 三个本地实用工具 | lab-service/public/useful/，避免读取 vendor/ 的大文件 |
| 外站链接 | lab-service/public/sites/；server.cjs 中 sites.garyhub.uk 分支；scripts/sites/capture_thumbnails.py |
| 网站伙伴（米露等五个角色） | lab-service/public/companion/（Calendar 副本 calendar-app/public/companion/；puppet.js 驱动布丁）；lab-service/test/companion-*.cjs；scripts/companion/slim_rig.py、place_frames.py |
| A 股行情与 VIP | calendar-app/stocks/、stock-market.js、stock-api.js、account-admin.js、hub-api.js；lab-service/public/admin.js |
| 页头、标志、手机菜单、站点图标 | 两服务 public/brand.css、hub-nav.js、favicon.svg、icons/、manifest.webmanifest；scripts/branding/make_icons.py |
| 今日面板与全站搜索 | calendar-app/today-api.js；lab-service/hub-extras.cjs、public/home/today.js、public/hub-search.js |
| 日历订阅、浏览器推送、A 股提醒、账本预算 | calendar-app/extras.js、calendar-feed.js、push-api.js、stock-alerts.js、ledger-budget.js；public/sw.js、calendar-extras.js、ledger/budget.js；stocks/alerts.js |
| 设置中心与账号偏好 | calendar-app/preferences-api.js；两服务 public/hub-prefs.js；lab-service/public/personalize/ |
| 游戏厅与白日梦想家（games.garyhub.uk） | calendar-app/games-api.js；lab-service/games-host.cjs、public/games/（games.js 共用工具与大厅，dream/ 为游戏） |
| 骰子抢宝箱、大富翁 | calendar-app/play-treasure.js、play-monopoly.js（v2.4.3.3 起含胜负方式、交易、拍卖、电脑理由、事件列表与资产记录；v2.4.3.4 起含破产清算与电脑的估值、留钱、卖地、收购参数 `LEVELS`）、play-rooms.js（seatCount、托管、takeover、ctx.bot）；public/games/play/board.js（棋盘、骰子与动画速度，两款共用）、treasure.js、monopoly.js |
| 合作小车 | calendar-app/play-car.js、play-car-sim.js（与 lab-service/public/games/play/car-sim.js 逐字节相同）、play-rooms.js（realtime 循环、in／say）；public/games/play/car.js |
| 实时房间、词语默契、对战猜数字 | calendar-app/play-rooms.js（房间、socket 路由、计时、电脑、清理）、play-socket.js、play-word.js、play-digits.js；lab-service/games-host.cjs（upgrade）；public/games/play/（play.js 平台，word.js、digits.js 渲染）；设计稿 docs/GAMES_V2_4_3_0_DESIGN.md |
| 安装、打包、回滚 | scripts/updater/；当前适配器 scripts/releases/v2.4.3.4/ |

Calendar 使用 Node.js、Express、SQLite；Lab 使用 Node 原生 HTTP，浏览器运行 Python/WASM。生产运行代码须保持 Node 20 兼容。浏览器依赖已本地打包，无需让生产服务器在线安装依赖。

## 部署与数据边界

- Caddy 为 HTTPS 入口；主要容器 calendar-app、garyhub-lab。其他 RSS、文件、监控、网络服务按现有配置运行。
- 正式有效配置以 `/opt/my-services/garyhub-active-deployment.json` 及容器实际镜像、挂载为准，不能直接采用 README 中的历史路径。
- Calendar 数据挂载 `/app/data`，Lab 用户数据挂载 `/data`；实际宿主路径需现场核对。
- Calendar 统一账号；共享 Cookie `garyhub.shared.sid`、`.garyhub.uk`、HttpOnly、Secure、SameSite=Lax。保留明确 Origin 与 CSRF 校验。
- Lab 数据按用户独立保存，乐观修订号控制并发。分发为追加独立副本，保留作答与历史，禁止覆盖接收人空间。
- 服务器存在有 TOTP / 无 TOTP 两种历史组合。当前适配器的标识 1.3.4.2 / 1.3.4.1 代表能力组合，不代表当前应用版本。
- 不提交 `.env`、私有 Compose、数据库、会话、密钥、邮件授权、生产备份、homepage-protected.json、profile-private.json、developer-profile.json。

## 已有更新机制

统一入口为 `scripts/updater/manage.py`。v2.4.3.4-r1 的清单和 release-config 统一核对 v2.4.3.3，以已合并 main `2c51ae7` 为审阅源码基线；能力覆盖对应有／无 TOTP 两种历史组合，基础适配器为 v2.4.3.3。共享更新器未修改。

完整解压后双击 RUN-UPDATE.cmd。安装器按实际版本、源码、能力及有效 Compose 预检，并只读核对 Caddyfile 仍有 `games.garyhub.uk` 站点块（不写 Caddy）；执行离线构建、二十组隔离检查、备份、切换、HTTPS/哈希、游戏主机的页面与登录门／CSP／边界、房间 socket 经 Caddy 的 401／403／404 门、房间接口登录门与 Origin／令牌门、两个容器中的小车文件哈希一致、棋盘游戏与本版新文件、全体通知核对（沿用 v2.4.3.3 及更早核对）。ROLLBACK.cmd 恢复 v2.4.3.3 应用并保留当前用户记录与设置；Caddy 无需恢复。提醒 worker 不参与切换。源码导入器使用独立 worktree 和审查分支，不强推或自动合并。本机 `core.autocrlf=true`：构建须在 LF 检出的独立 worktree 中进行。

Markdown ZIP 在浏览器处理，使用原生 DEFLATE 流，不新增服务器运行依赖。支持普通未加密 ZIP（stored/DEFLATE），不支持 RAR、7z、多卷或 ZIP64；图片仅接受 PNG/JPEG/GIF/WebP，外部图片及 SVG 不加载。ZIP 最多 20 MiB、500 个条目、解压合计 50 MiB、单文件 10 MiB、Markdown 4 MiB。源码编辑和包内文档草稿仅保存在本次页面中，不写回原文件。

用户偏好：一次交付可运行 ZIP，减少往返复制代码；说明简洁，成功日志汇总、失败日志按需展开。开发环境验证与生产现场证据分开记录。
