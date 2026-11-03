# GaryHub v2.0.0.0：网站伙伴米露

维护日期：2026-11-03（America/Chicago）。基础版本 v1.4.3.2（main `aec0312513de5b86cbcd17e10cc35af568c7dbcb`）。状态：源码已准备；生产未核验。

## 用户看到的变化

| 页面 | 默认表现 |
|---|---|
| garyhub.uk、tools.garyhub.uk | 右下角显示完整的米露，可拖动 |
| lab.garyhub.uk/lab/、Calendar 的日历、账本、固定支出、待办、日记、健康记录、科研词典、音乐 | 右下角收起的小米露，不移动，点击即聊天 |
| 窄屏（≤600px） | 所有页面默认收起 |
| 登录、注册、改密码、Reading、文件／监控等独立应用 | 不加载 |

- **拖动与放置**：默认自由放置，松手即停。设置中切换重力模式后，松手会下落；落差超过约 180px 时开伞，落地后压缩、起身。拖动中可再次抓住。键盘：Enter 打开对话，方向键移动（Shift 加大），Home 回到默认位置。系统“减少动画”时不摆动、不弹跳，重力模式直接落地。
- **对话**：中英文描述需求，浏览器内本地匹配 14 个工具与 Calendar 的账本、固定支出、待办、日记、健康记录、音乐。支持否定（“不是 PDF”）、两项接近时追问、“第一个／怎么用／还有别的吗”、闲聊与按分类浏览。管理员／订阅工具只对有权限的账号推荐；目的页面仍由服务器鉴权。不调用外部模型，对话只在当前页面内存，账号变化即清空。
- **设置**（聊天面板右上角 ⋯）：收起／展开、重力 ↔ 自由放置、回到默认位置、关闭米露。关闭后屏幕右侧保留细标签用于恢复。收起、关闭和模式写入 `garyhub_companion` Cookie（`Domain=.garyhub.uk`，只含几个开关）；拖动位置按子站保存在 localStorage。
- 素材加载失败时自动退回普通聊天按钮，不影响原页面功能。

## 实现与边界

- `lab-service/public/companion/`：`boot.js` 单标签加载器；`knowledge.js` 工具知识（名称与说明复用 `tools-catalog.js`）；`brain.js` 意图匹配；`voices.js` 五个角色台词（首版只上线米露）；`panel.js/css` 聊天面板；`characters.js` 角色清单；`pet.js/css` 动作引擎；`characters/milu/rig.svg` 精简素材（gzip 约 75 KiB）。全部在 Shadow DOM 中，不受站点 CSS 与 i18n 扫描影响。
- Calendar 服务使用逐字节相同的 `calendar-app/public/companion/` 与 `tools-catalog.js`。
- `lab-service/server.cjs`：首页主机白名单额外放行 `/companion/*` 与 `/tools-catalog.js`；带版本号的 `/companion/` 资源缓存一天。
- 身份：首页与 Tools 使用既有 `garyhub:identity`；其他页面由加载器读取 `/api/hub/me`（至多每 10 秒，页面可见时）。
- 无数据库迁移、无新生产依赖、无 Caddy 改动；健康检查与 `privacy-ledger-release.json` 版本为 2.0.0.0。

## 安装与回滚

1. 两个服务须实际运行 v1.4.3.2；不匹配时安装器停止，不做任何改动。
2. 完整解压 upgrade ZIP，双击 `RUN-UPDATE.cmd`。安装器核对源码与有效配置，离线构建，在隔离网络中用合成账号运行既有检查与新增 `companion-http.cjs`，备份后切换，再校验 HTTPS、资源哈希、页面标签、缓存头与首页白名单，最后发布并核对站内通知。
3. `ROLLBACK.cmd` 恢复安装前的 v1.4.3.2 应用与配置，保留当前用户记录。
4. `PUSH-TO-GITHUB.cmd` 在独立 worktree 准备并普通推送 `update/garyhub-v2.0.0.0` 审查分支，不强推、不自动合并 main。

验证范围与限制见 [GARYHUB_V2_0_0_0_TESTS.md](GARYHUB_V2_0_0_0_TESTS.md)。
