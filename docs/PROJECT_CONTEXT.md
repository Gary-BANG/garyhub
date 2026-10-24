# GaryHub 项目档案

维护日期：2026-10-24。首次阅读本文件及 UPDATE_WORKFLOW.md，按任务范围读取相关源码。

## 当前源码与部署证据

- 仓库 Gary-BANG/garyhub；默认分支 main；维护者本机 `D:\Codes\Own_Project\garyhub-repo`。
- 本次审阅 main：`637d86faae37d6c06b74b15bf850e82e301c8ad7`，v1.4.0.1 已合并（PR #18）。前次档案中的“未合并”是当时状态，不能代替本次远端证据。
- 本次准备 v1.4.1.0，分支 `update/garyhub-v1.4.1.0`；入口 `releases/current.json`，清单 `releases/1.4.1.0.json`。升级器严格要求 Calendar 和 Tools/Lab 实际运行 v1.4.0.1，不把用户版本陈述或 Git 合并当作生产证据。
- 新增 Research Dictionary，Tools 链接至 Calendar `/research/`。顶部 Research 管理、第二行搜索/Prompt/导入导出/新增，下面左窄右宽双栏。支持手动新增编辑、双语多义记录、别名/标签搜索、项目上下文 Prompt、JSON 预览合并/替换/新增、导入撤销。
- 数据按账号和 Research 独立保存。新增表 `research_projects`、`research_receipts`；人工修改需要导入冲突确认，使用独立 SQLite 连接、事务、修订号、账号快照与请求幂等；沿用 Origin/CSRF/会话和账号禁用检查。管理员没有其他用户词库读取特权，不提供团队共享。
- 状态：源码准备并本地验证；Node20 两种部署能力组合的 HTTP/隔离、真实 Chromium 桌面/手机与明暗主题、导入/迁移/权限、部署保护和打包检查见验证记录。本次分支未推送/合并；未连接生产，通知人数和正式镜像状态未核验。
- 当前说明与验证：`docs/GARYHUB_V1_4_1_0.md`、`docs/GARYHUB_V1_4_1_0_TESTS.md`。历史功能及验证记录保留，不能把旧的未验收事项写为生产完成。

## 模块定位

| 需求 | 首先读取 |
|---|---|
| 登录、会话、账号、通知 | calendar-app/app.js、auth-utils.js、account-admin.js、hub-api.js |
| 日历、Todo、私人记录 | calendar-app/ 对应 API 文件和 public/ 对应页面 |
| 账本、汇率、固定支出 | calendar-app/ledger-api.js、fixed-expenses.js、fx-rates.js |
| Research Dictionary | calendar-app/research-api.js、public/research/、account-admin.js |
| Tools 入口、搜索与 Dock | lab-service/public/index.html、tools-catalog.js、tools-dock.js、tools-dock.css |
| 跨站跳转 | 两服务的 public/auth-redirect.js |
| ECE 470 Lab | lab-service/server.cjs、public/lab/app.js、cloud.js、core.js |
| 作业题库分发 | lab-service/lab-distribution.cjs、public/lab/distribution.js、pack-validation.mjs |
| 三个本地实用工具 | lab-service/public/useful/，避免读取 vendor/ 的大文件 |
| 安装、打包、回滚 | scripts/updater/；当前适配器 scripts/releases/v1.4.1.0/ |

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

统一入口仍为 `scripts/updater/manage.py`。v1.4.1.0 注册自己的小型配置和 HTTPS 资源/认证校验适配器，复用 `build_overlay.py`、`deploy_runtime.py`、已审阅的 Windows 安装模板与独立源码导入器。baseline_adapter 为 `scripts/releases/v1.4.0.1`；无 TOTP 的 app.js/server.cjs/index.html 从该版本的独立基线施加对应的 Research 入口修改，不改变能力组合。未复制整套历史发布目录，未修改共享备份/切换/回滚运行时。

完整解压升级 ZIP 后双击 RUN-UPDATE.cmd。现场核验两服务版本、能力与源码、有效配置，离线构建与隔离测试，备份后切换；HTTPS 核对当前词典 HTML/JS/CSS 字节和未登录 API 401，再核对站内通知。ROLLBACK.cmd 返回 v1.4.0.1 镜像并保留当前用户记录，包括新表；旧界面不提供词典，旧删除器可能因未识别新表要求审阅，不得绕过检查。PUSH-TO-GITHUB.cmd 使用独立 worktree 准备/推送审查分支，不覆盖原工作区、不 force push、不自动合并 main。

Markdown ZIP 在浏览器处理，使用原生 DEFLATE 流，不新增服务器运行依赖。支持普通未加密 ZIP（stored/DEFLATE），不支持 RAR、7z、多卷或 ZIP64；图片仅接受 PNG/JPEG/GIF/WebP，外部图片及 SVG 不加载。ZIP 最多 20 MiB、500 个条目、解压合计 50 MiB、单文件 10 MiB、Markdown 4 MiB。源码编辑和包内文档草稿仅保存在本次页面中，不写回原文件。

用户偏好：一次交付可运行 ZIP，减少往返复制代码；说明简洁，成功日志汇总、失败日志按需展开。开发环境验证与生产现场证据分开记录。
