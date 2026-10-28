# GaryHub 项目档案

维护日期：2026-10-27（America/Chicago）。首次阅读本文件及 UPDATE_WORKFLOW.md，按任务范围读取相关源码。

## 当前源码与部署证据

- 仓库 `Gary-BANG/garyhub`，main 已核对到 `903f47778d3f8bf1d6efb99b1b21c10764b1cdae`：PR #21 已合并 v1.4.3.0；原档案的未合并状态已过期。GitHub 合并仍不代表生产完成。
- 当前安装器修订 r3。用户提供的 r1 输出表明：1/8–5/8 通过，6/8 对受登录保护的 Markdown Viewer index.html 做未登录响应哈希比较时失败，随后自动回滚到 v1.4.3.0，报告保留全部当前记录；未到 7/8 发布通知。r1 将正常登录重定向当成文件正文比较，属于安装器校验错误。
- r2 将公开资源的 HTTPS 正文哈希与受保护页面的运行容器文件哈希／未登录 HTTPS 302 跳转分别检查。新增真实登录后页面字节检查及直接运行第 6 阶段校验器的本地测试，保留登录保护、全部哈希、备份和回滚。r2 使用独立缓存／服务器目录，不与 r1 包标记冲突；应用版本仍是 v1.4.3.1。
- r2 用户输出在 1/8 因 Effective Compose does not match active deployment index 停止，尚未构建或切换。已从共享回滚代码复现：old_up 使用备份 Compose 路径，容器标签记录该路径，但旧 restore 原样复制回滚前索引，留下路径不一致。
- r3 修正共享 restore：恢复后核对实际镜像、运行状态、项目／服务和 Compose 标签，索引记录实际使用的备份路径，再执行严格一致性检查。另只针对已知 v1.4.3.1-r1 的回滚记录提供受限对齐：核对原包清单哈希、rolled-back 状态、未变化的原索引、两服务镜像／身份／路径、完整解析后的配置等价性及未变化的 Caddy；全部吻合才备份索引并原子更新路径。未知变化仍拒绝，不重启服务、不更改 Compose／数据库／用户记录。
- r3 用 15 项带实际路径标签的状态夹具覆盖“r1 回滚→旧检查复现失败→受限修复→重试”、今后的自动／手动回滚→严格检查、幂等／中断恢复、后续镜像或配置变更、符号链接及丢失证据拒绝。共享核心现为 35 项；有／无 TOTP HTTP 与第 6 阶段本地验证继续通过，实际 Docker／服务器修复结果仍待用户运行 r3。
- 本次独立分支 `update/garyhub-v1.4.3.1`，入口 `releases/current.json`、清单 `releases/1.4.3.1.json`。目标 v1.4.3.1，严格要求 Calendar 和 Tools/Lab 均实际 v1.4.3.0；有／无 TOTP 两种能力组合仍分别核验。
- v1.4.3.1：学习中心课程／讲次左栏用图标收起和展开，首次展开，选择保存在当前浏览器。Lecture Notes 用新标签页打开当前讲义的 Markdown Viewer，同时读取已导入的配图；经既有 state 接口读取，不新增上传或服务器写入。
- Viewer 以文档顶层 h1–h6 构建嵌套章节，父章节收起时包含其下级；打开文档默认全部收起，支持全局展开／收起。目录默认收起，显示完整层级，点击自动展开祖先与目标并定位；重复标题独立，编辑时保留仍能匹配的章节展开状态。源码编辑保持独立控制。
- 讲义链接只带账号／课程／讲次编号，不带正文或图片。打开时检查当前账号；重新聚焦、页面可见或可见页面每 10 秒检查会话，变化或失效时清除讲义、图片 URL、草稿和目录。Viewer 的临时编辑不写回学习中心。
- README 已改为当前项目入口；每次发布的 README 同步要求在 `UPDATE_WORKFLOW.md`，AGENTS 只提供提醒。历史路径已明确标注，不能用于替代有效部署索引。
- 本次复用共享 overlay 构建器、部署运行时、Windows 安装入口和独立 worktree 源码导入器。v1.4.3.1 不注册 host prepare/apply hooks；继承已有 R2 只读挂载、Reading、监控、Caddy 和 VPN 配置。应用入口与有／无 TOTP 覆盖文件只更新健康检查版本。
- 继承 v1.4.3.0 的普通账号 5 项固定开支／5 条 Todo／每条 10 points，以及订阅／管理员 300 项和 100 points；保留已有超额数据和 MP3 库。音乐限额为每人 10 首／20 MiB 单首／100 MiB 合计，应用对象总限额 8 GiB。R2 凭据只在服务器受限配置中；详见 v1.4.3.0 文档。
- 本地验证、限制和后续包校验见 `docs/GARYHUB_V1_4_3_1_TESTS.md`；功能及回滚见 `docs/GARYHUB_V1_4_3_1.md`。本次未直接连接生产、推送或合并；r3 的生产结果／通知人数仍待用户运行修订包后核对。
- 最近生产证据为 r1 报告恢复 v1.4.3.0、r2 在 1/8 因 Compose 路径索引不一致停止的输出。应用未因 r2 再次切换；索引对齐和 v1.4.3.1-r3 完成结果均待现场证据。基线和配置校验仍不得放宽。

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
| 学习中心与讲义 | lab-service/public/academic/；Viewer study-document.mjs 使用既有 academic/state 接口 |
| Markdown 阅读、章节与目录 | lab-service/public/useful/markdown-viewer/，避免打印 index.html 内嵌第三方 bundle |
| Tools 入口、搜索与 Dock | lab-service/public/index.html、tools-catalog.js、tools-dock.js、tools-dock.css |
| 跨站跳转 | 两服务的 public/auth-redirect.js |
| ECE 470 Lab | lab-service/server.cjs、public/lab/app.js、cloud.js、core.js |
| 作业题库分发 | lab-service/lab-distribution.cjs、public/lab/distribution.js、pack-validation.mjs |
| 三个本地实用工具 | lab-service/public/useful/，避免读取 vendor/ 的大文件 |
| 安装、打包、回滚 | scripts/updater/；当前适配器 scripts/releases/v1.4.3.1/ |

