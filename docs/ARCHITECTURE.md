# Gary Hub 系统架构

最后核对：2026-09-30 UTC（InterServer、Calendar v1.3.1.2）

正式主机 `vps3666849`，IPv4 `162.35.168.17`。Cloudflare 的五条网站 A 记录为 DNS only。旧 Vultr `LA-VPN` 实例已删除。

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
| `calendar-app` | `garyhub-calendar:6cd3102` | `unless-stopped` | `/opt/garyhub-cutover-20260927-203135/data` |
| `garyhub-reminder-production-20260927-203135` | 同一 Calendar 镜像 | `unless-stopped` | 同一正式数据目录 |
| `filebrowser` | `filebrowser/filebrowser:latest` | `always` | `filebrowser/data`、`filebrowser/database/filebrowser.db`、`filebrowser/settings.json` |
| `uptime-kuma` | `louislam/uptime-kuma:1` | `always` | `uptime-kuma` |
| `miniflux` | `miniflux/miniflux:latest` | `always` | 数据位于 `miniflux-db` |
| `miniflux-db` | `postgres:15-alpine` | `always` | `postgres` |
| `netdata` | `netdata/netdata:stable` | `always` | 只读系统监控挂载 |

旧 Vultr 上的测试容器未迁入新服务器；v1.3.1.2 隔离演练容器及目录已在验收后清理。它们不属于正式 Calendar 架构。

## 端口

- `80/tcp`：Caddy HTTP
- `443/tcp`、`443/udp`：Caddy HTTPS/HTTP3
- `127.0.0.1:19999`：Netdata，仅本机
- `8080/tcp`：主机上的 Xray systemd 服务（VLESS）；不经过 Caddy

其他应用端口仅供 Docker 内部通信，不应直接暴露到公网。Xray 配置在 `/usr/local/etc/xray/config.json`，服务单元在 `/etc/systemd/system/xray.service`；两者可能包含敏感信息，不要提交 Git。

## Caddy

- 配置：`/opt/my-services/caddy/Caddyfile`
- 证书和状态：`/opt/my-services/caddy/data`
- 配置状态：`/opt/my-services/caddy/config`
- 静态页面挂载：`/opt/my-services/site -> /srv`（只读）

## 正式 Compose 与数据挂载

- 主项目以 `/opt/my-services/docker-compose.yml`、`docker-compose.override.yml`、`docker-compose.migration.yml` 三个文件组合运行。第三个文件把 Filebrowser 的 Bolt 数据库从旧服务器的匿名卷迁到显式 bind mount：`/opt/my-services/filebrowser/database/filebrowser.db` → `/database/filebrowser.db`。
- Calendar Web 使用 `/opt/my-services/calendar-app/docker-compose.yml` 和 `/opt/garyhub-cutover-20260927-203135/override.yml`；提醒 worker 使用单独的 `/opt/my-services/reminder-compose.json`。后两个文件含正式环境变量，不得加入 Git；两者镜像字段已固定为 `garyhub-calendar:6cd3102`。
- Web 与 worker 连接 `my-services_default`，共享 `/opt/garyhub-cutover-20260927-203135/data`。worker 只应运行一个实例，以免重复发邮件。

## 统一 Calendar 当前状态

### Calendar v1.3.1.2 私人记录与事项

Calendar 登录后的同一页面增加日记、体重、锻炼区域，沿用现有 Session、CSRF 和账号 IANA 时区。接口为 `/api/personal/diary`、`/api/personal/weight`、`/api/personal/exercise` 及锻炼汇总。每条读写都通过 Session 中的用户 ID 限定，管理员的事项查看目标不影响私人记录。

新表 `diary_entries`（每用户每日期唯一）、`weight_entries`（整数克，同日多条）、`exercise_entries`（整数分钟，同日多条）只引用 `users`。日期为用户选定的 `YYYY-MM-DD`，不按 UTC 时间戳反推。服务启动时增量创建新表和索引；正式数据库已创建这些表并保留原有用户和事项。页面有五个可收起面板，事项可按覆盖日期与分类、状态、标题联合筛选；提醒邮件包含非空备注并保留换行。v1.3.1.2 的升级提示通过已有 `notifications` 表逐用户展示。

正式 Web 与提醒 worker 使用同一 `/opt/garyhub-cutover-20260927-203135/data` 目录，挂载到 `/app/data`。镜像 ID 为 `sha256:45c2b8d289bbec765d28f2313f030c8630d9b3c8ea750551eed7ef9820da1202`。Web 有效 Compose 使用 `/opt/my-services/calendar-app/docker-compose.yml` 和切换目录下含密钥的 `override.yml`；worker 使用 `/opt/my-services/reminder-compose.json`。

旧 Study 页面、API 和独立后端已退役。此前切换时保留 5 个用户，按照用户选择清空 22 条旧 Calendar 事项、未迁入 45 条旧 Study 任务。旧任务有用户电脑上的离线归档；新服务器的备份状态见 [数据与备份](DATA_AND_BACKUP.md)。

Caddyfile 以单文件 bind mount 进入容器 `/etc/caddy/Caddyfile`；修改时应核对主机与容器内文件哈希一致，再验证并重载容器实际加载的配置。
