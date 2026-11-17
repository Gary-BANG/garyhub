# GaryHub v2.4.0.4 · 讲义答疑授权随提问续期

源码基于 main `0a5e86e20330166e546dbfede1d99dcb73ec7a2f`（PR #41，v2.4.0.3），独立分支 `update/garyhub-v2.4.0.4`。源码准备、本地验证、GitHub 合并与生产验证分别记录；本版尚未部署服务器。

## 改动

v2.4.0.3 及以前，讲义答疑的授权从点击“授权当前讲义并开启”起固定 60 分钟，期间提问不会延长。本版改为：

- 授权后有效一小时。
- **每次提问被服务器接受时**，授权重新计为从这一刻起一小时；只有连续一小时没有提问才过期。
- 已过期的授权不会被提问“复活”：续期发生在令牌、登录会话、过期时间、讲义指纹和“正在回答”检查都通过之后，过期的授权仍返回“答疑授权已结束”。
- 提问失败（例如服务商出错、额度用完）也算一次提问，同样续期。
- 下列情况仍会立即结束授权，与之前相同：刷新或离开学习中心页面、切换讲义、修改当前讲义的标题或正文、关闭答疑开关、Calendar 服务重启（授权只在内存）、管理员更换 AI 服务商、重新登录、账号不再是订阅／管理员。收起对话框仍保留会话。

实现：

- `calendar-app/assistant-tutor.js`：提问通过检查后执行 `grant.expires = Date.now() + TTL`（`TTL` 仍为 60 分钟），成功回答返回新的 `expiresAt`。过期清理（每分钟一次）不变。
- `lab-service/public/companion/panel.js`（Calendar 副本相同）：面板在发出提问时把本地计时器重设为一小时，收到回答后按服务器返回的 `expiresAt` 校准；计时器到期时结束答疑并通知服务器。授权说明改为“有效一小时，每次提问都会从提问时起续期一小时，连续一小时不提问后过期清理”（英文同步）。
- `calendar-app/test/assistant-tutor.test.js` 新增续期用例。

v2.4.0.3 的三层等待（105／140／160 秒）、多行输入框、点空白收起和外站新标签页均不变。无数据库结构、依赖、Caddy 或 Compose 变化。

## 安装、回滚与源码

完整解压 `GaryHub_v2.4.0.4_upgrade.zip`，在 Windows 双击 `RUN-UPDATE.cmd`。两服务必须实际运行 **v2.4.0.3**：2026-11-10 三个域名的公开 `/health` 均返回 `hubVersion: 2.4.0.3`；v2.4.0.3-r2 的安装输出与通知人数未收录于本仓库。版本、源码、能力或有效 Compose 不匹配时安装器停止。

本版注册自己的小型适配器 `scripts/releases/v2.4.0.4/`（安装器 v2.4.0.4-r2；r1 在第 6 阶段 HTTPS 核对报 `curl` 失败并自动回滚到 v2.4.0.3，r2 为该阶段的 HTTPS 核对加入瞬时失败重试，并在失败时写明具体请求，见验证记录），复用共享 `build_overlay.py`、`deploy_runtime.py`、Windows 安装入口和源码导入器，基线能力覆盖来自 v2.4.0.3，隔离检查沿用 v2.4.0.3 的十组（含其 `sites-http.cjs`）。安装执行严格预检、离线镜像构建、十组隔离 HTTP 检查、一致备份、切换、HTTPS／资源哈希，核对两个容器中的续期代码确已就位，并向全体启用账号发布站内通知、核对人数与去重。

`ROLLBACK.cmd` 恢复安装前 v2.4.0.3 应用和有效配置，保留当前用户记录；回滚后授权恢复为固定一小时。安装或回滚都会重启 Calendar，进行中的讲义答疑授权会结束，需要重新授权。`PUSH-TO-GITHUB.cmd` 使用独立 worktree 和审查分支，不强推、不自动合并 main。

构建：`python scripts/updater/manage.py build --release 2.4.0.4 --output <ZIP绝对路径>`。验证范围见 [GARYHUB_V2_4_0_4_TESTS.md](GARYHUB_V2_4_0_4_TESTS.md)。

## 项目档案历史记录

以下条目于 2026-11-16 从 `docs/PROJECT_CONTEXT.md` 原样移入，是写入当时的记录；其中“尚未推送／合并／部署”等状态描述以写入时为准，后续状态见项目档案的版本索引。

- **v2.4.0.4（PR #42 已合并为 main `97ad2f2`；2026-11-10 tools／calendar `/health` 返回 2.4.0.4，r2 安装输出与通知人数未收录）** 基于 PR #41 的 main `0a5e86e20330166e546dbfede1d99dcb73ec7a2f`，独立分支 `update/garyhub-v2.4.0.4`；清单 `releases/2.4.0.4.json`，适配器 `scripts/releases/v2.4.0.4/`（baseline_adapter v2.4.0.3，安装器 v2.4.0.4-r2，严格要求实际 v2.4.0.3，沿用 v2.4.0.3 的十组隔离检查及其 `sites-http.cjs`）。r1 于 2026-11-10 通过第 1–5 阶段后在第 6 阶段报 `Command failed: curl` 并自动回滚到 v2.4.0.3（记录与凭据保留，未发通知）；共享运行时不记录 curl 响应，无法确定失败的请求，且请求与已成功的 v2.4.0.3-r2 完全相同。r2 在本版 `deploy.py` 中包装 `runtime.run`：curl 遇连接／超时／429／5xx 间隔 5 秒最多试 4 次，仍失败则报出主机、路径、退出码与 HTTP 状态。以后的适配器可沿用此包装。讲义答疑授权改为随提问续期：`assistant-tutor.js` 在提问通过令牌／会话／过期／指纹／忙碌检查后执行 `grant.expires = Date.now() + TTL`（`TTL` 仍 60 分钟），成功回答返回 `expiresAt`；已过期授权不会被续期。`panel.js` 用 `armTutor` 在发出提问时把本地计时器重设为一小时，收到回答后按 `expiresAt` 校准；授权说明中英文同步改写。`deploy.py` 核对两个容器中的续期代码。构建机无 Node：实际 `assistant-tutor.js` 与 `panel.js` 在浏览器中用替身运行验证（16 项、11 项），单元测试新增的续期用例未在 Node 中运行；适配器 10 项、共享更新器（WSL）通过。无数据库、依赖、Caddy 或 Compose 变化。源码已准备／本地已验证，尚未推送、合并或部署。详见 GARYHUB_V2_4_0_4.md 与 _TESTS.md。
