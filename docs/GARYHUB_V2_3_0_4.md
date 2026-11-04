# GaryHub v2.3.0.4 更新说明

完整解压 ZIP 后，在 Windows 双击 `RUN-UPDATE.cmd`，使用既有 SSH 密钥。安装前 Calendar 与 Tools/Lab 必须都实际运行 **v2.3.0.3**；源码、能力组合或有效 Compose 不匹配时停止。

本次更新：

- 服务状态使用波形、服务器监控使用机柜、AI 日志使用文档与放大镜图标。
- Tools 的“Reading 使用说明 / 关联旧账号”入口仅管理员显示；现有订阅阅读功能及账号关联 API 权限不变。
- 普通通知（含网站更新）从创建时间起保留 14 天；到期不再返回给界面，启动时、每分钟及读取列表时自动清理。
- 主页、Calendar、Network Access 通知面板支持“一键已读”和“一键删除”，作用于当前账号、当前分类的全部普通通知，包括未加载的后续页。主页覆盖全部分类。
- 邮箱验证等必要通知（`account`、`security`、`required` 类型）不自动删除，也不参与批量已读/删除；仍可逐条标为已读。

复用现有更新器：核对版本与有效配置 → 离线构建 → 8 项合成数据隔离检查 → 备份 → 切换 → HTTPS/资源哈希 → 全体已批准且启用账号的站内通知与去重核对。无数据库结构变化、无新生产依赖、不改 Caddy/DNS/Compose。

`ROLLBACK.cmd` 恢复 v2.3.0.3 应用并保留当前数据库与设置。因此，回滚不会重新生成已过期或用户已删除的通知；安装前备份仍由更新器保留。后续已有新部署时，旧包回滚会停止。

`PUSH-TO-GITHUB.cmd` 使用独立 worktree，在审阅的 main 基础 `c9096802a1e8dd3bba5f56a3bc38ed617df331f3` 上准备 `update/garyhub-v2.3.0.4`，普通 push，不强推、不覆盖已有工作、不自动合并 main。安装结束也会尝试本地源码准备；源码准备失败不代表服务器安装失败。

安装后检查：管理员 Tools 的三个图标和 Reading 说明入口；普通/订阅账号不显示该说明入口；在通知面板分别试一键已读和一键删除，必要通知仍存在。Windows 双击安装、真实浏览器桌面/手机排版和生产 HTTPS 尚需现场验收。

本包源码已准备并完成本地相关测试，未推送/合并本版，未部署生产。请保留最后的安装输出，以核对生产结果和通知人数。

## 实现定位

- `calendar-app/notification-policy.js`：统一必要类型、14 天可见条件、物理清理与每分钟任务；使用 SQLite UTC 时间比较，不受浏览器时区影响。
- `hub-api.js`：主页/Access 列表过滤，`POST /api/hub/notifications/read-all` 与 `delete-all`。请求必须带当前 `userId` 和 `scope`；账号切换返回 409，CSRF/Origin 与登录校验沿用既有中间件。
- `tasks-api.js`：Calendar 列表沿用同一保留规则；`public/unified.js` 与 Tools/Lab 的 `hub-account.js` 渲染批量操作、错误提示和必要通知标识。
- `lab-service/server.cjs`：仅扩展两个明确的通知代理路径；有/无 TOTP 两种覆盖做相同变更。
- `tools-dock.js`：身份事件每次核对管理员角色；退出、降级或身份失效即隐藏 Reading 说明入口。
- `hub_releases` 发布记录不随通知清理，避免用户删除/通知到期后重跑旧版本再次发通知。
- 本版适配器：新建清单与小型配置，逐个复用既有 Windows 入口与 HTTPS 校验，使用共享 `build_overlay.py`、`deploy_runtime.py`。资源校验器按主机选择 Calendar/Tools 响应。
