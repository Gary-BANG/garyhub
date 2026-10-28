# GaryHub

GaryHub 是使用统一账号的个人工作空间，包含日历与私人记录、账本、待办、学习工具和服务器工具。仓库保存应用源码、脱敏文档与可复现更新器；正式服务通过经过验证的升级包部署，GitHub 合并不会自动更新服务器。

**当前源码版本：v1.4.3.1。** 本次升级基于已合并 PR #21 的 v1.4.3.0（`903f47778d3f8bf1d6efb99b1b21c10764b1cdae`），新增学习中心侧栏控制、讲义直达 Markdown Viewer、章节折叠和目录导航。源码准备、本地测试、GitHub 合并、生产上线分别记录；当前版本的生产完成情况须以安装输出为证。

当前安装器为 **v1.4.3.1-r3**。r2 保留受保护 HTML 的正确校验；r3 修正回滚后 Compose 路径与部署索引不一致的问题，仅在完整证据吻合时对齐已知 r1 遗留索引。应用功能和版本保持不变，修订包上线结果仍待现场输出。

维护日期：2026-10-27（America/Chicago）。

## 应用入口

| 入口 | 功能 | 源码 |
|---|---|---|
| [GaryHub](https://garyhub.uk) | 个人主页、统一账号与站内通知 | `lab-service/public/homepage.html`、`calendar-app/` |
| [Calendar](https://calendar.garyhub.uk) | 日历事项、日记、健康记录、私人账本、固定开支、Todo、Research Dictionary、个人音乐库 | `calendar-app/` |
| [Tools](https://tools.garyhub.uk) | 可搜索工具图标与 Dock；学习中心、成绩规划、Markdown Viewer、PDF 浅灰转换、图片局部消除、Reading、服务器监控及权限控制工具 | `lab-service/` |
| [ECE 470 Lab](https://lab.garyhub.uk/lab/) | 机器人学练习、题库导入、代码运行、个人进度与作业分发 | `lab-service/public/lab/` |

Calendar 使用 Node.js 20、Express 与 SQLite；Tools/Lab 使用 Node 原生 HTTP，浏览器端运行文档处理和 Python/WASM。应用依赖已包含在既有生产镜像和本地静态资源中；升级器基于现场镜像离线构建，无需在生产服务器在线安装 npm 包。

## 当前功能与使用边界

- 学习中心按账号保存课程、讲次、进度与配图，支持 Markdown、文件夹、ZIP 和 GitHub 导入。课程／讲次左栏可用图标收起；Lecture Notes 可在新标签页直接打开当前讲义的 Markdown Viewer。
- Markdown Viewer 支持源码编辑、公式、表格及 ZIP 内配图。章节默认收起，可逐节或全部展开；左侧层级目录默认收起，点击标题自动展开并定位。普通本地文件在浏览器处理；学习中心讲义通过既有登录接口读取，账号变化后清除已打开的私人讲义。Viewer 编辑仅留在本次页面，不写回原讲义或文件。
- 普通账号最多保存 5 项固定开支、5 条 Todo、每条 10 个 points；订阅用户和管理员保留现有 300 项／条和每条 100 points 上限。已有超额内容保留，已完成／停用内容仍计数。
- 订阅用户和管理员可上传个人 MP3：每人最多 10 首、单首 20 MiB、合计 100 MiB；应用管理的 R2 音乐对象总上限为 8 GiB。选曲随账号保存，降级后使用默认音乐，原文件保留。默认音乐不要求配置 R2；个人音乐需要管理员完成私有桶配置。
- Research Dictionary、账本、讲义与练习数据按账号隔离；管理员身份不额外授予读取他人私人内容的权限。界面支持中文、英文和日夜主题。

ZIP 阅读支持普通未加密 stored／DEFLATE ZIP，不支持 RAR、7z、多卷或 ZIP64；只加载允许的本地位图。完整格式与大小限制见[项目档案](docs/PROJECT_CONTEXT.md)。

## 从这里维护项目

**AI 或维护者开始更新前，先读 [AGENTS.md](AGENTS.md)、[项目档案](docs/PROJECT_CONTEXT.md) 和[固定更新流程](docs/UPDATE_WORKFLOW.md)。**

```bash
python scripts/updater/manage.py context
python scripts/updater/manage.py plan --base <实际审阅的基础提交>
python scripts/updater/manage.py check
```

用独立分支开发，按实际行为变化选择测试；同步 README、项目档案、发布清单、版本说明与验证记录，再通过统一入口生成 upgrade ZIP。每次发布都必须检查根 README 的版本、功能、文档链接和状态表述；长期规则以 `docs/UPDATE_WORKFLOW.md` 为准。

## v1.4.3.1 安装与回滚

1. 安装前，Calendar 与 Tools/Lab 必须均实际运行 v1.4.3.0。源码版本不能代替现场版本证据；版本或源码不匹配时安装器会停止。
2. 完整解压 upgrade ZIP，在 Windows 双击 `RUN-UPDATE.cmd`，使用已有 OpenSSH 与 SSH 密钥。安装器执行源码／配置核对、离线构建、合成数据隔离验证、一致性备份、切换、HTTPS 与资源校验。
3. 部署健康后，向全部已批准且启用的账号（含管理员）发布未读站内通知，并核对人数和去重。执行输出用于确认生产是否完成。
4. `ROLLBACK.cmd` 恢复本次安装前的 v1.4.3.0 应用和有效配置，保留当前用户记录。若已有后续部署或配置变化，回滚会停止等待核对。
5. `PUSH-TO-GITHUB.cmd` 使用独立工作目录准备并推送审查分支，保留原工作区，不强推、不自动合并 `main`。

构建入口：

```bash
python scripts/updater/manage.py build --release 1.4.3.1 --output <新的ZIP绝对路径>
```

详见 [v1.4.3.1 说明](docs/GARYHUB_V1_4_3_1.md)、[验证记录](docs/GARYHUB_V1_4_3_1_TESTS.md)及[发布通知规则](docs/RELEASE_POLICY.md)。

## 部署与私密数据

正式运行目录为 `/opt/my-services`，不是 Git working tree。**有效配置以 `/opt/my-services/garyhub-active-deployment.json`、实际容器镜像和挂载为准。** 不要直接套用旧文档的 Compose 路径或在服务器执行未经验证的 `git pull`。

Calendar 数据挂载 `/app/data`，Lab 数据挂载 `/data`，实际宿主路径须现场核对。保留现有共享登录 Cookie、明确 Origin、CSRF、TOTP 能力组合、R2 只读配置挂载和 Reading／监控／VPN 集成。Caddy 是 HTTPS 入口；相关外部服务与网络配置不因本次阅读界面更新而改变。

不得提交 `.env`、私有 Compose、数据库、会话、密钥、邮件授权、生产备份、`homepage-protected.json` 或 `profile-private.json`。GitHub 不是数据库备份；恢复数据库前必须评估备份之后的用户操作。

## 文档导航

| 文档 | 用途 |
|---|---|
| [项目档案](docs/PROJECT_CONTEXT.md) | 当前源码、已知生产证据、模块定位与数据边界 |
| [固定更新流程](docs/UPDATE_WORKFLOW.md) | 每次更新必须遵循的开发、验证、文档与交付流程 |
| [统一更新器](scripts/updater/README.md) | context／plan／check／build 与源码同步工具 |
| [当前版本清单](releases/current.json) | 源码版本及对应发布清单 |
| [v1.4.3.0](docs/GARYHUB_V1_4_3_0.md)／[R2 配置说明](docs/GARYHUB_V1_4_3_0_CLOUDFLARE.md) | 本版继承的订阅额度与音乐存储规则 |
| [架构](docs/ARCHITECTURE.md)／[数据与备份](docs/DATA_AND_BACKUP.md) | 系统背景与备份原则；历史路径须现场复核 |
| [历史升级与回滚记录](docs/UPDATE_GUIDE.md) | 早期部署记录，不作为当前有效 Compose 的依据 |

旧服务器迁移、已退役 Study 服务及早期版本说明保留在 `docs/`，历史记录不代表当前部署状态。仓库地址：[Gary-BANG/garyhub](https://github.com/Gary-BANG/garyhub)，默认分支 `main`。
