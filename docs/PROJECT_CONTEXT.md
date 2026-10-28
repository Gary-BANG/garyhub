# GaryHub 项目档案

维护日期：2026-10-28（America/Chicago）。首次阅读本文件及 UPDATE_WORKFLOW.md，按任务范围读取相关源码。

## 当前源码与部署证据

- 仓库 `Gary-BANG/garyhub`，本次审阅 main 为 `2b3d597e3f000b9340356aed6191af81970368cb`，PR #22 已合并 v1.4.3.1。GitHub 合并不等于生产部署。
- 当前源码入口 `releases/current.json`，清单 `releases/1.4.3.2.json`，独立开发分支 `update/garyhub-v1.4.3.2`；应用版本 v1.4.3.2，安装器 v1.4.3.2-r1。尚未推送／合并本次分支，生产完成及通知人数待现场输出。
- 用户指定从 v1.4.3.1 升级；本包严格核对两服务的实际版本均为 v1.4.3.1、对应源码与有效 Compose。缺少新的服务器现场证据时，不将其记录为已核实运行版本；不是 v1.4.3.1 时停止。
- ECE 470 Lab 的新 `public/lab/math-markdown.mjs` 在 Markdown 前保护公式，并使用既有本地 KaTeX 排版。支持四种标准 LaTeX 分隔符；为截图所示无标记的 `theta(s)`、五次时间标度、速度／加速度约束及已声明变量提供有限 ASCII 语法。保留原始题面作为排版元素 data-source，未知内容／非法 LaTeX 显示原文。代码块、行内代码、链接和 HTML 不做 ASCII 数学推断；HTML 仍经清理。显示转换不写回题包、不修改判题、不提前显示 formula_latex／答案。
- 练习视图每次重绘都排版，包括切题、同类变式、运行、提交完成；参考函数的数学维度与解析继续排版。题包格式和导入提示已说明优先使用显式 LaTeX。
- 成绩规划、学习中心、图片局部消除、Markdown Viewer、PDF 浅灰打印复用现有 ambient-music 播放器。显式配置挂载位置与 `data-music-library="false"`；两服务共享相同代码。选曲、播放进度、音频循环、多标签页租约及账号刷新逻辑沿用原实现。新页不增加 Music Library；原有 sky 页入口保留。
- 三个实用工具的 CSP 仅增加 `media-src 'self' https://*.r2.cloudflarestorage.com`，以播放现有签名 R2 曲目；connect-src、上传和本机文档处理边界不变。
- 本次独立适配器 `scripts/releases/v1.4.3.2/` 复用共享 build_overlay、deploy_runtime、既有 Windows 模板与独立 worktree 导入器。有／无 TOTP 仍分别核验，能力组合的 app/server 覆盖只改健康版本和必要媒体 CSP。无数据库迁移、新生产依赖或 host hooks；不注册 v1.4.3.1-r1 的历史索引修复 hook。
- 本地结果：7 项数学单元测试、23 项相关业务回归、35 项共享更新器／回滚及 8 项新适配器检查通过；两能力组合各 112 条 HTTP、61 条浏览器断言，第六阶段真实响应校验和 5 人合成通知去重通过。最终 ZIP 校验与源码导入测试在构建后执行。
- README、清单、功能说明、验证记录和 `calendar-app/releases/garyhub-1.4.3.2.json` 同步维护。测试范围与限制见 `docs/GARYHUB_V1_4_3_2_TESTS.md`，使用与回滚见 `docs/GARYHUB_V1_4_3_2.md`。
- 继承普通账号 5 项固定开支／5 条 Todo／每条 10 points，以及订阅／管理员 300 项和 100 points；保留已有超额数据和 MP3 库。音乐限额仍为每人 10 首／20 MiB 单首／100 MiB 合计，应用对象总限额 8 GiB，R2 凭据只在受限配置中。

### 最近的历史生产证据

v1.4.3.1-r1 曾在受保护 HTML 的未登录正文哈希检查失败后回滚至 v1.4.3.0；r2 在第一阶段发现回滚 Compose 标签与索引路径不一致而停止。r3 修正共享 restore，并提供仅针对完整已知 r1 证据的受限索引对齐。仓库已有 r3 的本地验证，但当前会话未取得其最终服务器输出。历史修订详情见 v1.4.3.1 文档；本次包不放宽 v1.4.3.1 安装基线。

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
| ECE 470 Lab | lab-service/server.cjs、public/lab/app.js、math-markdown.mjs、cloud.js、core.js |
| 作业题库分发 | lab-service/lab-distribution.cjs、public/lab/distribution.js、pack-validation.mjs |
| 三个本地实用工具 | lab-service/public/useful/，避免读取 vendor/ 的大文件 |
| 安装、打包、回滚 | scripts/updater/；当前适配器 scripts/releases/v1.4.3.2/ |

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

统一入口 `scripts/updater/manage.py`。当前 v1.4.3.2 有独立清单、release-config、deploy.py 和健康版本覆盖；baseline_adapter 为 `scripts/releases/v1.4.3.1`。复用共享 build_overlay.py、deploy_runtime.py 和 Windows 模板。不复制整套旧发布目录，不把新版本指向旧硬编码安装器。

完整解压 ZIP 后双击 RUN-UPDATE。现场依次核对实际版本、源码、能力组合和有效 Compose，离线构建，以隔离合成数据验证，备份 SQLite/Lab 并干跑既有迁移，再切换并验证 HTTPS／资源哈希，最后按 RELEASE_POLICY 核对全体收件人与去重。本版不增加数据库迁移或生产运行依赖。

ROLLBACK 恢复安装前的 v1.4.3.1 应用及原有效配置，保留当前用户记录与音乐。后续部署或配置变化时停止覆盖。PUSH-TO-GITHUB 用独立 worktree 准备审查分支，不覆盖原工作区、不强推、不自动合并 main。

Markdown ZIP 在浏览器处理，使用原生 DEFLATE 流，不新增服务器运行依赖。支持普通未加密 ZIP（stored/DEFLATE），不支持 RAR、7z、多卷或 ZIP64；图片仅接受 PNG/JPEG/GIF/WebP，外部图片及 SVG 不加载。ZIP 最多 20 MiB、500 个条目、解压合计 50 MiB、单文件 10 MiB、Markdown 4 MiB。源码编辑和包内文档草稿仅保存在本次页面中，不写回原文件。

用户偏好：一次交付可运行 ZIP，减少往返复制代码；说明简洁，成功日志汇总、失败日志按需展开。开发环境验证与生产现场证据分开记录。
