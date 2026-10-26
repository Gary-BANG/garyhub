# GaryHub 项目档案

维护日期：2026-10-26。首次阅读本文件及 UPDATE_WORKFLOW.md，按任务范围读取相关源码。

## 当前源码与部署证据

- 仓库 Gary-BANG/garyhub。已核对 main 基础提交 `0acf0c89dba8db923441df162a22743d604a5ebf`：PR #20 已合并 v1.4.2.0。旧档案中的“尚未合并”是历史状态。
- 当前安装器修订 r2。用户 r1 现场输出（2026-10-26 18:58:05 UTC）已通过基础版本/源码核对和离线构建，停在 3/8 的 Tools/Lab startup health；fake-r2.cjs:5:35 与本地未设置 DATA_DIR 时的 ERR_INVALID_ARG_TYPE 完全一致。原因是通用隔离环境把 Calendar 的 NODE_OPTIONS/R2 假凭据也传给 Lab，而此前本地运行器给两个服务共用了 DATA_DIR，掩盖了差异。
- r2 新增按服务的隔离环境配置：仅 Calendar 加载模拟 R2，Lab 仅使用 LAB_DATA_DIR；本地运行器读取与安装器相同的环境选择函数，明确断言 Lab 不含 DATA_DIR、R2 凭据或该 preload。增加六项回归并验证实际 Docker 启动参数；有/无 TOTP 各 166 项 HTTP 及 5 个合成收件人/通知去重通过。保留全部现场校验，不跳过健康测试；实际 Docker 与服务器结果仍待用户运行 r2 核验。
- 本次在独立分支 `update/garyhub-v1.4.3.0` 准备 v1.4.3.0；源码入口 `releases/current.json`、清单 `releases/1.4.3.0.json`。安装器必须现场确认 Calendar 和 Tools/Lab 均实际 v1.4.2.0，不能凭 GitHub 合并推断上线。
- 普通账号最多 5 项固定开支、5 条 Todo、每条 10 个 points；订阅与管理员保留原 300 项/条及每条 100 points 上限。按保存总数计数，已完成/停用内容仍计入。已有超额内容保留，可编辑、完成、排序、删除；事务内限制新增和导入，等级从当前用户表读取。
- 订阅与管理员新增个人 MP3 音乐库，选择随账号保存。每人最多 10 首、单首 20 MiB、合计 100 MiB；站点应用管理的音乐对象总上限 8 GiB。上传使用有界内存，不落音频临时文件；播放由浏览器直连 R2 私有对象的 5 分钟签名链接。
- 粒子页面新增音乐库入口，保留唱片开关与跨页面协调，播放位置按账号/曲目区分。普通账号或订阅降级时使用默认音乐，已有文件保留。删除、失败上传、账号删除通过持久队列处理云对象；待清理对象仍占配额，结果不确定的上传延迟清理。
- R2 凭据仅存服务器 `/etc/garyhub/music-r2.env`（0600），只读挂载到 Calendar `/run/garyhub-music.env`。安装可在未配置 R2 时完成；独立 `SETUP-R2.cmd` 通过现有 SSH 接收本地输入并验证真实对象写/读/删，失败恢复原配置，不重启服务。已存在对象时不允许直接切换桶/账号。
- v1.4.3.0 复用共享 overlay 构建器与部署运行时，仅新增小型发布适配器和受限配置挂载；继承 v1.4.2.0 的 Reading、监控、Caddy 与 VPN 配置，不再修改这些 host integrations。有/无 TOTP 两种组合分别验证；本次修正无 TOTP 组合账号删除时无条件访问 TOTP 表的问题。
- 真实 Node 20、Express/sqlite3 的两种组合 HTTP 验证、通知收件人数/去重及浏览器交互检查见 `docs/GARYHUB_V1_4_3_0_TESTS.md`。R2 测试为合成传输与独立签名参考，不代表真实 Cloudflare 已配置。
- 状态分别为：v1.4.3.0 源码准备及本地验证；本次分支未推送/合并；已收到用户 r1 在切换前停止的现场证据，v1.4.3.0 尚未上线；r2 实际安装/回滚与通知人数、真实 R2 网络/CORS/凭据和计费状态仍待现场验证。
- 功能和恢复边界：`docs/GARYHUB_V1_4_3_0.md`；Cloudflare 网页和双击配置：`docs/GARYHUB_V1_4_3_0_CLOUDFLARE.md`。Research 仍按账号及项目独立，管理员没有额外读取权限。

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
| Tools 入口、搜索与 Dock | lab-service/public/index.html、tools-catalog.js、tools-dock.js、tools-dock.css |
| 跨站跳转 | 两服务的 public/auth-redirect.js |
| ECE 470 Lab | lab-service/server.cjs、public/lab/app.js、cloud.js、core.js |
| 作业题库分发 | lab-service/lab-distribution.cjs、public/lab/distribution.js、pack-validation.mjs |
| 三个本地实用工具 | lab-service/public/useful/，避免读取 vendor/ 的大文件 |
| 安装、打包、回滚 | scripts/updater/；当前适配器 scripts/releases/v1.4.3.0/ |

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

统一入口 `scripts/updater/manage.py`。当前 v1.4.3.0 有独立清单、release-config 和 deploy.py，复用 `scripts/updater/build_overlay.py`、`deploy_runtime.py`、已审阅 Windows 安装模板及独立源码导入器；baseline_adapter 为 `scripts/releases/v1.4.2.0`。不复制整套旧发布目录，不把新版本指向旧硬编码安装器。

完整解压 ZIP 后双击 RUN-UPDATE。现场依次核对版本、源码、能力组合和有效 Compose，离线构建，使用隔离合成数据验证，备份 SQLite/Lab 并干跑新增音乐迁移，再切换并验证 HTTPS，最后按 RELEASE_POLICY 核对全体收件人与去重。SETUP-R2 在应用安装成功后单独配置；指南随 ZIP 提供。

ROLLBACK 恢复 v1.4.2.0 应用和原有效配置，保留当前记录与音乐，不改动现有 Reading/VPN 集成。新音乐表不增加 users 外键，数据库删除触发器兼容旧镜像；回滚期间不运行音乐对象清理，后续升级继续处理。PUSH-TO-GITHUB 仍用独立 worktree 准备审查分支，不覆盖原工作区、不强推、不自动合并 main。

Markdown ZIP 在浏览器处理，使用原生 DEFLATE 流，不新增服务器运行依赖。支持普通未加密 ZIP（stored/DEFLATE），不支持 RAR、7z、多卷或 ZIP64；图片仅接受 PNG/JPEG/GIF/WebP，外部图片及 SVG 不加载。ZIP 最多 20 MiB、500 个条目、解压合计 50 MiB、单文件 10 MiB、Markdown 4 MiB。源码编辑和包内文档草稿仅保存在本次页面中，不写回原文件。

用户偏好：一次交付可运行 ZIP，减少往返复制代码；说明简洁，成功日志汇总、失败日志按需展开。开发环境验证与生产现场证据分开记录。
