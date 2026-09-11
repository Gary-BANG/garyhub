# 数据位置与备份规则

最后核对：2026-09-11 UTC

## 持久化数据

| 服务 | 位置 | 类型 |
|---|---|---|
| 首页 | `/opt/my-services/site` | HTML/静态文件 |
| Calendar | `/opt/my-services/calendar-app/data` | SQLite |
| Study Planner | `/opt/my-services/study-api/data` | JSON 任务数据 |
| Uptime Kuma | `/opt/my-services/uptime-kuma` | SQLite 和运行状态 |
| Miniflux | `/opt/my-services/postgres` | PostgreSQL 数据目录 |
| FileBrowser 文件 | `/opt/my-services/filebrowser/data` | 用户文件 |
| FileBrowser 设置 | `/opt/my-services/filebrowser` | 设置和数据库 |
| Caddy 状态 | `/opt/my-services/caddy/data` | TLS 证书和状态 |
| Caddy 路由 | `/opt/my-services/caddy/Caddyfile` | 配置文件 |

已确认的主要文件：

```text
/opt/my-services/calendar-app/data/calendar.sqlite
/opt/my-services/study-api/data/tasks.json
```

## 已发现的备份

```text
/opt/my-services/backups/miniflux-db/miniflux-latest.sql
/opt/my-services/calendar-app-backup-2026-04-06-165632
/opt/my-services/site_backup_20260624_012324
/opt/garyhub-home-backup-D7RKhsek
```

只有在能列出内容且测试过恢复方法后，备份才可视为可靠。

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
sqlite3 /opt/my-services/calendar-app/data/calendar.sqlite 'PRAGMA integrity_check;'
```

正常输出应为 `ok`。

## 密钥安全

密钥可能位于 `.env`、Compose 配置或容器环境变量中。文档只记录位置和用途，不保存真实值。

禁止写入 README、Git 或聊天记录的内容包括：密码及其哈希、Session Secret、API Token、私钥、Cookie、完整 `.env` 和含私人信息的数据库导出。

## 临时目录

`/opt/garyhub-upgrade-lJdq1ju8` 不是正式数据源。在合并完成、验证通过并建立最终备份前不要删除。完成后应保留迁移脚本，停止测试容器，再决定是否清理该目录。
