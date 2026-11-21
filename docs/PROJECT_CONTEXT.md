# GaryHub 项目档案

维护日期：2026-11-20（America/Chicago）。首次阅读本文件及 UPDATE_WORKFLOW.md，按任务范围读取相关源码。

## 当前源码与部署证据

- **v2.4.3.1（当前源码，本地已验证）** 基于 PR #51 的 main `e61b20051c4db52b709b01cec04c736134ab0585`（树与 v2.4.3.0 提交 `6021d8b` 相同），独立分支 `update/garyhub-v2.4.3.1`；清单 `releases/2.4.3.1.json`，适配器 `scripts/releases/v2.4.3.1/`（baseline_adapter v2.4.3.0，安装器 v2.4.3.1-r1，严格要求实际 v2.4.3.0）。按维护者 2026-11-20 要求做设计稿第 5 节的**合作小车**第一版：一人方向、一人油门／刹车／2 次氮气；3 关（直道起步；S 弯与锥桶；窄桥 36 km/h 限速半秒滑落、跳台 ≥58 km/h、油污转向三成），3 颗心（锥桶扣 1，之后 1.5 秒无敌）、离路太远／掉桥／缺口回检查点扣 3 秒、限时 75／80／100 秒、1–3 星（通关、标准时间 36／37／47 秒内、未丢心）；宽松模式（路宽 ×1.2 等）；快捷呼叫；油门手前方提示与小地图；结束后房主“再试一次／下一关”直接开始。物理与赛道是一个文件：Calendar `play-car-sim.js` 运行，页面加载逐字节相同的 `public/games/play/car-sim.js`（测试与安装后核对）。Calendar 新文件 `play-car.js`（规则、按座位校验的输入、掉线松键、恢复倒数、战绩）；`play-rooms.js` 加实时循环（每秒 20 次推进、固定 60 Hz 物理、每次发约 200 多字节的帧，暂停／结束／关闭时停止）、`in`／`say` 快速通道（突发 60、每秒 40，多余丢弃不断线；呼叫同人间隔 ≥0.4 秒）、掉线立即调用 `drop` 并以 3 秒宽限暂停、恢复时调用游戏 `resume`、房主直接再来一局（全员在线且坐满时跳过大厅）。只有出界、撞锥、捡币、过检查点、倒数结束等时刻存盘并发完整状态。页面 `car.js`：跟车镜头 Canvas、晚 110 毫秒插值、本机按键立即显示、“操作回显”（按下到服务器帧回应的中位数）、触屏长按与键盘、网页隐藏或失焦即松键。Lab `games-host.cjs` 放行两个脚本；`app.js`、`server.cjs` 只改版本号；无新表、无新依赖、不改 Caddy。离线自动驾驶在 0／250／400 毫秒操作延迟下三关都能通关（据此调宽锥桶阵、定标准时间）。隔离检查 17 组（新增 `car-http.cjs`，登录地址 192.0.2.227–228）。站内通知一条：home。本地验证：Calendar 140、Lab 115；浏览器三关连续通过、两种角色、掉线 3 秒暂停与恢复、375 px。源码已准备／本地已验证，尚未推送、合并或部署。详见 GARYHUB_V2_4_3_1.md 与 _TESTS.md。

