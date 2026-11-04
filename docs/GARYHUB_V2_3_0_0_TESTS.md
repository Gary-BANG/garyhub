# GaryHub v2.3.0.0 验证记录

维护日期：2026-11-03（America/Chicago）。状态：源码已准备、本地已验证；未推送、未合并、生产未核验。

## 环境

- Windows 11、Python 3.10、Git 2.52、PowerShell 5.1。
- WSL Ubuntu 22.04，官方 Node.js v20.20.2（服务与语法，与生产镜像同为 Node 20）和 v22.23.4（测试辅助代码使用 `node:sqlite`）。
- calendar-app 依赖按 `package-lock.json` 执行 `npm ci --build-from-source`；测试在 WSL 的 LF 副本中运行。

## 已执行

| 范围 | 结果 |
|---|---|
| calendar-app 全部 `node --test`。`assistant-api.test.js` 覆盖：确认前不写入；他人确认 404；重复确认 409；取消后不可确认；服务器记忆带上一轮及卡片摘要，忽略浏览器历史；5 轮窗口与清空；主模型 429（1302）后改用备用模型且备用请求不带 `thinking`；两者都失败返回 `busy` 且不计次；401 不切换；搜索返回来源、搜索后拒绝日程工具；搜索失败退回搜索次数；日程次数用完的固定回复且不再调用模型；搜索次数为 0 时不提供搜索工具；对话次数用完返回 `quota`；订阅用户与管理员各自的上限；日志只有元数据、错误关联到调用；测试连接逐项结果；Key 不出现在任何响应、服务商文本中的 Key 被遮盖；迁移可重复执行；次数设置的默认与非法值 | 87 通过／0 失败 |
| lab-service 全部 `node --test` | 85 通过／2 失败（见下） |
| 本地隔离联调：按 release-config 复制全部测试输入，种子账号 + Calendar 与 Tools/Lab（Node 20），依次运行全部 7 项检查 | useful 29、study 19、asset-response 53、music 25、companion 301、sites 59、assistant 63，全部通过 |
| 站内通知 `publish-hub-release.js garyhub-2.3.0.0.json` 连续两次 | 首次 5 个账号（含管理员）、20 条；第二次 `alreadyPublished`，人数相同 |
| 无 TOTP 覆盖：与主文件的差异仍为原有的 7 行（server.cjs）与 12 行（app.js） | 通过 |
| 两服务伙伴文件逐字节一致；中英文词典两份一致；工具目录、`auth-redirect.js` 两份一致 | 通过 |
| 浏览器（伙伴演示页 `?ai`，模拟助手）：AI 副标题与搜索快捷问题、记忆与搜索说明、添加卡片与剩余日程次数、搜索回答与来源链接（新标签页、`noopener noreferrer`）、繁忙错误后保持 AI 模式且不调用本地向导、“⋯”菜单“清空对话” | 通过 |
| 浏览器（`/ai-logs/` 静态页 + 模拟接口数据）：概况、按用户、调用记录与错误日志表格内容 | 通过（DOM 核对） |

## 发现并处理

- 第一次本地隔离联调中 `asset-response.cjs` 失败（403）：该检查以普通账号登录读取受保护页面，而 `/ai-logs/` 仅管理员可见。改为放入独立的 `admin_asset_checksums`，部署核对仍校验容器内文件哈希与登录跳转；`assistant-http.cjs` 另行核对游客 302、普通账号 403、管理员 200。
- `/ai-logs/` 只对页面本身做管理员门禁，`logs.js`／`logs.css` 与其他工具脚本一样公开，便于版本化缓存和资源核对。

## 已知问题（未在本版修改）

- `companion-characters.test.cjs` 的栗栗、布丁两项几何检查失败：挂绳点 y=150 在显示框（y 从 167 起）上方。自 v2.0.1.0 起存在，浏览器显示正常。

## 未在本地执行

- 真实模型与搜索调用（需要管理员的智谱 API Key），以及生产容器访问 `open.bigmodel.cn` 的外网连接；`glm-4-flashx-250414` 的工具调用格式以智谱文档为准，未用真实 Key 验证。
- 安装器第 3 阶段在 Docker 隔离网络中的运行和第 6 阶段 HTTPS 核对。
- 管理员设置卡片与 AI 日志页在真实登录会话中的界面（本地只做了 DOM 与接口核对）。
