# GaryHub 发布规则

用户于 2026-10-11 确认：今后每次正式功能更新，都要向全部已批准且启用的用户（含管理员）发布未读站内通知，无需用户再次提醒。

1. 在 `calendar-app/releases/garyhub-<version>.json` 编写发布说明。每条说明必须带 `scope`：`home`、`calendar`、`tools`、`access` 或 `lab`，以及功能名称、发布日期和具体改动。
2. 完成备份、测试、正式服务切换和健康检查后，运行当前 Calendar 镜像中的 `scripts/publish-hub-release.js`，传入该发布文件。
3. 发布程序按当前已启用用户创建通知并核对收件人数。发布版本、通知和收件人记录在同一事务中保存。
4. 同一版本重复执行不能重复发通知，不能重置已读状态，也不能为后来新注册的用户补发旧通知。新变更必须使用新版本号。
5. Homepage 汇总全部分类；Access 只显示 `access`；Calendar 只显示 `calendar`；Tools 不显示铃铛。
6. 同一通知在所有页面共用当前账号的 `read_at`；后台检查账号归属。更新状态在页面切回时及可见页面每 10 秒刷新。
7. 把通知收件人数和去重验证写入本次上线记录。发布失败不能标记为“全部完成”。

通知是站内消息；此规则不要求发送邮件。

## 身份与权限

- Homepage、Tools、Calendar、Lab、Network Access 共用 Calendar 账号与 `garyhub.shared.sid`；正式 cookie 为 `.garyhub.uk`、HttpOnly、Secure、SameSite=Lax。
- 只信任明确列出的站点 Origin，并保留 CSRF 校验。不得将信任范围扩大到任意子域。
- API 每次核对用户启用状态和当前角色；禁用用户立即失去 API 访问权。
- 学业信息保存在服务器非公开文件中，接口经权限检查返回。访客和未授权用户的 HTML、接口及公开备份路径不得泄露真实值。
- Lab 保存请求同时核对当前页面账号与服务器会话账号，防止跨站切换账号后把旧草稿写入新账号。
- GPA / Rank 权限与 Network Access 授权相互独立。

## 正式配置

20261011-v1 部署成功后，以服务器 `/opt/my-services/garyhub-active-deployment.json` 指向的有效 Compose 配置为准。它们是合并现有配置后生成的受限文件，含正式环境变量，不得上传、打印或提交 Git。不要用旧的 Compose 命令覆盖新镜像或共享 Cookie 配置。
