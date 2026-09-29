# Gary Hub 系统架构

最后核对：2026-09-28 UTC（生产切换与旧 Study 清理报告）

## 请求路径

```text
Internet
   |
   | HTTP/HTTPS :80/:443
   v
Caddy
   +-- garyhub.uk ----------> /opt/my-services/site
   +-- /study/* ------------> 410 Gone
   +-- /api/study/* --------> 410 Gone
   +-- calendar.garyhub.uk -> calendar-app:3000
   +-- kuma.garyhub.uk -----> uptime-kuma:3001
   +-- rss.garyhub.uk ------> miniflux:8080
   +-- files.garyhub.uk ----> filebrowser:80
```

Miniflux 在 Docker 内部连接 `miniflux-db:5432`。

独立 `study-api` 已清理。提醒 worker `garyhub-reminder-production-20260927-203135` 与 Calendar Web 共享正式数据目录，并通过 Outlook Microsoft Graph 发件。

## 容器与持久化目录

| 容器 | 镜像 | 重启策略 | 主要持久化位置 |
|---|---|---|---|
| `caddy` | `caddy:2` | `always` | `caddy/data`、`caddy/config`、`site` |
| `calendar-app` | `garyhub-calendar-candidate:20260927-200732` | `unless-stopped` | `/opt/garyhub-cutover-20260927-203135/data` |
| `garyhub-reminder-production-20260927-203135` | 同一 Calendar 镜像 | `unless-stopped` | 同一正式数据目录 |
| `filebrowser` | `filebrowser/filebrowser:latest` | `always` | `filebrowser`、`filebrowser/data` |
| `uptime-kuma` | `louislam/uptime-kuma:1` | `always` | `uptime-kuma` |
| `miniflux` | `miniflux/miniflux:latest` | `always` | 数据位于 `miniflux-db` |
| `miniflux-db` | `postgres:15-alpine` | `always` | `postgres` |
| `netdata` | `netdata/netdata:stable` | `always` | 只读系统监控挂载 |

旧测试容器和隔离环境是否仍运行，需在清理前重新盘点；它们不属于正式 Calendar 架构。

## 端口

- `80/tcp`：Caddy HTTP
- `443/tcp`、`443/udp`：Caddy HTTPS/HTTP3
- `127.0.0.1:19999`：Netdata，仅本机
- `127.0.0.1:3101/3103/3104`：历史测试端口，不属于正式入口；实际占用以现场检查为准

其他应用端口仅供 Docker 内部通信，不应直接暴露到公网。

## Caddy

- 配置：`/opt/my-services/caddy/Caddyfile`
- 证书和状态：`/opt/my-services/caddy/data`
- 配置状态：`/opt/my-services/caddy/config`
- 静态页面挂载：`/opt/my-services/site -> /srv`（只读）

## 统一 Calendar 当前状态

## 私人记录候选功能（尚未部署）

Calendar 登录后的同一页面增加日记、体重、锻炼区域，沿用现有 Session、CSRF 和账号 IANA 时区。接口为 `/api/personal/diary`、`/api/personal/weight`、`/api/personal/exercise` 及锻炼汇总。每条读写都通过 Session 中的用户 ID 限定，管理员的事项查看目标不影响私人记录。

新表 `diary_entries`（每用户每日期唯一）、`weight_entries`（整数克，同日多条）、`exercise_entries`（整数分钟，同日多条）只引用 `users`，不加入提醒或通知。日期为用户选定的 `YYYY-MM-DD`，不按 UTC 时间戳反推。服务启动时增量创建新表和索引；当前已部署镜像尚未包含本功能。

正式 Web 与提醒 worker 使用同一 `/opt/garyhub-cutover-20260927-203135/data` 目录，挂载到 `/app/data`。镜像 ID 为 `sha256:0490d2abb87f3c4f167d1f04026d111e36bbd6d9f0a58a19b9f4c7de279b727f`。有效 Compose 使用 `/opt/my-services/calendar-app/docker-compose.yml` 和切换目录下含密钥的 `override.yml`。

旧 Study 页面、API 和独立后端已退役。切换时保留 5 个用户，按照用户选择清空 22 条旧 Calendar 事项、未迁入 45 条旧 Study 任务。旧任务有用户电脑上的离线归档，历史切换备份仍在服务器。

Caddyfile 以单文件 bind mount 进入容器 `/etc/caddy/Caddyfile`；修改时应核对主机与容器内文件哈希一致，再验证并重载容器实际加载的配置。