Calendar 使用 Node.js、Express、SQLite；Lab 使用 Node 原生 HTTP，浏览器运行 Python/WASM。生产运行代码须保持 Node 20 兼容。浏览器依赖已本地打包，无需让生产服务器在线安装依赖。

## 部署与数据边界

- Caddy 为 HTTPS 入口；主要容器 calendar-app、garyhub-lab。其他 RSS、文件、监控、网络服务按现有配置运行。
- 正式有效配置以 `/opt/my-services/garyhub-active-deployment.json` 及容器实际镜像、挂载为准，不能直接采用 README 中的历史路径。
- Calendar 数据挂载 `/app/data`，Lab 用户数据挂载 `/data`；实际宿主路径需现场核对。
- Calendar 统一账号；共享 Cookie `garyhub.shared.sid`、`.garyhub.uk`、HttpOnly、Secure、SameSite=Lax。保留明确 Origin 与 CSRF 校验。
- Lab 数据按用户独立保存，乐观修订号控制并发。分发为追加独立副本，保留作答与历史，禁止覆盖接收人空间。
- 服务器存在有 TOTP / 无 TOTP 两种历史组合。当前适配器的标识 1.3.4.2 / 1.3.4.1 代表能力组合，不代表当前应用版本。
- 不提交 `.env`、私有 Compose、数据库、会话、密钥、邮件授权、生产备份、homepage-protected.json、profile-private.json。

## 已有更新机制

统一入口 `scripts/updater/manage.py`。当前 v1.4.3.1 有独立清单、release-config、deploy.py 和健康版本覆盖；baseline_adapter 为 `scripts/releases/v1.4.3.0`。复用共享 build_overlay.py、deploy_runtime.py 和 Windows 模板。不复制整套旧发布目录，不把新版本指向旧硬编码安装器。

完整解压 ZIP 后双击 RUN-UPDATE。现场依次核对实际版本、源码、能力组合和有效 Compose，离线构建，以隔离合成数据验证，备份 SQLite/Lab 并干跑既有迁移，再切换并验证 HTTPS／资源哈希，最后按 RELEASE_POLICY 核对全体收件人与去重。本版不增加数据库迁移或生产运行依赖。

ROLLBACK 恢复安装前的 v1.4.3.0 应用及原有效配置，保留当前用户记录与音乐。后续部署或配置变化时停止覆盖。PUSH-TO-GITHUB 用独立 worktree 准备审查分支，不覆盖原工作区、不强推、不自动合并 main。

Markdown ZIP 在浏览器处理，使用原生 DEFLATE 流，不新增服务器运行依赖。支持普通未加密 ZIP（stored/DEFLATE），不支持 RAR、7z、多卷或 ZIP64；图片仅接受 PNG/JPEG/GIF/WebP，外部图片及 SVG 不加载。ZIP 最多 20 MiB、500 个条目、解压合计 50 MiB、单文件 10 MiB、Markdown 4 MiB。源码编辑和包内文档草稿仅保存在本次页面中，不写回原文件。

用户偏好：一次交付可运行 ZIP，减少往返复制代码；说明简洁，成功日志汇总、失败日志按需展开。开发环境验证与生产现场证据分开记录。
