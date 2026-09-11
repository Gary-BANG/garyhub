# 升级、验证与回滚指南

最后核对：2026-09-11 UTC

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
```

Caddy 修改前先验证：

```bash
docker exec caddy caddy validate --config /etc/caddy/Caddyfile
```

验证成功后再重载：

```bash
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

## 首页升级

正式文件：`/opt/my-services/site/index.html`

推荐顺序：在独立目录准备候选文件；备份原文件；只替换目标文件；比较候选文件与正式文件；直接请求源站验证；最后在浏览器无痕窗口测试公网 HTTPS。

`site` 已直接挂载到 Caddy，因此单纯替换首页通常不需要重启 Caddy。

## Calendar 升级

- 源码：`/opt/my-services/calendar-app`
- 数据：`/opt/my-services/calendar-app/data`

数据目录必须位于镜像之外。部署后应验证健康检查、管理员和普通用户登录、原日程、日程编辑、注册审批、管理员功能、Session，以及 HTTPS Secure Cookie。

## Study Planner 升级

- 源码：`/opt/my-services/study-api`
- 页面：`/opt/my-services/site/study`
- 数据：`/opt/my-services/study-api/data`

在最终合并完成前，这仍是正式任务数据来源。

## 最终合并检查表

- [ ] 获取最新 Calendar 和 Study Planner 一致性备份
- [ ] 核对用户、日程和任务数量
- [ ] 将任务迁移至目标用户
- [ ] 执行 SQLite integrity 和 foreign-key 检查
- [ ] 测试任务增删改查
- [ ] 测试用户隔离与管理员权限
- [ ] 验证正式域名的 Origin/CSRF 检查
- [ ] 验证 HTTPS Secure Cookie
- [ ] 验证 Calendar 与 Tasks 页面
- [ ] 记录上线镜像 ID
- [ ] 保留旧镜像和原数据以便回滚
- [ ] 正式验证后停止并移除 `garyhub-calendar-test`
- [ ] 保存最终迁移脚本并更新本文档

## 回滚原则

回滚必须恢复互相兼容的代码与数据。首页故障只需恢复旧 `index.html`；不要为修复前端问题而恢复旧数据库，否则可能丢失上线后新增的数据。

应用故障时，只停止受影响容器；恢复旧代码或镜像；仅在数据库结构或内容确实被迁移时恢复数据；随后验证日志、健康状态、登录和数据数量。

## 待处理事项

- 完成 Calendar/Study Planner 正式合并。
- 验证后移除临时测试容器。
- 决定何时归档或删除临时升级目录。
- 检查意外路径 `/opt/my-services/ystemctl start docker` 的内容和来源；确认前不要删除。
- 定期测试 Miniflux、Calendar 和 Uptime Kuma 的备份恢复。
