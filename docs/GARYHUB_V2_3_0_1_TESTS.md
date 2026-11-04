# GaryHub v2.3.0.1 验证记录

维护日期：2026-11-03（America/Chicago）。状态：源码已准备、本地已验证；未推送、未合并、生产未核验。环境与 v2.3.0.0 相同（WSL Ubuntu 22.04，官方 Node v20.20.2 与 v22.23.4）。

## 已执行

| 范围 | 结果 |
|---|---|
| calendar-app 全部 `node --test`。`assistant-api.test.js` 新增：`glm-5.3-flash` 请求带 `reasoning_effort:"low"`、不带 `thinking`、`max_tokens` 3072；另一模型先以 400／1210“始终思考”拒绝后在同一请求内改用 `reasoning_effort` 重试成功，不记错误、不切换备用模型，下一条消息直接使用 `reasoning_effort`；其他 400 仍切换备用模型 | 87 通过／0 失败 |
| lab-service 全部 `node --test` | 85 通过／2 失败（栗栗、布丁几何检查，自 v2.0.1.0 起存在） |
| 本地隔离联调（沿用 v2.3.0.0 的 7 项检查与测试输入，资源哈希按 2.3.0.1 重算） | useful 29、study 19、asset-response 53、music 25、companion 301、sites 59、assistant 63，全部通过 |
| 站内通知 `garyhub-2.3.0.1.json` 连续两次 | 首次 5 个账号（含管理员）、10 条；第二次 `alreadyPublished`，人数相同 |
| 无 TOTP 覆盖：与主文件的差异仍为原有的 7 行（server.cjs）与 12 行（app.js） | 通过 |

## 未在本地执行

- 真实的 `glm-5.3-flash`／`glm-5.3-flashx` 调用（需要管理员的 Key），包括这两个模型的工具调用格式和 `reasoning_effort` 在官方接口上的实际效果；参数依据维护者发回的错误提示和第三方文档。
- 安装器第 3 阶段在 Docker 隔离网络中的运行和第 6 阶段 HTTPS 核对。
