# GaryHub 项目档案

维护日期：2026-10-25。首次阅读本文件及 UPDATE_WORKFLOW.md，按任务范围读取相关源码。

## 当前源码与部署证据

- 仓库 Gary-BANG/garyhub，main 最新审阅提交 `18cb483b3417b51686ab37b09ac2a69499233c71`，PR #19 已合并 v1.4.1.0。旧档案“未合并”的说法是当时状态，不再代表 GitHub。
- 当前安装器修订 r4：用户 r3 已通过服务/数据库识别和离线构建，在 3/8 隔离测试以笼统 Docker 错误停止，尚未切换正式服务或发布本次通知。按 r3 隔离环境本地复现模拟登录 403；r4 补全测试专用 TRUSTED_ORIGINS，本地运行器直接读取同一发布配置。失败输出增加具体测试名、允许公开的错误码/状态及私有日志路径，清理前保留临时容器日志；不输出凭据或响应正文。
- r3 已修复 r2 固定 `miniflux-db` Compose 服务名的问题：从实际 Caddy 上游与 Miniflux 数据库连接解析目标，在源容器网络命名空间验证 DNS，唯一匹配运行容器，再以实际数据库/用户进行只读身份验证及备份；不猜测服务名，不使用 PostgreSQL 默认数据库代替。
- 本次准备 v1.4.2.0，分支 `update/garyhub-v1.4.2.0`，严格要求两个 Web 服务现场实际 v1.4.1.0；入口 `releases/current.json`、清单 `releases/1.4.2.0.json`。
- 新增管理员 Server Monitor；Files/Status 仅管理员，Reading 仅管理员及 subscriber。Reading 使用当前 Miniflux 与 PostgreSQL，通过 GaryHub 权限验证和隔离 Cookie 的网关统一网页登录；旧账号支持 API Token 验证关联，不保存 Token。
- 五个私人工作区页新增每日金句，按账号时区稳定换日；Research 增加粒子；所有粒子页面新增同一首原创音乐、播放按钮、偏好记忆和跨页面播放协调。
- 状态：源码准备及本地验证见 `docs/GARYHUB_V1_4_2_0_TESTS.md`；尚未推送/合并本次分支，未连接生产，正式服务版本、实际通知人数与 Miniflux 现场验收结果尚未核验。
- 功能、指标含义、旧 Reading 关联和恢复边界：`docs/GARYHUB_V1_4_2_0.md`。Research 仍按账号和项目独立保存，管理员不因此获得其他用户词库读取权限。

## 模块定位

| 需求 | 首先读取 |
|---|---|
| 登录、会话、账号、通知 | calendar-app/app.js、auth-utils.js、account-admin.js、hub-api.js |
| 日历、Todo、私人记录 | calendar-app/ 对应 API 文件和 public/ 对应页面 |
| 账本、汇率、固定支出 | calendar-app/ledger-api.js、fixed-expenses.js、fx-rates.js |
| 工具权限、Reading 关联、每日金句 | calendar-app/tool-access.js、daily-quote.js；lab-service/reading-proxy.cjs |
| 服务器监控 | server-monitor/collect.py、lab-service/server-monitor.cjs、public/server-monitor/ |
| 粒子与音乐 | calendar-app/public/ambient.js、particles.js、两个服务 public/ambient-music.* |
| Research Dictionary | calendar-app/research-api.js、public/research/、account-admin.js |
| Tools 入口、搜索与 Dock | lab-service/public/index.html、tools-catalog.js、tools-dock.js、tools-dock.css |
| 跨站跳转 | 两服务的 public/auth-redirect.js |
| ECE 470 Lab | lab-service/server.cjs、public/lab/app.js、cloud.js、core.js |
| 作业题库分发 | lab-service/lab-distribution.cjs、public/lab/distribution.js、pack-validation.mjs |
| 三个本地实用工具 | lab-service/public/useful/，避免读取 vendor/ 的大文件 |
| 安装、打包、回滚 | scripts/updater/；当前适配器 scripts/releases/v1.4.2.0/ |

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

统一入口 `scripts/updater/manage.py`。v1.4.2.0 注册自己的发布配置、HTTPS 校验及 host integration 适配器，复用共享 overlay 构建器、备份/切换/回滚运行时、已审阅 Windows 安装模板和独立源码导入器。baseline_adapter 为 `scripts/releases/v1.4.1.0`。不复制整套旧发布目录，不把新版本指向旧硬编码安装器。

本次新增采集定时器、只读快照挂载、Reading 网关、Caddy 权限门及 Miniflux 代理认证配置。Xray 统计接口仅本机回环监听。升级时基于现场配置准备候选，验证 Miniflux 隔离实例、备份 PostgreSQL/SQLite/Lab 和私有配置后切换；HTTPS 和统计核验后按 RELEASE_POLICY 发布并验证全体收件人与去重。

完整解压 ZIP 后双击 RUN-UPDATE.cmd；ROLLBACK.cmd 恢复 v1.4.1.0 镜像与本次相关配置，保留所有当前记录和后来新增的 VPN 用户。有效配置依然从 `/opt/my-services/garyhub-active-deployment.json` 与实际容器核对，新增 integrations 记录 Miniflux 的有效 Compose。PUSH-TO-GITHUB.cmd 仍以独立 worktree 准备审查分支，不覆盖原工作区、不 force push、不自动合并 main。

Markdown ZIP 在浏览器处理，使用原生 DEFLATE 流，不新增服务器运行依赖。支持普通未加密 ZIP（stored/DEFLATE），不支持 RAR、7z、多卷或 ZIP64；图片仅接受 PNG/JPEG/GIF/WebP，外部图片及 SVG 不加载。ZIP 最多 20 MiB、500 个条目、解压合计 50 MiB、单文件 10 MiB、Markdown 4 MiB。源码编辑和包内文档草稿仅保存在本次页面中，不写回原文件。

用户偏好：一次交付可运行 ZIP，减少往返复制代码；说明简洁，成功日志汇总、失败日志按需展开。开发环境验证与生产现场证据分开记录。
