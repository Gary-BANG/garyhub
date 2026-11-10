# GaryHub v2.4.0.3 · 伙伴输入框、点空白收起、答疑等待与外站新标签页

源码基于 main `aa0bd193428551d57e69ad9767ba914368a1576b`（PR #40，v2.4.0.2），独立分支 `update/garyhub-v2.4.0.3`。源码准备、本地验证、GitHub 合并与生产验证分别记录；本版尚未部署服务器。

## 伙伴对话输入框

输入框由单行 `<input>` 改为多行 `<textarea>`（`lab-service/public/companion/panel.js`、`panel.css`，Calendar 副本逐字节相同）：

- 文字到达右边界自动换行，输入框随内容增高；起始一行（39 px），最多六行（144 px），再多则在框内滚动。发送后恢复一行。
- 回车发送，Shift+回车换行。中文输入法选字时的回车（`isComposing`／keyCode 229）既不发送也不被拦截。
- 面板宽度变化时（打开、进入讲义答疑的宽面板、窗口缩放）重新计算高度。
- 字数上限按模式设置，与服务器一致：本地向导 200，AI 助手 500（原界面只允许 200，服务器一直接受 500），讲义答疑 4,000。
- 用户气泡原样保留换行。

## 点击空白处收起

对话框打开时，在伙伴以外的页面位置单击或轻点会收起对话框，效果与点 × 相同：

- 只认“按下和抬起基本在同一位置”（移动不超过 6 px）的点击。拖动选择文字、拖动滚动条、触屏滚动不会收起。
- 伙伴本体、收起后的小标签和对话框内部不算空白；点伙伴仍由它自己开关对话框。
- 这样收起时不把焦点移回伙伴，所以点到页面上的输入框可以直接输入。× 和 Esc 的行为不变。
- 讲义答疑会话在收起后继续保留（v2.3.1.1 起的行为）；未确认的授权提示会随收起取消。

## 讲义答疑的授权时长（未改）

授权从点击“授权当前讲义并开启”起固定 **60 分钟**（`calendar-app/assistant-tutor.js` 的 `TTL`）。它不是空闲计时：期间继续提问不会延长，到点即结束。以下情况会提前结束：刷新或离开学习中心页面、切换讲义、修改当前讲义的标题或正文、关闭答疑开关、Calendar 服务重启（授权只在内存）、管理员更换 AI 服务商、重新登录、账号不再是订阅／管理员。单纯收起对话框不会结束授权。

## 讲义答疑三层等待各加 30 秒

| 层 | v2.4.0.2 | v2.4.0.3 | 位置 |
|---|---|---|---|
| 单个模型 | 75 秒 | 105 秒 | `calendar-app/assistant-api.js` 的 `TUTOR_ROUND_TIMEOUT` |
| 整条问题 | 110 秒 | 140 秒 | `calendar-app/assistant-tutor.js` 的 `deadline` |
| Lab → Calendar 转发 | 130 秒 | 160 秒 | `lab-service/academic.cjs` |

三层仍然由内向外递增：主模型用满 105 秒后，备用模型还剩约 35 秒；Calendar 总是先于 Lab 结束，能正常退回额度并记录日志。普通伙伴聊天的单轮 25 秒、整条 110 秒和转发 130 秒不变；授权、退出、清空的转发仍为 10 秒。网站各域名在 Cloudflare 为“仅 DNS”，入口只有 Caddy，本版不改 Caddy。

延长等待只影响“等得不够久”的情况。服务商在几秒内直接拒绝请求（例如参数不被模型接受）不属于超时，本版没有改动这部分；出现时请查看管理页 AI 日志中来源为 `tutor` 的记录。

## 外站链接在新标签页打开

- 主页“其他”菜单的 “Elsewhere ↗”（`lab-service/public/homepage.html`）。
- 外站链接页 `sites.garyhub.uk` 上的两个课程网站（`lab-service/public/sites/index.html`）。

三处均加 `target="_blank" rel="noopener"`。`target`／`rel` 放在 `data-thumb` 之后，`scripts/sites/capture_thumbnails.py` 与隔离检查读取链接的写法不受影响。页面内返回 GaryHub 的链接和伙伴推荐卡片仍在当前标签页打开。

## 安装、回滚与源码

完整解压 `GaryHub_v2.4.0.3_upgrade.zip`，在 Windows 双击 `RUN-UPDATE.cmd`。两服务必须实际运行 **v2.4.0.2**。2026-11-10 三个域名的公开 `/health` 均返回 `hubVersion: 2.4.0.2`；v2.4.0.2 的安装输出未收录于本仓库。版本、源码、能力或有效 Compose 不匹配时安装器停止。

本版注册自己的小型适配器 `scripts/releases/v2.4.0.3/`，复用共享 `build_overlay.py`、`deploy_runtime.py`、Windows 安装入口和源码导入器，基线能力覆盖来自 v2.4.0.2；不修改共享更新器、数据库结构、生产依赖、Caddy、DNS 或 Compose。安装执行严格预检、离线镜像构建、十组隔离 HTTP 检查、一致备份、切换、HTTPS／资源哈希，核对运行中容器确实带有新的三层等待值和主页新标签页链接，并向全体启用账号发布站内通知、核对人数与去重。

`ROLLBACK.cmd` 恢复安装前 v2.4.0.2 应用和有效配置，保留当前用户记录。`PUSH-TO-GITHUB.cmd` 使用独立 worktree 和审查分支，保留现有工作区，不强推、不自动合并 main。Windows 安装、真实 Docker 切换／回滚与生产通知人数需要安装现场日志确认。

构建：`python scripts/updater/manage.py build --release 2.4.0.3 --output <ZIP绝对路径>`。验证范围见 [GARYHUB_V2_4_0_3_TESTS.md](GARYHUB_V2_4_0_3_TESTS.md)。