- **v2.4.3.0（PR #51 已合并为 main `e61b200`；2026-11-20 tools／calendar `/health` 返回 2.4.3.0，房间 socket 经 Caddy 无登录 401、外来来源 403、tools 主机 404，安装输出与通知人数未收录；以下为交付时记录）** 基于 PR #50 的 main `4511bd72a8b4310cb4f61e1e97bb04fa73c140e0`（树与 v2.4.2.0 提交 `92b6de1` 相同），独立分支 `update/garyhub-v2.4.3.0`；清单 `releases/2.4.3.0.json`，适配器 `scripts/releases/v2.4.3.0/`（baseline_adapter v2.4.2.0，安装器 v2.4.3.0-r1，严格要求实际 v2.4.2.0）。按维护者 2026-11-20 要求，依设计稿 `docs/GAMES_V2_4_3_0_DESIGN.md` 第 7 节先做**实时房间平台 + 词语默契 + 对战猜数字**。页面 `games.garyhub.uk/play/` 经 `wss://games.garyhub.uk/api/hub/play/socket` 连接：Lab `games-host.cjs` 新增 `upgrade`，只在 games 主机、只对该路径接受，转发 Cookie／Origin／最后一跳地址与握手键（不转发扩展），之后双向原样转发，任一端关闭或只发 FIN 即关两端；Calendar 新文件 `play-socket.js`（RFC 6455 服务端，Node 原生、无新依赖：掩码文本帧、≤8 KiB、各关闭码、发送缓冲 >1 MiB 断开、收到 FIN 立即断开）、`play-rooms.js`（升级请求走一遍 Express——会话、账号与 auth_version、428——再由 `GET /api/hub/play/socket` 路由核对 Origin 必须是 games 来源（403）、登录（401）、每账号 ≤4 连接；每分钟复核账号；15 秒心跳、45 秒无数据断开；每条 ≤2 KiB、令牌桶突发 20／每秒 8；动作 id 去重；按座位过滤的完整视图推送；规则在状态副本上执行；服务器计时与掉线 10 秒暂停、全员回来后续时（≥5 秒）；`GET/POST /api/hub/play`；按用户名站内邀请每房间 10 次；每账号 ≤3 个未结束房间；新表 `play_rooms` 一房一行，`user_id`＝当前房主、`members` 座位账号、`data` JSON，无外键，已入删除清单；每次变化写入，重启后对局以暂停恢复；每小时关闭 30 分钟无人的大厅、7 天无进展的对局，删除结束 180 天的房间与成员账号不存在的房间）、规则 `play-word.js`（同时提交揭晓、NFKC 小写去标点比较、禁用已出现的词、双方“算我们一样”、15 秒最后提醒、连续 3 轮超时停表、上限／认输／离开中断）与 `play-digits.js`（4 位不重复、同时猜、xA yB、同轮都中平局、30 轮平局、连续 3 轮未猜判负、离开 2 分钟可判胜；电脑三档：新手与普通只记最近 3 条提示、新手 1/5 乱猜，精明全记并做有上限的极小化最大值，约 9／7.4／5.4 次）。`app.js` 改 2 行加 1 行（`attachExtras(app, server)`），`server.cjs` 改 2 行加 1 行（calendarUrl、代理路由 `play`、`server.on('upgrade')`），无 TOTP 覆盖逐行相同；CSP `connect-src` 加 `wss://games.garyhub.uk`；两份 `auth-redirect.js` 的 games 路由加 `/play/`（v2.4.2.0 的运行标记由本版适配器改为核对新列表）。大厅新增两张卡片与房间码加入；主页“更多”说明、两份 `hub-search.js`、两份伙伴 `knowledge.js` 同步。房间显示每人到服务器的往返中位数与波动和“你们之间约 X ms”，结果中保存；本构建机到生产服务器中位 82 ms，另一地点待部署后实测。Caddy 不改：第 1 阶段只读核对 v2.4.2.0 的站点块；第 6 阶段经 Caddy 核对 socket 401／403／404 门。隔离检查 16 组（新增 `play-http.cjs`，登录地址 192.0.2.224–226）。站内通知一条：home。本地验证：Calendar 137、Lab 115；浏览器完成两款游戏、掉线暂停与恢复、375 px、夜间。验证中修复：只发 FIN 的掉线原本要等 45 秒心跳；`/play/` 原本不是登录返回路由。源码已准备／本地已验证，尚未推送、合并或部署。详见 GARYHUB_V2_4_3_0.md 与 _TESTS.md。

- **v2.4.2.0（PR #50 已合并为 main `4511bd7`；2026-11-20 tools／calendar `/health` 返回 2.4.2.0、`games.garyhub.uk` 已响应，安装输出与通知人数未收录；以下为交付时记录）** 基于 PR #49 的 main `ca696d2ae307e5351821687155309c528963a560`（树与 v2.4.1.6 提交 `a05f41c` 相同），独立分支 `update/garyhub-v2.4.2.0`；清单 `releases/2.4.2.0.json`，适配器 `scripts/releases/v2.4.2.0/`（baseline_adapter v2.4.1.6，安装器 v2.4.2.0-r1，严格要求实际 v2.4.1.6）。按维护者 2026-11-20 要求（方案沟通后批准）新增子站 **`games.garyhub.uk`**（游戏厅）与双人轮流游戏“白日梦想家”：发起人设 10–20 个金额或礼品（礼品可选估值），服务器 `crypto.randomInt` 打乱并只公布 `SHA-256(盐|顺序)` 指纹；参与人看奖池后选盒；每轮发起人定揭开数（首轮 0..N−2 在开局时定，之后随出价定“若不卖下一轮揭开几个”，1..剩余−1）、参与人选揭开哪几个；只剩一个别的盒子时为最后一次出价；成交或拒绝最后出价后发起人逐个揭开（可自动依次），最后揭晓参与人的盒子，结束后公开盐与顺序、页面核对指纹；只做记录，不处理付款。Calendar 新文件 `games-api.js`（经 `extras.js` 注册；新表 `dream_games`，一局一行，`user_id`=发起人、`player_id`=参与人，无外键，已入删除清单；每步一条带修订号的条件 UPDATE，双方之外 404、错方 403、过期 409；轮到谁谁收站内通知 type `game`／scope `home`，推送跟随“事项提醒”推送与免打扰；每小时把 30 天无进展的局置为过期并删除账号已不存在的局）。`app.js` 在 `TRUSTED_ORIGINS` 之外**代码中明确加入** `https://games.garyhub.uk`（不改 Compose）；Lab `TRUSTED` 同样加入。Lab 新文件 `games-host.cjs`：游戏主机只给大厅／对局页（需登录，跳转回原页面）、四个静态脚本样式、`hub-prefs.js` 与图标，以及 csrf/me/hub-me/preferences/games 接口，其余 404，CSP `default-src 'none'`；其他主机 `/games/` 404。`server.cjs` 新增 2 行、改 3 行（可信来源、代理路由、版本号），无 TOTP 覆盖逐行相同。两服务 `auth-redirect.js` 加入 games 的 `/`、`/dream/`；`sw.js` 允许打开 games 主机；主页“更多”菜单加 “Games”（`i18n/dictionary.js` 中英）、两份 `hub-search.js` 与伙伴 `knowledge.js`（两份相同）加入口。学习中心版本标记随应用改为 v2.4.2.0。适配器沿用 v2.4.1.6 全部核对，DNS 预检与 Caddy 追加／validate／健康后写入／回滚恢复沿用 v2.1.0.0 做法；游戏文件哈希单独成组（`games_asset_checksums`、`games_page_checksums`）。隔离检查 15 组（新增 `games-http.cjs`，登录地址 192.0.2.221–223）。站内通知一条：home。本地验证：Calendar 128、Lab 113；浏览器以发起人与参与人分别完成整局，中英文、日夜、375 px。**安装前需在 Cloudflare 添加 `games` A 记录（仅 DNS）**。源码已准备／本地已验证，尚未推送、合并或部署。详见 GARYHUB_V2_4_2_0.md 与 _TESTS.md。

