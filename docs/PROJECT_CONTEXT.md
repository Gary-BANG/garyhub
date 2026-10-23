# GaryHub 项目档案

维护日期：2026-10-23。首次阅读本文件及 UPDATE_WORKFLOW.md，按任务范围读取相关源码。

## 当前源码与部署证据

- 仓库：Gary-BANG/garyhub；默认分支 main；本机常用目录 `D:\Codes\Own_Project\garyhub-repo`。
- 本次审阅的 main：`697daf65c269a8f2169857b0eb21e8cf84cf6a3e`，包含 v1.3.6.0（PR #14）及更新流程（PR #15）。
- 当前应用源码版本：1.3.6.1；更新分支 `update/garyhub-v1.3.6.1`。
- 状态：源码已准备、本地已验证；GitHub 尚未合并，生产尚未验证。没有实际安装输出前，不记录生产完成或真实通知人数。
- 机器可读入口：`releases/current.json`；当前清单 `releases/1.3.6.1.json`，明确要求生产基础版本 1.3.6.0。
- 本次改动：三个实用工具接入现有中英文偏好；Markdown 支持本地 ZIP、多文档选择、相对路径配图、可编辑源码及实时预览；图片工具在手机布局变化后重新适配画布。
- 行为说明与测试证据：`docs/GARYHUB_V1_3_6_1.md`、`docs/GARYHUB_V1_3_6_1_TESTS.md`。

## 模块定位

| 需求 | 首先读取 |
|---|---|
| 登录、会话、账号、通知 | calendar-app/app.js、auth-utils.js、account-admin.js、hub-api.js |
| 日历、Todo、私人记录 | calendar-app/ 对应 API 文件和 public/ 对应页面 |
| 账本、汇率、固定支出 | calendar-app/ledger-api.js、fixed-expenses.js、fx-rates.js |
| Tools 入口、跨站跳转 | lab-service/public/index.html、两服务的 public/auth-redirect.js |
| ECE 470 Lab | lab-service/server.cjs、public/lab/app.js、cloud.js、core.js |
| 作业题库分发 | lab-service/lab-distribution.cjs、public/lab/distribution.js、pack-validation.mjs |
| 三个本地实用工具 | lab-service/public/useful/，避免读取 vendor/ 的大文件 |
| 安装、打包、回滚 | scripts/updater/；当前适配器 scripts/releases/v1.3.6.1/ |

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

统一入口仍为 `scripts/updater/manage.py`。v1.3.6.1 的小型发布适配器通过 `release-config.json` 配置版本、基础提交、能力组合、隔离检查和更新内容。共享 `build_overlay.py`、`deploy_runtime.py` 复用既有离线镜像覆盖、源码基线、有效部署索引、备份、失败恢复、回滚与站内通知逻辑；旧发布适配器不变。

每个升级 ZIP 独立可用，包含安装/回滚入口、SHA256SUMS、应用覆盖和源码补丁。Windows SSH 安装器沿用已有私钥与主机记录；服务器现场核验后才切换。源码通过已有 `push-source.ps1` 在独立 worktree 准备 `update/garyhub-v1.3.6.1`，保留原工作区；`PUSH-TO-GITHUB.cmd` 才执行普通 push 并打开 PR，不自动合并 main。

Markdown ZIP 在浏览器处理，使用原生 DEFLATE 流，不新增服务器运行依赖。支持普通未加密 ZIP（stored/DEFLATE），不支持 RAR、7z、多卷或 ZIP64；图片仅接受 PNG/JPEG/GIF/WebP，外部图片及 SVG 不加载。ZIP 最多 20 MiB、500 个条目、解压合计 50 MiB、单文件 10 MiB、Markdown 4 MiB。源码编辑和包内文档草稿仅保存在本次页面中，不写回原文件。

用户偏好：一次交付可运行 ZIP，减少往返复制代码；说明简洁，成功日志汇总、失败日志按需展开。开发环境验证与生产现场证据分开记录。
