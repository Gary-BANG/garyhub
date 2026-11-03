# GaryHub v2.2.0.0：伙伴 AI 日程助手

维护日期：2026-11-03（America/Chicago）。状态：源码已准备、本地已验证；未推送、未合并、生产未核验。

## 用户可见变化

- 登录账号在任何显示伙伴的页面（主页、Tools、Lab、Calendar 各页）都可以用一句话管理自己的日程：“明天下午三点开组会”“这周有什么安排”“把周五的看牙删掉”。面板副标题变为“AI 日程助手”，快捷按钮换成日程相关问题。
- 添加和删除不会直接生效。伙伴先显示一张卡片（标题、日期、分类、提醒时间、备注），用户点“确认”后才写入；点“取消”不改动。卡片 15 分钟后失效，只能由本人确认一次。确认后若正打开 Calendar 首页，日历会自动刷新。
- 带时间的事项把时间写在标题前（如 `15:00 看牙`），因为日历事项按日期记录；只有用户要求提醒时才设置每天的提醒时间。
- 第一次打开面板时会说明：AI 由管理员选择的服务处理，用户消息和相关日程会发送给该服务。
- 游客、助手未启用、当天次数用完或服务不可用时，伙伴说明原因并回到原来的本地工具向导。
- 管理员在 `https://tools.garyhub.uk/admin/` 的“AI 日程助手”卡片中选择服务商（智谱 BigModel 或 Z.ai）、填写模型名称（默认 `glm-4.7-flash`）、API Key 和每人每天可用次数（默认 40），可先“测试连接”再启用。已保存的 Key 只显示末四位；留空保存会保留原 Key，“删除 Key”同时停用助手。

## 实现

- `calendar-app/assistant-api.js`：
  - `/api/assistant/status`：登录后查询是否可用和当天次数。
  - `/api/assistant/chat`：每 IP 每分钟 30 次，另按用户时区每天计数，超出返回 429。
  - `/api/assistant/actions/:id/confirm|cancel`：只处理本人、未过期、待确认的记录，用一次条件更新防止重复执行。
  - `/api/assistant/admin/settings|test`：仅管理员；每次保存写入 `admin_operations`。
- 模型调用使用 OpenAI 兼容的 chat completions（智谱文档：`tool_choice` 只支持 `auto`，`function.arguments` 为 JSON 字符串，工具结果以 `role:"tool"` 回传）。请求关闭 `thinking`，`max_tokens` 1024，单轮 30 s 超时，最多 4 轮；最后一轮不再提供工具，迫使模型给出文字回复。服务商错误只映射成固定提示，不回传或记录服务商正文。
- 系统提示包含用户时区的当前日期、星期和时间，以及当前账号可打开的页面列表（沿用伙伴 `knowledge.js` 的权限规则）。工具结果和事项内容被明确标为数据而非指令。
- 工具：
  - `list_tasks`：最多 92 天、40 条，可按关键词过滤。
  - `add_task`：沿用 `tasks-api.js` 的 `validateTask`；分类按名称匹配本人已有分类，找不到时把可用分类告诉模型。
  - `delete_task`：要求 `list_tasks` 返回的编号。
  - `open_page`：只接受允许的页面编号。
  - 工具出错时把错误回传给模型，而不是让整个请求失败。每条消息最多准备 5 项改动。
- 新表：
  - `assistant_settings`：单行，含 API Key。
  - `assistant_usage`：按天计数，40 天后清理。
  - `assistant_actions`：保存待确认的改动，过期一天后清理。
  - 后两表不设外键：回滚到 v2.1.0.0 时，旧版删除账号的结构检查不会因未知关联表而停止。`account-admin.js` 删除账号时同时清除这两表。
- `tasks-api.js` 把新建事项的写入提取为 `createTask`，表单和助手共用；更新路径不变。
- Tools/Lab `server.cjs`：
  - 在 API 段转发助手路由，沿用原有的来源检查和会话 Cookie。
  - chat 与 test 的上游超时为 130 s，正文上限 16 KiB。
  - 无 TOTP 的 1.3.4.1 覆盖文件应用了同样的改动。
- 伙伴：
  - 新增 `companion/assistant.js`，作为客户端调用上述路由，CSRF 从当前主机的 `/api/csrf` 获取。
  - `panel.js` 负责 AI 模式、确认卡片、使用说明和次数提示。
  - 最近 8 轮对话随请求发送，只保存在页面内存里，账号变化时清空。
  - 两个服务的伙伴文件仍逐字节一致。
- 管理页：`admin.html` 新卡片和 `assistant-admin.js`；中英文词典两份同步增加 11 条。
- 修正：`lab-service/test/companion-brain.test.cjs` 的游客可见性判断改用 `knowledge.permitted`。v2.1.0.0 新增的 `public` 访问级别此前被误判为受限。

## 部署与回滚

- 要求两服务实际运行 v2.1.0.0；只替换应用文件，不改 Caddy、DNS、Compose 或环境变量。新表在 Calendar 启动时以 `CREATE TABLE IF NOT EXISTS` 创建，无数据迁移。
- Calendar 容器需要能访问外网 HTTPS（`open.bigmodel.cn` 或 `api.z.ai`），才能在启用后调用模型。安装器不测试真实模型连接，由管理员在后台用“测试连接”确认。
- 第 3 阶段新增 `assistant-http.cjs`：
  - 在 Calendar 测试容器内启动模拟模型服务。
  - 通过隔离环境变量 `GARYHUB_ASSISTANT_ENDPOINT` 让 Calendar 指向它。
  - 验证内容：游客拒绝、关闭状态、管理员设置、确认前不写入、他人无法确认、重复确认被拒、删除流程、不受信来源被拒、管理页与资源、Key 不出现在任何响应中。
- 第 6 阶段核对：
  - 三个主机的 `/api/assistant/status` 未登录时为 401。
  - 无来源头的 chat 为 403，`/admin/` 有登录跳转。
  - 主页主机不暴露 `assistant-admin.js`，外站主机不暴露助手路由。
  - 10 个公开资源哈希、Lab 受保护页哈希和伙伴缓存一致。
- 回滚恢复 v2.1.0.0 应用，保留全部用户记录；`assistant_*` 表留在数据库中不被使用，API Key 仍在其中。再次升级时设置会继续生效。

## 未包含

- 修改已有事项、账单、日记等其他记录类型，以及多步对话里的“改成四点”式修改（下一版本再做）。
- 流式输出：回复在模型完成后一次显示。
