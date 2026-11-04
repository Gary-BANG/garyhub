# GaryHub v2.3.0.1-r1 upgrade

完整解压 ZIP 后，在 Windows 双击 RUN-UPDATE.cmd。安装器复用已有的 OpenSSH 和 SSH 密钥，要求 Calendar 与 Tools/Lab 都实际运行 v2.3.0.0，并分别核对有 TOTP 和无 TOTP 两种组合的源码。不匹配时直接停止，不能跳过校验。

本次修复：AI 助手无法使用 GLM-5.3 系列模型（`glm-5.3-flash`、`glm-5.3-flashx`）。这类模型始终思考，拒绝“关闭思考”参数（HTTP 400，错误码 1210）；现在改用最低思考强度 `reasoning_effort: "low"`。其他模型不变；以后若有模型同样拒绝，会自动改用这种方式重试一次。

本次只替换应用文件，不改数据库结构、Caddy、DNS 或 Compose；已保存的 Key、模型、次数和用户记录保持不变。安装器依次执行来源与有效配置核对、离线构建、合成数据隔离验证（沿用 v2.3.0.0 的 7 项检查）、备份并切换、HTTPS 与资源核对，并向全部已批准且启用的账号（含管理员）发布站内通知、核对人数与去重。

安装后：
1. 打开 https://tools.garyhub.uk/admin/ 的“AI 助手”，主模型设为 `glm-5.3-flash`，备用模型设为 `glm-5.3-flashx` 或保留 `glm-4-flashx-250414`，保存后点“测试连接”。
2. 对伙伴说一句需要工具的话（例如“明天下午三点测试一下”），确认出现添加卡片，再到 https://tools.garyhub.uk/ai-logs/ 看对应记录。

ROLLBACK.cmd 恢复 v2.3.0.0 应用，保留当前记录与设置；回滚后 GLM-5.3 会再次报错，请先把主模型改回 `glm-4.7-flash`。如果之后又有部署，回滚会停止。

PUSH-TO-GITHUB.cmd：v2.3.0.0 尚未合并时请先不要运行本包的推送，先推送并合并 v2.3.0.0；本版源码分支在那之后再准备。

功能说明见 docs/GARYHUB_V2_3_0_1.md，验证记录见 docs/GARYHUB_V2_3_0_1_TESTS.md。请保存最终的安装输出，用于核对生产结果。交付升级包不代表已经上线。
