# GaryHub v2.2.0.0-r2 upgrade

r2 修正：r1 在第 3 阶段的 sites-http 检查停止（外站页仍引用 `?v=2.1.0.0`），服务器未做任何改动。r2 只把外站页的资源版本号改为 2.2.0.0，其余与 r1 相同。

完整解压 ZIP 后，在 Windows 双击 RUN-UPDATE.cmd。安装器复用已有的 OpenSSH 和 SSH 密钥，要求 Calendar 与 Tools/Lab 都实际运行 v2.1.0.0，并分别核对有 TOTP 和无 TOTP 两种组合的源码。不匹配时直接停止，不能跳过校验。

本次在网站伙伴中加入 AI 日程助手：
- 登录账号可以用一句话查看、添加和删除自己的日程。
- 每次添加或删除，都要用户在对话卡片上点“确认”才会写入。
- 模型使用 OpenAI 兼容接口，默认是智谱 GLM（`glm-4.7-flash`）。
- 用户消息和相关日程会发送给所选服务商；API Key 只保存在 Calendar 数据库中，不会返回浏览器，也不会写入日志。
- 游客，或助手未启用时，伙伴仍使用原来的本地向导。

**安装后助手默认关闭。** 管理员需要：
1. 打开 https://tools.garyhub.uk/admin/，找到“AI 日程助手”。
2. 粘贴智谱开放平台的 API Key，点“测试连接”。
3. 勾选“启用 AI 助手”，保存。

本次只替换应用文件，不改 Caddy、DNS 或 Compose；新表在 Calendar 启动时自动创建。安装器依次执行：
- 来源与有效配置核对；
- 离线构建；
- 合成数据隔离验证，新增 assistant-http 检查（使用容器内的模拟模型，不需要真实 Key）；
- 备份并切换；
- 核对 HTTPS、资源与助手权限；
- 向全部已批准且启用的账号（含管理员）发布本次站内通知，并核对人数与去重。

ROLLBACK.cmd 恢复本次安装前的 v2.1.0.0 应用，保留当前用户记录。如果之后又有部署，回滚会停止。

PUSH-TO-GITHUB.cmd 在独立的 worktree 中准备并推送审查分支：保留原工作区，不强推，也不自动合并 main。默认仓库为 `D:\Codes\Own_Project\garyhub`。

SHA256SUMS.txt 和 payload manifest 用来校验文件完整性。功能说明见源码中的 docs/GARYHUB_V2_2_0_0.md，验证记录见 docs/GARYHUB_V2_2_0_0_TESTS.md。

请保存最终的安装输出，用于核对生产结果。交付升级包不代表已经上线。