本节只保留最近三个版本的完整条目。更早版本的完整记录在各自的版本文档末尾“项目档案历史记录”一节；发新版时，把最旧的一条原样移入其版本文档，并在下表补一行。


## 版本索引

状态只摘录已有记录；“未收录”指安装输出与通知人数不在本仓库。GitHub 合并不等于生产部署。

| 版本 | 内容 | GitHub | 生产证据 | 记录 |
|---|---|---|---|---|
| 2.4.3.1 | 合作小车：实时循环与帧、方向／油门分工、3 关、掉线松键与倒数恢复、操作回显 | 未推送 | 未部署 | 上文，GARYHUB_V2_4_3_1.md |
| 2.4.3.0 | 实时房间（WebSocket、房间码、掉线暂停与重连、延迟），词语默契、对战猜数字与电脑对手 | PR #51，main `e61b200` | 2026-11-20 `/health`、socket 门 401／403／404；未收录 | 上文，GARYHUB_V2_4_3_0.md |
| 2.4.2.0 | 游戏厅 games.garyhub.uk 与双人游戏“白日梦想家” | PR #50，main `4511bd7` | 2026-11-20 `/health`；未收录 | 上文，GARYHUB_V2_4_2_0.md |
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
| 合作小车 | calendar-app/play-car.js、play-car-sim.js（与 lab-service/public/games/play/car-sim.js 逐字节相同）、play-rooms.js（realtime 循环、in／say）；public/games/play/car.js |
| 实时房间、词语默契、对战猜数字 | calendar-app/play-rooms.js（房间、socket 路由、计时、电脑、清理）、play-socket.js、play-word.js、play-digits.js；lab-service/games-host.cjs（upgrade）；public/games/play/（play.js 平台，word.js、digits.js 渲染）；设计稿 docs/GAMES_V2_4_3_0_DESIGN.md |
| 安装、打包、回滚 | scripts/updater/；当前适配器 scripts/releases/v2.4.3.1/ |

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

统一入口为 `scripts/updater/manage.py`。v2.4.3.1-r1 的清单和 release-config 统一核对 v2.4.3.0，以已合并 main `e61b200` 为审阅源码基线；能力覆盖对应有／无 TOTP 两种历史组合，基础适配器为 v2.4.3.0。共享更新器未修改。

完整解压后双击 RUN-UPDATE.cmd。安装器按实际版本、源码、能力及有效 Compose 预检，并只读核对 Caddyfile 仍有 `games.garyhub.uk` 站点块（不写 Caddy）；执行离线构建、十七组隔离检查、备份、切换、HTTPS/哈希、游戏主机的页面与登录门／CSP／边界、房间 socket 经 Caddy 的 401／403／404 门、房间接口登录门与 Origin／令牌门、容器内新文件与小车文件哈希一致、全体通知核对（沿用 v2.4.3.0 及更早核对）。ROLLBACK.cmd 恢复 v2.4.3.0 应用并保留当前用户记录与设置；小车房间留在 `play_rooms`，旧版不加载；Caddy 无需恢复。提醒 worker 不参与切换。源码导入器使用独立 worktree 和审查分支，不强推或自动合并。本机 `core.autocrlf=true`：构建须在 LF 检出的独立 worktree 中进行。

Markdown ZIP 在浏览器处理，使用原生 DEFLATE 流，不新增服务器运行依赖。支持普通未加密 ZIP（stored/DEFLATE），不支持 RAR、7z、多卷或 ZIP64；图片仅接受 PNG/JPEG/GIF/WebP，外部图片及 SVG 不加载。ZIP 最多 20 MiB、500 个条目、解压合计 50 MiB、单文件 10 MiB、Markdown 4 MiB。源码编辑和包内文档草稿仅保存在本次页面中，不写回原文件。

用户偏好：一次交付可运行 ZIP，减少往返复制代码；说明简洁，成功日志汇总、失败日志按需展开。开发环境验证与生产现场证据分开记录。
