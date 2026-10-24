# GaryHub 项目档案

维护日期：2026-10-23。首次阅读本文件及 UPDATE_WORKFLOW.md，按任务范围读取相关源码。

## 当前源码与部署证据

- 仓库：Gary-BANG/garyhub；默认分支 main；本机常用目录 `D:\Codes\Own_Project\garyhub-repo`。
- 本次审阅的 main：`bf5d8e2aa1f87024ba3c183b5e5d4155dc6e6a4f`，已合并 v1.3.6.1（PR #16）。旧档案中的“v1.3.6.1 尚未合并”已过时；生产仍需现场证据。
- 当前准备的应用源码版本：1.4.0.0；独立更新分支 `update/garyhub-v1.4.0.0`。
- 状态：源码已准备；本地 DOM、Node20 HTTP、通知与部署保护检查已通过；真实浏览器视觉/手机布局/帧率尚未验证（可用浏览器连接失败）。本次 GitHub 尚未推送/合并，生产尚未安装或验证。不能把自动化通过写成视觉验收或上线完成。
- 机器可读入口：`releases/current.json`；当前清单 `releases/1.4.0.0.json`，严格要求两个生产服务均为 1.3.6.1，能力标识继续区分有/无 TOTP。
- 本次改动：Tools 改为独立 SVG 图标、多行网格/单行 Dock、双语名称与简介、按中文/英文/简称/用途搜索、布局偏好保存、键盘导航；保留背景和主题。只在动画未收敛时运行图标 spring 循环，减少动态效果/触屏停用图标放大。
- 本次新增文件集中在 `lab-service/public/tools-*`；`hub.css`、`hub.js`、工具内部编辑器、数据库与账号逻辑保持基线内容。
- 行为说明与验证证据：`docs/GARYHUB_V1_4_0_0.md`、`docs/GARYHUB_V1_4_0_0_TESTS.md`。实际生产版本与通知人数必须等真实安装输出。

## 模块定位

| 需求 | 首先读取 |
|---|---|
| 登录、会话、账号、通知 | calendar-app/app.js、auth-utils.js、account-admin.js、hub-api.js |
| 日历、Todo、私人记录 | calendar-app/ 对应 API 文件和 public/ 对应页面 |
| 账本、汇率、固定支出 | calendar-app/ledger-api.js、fixed-expenses.js、fx-rates.js |
| Tools 入口、搜索与 Dock | lab-service/public/index.html、tools-catalog.js、tools-dock.js、tools-dock.css |
| 跨站跳转 | 两服务的 public/auth-redirect.js |
| ECE 470 Lab | lab-service/server.cjs、public/lab/app.js、cloud.js、core.js |
| 作业题库分发 | lab-service/lab-distribution.cjs、public/lab/distribution.js、pack-validation.mjs |
| 三个本地实用工具 | lab-service/public/useful/，避免读取 vendor/ 的大文件 |
| 安装、打包、回滚 | scripts/updater/；当前适配器 scripts/releases/v1.4.0.0/ |

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

统一入口仍为 `scripts/updater/manage.py`。v1.4.0.0 使用自己的 `release-config.json` 和小型适配器；共享 `build_overlay.py`、`deploy_runtime.py` 继续承担离线镜像覆盖、精确源码基线、有效部署索引、备份、失败恢复、回滚与站内通知。旧发布适配器未改动。本次共享 builder 仅增加可选 `source_subject`，旧配置的默认提交标题保持不变。

v1.4.0.0 的 baseline_adapter 必须是 `scripts/releases/v1.3.6.1`，以匹配无 TOTP 组合的实际 app.js、server.cjs 和首页，不能用 canonical 有 TOTP 文件作为这类部署的基线。新适配器额外在既有 HTTPS 检查后核对 Dock 版本标记和三个新资源。

每个升级 ZIP 独立可用，包含安装/回滚入口、SHA256SUMS、应用覆盖和源码补丁。完整解压后双击 `RUN-UPDATE.cmd`；沿用既有 SSH 私钥和主机记录，现场核验通过才切换。安装后通过既有 `push-source.ps1` 在独立 worktree 准备 `update/garyhub-v1.4.0.0`，保留原工作区；`PUSH-TO-GITHUB.cmd` 才执行普通 push 并打开 PR，不自动合并 main。回滚保留安装后新产生的用户记录。

Markdown ZIP 在浏览器处理，使用原生 DEFLATE 流，不新增服务器运行依赖。支持普通未加密 ZIP（stored/DEFLATE），不支持 RAR、7z、多卷或 ZIP64；图片仅接受 PNG/JPEG/GIF/WebP，外部图片及 SVG 不加载。ZIP 最多 20 MiB、500 个条目、解压合计 50 MiB、单文件 10 MiB、Markdown 4 MiB。源码编辑和包内文档草稿仅保存在本次页面中，不写回原文件。

用户偏好：一次交付可运行 ZIP，减少往返复制代码；说明简洁，成功日志汇总、失败日志按需展开。开发环境验证与生产现场证据分开记录。
