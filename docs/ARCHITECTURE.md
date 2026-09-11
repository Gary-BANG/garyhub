# Gary Hub 系统架构

最后核对：2026-09-11 UTC

## 请求路径

```text
Internet
   |
   | HTTP/HTTPS :80/:443
   v
Caddy
   +-- garyhub.uk ----------> /opt/my-services/site
   +-- /api/study ----------> study-api:3000
   +-- calendar.garyhub.uk -> calendar-app:3000
   +-- kuma.garyhub.uk -----> uptime-kuma:3001
   +-- rss.garyhub.uk ------> miniflux:8080
   +-- files.garyhub.uk ----> filebrowser:80
```

Miniflux 在 Docker 内部连接 `miniflux-db:5432`。

## 容器与持久化目录

| 容器 | 镜像 | 重启策略 | 主要持久化位置 |
|---|---|---|---|
| `caddy` | `caddy:2` | `always` | `caddy/data`、`caddy/config`、`site` |
| `calendar-app` | `calendar-app-calendar-app` | `unless-stopped` | `calendar-app/data` |
| `study-api` | `study-api:0.2` | `unless-stopped` | `study-api/data` |
| `filebrowser` | `filebrowser/filebrowser:latest` | `always` | `filebrowser`、`filebrowser/data` |
| `uptime-kuma` | `louislam/uptime-kuma:1` | `always` | `uptime-kuma` |
| `miniflux` | `miniflux/miniflux:latest` | `always` | 数据位于 `miniflux-db` |
| `miniflux-db` | `postgres:15-alpine` | `always` | `postgres` |
| `netdata` | `netdata/netdata:stable` | `always` | 只读系统监控挂载 |
| `garyhub-calendar-test` | 临时 Calendar 镜像 | `no` | 临时升级目录 |

## 端口

- `80/tcp`：Caddy HTTP
- `443/tcp`、`443/udp`：Caddy HTTPS/HTTP3
- `127.0.0.1:19999`：Netdata，仅本机
- `127.0.0.1:3101`：临时 Calendar 测试服务，通常通过 SSH 隧道访问

其他应用端口仅供 Docker 内部通信，不应直接暴露到公网。

## Caddy

- 配置：`/opt/my-services/caddy/Caddyfile`
- 证书和状态：`/opt/my-services/caddy/data`
- 配置状态：`/opt/my-services/caddy/config`
- 静态页面挂载：`/opt/my-services/site -> /srv`（只读）

## Calendar/Study Planner 合并状态

正式环境目前仍使用两个数据源：

1. Calendar SQLite：`calendar-app/data/calendar.sqlite`
2. Study Planner JSON：`study-api/data/tasks.json`

临时升级目录中已有 Tasks API、Tasks UI，以及将 45 条任务归属到管理员 ID 1 的测试数据库。测试页面里的修改不会同步回正式 Study Planner。

正式迁移前必须重新备份最新数据、重新迁移、核对用户/日程/任务数量、测试权限与编辑功能，并保留旧镜像和原数据以便回滚。
