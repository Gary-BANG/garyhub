# Gary Hub — 服务器维护总览

最后核对：2026-09-28 UTC（依据生产切换与旧 Study 清理报告）
服务器主机名：`LA-VPN`

本目录是 `garyhub.uk` 正式服务的部署目录。修改 Docker、Caddy、应用代码或数据前，请先阅读本文档及 `docs/` 中的说明。

## 当前正式服务

| 地址 | 容器 | 功能 |
|---|---|---|
| `garyhub.uk` | `caddy` | 个人主页；Others 只有 Projects 和 GitHub |
| `calendar.garyhub.uk` | `calendar-app` | 账号、统一日历与事项、分类、邮件提醒 |
| 无公网地址 | `garyhub-reminder-production-20260927-203135` | 邮件提醒 worker |
| `kuma.garyhub.uk` | `uptime-kuma` | 服务状态监控 |
| `rss.garyhub.uk` | `miniflux` | RSS 阅读器 |
| `files.garyhub.uk` | `filebrowser` | 文件管理 |
| 仅 Docker 内部 | `miniflux-db` | Miniflux 的 PostgreSQL 数据库 |
| `127.0.0.1:19999` | `netdata` | 服务器监控 |

Caddy 是唯一对公网开放 80/443 端口的正式服务。

## 当前重要状态

- 新个人主页已上线：`/opt/my-services/site/index.html`
- 正式 Calendar 镜像：`garyhub-calendar-candidate:20260927-200732`，镜像 ID `sha256:0490d2abb87f3c4f167d1f04026d111e36bbd6d9f0a58a19b9f4c7de279b727f`。
- 正式 Web 与提醒 worker 共用 `/opt/garyhub-cutover-20260927-203135/data`，挂载至 `/app/data`。其中的 Outlook 授权文件是密钥。
- 正式 Compose override：`/opt/garyhub-cutover-20260927-203135/override.yml`，含密钥，不可提交 Git。
- 切换时保留 5 个用户；依用户选择，22 条旧 Calendar 事项和 45 条旧 Study 任务没有迁入新统一事项表。
- 旧 Study 容器、镜像标签、源码、数据目录和专用回滚目录已移除。旧 `/study/*` 和 `/api/study/*` 在源站返回 HTTP 410；主页和 Calendar 健康检查为 200。
- 原 Calendar 数据及部分含 Study 数据的历史切换/演练备份仍在服务器上。旧 Study 专用文件另已导出到用户电脑，不能提交 Git。

## 文档入口

候选功能（日记、体重、锻炼）尚未部署；见架构、数据备份和升级文档中的私人记录章节。服务器版本仍应以实际镜像与 Compose 现场检查为准。

- [系统架构](docs/ARCHITECTURE.md)
- [数据与备份](docs/DATA_AND_BACKUP.md)
- [升级与回滚](docs/UPDATE_GUIDE.md)
- [统一 Calendar 隔离开发](docs/ISOLATED_DEVELOPMENT.md)
- [Outlook 邮件配置](docs/OUTLOOK_MAIL.md)

## 正式配置与代码位置

| 内容 | 位置 |
|---|---|
| 主 Compose 配置 | `/opt/my-services/docker-compose.yml` |
| Calendar Compose 基础文件 | `/opt/my-services/calendar-app/docker-compose.yml` |
| Calendar 正式 override | `/opt/garyhub-cutover-20260927-203135/override.yml`（敏感） |
| Caddy 路由 | `/opt/my-services/caddy/Caddyfile` |
| 个人主页 | `/opt/my-services/site/index.html` |
| Calendar 正式数据 | `/opt/garyhub-cutover-20260927-203135/data`（敏感） |
| 旧 Calendar 数据和源码 | `/opt/my-services/calendar-app`（历史；不是当前数据挂载） |

本文档只记录密钥的位置和用途，绝不记录密码、Cookie、会话密钥、API Token、私钥或数据库内容。

## Git 版本控制

- Private repository: `https://github.com/Gary-BANG/garyhub`
- Default branch: `main`
- Initial import commit: `1246ea5`
- Maintainer: Guyang Pan
- Local working copy: `D:\Codes\Own_Project\garyhub-repo`

GitHub 保存经过脱敏的源码、配置示例和维护文档，不保存正式数据库、任务数据、密码、Cookie、Session Secret、邮件令牌、TLS 私钥或备份。

当前 `/opt/my-services` 是正式运行目录，不是 Git working tree。GitHub 推送不会自动修改服务器，服务器也不应直接执行未经测试的 `git pull`。未合并分支的源码与已部署镜像可能不同步；操作前应核对实际镜像、Compose 和数据挂载。
