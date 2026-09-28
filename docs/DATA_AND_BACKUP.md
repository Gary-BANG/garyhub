# 数据位置与备份规则

最后核对：2026-09-28 UTC（生产切换与旧 Study 清理报告）

## 持久化数据

| 服务 | 位置 | 类型 |
|---|---|---|
| 首页 | `/opt/my-services/site` | HTML/静态文件 |
| Calendar 与统一事项 | `/opt/garyhub-cutover-20260927-203135/data` | SQLite；目录内另有私密 Outlook 授权文件 |
| Uptime Kuma | `/opt/my-services/uptime-kuma` | SQLite 和运行状态 |
| Miniflux | `/opt/my-services/postgres` | PostgreSQL 数据目录 |
| FileBrowser 文件 | `/opt/my-services/filebrowser/data` | 用户文件 |
| FileBrowser 设置 | `/opt/my-services/filebrowser` | 设置和数据库 |
| Caddy 状态 | `/opt/my-services/caddy/data` | TLS 证书和状态 |
| Caddy 路由 | `/opt/my-services/caddy/Caddyfile` | 配置文件 |

已确认的主要文件：

```text
/opt/garyhub-cutover-20260927-203135/data/calendar.sqlite
```

`/opt/my-services/calendar-app/data` 是切换前的旧数据，不再挂载至正式 Calendar。`/opt/my-services/study-api/data` 已随旧服务移除。

## 已发现的备份与旧数据

```text
/opt/my-services/backups/miniflux-db/miniflux-latest.sql
/opt/my-services/calendar-app-backup-2026-04-06-165632
/opt/my-services/site_backup_20260624_012324
/opt/garyhub-home-backup-D7RKhsek
/opt/garyhub-cutover-20260927-203135/backup
```

切换时确认旧 Calendar 有 5 个用户、22 条事项，Study JSON 有 45 条任务。依用户选择，保留 5 个用户，旧事项和任务未迁入新统一事项表。旧 Study 专用文件已导出到用户电脑的 `garyhub-study-removal-export-20260928-012533.tar.gz`，SHA256 为 `7d9d75f9d71a7aef6a762caff8013b02e23b073af0b965f573498e7ce47395ef`；它含私人任务数据，不得上传 Git 或聊天。历史演练/切换备份还可能同时包含旧 Study 数据和 Calendar 回滚资料，不能按目录名批量删除。

`/opt/garyhub-cutover-20260927-203135/data` 是**当前正式数据**；不要因路径像临时目录而删除。只有在能列出备份内容且测试过恢复方法后，备份才可视为可靠。

## 每次升级前

1. 创建带时间戳的新备份目录。
2. 使用数据库支持的一致性备份方法。
3. 备份即将修改的代码和配置。
4. 记录当前 Docker 镜像 ID。
5. 验证备份后再改正式环境。
6. 不覆盖唯一的一份旧备份。

## 各数据库注意事项

- SQLite：不要直接复制正在写入的单个数据库文件；使用 SQLite backup API，或短暂停止写入服务。
- PostgreSQL：使用 `pg_dump`。不能把正在运行时截取的部分 `postgres` 目录当作有效备份。
- Uptime Kuma：目录可能含 `kuma.db`、`kuma.db-wal` 和 `kuma.db-shm`；使用一致性备份或短暂停止容器后复制。

Calendar SQLite 完整性检查：

```bash
sqlite3 /opt/garyhub-cutover-20260927-203135/data/calendar.sqlite 'PRAGMA integrity_check;'
```

正常输出应为 `ok`。

## 密钥安全

密钥可能位于 `.env`、Compose 配置或容器环境变量中。文档只记录位置和用途，不保存真实值。

禁止写入 README、Git 或聊天记录的内容包括：密码及其哈希、Session Secret、API Token、私钥、Cookie、完整 `.env` 和含私人信息的数据库导出。

## 临时目录

`/opt/garyhub-upgrade-lJdq1ju8` 是历史测试目录，不是正式数据源。清理它及其他隔离环境前，仍需重新盘点容器挂载、备份和测试用途；不要误删正式切换目录的 `data/`。
