# GaryHub 项目档案

维护日期：2026-11-18（America/Chicago）。首次阅读本文件及 UPDATE_WORKFLOW.md，按任务范围读取相关源码。

## 当前源码与部署证据

- **v2.4.1.5（当前源码，本地已验证）** 基于 PR #47 的 main `0041a4ef2752fa5473bc6775452c864b3f68f17a`（树与 v2.4.1.4 提交 `ef85c1d` 相同），独立分支 `update/garyhub-v2.4.1.5`；清单 `releases/2.4.1.5.json`，适配器 `scripts/releases/v2.4.1.5/`（baseline_adapter v2.4.1.4，安装器 v2.4.1.5-r1，严格要求实际 v2.4.1.4）。按维护者 2026-11-17 要求补齐设置清单第 2、3、7 项：`preferences-api.js` 新增 `appearance.accent`（blue/violet/teal/brown，null=页面原色）、`appearance.density`（standard/compact）、`region.weekStart`（monday/sunday）、`region.dateFormat`（iso/zh/us/eu）、`calendar.view`（month/week/list），共 15 键；`hub-prefs.js` 把这五项镜像到 `garyhub_prefs` Cookie（a/d/w/f/v，首屏前生效），账号值（含未设置）始终覆盖 Cookie、不从浏览器上传，提供 `value()`／`setDisplay()`／`formatDate()`；`brand.css` 按 `html[data-gh-accent][data-gh-theme]` 同时覆盖根元素与 body 的 `--accent`（主页与开发者页总用深色色值），`html[data-gh-density=compact]` 收紧页头、卡片、日历外框、记账指标、工具图标、主页卡片、设置分节与搜索结果；学习中心 `<html data-gh-accent-off>` 退出强调色。`calendar-page.js` 读 `firstDay`／`initialView` 并加月／周／列表切换按钮；`journal-page.js` 按周起始日调整星期标题与月初空格；日期经 `formatDate()` 显示于日历事项列表与今日日期、记账明细与区间、日记列表与筛选、主页“今日”、搜索结果（存储与输入仍为 YYYY-MM-DD）。学习中心：`core.js` 校验 `codeFont`（default/consolas/courier/sans）与 `mathScale`（0.8–1.5），`academic.cjs` 读写，`app.js` 设 `--reader-code-font`／`--reader-math-scale`，`style.css` 代码与 KaTeX 使用它们。无新表，`app.js` 只改版本号。隔离检查仍 13 组，`prefs-http.cjs`（77 项）与 `study-http.cjs`（只改期望字段）换成本版副本。站内通知两条：home、tools。本地验证：Calendar 115、Lab 113；13 组隔离套件两种能力组合通过；浏览器检查强调色、密度、周日开始、中文日期、周视图、日记星期顺序、学习中心代码字体与公式大小。开发中 PowerShell 把中文弯引号当字符串分隔符，截断了 `settings.js` 一行，已在语法检查中发现并改正——**以后写含中文弯引号的文本用 Write/Edit 工具或 Python，不要用 PowerShell 字符串**。源码已准备／本地已验证，尚未推送、合并或部署。详见 GARYHUB_V2_4_1_5.md 与 _TESTS.md。

- **v2.4.1.4（PR #47 已合并为 main `0041a4e`；2026-11-17 tools／calendar `/health` 返回 2.4.1.4，安装输出与通知人数未收录；以下为交付时记录）** 基于 PR #46 的 main `5306dd9b56d753b4b7fd99a92400196b392fe6f8`（树与 v2.4.1.3 提交 `c669e6b` 相同），独立分支 `update/garyhub-v2.4.1.4`；清单 `releases/2.4.1.4.json`，适配器 `scripts/releases/v2.4.1.4/`（baseline_adapter v2.4.1.3，安装器 v2.4.1.4-r1，严格要求实际 v2.4.1.3）。设置中心：原个性化页 `personalize/` 改为六节（外观、语言与地区、网站伙伴、学习中心、记账与工具台、通知与订阅），每项改动立即保存并跨设备同步；头像图标改名“设置”。Calendar `preferences-api.js`：新表 `user_preferences`（无外键，已加入删除清单），`GET`／`PUT /api/hub/preferences`，10 个键各有固定取值、null 复位，一条 `json_patch` 语句原子合并，时区写 `users.timezone`，账号不一致 409，每 IP 每分钟 120 次；经 `extras.js` 注册，`app.js` 只改版本号。Lab `server.cjs` 把该路由加入账号代理并在主页主机放行 `/hub-prefs.js`（无 TOTP 覆盖同样）。共享 `hub-prefs.js`（两服务相同副本，除外站页与 Lab 登录跳转页外全部页面在 `<head>` 中加载，Calendar 页面在 `theme.js` 之前）：`GaryHubTheme` 统一日夜（跟随系统／浅色／深色，`.garyhub.uk` 下 Cookie `garyhub_prefs` 跨子站与首屏），各页 ◐ 按钮保留并保存到账号（维护者要求）；登录后账号值写入各页原有缓存，本浏览器已有而账号没有的选择上传一次；旧 localStorage 键只迁移一次（Cookie 中 `m=1`），不再写回——第一版写回导致“跟随系统”第二次打开变“深色”，已修。伙伴 `boot.js` 保存时发 `garyhub:companion-prefs`（两份副本相同）；`cosmos.js` 支持安静与静止；记账等账号偏好就绪后再取默认币种；工具台跟随账号布局；`academic.cjs` 阅读偏好增加 `lineHeight`（1.4–2.5）与 `readerWidth`（600–1400）。隔离检查 13 组：新增 `prefs-http.cjs`（测试地址 192.0.2.246–248），`study-http.cjs` 换成本版副本（只改期望的偏好字段）。站内通知两条：home、tools。本地验证：Calendar 115、Lab 113 单元测试；13 组隔离套件两种能力组合全部通过（WSL bwrap）；浏览器桌面与 375 px 检查设置页与日夜往返。源码已准备／本地已验证，尚未推送、合并或部署。详见 GARYHUB_V2_4_1_4.md 与 _TESTS.md。

