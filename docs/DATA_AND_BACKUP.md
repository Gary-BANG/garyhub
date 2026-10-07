> 2026-10-07 production correction: Filebrowser actually uses `/config/database.db`, mapped to `/opt/my-services/filebrowser/database.db`. Its command-line option overrides the JSON configuration. The additional `/database` mount is not proof of the active database. Tools and Lab are now deployed; see [deployment record](DEPLOYMENT_20261007.md) and [verified backup](BACKUP_VERIFICATION_20261007.md).
# 数据位置与备份规则

最后核对：2026-09-30 UTC（InterServer、Calendar v1.3.1.2）

## 持久化数据

| 服务 | 位置 | 类型 |
|---|---|---|
| 首页 | `/opt/my-services/site` | HTML/静态文件 |
| Calendar 与统一事项 | `/opt/garyhub-cutover-20260927-203135/data` | SQLite；目录内另有私密 Outlook 授权文件 |
| Uptime Kuma | `/opt/my-services/uptime-kuma` | SQLite 和运行状态 |
| Miniflux | `/opt/my-services/postgres` | PostgreSQL 数据目录 |
| FileBrowser 文件 | `/opt/my-services/filebrowser/data` | 用户文件 |
| FileBrowser 数据库 | `/opt/my-services/filebrowser/database.db` | Bolt 数据库；经 /config 挂载，由启动参数明确指定 |
| FileBrowser 设置 | `/opt/my-services/filebrowser/settings.json` | 设置文件；`filebrowser/database.db` 是已核实的实际数据库；启动参数优先于设置文件 |
| Caddy 状态 | `/opt/my-services/caddy/data` | TLS 证书和状态 |
| Caddy 路由 | `/opt/my-services/caddy/Caddyfile` | 配置文件 |
| Xray 配置 | `/usr/local/etc/xray/config.json` | VLESS 客户端信息；敏感 |

已确认的主要文件：

```text
/opt/garyhub-cutover-20260927-203135/data/calendar.sqlite
```

`/opt/my-services/calendar-app/data` 是切换前的旧数据，不再挂载至正式 Calendar。`/opt/my-services/study-api/data` 已随旧服务移除。

## 正式备份

新服务器的 `/etc/cron.d/garyhub-after-cutover` 含下列 UTC 任务：

| 时间 | 脚本 | 内容 |
|---|---|---|
| 每日 03:20 | `/usr/local/sbin/backup-my-services.sh` | Restic/B2 备份 `/opt/my-services` 与 Miniflux `pg_dump`；排除在线 PostgreSQL 原始目录和 Caddy access 日志 |
| 每日 05:00 | `/usr/local/sbin/backup-garyhub-state.sh` | SQLite online backup（Calendar、Session、Kuma）、Miniflux dump、Filebrowser 数据库、Outlook 令牌及配置；Restic 标签 `garyhub-state` |
| 周日 04:10 | `/usr/local/sbin/restic-prune-my-services.sh` | 按既定保留策略整理 Restic 仓库 |

同一 cron 文件每日 04:00 重启 Xray。Restic 环境在 `/root/.config/restic/restic-env`，密码文件位置由其中的 `RESTIC_PASSWORD_FILE` 指定；两者均为密钥，不得提交或打印。

迁移当天的 `garyhub-state` 快照 `8372824a`（2026-09-30 02:16 UTC）已实际恢复到独立目录：三个 SQLite 数据库 `PRAGMA integrity_check=ok`，Miniflux dump 可列目录，Filebrowser 数据库及令牌文件存在。此记录只证明该快照可读；以后仍应检查定时运行和抽样恢复。

Calendar v1.3.1.2 上线时另创建的两份手工临时备份 `/root/garyhub-upgrade-backups/20260930T052821Z`、`/root/garyhub-upgrade-backups/predeploy-20260930T084433Z`，以及包含生产数据库副本的 `/opt/garyhub-rehearsal-20260930T053329Z`，已在验收后依用户要求删除。这不等于删除 Restic/B2 仓库或定时任务；能否恢复到某个时间点，仍需核对相应快照的存在及可恢复性。正式数据目录未删除。

切换时确认旧 Calendar 有 5 个用户、22 条事项，Study JSON 有 45 条任务。依用户选择，保留 5 个用户，旧事项和任务未迁入新统一事项表。旧 Study 专用文件已导出到用户电脑的 `garyhub-study-removal-export-20260928-012533.tar.gz`，SHA256 为 `7d9d75f9d71a7aef6a762caff8013b02e23b073af0b965f573498e7ce47395ef`；它含私人任务数据，不得上传 Git 或聊天。历史演练/切换备份还可能同时包含旧 Study 数据和 Calendar 回滚资料，不能按目录名批量删除。

旧 Vultr `LA-VPN` 实例已删除。旧服务器上的 `/opt/my-services/backups`、切换目录及其他历史目录不能视作新服务器本地存在；旧 Study 离线归档仍属于用户私人资料。`/opt/garyhub-cutover-20260927-203135/data` 在**新服务器上仍是当前正式数据**，不要因路径像临时目录而删除。只有在能列出备份内容且测试过恢复方法后，备份才可视为可靠。

## 每次升级前

今后升级前，先在**当前**正式数据文件上使用 SQLite online backup API，输出至新建、权限受限的备份目录；随后在备份副本运行 `PRAGMA integrity_check`、`PRAGMA foreign_key_check` 并核对用户和任务数量。备份文件可能含私人日记，不能提交 Git、上传聊天或放入交付包。保存正式数据目录中的 Outlook 授权文件原位置，不要将整个目录当临时目录清理。

已部署的迁移 `20260929_personal_records_v1` 仅新增三张表和索引，`CREATE ... IF NOT EXISTS` 加事务可重复执行；本次未使用旧的 `--clear-legacy-data` 流程。回滚应用镜像时通常保留这些新表，因此在旧应用继续运行期间不要写入新功能数据；恢复整个数据库备份会丢失备份以后产生的任务和新记录，应作为明确的数据恢复决定。

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

Calendar SQLite 完整性检查（在线数据库请优先先生成一致性副本，再检查副本）：

```bash
sqlite3 /opt/garyhub-cutover-20260927-203135/data/calendar.sqlite 'PRAGMA integrity_check;'
```

正常输出应为 `ok`。

## 密钥安全

密钥可能位于 `.env`、Compose 配置或容器环境变量中。文档只记录位置和用途，不保存真实值。

禁止写入 README、Git 或聊天记录的内容包括：密码及其哈希、Session Secret、API Token、私钥、Cookie、完整 `.env` 和含私人信息的数据库导出。

## 临时目录

旧文档提及的 `/opt/garyhub-upgrade-lJdq1ju8` 属于已删除旧服务器。新服务器的 `/root/garyhub-migration`（包括 `garyhub-final-20260930-*`）等迁移备份可能含数据库和令牌；清理前需确认 Restic 快照与当前数据，而不能按目录名批量删除。

## 2026-10-07 Lab and Files backup update

Lab state is stored in `/opt/my-services/lab-data`. The state backup now uses the actual Files database and briefly stops each of Files/Lab during its copy. A new snapshot was restored and verified; see [verification results](BACKUP_VERIFICATION_20261007.md). The daily 03:20 whole-directory snapshot is not a substitute for consistent database snapshots.
