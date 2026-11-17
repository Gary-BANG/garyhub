# GaryHub v2.3.0.1：AI 助手支持始终思考的 GLM-5.3 模型

维护日期：2026-11-03（America/Chicago）。状态：源码已准备、本地已验证；未推送、未合并、生产未核验。基础为 v2.3.0.0 提交 `e89fc65c5dad4011faf2089c2468fabe90f9f424`。

## 问题

维护者想用智谱赠送的新用户额度（只适用于 `glm-5.3-flash` 与 `glm-5.3-flashx`），把主模型设为 `glm-5.3-flash` 后，“测试连接”返回：

> HTTP 400 · 1210 · 该模型始终思考，不支持关闭思考；请使用 low、high 或 max。

v2.2.0.0／v2.3.0.0 对所有 GLM 4.5 及以后的模型都发送 `thinking:{type:'disabled'}`，GLM-5.3 系列不接受这个参数。

## 修改

`calendar-app/assistant-api.js` 的 `complete()`：

- 名称以 `glm-5.3` 开头的模型不再发送 `thinking`，改发 `reasoning_effort: "low"`（最低思考强度，省 Token、回复快），并把 `max_tokens` 增加 2048，给思考过程留出空间。
- 其他 GLM 4.5+ 模型照旧关闭思考，旧模型不发送任何思考参数。
- 若将来别的模型同样以 400 拒绝关闭思考（说明中含“思考”“thinking”或“reasoning”），本次请求在剩余时间内改用 `reasoning_effort` 重试一次，并在 Calendar 进程内记住该模型。重试成功不记为错误，也不会切换到备用模型；其他 400 仍按原规则切换。

没有数据库结构、路由或界面变化；版本号与资源 `?v=` 改为 2.3.0.1。

## 安装后

在 `https://tools.garyhub.uk/admin/` 的“AI 助手”把主模型设为 `glm-5.3-flash`，备用模型可设 `glm-5.3-flashx`（同样使用赠送额度）或保留 `glm-4-flashx-250414`，点“测试连接”。“测试连接”只发送一句 ping，不带工具；请再对伙伴说一句需要工具的话（例如“明天下午三点测试一下”），确认出现添加卡片，并在“AI 日志”里看到对应模型。

赠送额度用完后，这两个模型改为从账户余额计费；余额不足时会在 AI 日志中出现相应错误，届时可把主模型改回 `glm-4.7-flash`。

## 项目档案历史记录

以下条目于 2026-11-16 从 `docs/PROJECT_CONTEXT.md` 原样移入，是写入当时的记录；其中“尚未推送／合并／部署”等状态描述以写入时为准，后续状态见项目档案的版本索引。

- **v2.3.0.1（上一版本，生产已安装）**：基础为 v2.3.0.0 提交 `e89fc65c5dad4011faf2089c2468fabe90f9f424`（同一分支 `feature/assistant-tiers`，两者均未推送／合并）；清单 `releases/2.3.0.1.json`，适配器 `scripts/releases/v2.3.0.1/`（baseline_adapter v2.3.0.0，隔离检查沿用 v2.3.0.0 的 7 项），安装器 v2.3.0.1-r1，要求两服务实际运行 v2.3.0.0。起因：维护者把主模型设为 `glm-5.3-flash` 后“测试连接”返回 HTTP 400、错误码 1210“该模型始终思考，不支持关闭思考；请使用 low、high 或 max”。`assistant-api.js` 的 `complete()` 改为：名称匹配 `glm-5.3` 的模型不发 `thinking`，改发 `reasoning_effort:'low'`，`max_tokens` 加 2048 留给思考；GLM 4.5+ 其他模型仍发 `thinking:{type:'disabled'}`；若某模型以 400 且说明含“思考／thinking／reasoning”拒绝，则在同一请求预算内改用 `reasoning_effort` 重试一次，并在进程内记住该模型（不计入错误日志、不触发备用模型）。无数据库结构变化。GitHub：v2.3.0.0 由 PR #28 合并为 main `b783804`（代码树与 `e89fc65` 相同，但不含该提交本身），因此 v2.3.0.1 的审查分支 `update/garyhub-v2.3.0.1` 在 `b783804` 上重放 v2.3.0.1 的两个提交另行准备，并核对树与本地 `7464b50` 相同，未使用安装包的源码同步。**生产：2026-11-03 安装输出 8/8 COMPLETE，通知核对 8 个账号，`SOURCE_BASELINE=1.3.4.2`；本地源码同步按预期因 main 不含基础提交而停止。**
