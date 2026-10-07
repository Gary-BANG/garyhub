# GaryHub 2026-10-07 部署记录

## 已部署并由用户验收
- 首页 Tools 入口连接 https://tools.garyhub.uk
- Tools 导航页包含背景动画和各工具入口。
- ECE 470 Lab 位于 https://lab.garyhub.uk/lab/
- Lab 使用 Calendar 账号认证；两站分别登录，尚未实现跨站免登录。
- Lab 的代码保存、刷新恢复、Python 运行、判题和解析已由用户确认正常。
- 自动化测试覆盖账号隔离；真实两个账号之间的人工隔离验收尚未完成。

## 生产数据
- Calendar：/opt/garyhub-cutover-20260927-203135/data
- Lab：/opt/my-services/lab-data
- Filebrowser 实际数据库：/opt/my-services/filebrowser/database.db
- Filebrowser 启动参数：--database /config/database.db
- /config/settings.json 中的 /database/filebrowser.db 被启动参数覆盖。
- 旧文档中将 database/filebrowser.db 认定为当前数据库的说法不准确。
- 不应删除任何候选数据库；先核对实际使用情况和备份。

## Files 维护结果
- 外层 Caddy basic_auth 已移除，内层 json 登录保留。
- admin 密码已在实际数据库重置，接口 HTTP 200，用户确认网页登录成功。
- 有效手工备份：
  /opt/garyhub-files-active-db-backup-20261007T072812Z
- 不记录密码、哈希或令牌。

## 部署与回滚
- 新增 garyhub-lab 容器；未替换 Calendar 或提醒服务。
- 当前发布源码目录：/opt/garyhub-lab-release-tHVHPNKh/lab-service
- 首次部署备份：/opt/garyhub-lab-backup-20261007T071751Z
- 此后 Files 的 Caddy 配置已有修改，不能直接整体覆盖旧 Caddyfile 回滚。
- /opt/my-services 不是 Git working tree；GitHub push 不会自动部署。

## 仍需完成
- 自动备份已修复并通过隔离恢复验证，见 BACKUP_VERIFICATION_20261007.md。
- 新快照编号及恢复检查结果已写入备份验证记录。
- 源码和修正文档已导入开发仓库；GitHub 推送结果以终端输出为准。
