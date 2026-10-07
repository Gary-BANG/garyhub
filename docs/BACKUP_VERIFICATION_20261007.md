# 2026-10-07 自动备份修复与恢复验证

- 状态备份脚本：`/usr/local/sbin/backup-garyhub-state.sh`。
- Files 实际数据库：`/opt/my-services/filebrowser/database.db`。
- Lab 数据：`/opt/my-services/lab-data`。
- 每次状态备份分别短暂停止 Files、Lab 以复制一致性数据，复制后自动启动；Calendar 不停止。
- 保留现有定时任务：每日 05:00 UTC 执行状态备份。
- 已实际运行修改后的备份脚本。
- 新 Restic 快照：`89d9ae3805ea93296d04974f67e7606c62ac59175c1d3ae79ad257bffd8e3d8f`，时间：`2026-10-07T08:07:11.495949945Z`。
- 新快照已恢复到隔离目录，11 个源文件逐一通过 SHA256 比较。
- Lab 恢复 JSON 验证通过；Filebrowser 恢复副本可通过原镜像 CLI 打开。
- SQLite 完整性检查通过：3 个数据库。
- 生产容器 Files、Lab 均已恢复运行。
- 私有脚本备份、执行日志和恢复副本：`/opt/garyhub-finish-20261007T080627Z`。未上传 GitHub；本次未清理。
- 整目录备份仍为每日 03:20 UTC；数据库恢复优先使用上述一致性状态快照。
