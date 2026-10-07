# Gary Hub — 服务器维护总览

最后核对：2026-09-30 UTC（InterServer、Calendar v1.3.1.2）
正式服务器：InterServer `vps3666849`，IPv4 `162.35.168.17`

本仓库保存源码与脱敏维护文档；正式服务运行在新服务器的 `/opt/my-services`，该目录不是 Git working tree。修改 Docker、Caddy、应用代码或数据前，请先阅读本文档及 `docs/` 中的说明。

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

Caddy 对公网提供 80/443；独立的 Xray systemd 服务监听 TCP 8080。Cloudflare 的五条网站 A 记录均指向 `162.35.168.17`，保持 DNS only。

## 当前重要状态

- 新个人主页已上线：`/opt/my-services/site/index.html`
- 正式 Calendar Web 与提醒 worker 镜像：`garyhub-calendar:6cd3102`，镜像 ID `sha256:45c2b8d289bbec765d28f2313f030c8630d9b3c8ea750551eed7ef9820da1202`。对应功能分支提交 `6cd3102`；GitHub 是否已合并以实际状态为准。
- 正式 Web 与提醒 worker 共用 `/opt/garyhub-cutover-20260927-203135/data`，挂载至 `/app/data`。其中的 Outlook 授权文件是密钥。
- 正式 Compose override：`/opt/garyhub-cutover-20260927-203135/override.yml`，含密钥，不可提交 Git。
- 主 Compose 必须同时加载 `/opt/my-services/docker-compose.yml`、`docker-compose.override.yml` 和 `docker-compose.migration.yml`；第三个文件将 Filebrowser 的实际数据库固定挂载在 `/opt/my-services/filebrowser/database`。
- 提醒 worker 使用 `/opt/my-services/reminder-compose.json` 独立启动；此文件含正式环境变量，权限为 `0600`，不可提交 Git。
- 备份使用 Restic/B2；每日 03:20 UTC 运行主服务备份，每日 05:00 UTC 运行状态备份，周日 04:10 UTC 执行 prune。备份和恢复见 [数据与备份](docs/DATA_AND_BACKUP.md)。
- 旧 Vultr `LA-VPN` 实例（`45.32.84.89`）已在数据切换和恢复测试后删除；不能再以旧服务器作为回滚目标。
- 切换时保留 5 个用户；依用户选择，22 条旧 Calendar 事项和 45 条旧 Study 任务没有迁入新统一事项表。
- 旧 Study 容器、镜像标签、源码、数据目录和专用回滚目录已移除。旧 `/study/*` 和 `/api/study/*` 在源站返回 HTTP 410；主页和 Calendar 健康检查为 200。
- 旧 Study 专用文件曾导出到用户电脑；旧 Vultr 上的历史目录不应视作新服务器本地存在。部分历史快照仍在 Restic 仓库；不能提交 Git。

## 文档入口

Calendar 对外版本 v1.3.1.2 已上线：每用户每日一篇可修改的日记、同日多条可编辑删除的体重记录、锻炼记录、可收起面板、事项日期联合筛选，以及含备注的提醒邮件。当时的 5 个账号各收到一条站内升级通知。`calendar-app/package.json` 的 `2.0.0` 是 Node 包版本，与对外发布号分别管理。服务器版本仍应以实际镜像与 Compose 现场检查为准。

- [系统架构](docs/ARCHITECTURE.md)
- [数据与备份](docs/DATA_AND_BACKUP.md)
- [升级与回滚](docs/UPDATE_GUIDE.md)
- [服务器迁移记录](docs/SERVER_MIGRATION_20260930.md)
- [统一 Calendar 隔离开发](docs/ISOLATED_DEVELOPMENT.md)
- [Outlook 邮件配置](docs/OUTLOOK_MAIL.md)

## 正式配置与代码位置

| 内容 | 位置 |
|---|---|
| 主 Compose 配置 | `/opt/my-services/docker-compose.yml` |
| 主 Compose 附加文件 | `/opt/my-services/docker-compose.override.yml`、`docker-compose.migration.yml` |
| Calendar Compose 基础文件 | `/opt/my-services/calendar-app/docker-compose.yml` |
| Calendar 正式 override | `/opt/garyhub-cutover-20260927-203135/override.yml`（敏感） |
| 提醒 worker Compose | `/opt/my-services/reminder-compose.json`（敏感） |
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

当前 `/opt/my-services` 是正式运行目录，不是 Git working tree。GitHub 推送不会自动修改服务器，服务器也不应直接执行未经测试的 `git pull`。私人记录功能已在正式镜像中上线；操作前仍需核对实际镜像、Compose 和数据挂载。

## Tools and ECE 470 Lab (2026-10-07)

- Tools: https://tools.garyhub.uk
- Lab: https://lab.garyhub.uk/lab/
- Source: `lab-service/`. Calendar accounts, separate site sessions, per-user persisted workspaces.
- [Deployment record](docs/DEPLOYMENT_20261007.md)
- [Backup and restore verification](docs/BACKUP_VERIFICATION_20261007.md)
- GitHub updates do not automatically deploy to the server.
