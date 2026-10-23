# GaryHub 项目档案

维护日期：2026-10-23。首次阅读本文件及 UPDATE_WORKFLOW.md，按任务范围读取相关源码。

## 当前源码与部署证据

- 仓库：Gary-BANG/garyhub；默认分支 main；本机常用目录 `D:\Codes\Own_Project\garyhub-repo`。
- 最近核对的 main：`34d3072e2f11c416c0dbb4c8db6750489b19cfbd`，已合并 v1.3.6.0（PR #14）。
- 当前应用源码版本：1.3.6.0；此流程整理不改变应用版本。
- 本次会话尚无生产安装完成输出，不能声称 v1.3.6.0 已正式部署。
- 机器可读入口：`releases/current.json`；当前发布清单 `releases/1.3.6.0.json`。

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
| 安装、打包、回滚 | scripts/updater/；当前适配器 scripts/releases/v1.3.6.0/ |

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

v1.3.6.0 已有经过验证的 Windows SSH 安装器、离线镜像覆盖、合成环境测试、备份、回滚和站内通知。其脚本包含具体版本常量，统一入口通过发布清单调用它；通用参数化迁移应按后续需求逐项完成，不能假装旧脚本天然适用于任意版本。

开发验证记录见 `docs/GARYHUB_V1_3_6_0_TESTS.md`。测试环境与生产现场验证必须分别记录。用户偏好：一次交付可运行 ZIP，减少往返复制代码；说明简洁，成功日志汇总、失败日志按需展开。
