# GaryHub v2.3.0.0-r1 upgrade

完整解压 ZIP 后，在 Windows 双击 RUN-UPDATE.cmd。安装器复用已有的 OpenSSH 和 SSH 密钥，要求 Calendar 与 Tools/Lab 都实际运行 v2.2.0.0，并分别核对有 TOTP 和无 TOTP 两种组合的源码。不匹配时直接停止，不能跳过校验。

本次更新网站伙伴的 AI 助手：
- 每日次数按普通用户、订阅用户、管理员分别计算：对话（每条消息）、日程操作、联网搜索。日程和搜索只在实际用到时计 1 次；用完时伙伴直接说明额度已用完。
- 主模型（默认免费 `glm-4.7-flash`）出错时，同一条消息自动改用备用模型（默认付费 `glm-4-flashx-250414`）；都失败时提示稍后再试，本条不计次数。
- 可以联网搜索新闻和时事，回答附来源链接（智谱 Web Search，每次约 0.01 元）。
- 服务器保存每人最近 5 轮对话，换页面也能接上；伙伴“⋯”菜单可清空。
- 管理员新增工具“AI 日志”（https://tools.garyhub.uk/ai-logs/）：调用记录与全部错误，只记录元数据，不保存对话内容。

已保存的 API Key、主模型和启用状态保持不变。安装后建议管理员：
1. 打开 https://tools.garyhub.uk/admin/ 的“AI 助手”，核对备用模型、联网搜索和次数。
2. 点“测试连接”，会分别测试主模型、备用模型和一次搜索。
3. 打开 https://tools.garyhub.uk/ai-logs/ 查看记录。

本次只替换应用文件，不改 Caddy、DNS 或 Compose；新列和新表在 Calendar 启动时自动创建。安装器依次执行：
- 来源与有效配置核对；
- 离线构建；
- 合成数据隔离验证（assistant-http 使用容器内的模拟模型与搜索服务，不需要真实 Key）；
- 备份并切换；
- 核对 HTTPS、资源、助手与 AI 日志的权限；
- 向全部已批准且启用的账号（含管理员）发布本次站内通知，并核对人数与去重。

ROLLBACK.cmd 恢复本次安装前的 v2.2.0.0 应用，保留当前用户记录。如果之后又有部署，回滚会停止。

PUSH-TO-GITHUB.cmd 在独立的 worktree 中准备并推送审查分支：保留原工作区，不强推，也不自动合并 main。默认仓库为 `D:\Codes\Own_Project\garyhub`。

SHA256SUMS.txt 和 payload manifest 用来校验文件完整性。功能说明见源码中的 docs/GARYHUB_V2_3_0_0.md，验证记录见 docs/GARYHUB_V2_3_0_0_TESTS.md。

请保存最终的安装输出，用于核对生产结果。交付升级包不代表已经上线。
