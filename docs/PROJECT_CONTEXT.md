# GaryHub 项目档案

维护日期：2026-10-23。首次阅读本文件及 UPDATE_WORKFLOW.md，按任务范围读取相关源码。

## 当前源码与部署证据

- 仓库 Gary-BANG/garyhub；默认分支 main；维护者本机 `D:\Codes\Own_Project\garyhub-repo`。
- 本次审阅 main：`4f5611b6c1d1e6def995ef9664b0035e551a806a`，v1.4.0.0 已合并（PR #17）。该提交的源码树与先前交付 v1.4.0.0 一致。
- 本次准备 1.4.0.1，分支 `update/garyhub-v1.4.0.1`；入口 `releases/current.json`，清单 `releases/1.4.0.1.json`，严格要求两服务实际运行 v1.4.0.0。
- 用户反馈 v1.4.0.0 页面运行但鼠标无响应，Tab 可显示介绍。现场镜像/配置/通知人数缺日志，仍未核验；不能据此填写生产完成。
- 修复：鼠标事件不再受主要设备 hover/fine 媒体查询限制，CSS 不再因 coarse 设备强制取消鼠标放大。pointer 与传统 mouse 均支持；触屏模拟鼠标过滤、键盘、减少动态效果与滚动后坐标重测保留。新版 HTML 为修复 JS/CSS 加版本参数，安装后 HTTPS 核对精确资源 SHA256。
- 状态：修复源码已准备，DOM/Node20 HTTP/部署保护自动检查通过；真实浏览器未连接，实际鼠标观感/手机排版/帧率未验收。1.4.0.1 尚未推送/合并或生产验证。
- 当前说明与验证：`docs/GARYHUB_V1_4_0_1.md`、`docs/GARYHUB_V1_4_0_1_TESTS.md`。原 1.4.0.0 档案保留为历史，不能再将其“鼠标悬停完成”当作验收结论。

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
| 安装、打包、回滚 | scripts/updater/；当前适配器 scripts/releases/v1.4.0.1/ |

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

统一入口仍为 `scripts/updater/manage.py`。v1.4.0.1 使用自己的小型配置与 HTTPS 资源校验适配器，复用 `build_overlay.py`、`deploy_runtime.py`、Windows 安装模板与独立源码导入器，不改共享部署逻辑。baseline_adapter 为 `scripts/releases/v1.4.0.0`，正确匹配无 TOTP 的 app.js/server.cjs/index.html 基线。

完整解压升级 ZIP 后双击 RUN-UPDATE.cmd。现场核验两服务版本、能力与源码、有效配置，离线构建与隔离测试，备份后切换；HTTPS 确认目标页面与 JS/CSS 字节，再核对站内通知。ROLLBACK.cmd 返回 v1.4.0.0 应用镜像并保留当前用户记录。PUSH-TO-GITHUB.cmd 使用独立 worktree 准备/推送审查分支，不覆盖原工作区、不 force push、不自动合并 main。

Markdown ZIP 在浏览器处理，使用原生 DEFLATE 流，不新增服务器运行依赖。支持普通未加密 ZIP（stored/DEFLATE），不支持 RAR、7z、多卷或 ZIP64；图片仅接受 PNG/JPEG/GIF/WebP，外部图片及 SVG 不加载。ZIP 最多 20 MiB、500 个条目、解压合计 50 MiB、单文件 10 MiB、Markdown 4 MiB。源码编辑和包内文档草稿仅保存在本次页面中，不写回原文件。

用户偏好：一次交付可运行 ZIP，减少往返复制代码；说明简洁，成功日志汇总、失败日志按需展开。开发环境验证与生产现场证据分开记录。
