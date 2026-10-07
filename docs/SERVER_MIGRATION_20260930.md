> 2026-10-07 production correction: Filebrowser actually uses `/config/database.db`, mapped to `/opt/my-services/filebrowser/database.db`. Its command-line option overrides the JSON configuration. The additional `/database` mount is not proof of the active database. Tools and Lab are now deployed; see [deployment record](DEPLOYMENT_20261007.md) and [verified backup](BACKUP_VERIFICATION_20261007.md).
# 2026-09-30 服务器迁移记录

## 当前入口

GaryHub 从 Vultr `LA-VPN`（旧 IPv4 `45.32.84.89`）迁至 InterServer `vps3666849`（IPv4 `162.35.168.17`）。旧 Vultr 实例已删除。Cloudflare 中 `garyhub.uk`、`calendar.garyhub.uk`、`files.garyhub.uk`、`kuma.garyhub.uk`、`rss.garyhub.uk` 的 A 记录均指向新 IPv4，保持 DNS only。Caddy 提供网站的 80/443，独立 Xray 提供 TCP 8080。

迁移后从公网不带 `--resolve` 验证了五个域名均连到 `162.35.168.17` 且证书有效。首页与 Calendar 返回 200，Files 未登录返回 401，Kuma 登录跳转返回 302，RSS 返回 200。用户确认 Calendar 登录后能看到正式任务和数据，并已用新 IP 的 Xray 客户端上网。

## 部署组成

| 部分 | 新服务器上的配置 | 数据 |
|---|---|---|
| Caddy、Miniflux、PostgreSQL、Uptime Kuma、Filebrowser、Netdata | `/opt/my-services/docker-compose.yml` + `docker-compose.override.yml` + `docker-compose.migration.yml` | `/opt/my-services` 下各目录 |
| Calendar Web | `/opt/my-services/calendar-app/docker-compose.yml` + `/opt/garyhub-cutover-20260927-203135/override.yml` | `/opt/garyhub-cutover-20260927-203135/data` |
| Reminder worker | `/opt/my-services/reminder-compose.json` | 与 Calendar Web 共享正式数据和 Graph 令牌 |
| Xray | `/etc/systemd/system/xray.service`、`/usr/local/etc/xray/config.json` | root 管理的配置文件 |

Calendar 的 `override.yml`、`reminder-compose.json` 以及 Xray 配置可能含真实密钥；这些文件都不是本仓库的模板，不得提交。提醒 worker 的镜像与 Calendar Web 相同：`garyhub-calendar-candidate:20260927-200732`。Filebrowser 的真实数据库挂载为 `/opt/my-services/filebrowser/database.db`，实际运行使用 `filebrowser/database.db`，此前将它认定为旧数据库的记录有误。

## 备份与回滚

- 新服务器的 cron 每日 03:20 UTC 运行主服务 Restic 备份、每日 05:00 UTC 运行 `garyhub-state` 状态备份；周日 04:10 UTC 执行 prune。脚本、日志和密钥位置见 [数据与备份](DATA_AND_BACKUP.md)。首次自动运行应单独核验。
- 停写后生成的最终数据包已传至新服务器；Restic 状态快照 `8372824a` 于 2026-09-30 02:16 UTC 建立。随后将该快照实际恢复到隔离目录，Calendar、Session、Kuma SQLite 完整性检查均为 `ok`，Miniflux dump 可读，Filebrowser 数据库和 Outlook 令牌存在。
- 旧 Vultr 已删除，回滚必须从兼容的镜像和新服务器的当前备份恢复。任何恢复前先冻结写入并保存切换后新增的数据。迁移前的历史快照不能替代最新业务数据。

## Git 与服务器

仓库路径（维护者本机）：`D:\Codes\Own_Project\garyhub-repo`。新服务器 `/opt/my-services` 不是 Git working tree，GitHub 推送不会自动部署。仓库可能包含尚未部署的私人记录候选代码；对比实际镜像 ID 与容器挂载后再安排代码升级。本记录不含密码、令牌、数据库或授权文件。
