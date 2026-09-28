# 升级、验证与回滚指南

最后核对：2026-09-28 UTC（生产切换与旧 Study 清理报告）

统一 Calendar 已正式切换；旧 Study 页面和 API 返回 410，独立旧服务及专用目录已清理。正式 Web 与提醒 worker 共享 `/opt/garyhub-cutover-20260927-203135/data`，此目录含正式 SQLite 和私密 Outlook 授权文件。

## 通用流程

1. 确认正式代码和持久化数据位置。
2. 查看容器状态和镜像 ID。
3. 创建带时间戳的备份。
4. 在独立目录准备修改。
5. 使用测试数据验证。
6. 先验证配置，再逐项部署。
7. 完成上线检查。
8. 保留明确的回滚路径。

不要执行 `docker compose down -v`，因为 `-v` 可能删除持久化卷。

## 常用检查

```bash
cd /opt/my-services
docker ps
docker compose ps
docker logs --tail 100 caddy
docker logs --tail 100 calendar-app
docker logs --tail 100 garyhub-reminder-production-20260927-203135
```

Caddy 修改前先验证：

```bash
docker exec caddy caddy validate --config /etc/caddy/Caddyfile
```

验证成功后再重载：

```bash
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

Caddyfile 通过单文件 bind mount 提供给容器。主机上替换文件 inode 后，容器可能仍读取旧 inode；修改前后需核对主机 `/opt/my-services/caddy/Caddyfile` 与容器 `/etc/caddy/Caddyfile` 的哈希，确保验证和重载的是实际配置。

## 首页升级

正式文件：`/opt/my-services/site/index.html`

推荐顺序：在独立目录准备候选文件；备份原文件；只替换目标文件；比较候选文件与正式文件；直接请求源站验证；最后在浏览器无痕窗口测试公网 HTTPS。

`site` 已直接挂载到 Caddy，因此单纯替换首页通常不需要重启 Caddy。

## Calendar 升级

- 本地源码：`D:\Codes\Own_Project\garyhub-repo\calendar-app`；服务器 `/opt/my-services/calendar-app` 仍含切换前源码，不等于当前镜像。
- 当前镜像：`garyhub-calendar-candidate:20260927-200732`，ID `sha256:0490d2abb87f3c4f167d1f04026d111e36bbd6d9f0a58a19b9f4c7de279b727f`。
- 正式数据：`/opt/garyhub-cutover-20260927-203135/data`；旧 `/opt/my-services/calendar-app/data` 不再挂载到正式容器。
- 有效 Compose：`/opt/my-services/calendar-app/docker-compose.yml` 加 `/opt/garyhub-cutover-20260927-203135/override.yml`；后者含密钥，不得加入 Git。

数据目录必须位于镜像之外。部署后应验证健康检查、管理员和普通用户登录、事项增删改查、用户隔离、分类、注册审批、Session、HTTPS Secure Cookie，以及提醒 worker 和邮件投递。

## 旧 Study 退役记录

2026-09-28 清理报告确认：`study-api` 容器、`study-api:0.2` 镜像标签、服务器旧源码/数据目录和 4 个专用回滚目录已清理；旧页面/API 源站均返回 410，主页及 Calendar 健康检查均返回 200。旧文件与任务已在删除前导出到用户电脑并校验哈希。包含 Calendar 回滚资料的历史混合备份仍保留，不应批量删除。

## 回滚原则

回滚必须恢复互相兼容的代码与数据。首页故障只需恢复旧 `index.html`；不要为修复前端问题而恢复旧数据库，否则可能丢失上线后新增的数据。

应用故障时，只停止受影响容器；恢复旧代码或镜像；仅在数据库结构或内容确实被迁移时恢复数据；随后验证日志、健康状态、登录和数据数量。

## 待处理事项

- 盘点并决定何时清理临时测试容器；先确认挂载、备份及用途。
- 决定何时归档或删除临时升级目录。
- 审核本地 `feat/unified-calendar` 的代码和文档，运行测试与敏感信息检查，再提交推送；不要提交密钥、数据库、日志或离线归档。
- 检查意外路径 `/opt/my-services/ystemctl start docker` 的内容和来源；确认前不要删除。
- 定期测试 Miniflux、Calendar 和 Uptime Kuma 的备份恢复。

## GitHub 与服务器同步流程

代码仓库：`https://github.com/Gary-BANG/garyhub`
默认分支：`main`

推荐更新流程：

1. 在本地 `D:\Codes\Own_Project\garyhub-repo` 检查分支和未提交修改，再决定是否 `git pull`。
2. 创建功能分支并在本地修改代码。
3. 检查 `.gitignore`，运行语法检查和敏感信息扫描。
4. 提交并推送功能分支。
5. 使用独立测试目录和测试数据验证。
6. 备份服务器上的正式代码与数据。
7. 将确认过的版本部署到 `/opt/my-services`。
8. 验证网站、登录、数据数量和容器日志。
9. 更新维护文档并提交新的 Git 版本。
10. 保留旧代码、旧镜像和数据备份用于回滚。

GitHub 不是数据库备份。正式数据库和用户数据必须使用独立的备份流程。

当前服务器目录没有配置为 Git 仓库，所以不要在 `/opt/my-services` 中直接运行 `git pull`。在部署流程完全自动化之前，继续采用“本地 Git → 独立测试 → 备份 → 正式部署”的方式。
