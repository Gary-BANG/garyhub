# Gary Hub — 服务器维护总览

最后核对：2026-09-11 UTC
服务器主机名：`LA-VPN`

本目录是 `garyhub.uk` 正式服务的部署目录。修改 Docker、Caddy、应用代码或数据前，请先阅读本文档及 `docs/` 中的说明。

## 当前正式服务

| 地址 | 容器 | 功能 |
|---|---|---|
| `garyhub.uk` | `caddy` | 个人主页及 Study Planner 路由 |
| `calendar.garyhub.uk` | `calendar-app` | 日历、账号、注册审批和管理功能 |
| `kuma.garyhub.uk` | `uptime-kuma` | 服务状态监控 |
| `rss.garyhub.uk` | `miniflux` | RSS 阅读器 |
| `files.garyhub.uk` | `filebrowser` | 文件管理 |
| 仅 Docker 内部 | `miniflux-db` | Miniflux 的 PostgreSQL 数据库 |
| `127.0.0.1:19999` | `netdata` | 服务器监控 |
| 仅 Docker 内部 | `study-api` | 当前独立的 Study Planner API |

Caddy 是唯一对公网开放 80/443 端口的正式服务。

## 当前重要状态

- 新个人主页已上线：`/opt/my-services/site/index.html`
- 正式 Calendar 数据：`/opt/my-services/calendar-app/data`
- 正式 Study Planner 数据：`/opt/my-services/study-api/data`
- Calendar 与 Study Planner **尚未完成最终正式合并**。
- `garyhub-calendar-test` 是临时测试容器，不是正式服务。
- `/opt/garyhub-upgrade-lJdq1ju8` 是临时升级工作区，不是正式数据源。
- 正式迁移并验证备份前，不要删除旧 Study Planner、测试数据库或升级工作区。

## 文档入口

- [系统架构](docs/ARCHITECTURE.md)
- [数据与备份](docs/DATA_AND_BACKUP.md)
- [升级与回滚](docs/UPDATE_GUIDE.md)

## 正式配置与代码位置

| 内容 | 位置 |
|---|---|
| 主 Compose 配置 | `/opt/my-services/docker-compose.yml` |
| Compose override | `/opt/my-services/docker-compose.override.yml` |
| Caddy 路由 | `/opt/my-services/caddy/Caddyfile` |
| 个人主页 | `/opt/my-services/site/index.html` |
| 旧 Study Planner 页面 | `/opt/my-services/site/study/index.html` |
| Calendar 源码 | `/opt/my-services/calendar-app` |
| Study Planner API 源码 | `/opt/my-services/study-api` |

本文档只记录密钥的位置和用途，绝不记录密码、Cookie、会话密钥、API Token、私钥或数据库内容。