- **v2.4.1.3（PR #46 已合并为 main `5306dd9`；维护者 2026-11-17 报告已安装并推送，同日 tools／calendar `/health` 返回 2.4.1.3，安装输出与通知人数未收录；以下为交付时记录）** 基于 PR #45 的 main `2d1977503a74d921e7c4f6005e181c46da14ca6f`（树与 v2.4.1.2 提交 `aad2f81` 相同），独立分支 `update/garyhub-v2.4.1.3`（其下还有一个只改文档的提交：项目档案精简）；清单 `releases/2.4.1.3.json`，适配器 `scripts/releases/v2.4.1.3/`（baseline_adapter v2.4.1.2，安装器 v2.4.1.3-r1，严格要求实际 v2.4.1.2）。按维护者 2026-11-16 的建议清单一次实现：①统一页头：共享 `brand.css`（行星标志、页头高度、胶囊按钮与圆角）、`hub-nav.js`（≤760 px 时导航收进一个菜单按钮，页头一行），29 个页面换成同一标志 `a.brand.gh-brand`；②站点图标：`favicon.svg`、`icons/*.png`（`scripts/branding/make_icons.py` 生成，两服务各一份相同副本）、两份 `manifest.webmanifest`，所有页面加 icon／apple-touch-icon／manifest 链接；③主页“今日”：`home/today.js` 读 `/api/hub/today`（Calendar `today-api.js` 按账号时区汇总今日日程、逾期数、未完成待办、未读通知；Lab `hub-extras.cjs` 补充学习中心在读讲义），登录后欢迎区收窄、今日面板与入口卡片同屏；④全站搜索：`hub-search.js`／`.css`（Ctrl/⌘+K 或 /），工具与页面在浏览器内匹配，`/api/hub/search` 只查当前账号的事项、待办、日记、账本备注、科研词典，主页／Tools 经 Lab 再加讲义标题；LIKE 转义 % 与 _，每 IP 每分钟 90 次；⑤登录来由：`auth-page.js` 按 `next` 显示“登录后将继续前往「…」”；⑥免登录本地工具：`server.cjs` 去掉三个本地工具页的登录门（CSP 不变），工具台给访客标“免登录”；⑦开发者公开卡：无可见栏目时显示 `developer/public-card.json`（非私人文案，可直接编辑）加访问码入口；⑧日历订阅：`calendar-feed.js`，`/feed/<32 位令牌>.ics` 只读、只存 SHA-256、可重新生成或关闭、停用账号立即失效；⑨浏览器推送：`push-api.js` 用 Node 自带 crypto 实现 RFC 8291 加密与 RFC 8292 VAPID（无新依赖，RFC 附录示例逐字节复现），只接受 FCM／Mozilla／Apple／Windows 推送服务地址，404／410 自动删除订阅，事项提醒按邮件提醒时间推送（Calendar 进程内每分钟扫描），`public/sw.js` 只显示通知不缓存；⑩账本：`ledger-budget.js`（按类别或全部消费的月度预算、六个月趋势、CSV 导出，单元格防公式注入）复用账本自己的连接、账号头与串行队列；⑪A 股到价提醒：`stock-alerts.js`，订阅门之后，普通 3 个／VIP 20 个，交易时段每分钟检查，一次触发后发 `tools` 站内通知并推送。新表 `calendar_feeds`、`push_keys`、`push_subscriptions`、`push_reminder_log`、`stock_alerts`、`ledger_budgets` 均 `IF NOT EXISTS` 且无指向 users 的外键，按账号的五张已加入 `account-admin.js` 删除清单；回滚到 v2.4.1.2 时保留不用。`app.js` 只多三行接线（`extras.js`），无 TOTP 覆盖做同样改动。`deploy.py` 以 `prior_0412.py` 载入 v2.4.1.2 适配器并沿用全部核对，唯一替换的是共享运行时“本地工具对访客 302”的检查（改为访客 200 且带 CSP）；另核对新接口的登录／Origin 门、manifest、容器中的新文件和新表。隔离检查 12 组（`useful-http.cjs` 换成本版，新增 `extras-http.cjs`，用测试地址 192.0.2.251–254，推送打到套件内的假推送服务 127.0.0.1:4012）。站内通知三条：home／calendar／tools。本地验证（本版起构建机可运行 Node）：Calendar 单元测试（Windows Node 24）、Lab 单元测试（WSL Node 20）、12 组隔离套件在两种能力组合下以 WSL bwrap 沙箱代替 Docker 运行全部通过，浏览器在桌面与 375 px 检查主页、工具台、登录、日历设置、记账、A 股提醒和开发者页。未验证：真实浏览器向真实推送服务的送达、真实日历应用订阅、Docker 构建与安装器现场阶段。源码已准备／本地已验证，尚未推送、合并或部署。详见 GARYHUB_V2_4_1_3.md 与 _TESTS.md。

本节只保留最近三个版本的完整条目。更早版本的完整记录在各自的版本文档末尾“项目档案历史记录”一节；发新版时，把最旧的一条原样移入其版本文档，并在下表补一行。


## 版本索引

状态只摘录已有记录；“未收录”指安装输出与通知人数不在本仓库。GitHub 合并不等于生产部署。

| 版本 | 内容 | GitHub | 生产证据 | 记录 |
|---|---|---|---|---|
| 2.4.1.5 | 补齐设置：强调色、密度、周起始日、日期格式、日历默认视图、代码字体、公式大小 | 未推送 | 未部署 | 上文，GARYHUB_V2_4_1_5.md |
| 2.4.1.4 | 设置中心：账号偏好跨设备同步、全站日夜、学习中心行距与宽度 | PR #47，main `0041a4e` | 2026-11-17 `/health`；未收录 | 上文，GARYHUB_V2_4_1_4.md |
| 2.4.1.3 | 统一页头与图标、今日面板、全站搜索、免登录工具、日历订阅、推送、预算、到价提醒 | PR #46，main `5306dd9` | 2026-11-17 `/health`、维护者报告已安装；未收录 | 上文，GARYHUB_V2_4_1_3.md |
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
| 安装、打包、回滚 | scripts/updater/；当前适配器 scripts/releases/v2.4.1.5/ |

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

统一入口为 `scripts/updater/manage.py`。v2.4.1.5-r1 的清单和 release-config 统一核对 v2.4.1.4，以已合并 main `0041a4e` 为审阅源码基线；能力覆盖对应有／无 TOTP 两种历史组合，基础适配器为 v2.4.1.4。共享更新器未修改。

完整解压后双击 RUN-UPDATE.cmd。安装器按实际版本、源码、能力及有效 Compose 预检，执行离线构建、十三组隔离检查、备份、切换、HTTPS/哈希、偏好接口登录门、共享脚本与样式一致性、容器内新文件／偏好表核对和全体通知核对（沿用 v2.4.1.4 核对并新增样式与学习中心退出强调色核对）。ROLLBACK.cmd 恢复 v2.4.1.4 应用并保留当前用户记录与设置；本版没有表结构变化，新增的偏好键旧版会忽略。源码导入器使用独立 worktree 和审查分支，不强推或自动合并。本机 `core.autocrlf=true`：构建须在 LF 检出的独立 worktree 中进行。

Markdown ZIP 在浏览器处理，使用原生 DEFLATE 流，不新增服务器运行依赖。支持普通未加密 ZIP（stored/DEFLATE），不支持 RAR、7z、多卷或 ZIP64；图片仅接受 PNG/JPEG/GIF/WebP，外部图片及 SVG 不加载。ZIP 最多 20 MiB、500 个条目、解压合计 50 MiB、单文件 10 MiB、Markdown 4 MiB。源码编辑和包内文档草稿仅保存在本次页面中，不写回原文件。

用户偏好：一次交付可运行 ZIP，减少往返复制代码；说明简洁，成功日志汇总、失败日志按需展开。开发环境验证与生产现场证据分开记录。
