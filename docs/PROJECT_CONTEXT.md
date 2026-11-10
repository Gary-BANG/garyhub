# GaryHub 项目档案

维护日期：2026-11-10（America/Chicago）。首次阅读本文件及 UPDATE_WORKFLOW.md，按任务范围读取相关源码。

## 当前源码与部署证据

- **v2.4.0.4（当前源码，本地已验证）** 基于 PR #41 的 main `0a5e86e20330166e546dbfede1d99dcb73ec7a2f`，独立分支 `update/garyhub-v2.4.0.4`；清单 `releases/2.4.0.4.json`，适配器 `scripts/releases/v2.4.0.4/`（baseline_adapter v2.4.0.3，安装器 v2.4.0.4-r1，严格要求实际 v2.4.0.3，沿用 v2.4.0.3 的十组隔离检查及其 `sites-http.cjs`）。讲义答疑授权改为随提问续期：`assistant-tutor.js` 在提问通过令牌／会话／过期／指纹／忙碌检查后执行 `grant.expires = Date.now() + TTL`（`TTL` 仍 60 分钟），成功回答返回 `expiresAt`；已过期授权不会被续期。`panel.js` 用 `armTutor` 在发出提问时把本地计时器重设为一小时，收到回答后按 `expiresAt` 校准；授权说明中英文同步改写。`deploy.py` 核对两个容器中的续期代码。构建机无 Node：实际 `assistant-tutor.js` 与 `panel.js` 在浏览器中用替身运行验证（16 项、11 项），单元测试新增的续期用例未在 Node 中运行；适配器 10 项、共享更新器（WSL）通过。无数据库、依赖、Caddy 或 Compose 变化。源码已准备／本地已验证，尚未推送、合并或部署。详见 GARYHUB_V2_4_0_4.md 与 _TESTS.md。

- **v2.4.0.3（PR #41 已合并为 main `0a5e86e`；2026-11-10 三个域名 `/health` 返回 2.4.0.3，r2 安装输出与通知人数未收录）** 基于 PR #40 的 main `aa0bd193428551d57e69ad9767ba914368a1576b`，独立分支 `update/garyhub-v2.4.0.3`；清单 `releases/2.4.0.3.json`，适配器 `scripts/releases/v2.4.0.3/`（baseline_adapter v2.4.0.2，安装器 v2.4.0.3-r2，严格要求实际 v2.4.0.2，沿用十组隔离检查）。r1 于 2026-11-10 在服务器第 3 阶段 `sites-http.cjs` 停止（v2.1.0.0 的套件要求主页 Elsewhere 链接不带 `target`），未备份、未切换；r2 改用本版自己的 `tests/sites-http.cjs`，并在适配器测试中把隔离套件的 HTML 字面量断言与页面比对。改动页面标记前，先在全部隔离套件中搜索该标记的字面量。伙伴面板 `panel.js`／`panel.css`：输入框改为 `<textarea>`，随内容增高到 144 px（六行）后滚动，回车发送、Shift+回车换行并避开输入法选字；`maxLength` 为本地向导 200／AI 500／答疑 4,000；在 id 以 `gh-companion` 开头的元素之外单击（移动不超过 6 px）即 `close(false)`，`pet.js` 的 `onClose(refocus)` 据此不抢焦点。讲义答疑等待各加 30 秒：`assistant-api.js` 的 `TUTOR_ROUND_TIMEOUT` 105 秒、`assistant-tutor.js` 的 `deadline` 140 秒、`lab-service/academic.cjs` 转发 160 秒；普通聊天限值和一小时固定授权（`TTL`）未变。主页 Elsewhere 与外站页两个课程链接加 `target="_blank" rel="noopener"`（写在 `data-thumb` 之后，以兼容缩略图脚本和 sites-http 的匹配）。`deploy.py` 额外核对运行容器内的三层等待值和主页链接。无数据库、依赖、Caddy 或 Compose 变化。构建机无 Node／Docker：浏览器交互、适配器 12 项、共享更新器（WSL，37 通过／2 个 pwsh 跳过）已验证，Node 单元测试与十组隔离 HTTP 检查留给安装器现场执行。本机检出为 `core.autocrlf=true`，`.css`／`.cjs`／`.svg` 会检出为 CRLF：资源哈希须按 Git 存储内容计算，随包文件须保持 LF（适配器测试已覆盖）。详见 GARYHUB_V2_4_0_3.md 与 _TESTS.md。

- **v2.4.0.2（PR #40 已合并；2026-11-10 三个域名 `/health` 返回 2.4.0.2，安装输出与通知人数未收录）** 基于 PR #39 的 main `8df09118e3f4d7a7c8d00f4c2cc79b13849ca50c`，独立分支 `update/garyhub-v2.4.0.2`。A 股行情改为图标栏、可收起搜索／收藏窄栏和宽内容区；新增有界模糊建议、代码片段／拼音缩写、暖色日夜主题及指标缩写。管理员通过独立 `stock_vip`／`stock_vip_version` 设置 A 股 VIP，只给开通用户显示标识；不改变订阅 gate，AI 选股后续开发。管理写入保留身份、CSRF、Origin、修订号和审计；账号删除清单补入既有 `stock_lists`。新适配器复用共享更新器，严格要求实际 v2.4.0.1，两种能力各十组隔离检查。相关单元、双能力 HTTP、桌面及手机响应式布局、VIP 管理与持久化检查通过；共享更新器 37 通过／2 个 pwsh 跳过。源码已准备／本地已验证，尚未推送、合并或部署；最新生产证据仍为下述 v2.4.0.0。详见 GARYHUB_V2_4_0_2.md 与 _TESTS.md。

- **v2.4.0.1（PR #39 已合并，生产待验证）** A 股详情新增换手率、量比、振幅、TTM 市盈率、市净率、总市值及流通市值，支持五档盘口、盘中分时、带成交量和 MA5/10/20 的近月日 K，并可切换最近四份已披露财报。 安装基线为已经现场核验的 v2.4.0.0；r2 源码以 PR #38 的 8d97771 和已交付的 v2.4.0.0 文件树为准。两种能力组合均复用现有部署、回滚及通知保护；上线待现场证据。见 GARYHUB_V2_4_0_1_TESTS.md。
- **v2.4.0.0（2026-11-06 生产已核验）** 新增独立 A 股行情工具。订阅用户可按代码或名称查行情、查看近月日 K，创建最多 3 个分组，每组 5 只股票。临时行情仅缓存在内存。 用户提交的 v2.4.0.0-r1 日志显示八阶段完成，SOURCE_BASELINE=1.3.4.2，8 个账号收到通知。其后的 Windows 源码准备在 apply --check 停止，GitHub 已由 PR #38 更新至 v2.3.2.3。v2.4.0.0 源码另由 PR #38 起点的专用同步包提交审查。
- **v2.3.2.3（上版源码）** 基线 main 558559e9。伙伴可查询、记录或纠正体重与运动，按周或月汇总运动。待办及子项支持查看、创建、编辑、标记完成、恢复和删除。所有写入均需确认。 参见 GARYHUB_V2_3_2_3_TESTS.md。待实机安装。
- **v2.3.2.2（PR #37 已合并）** 基线 ef0bebec。网站伙伴可修改日程、标记完成、记录支出和添加按月或按年的固定开支。未分类日程可直接确认，也可在对话中选择已有分类。记账需要明确币种和分类，核对卡片后保存。 本地验证范围见 GARYHUB_V2_3_2_2_TESTS.md。生产待验证。
- **v2.3.2.1（基线版本）**：基线 PR #35（v2.3.2.0，main `c5c0b86`）。学习中心采用四个图标控制课程、目录树与正文，目录底部显示当前讲义的双语进度。账号头像指向 Tools 下的 `/personalize/`；专用接口仅返回阅读偏好，沿用学业数据的身份验证与修订号。两种能力各通过 707 项隔离 HTTP 断言，另验证桌面与手机宽度。适配器 r1，源码已准备、未推送／合并；生产状态待安装记录。见 GARYHUB_V2_3_2_1.md 和对应验证记录。
- **v2.3.2.0（PR #35 已合并，以下为交付时记录）**：分支 `update/garyhub-v2.3.2.0`，源码基于 main `1527368`（PR #34）。安装器 r2 的升级、回滚和源码补丁统一以 v2.3.1.1（PR #34）为基线。维护者贴出的 r1 日志显示其在第 1/8 阶段因要求 v2.3.1.0 而停止，未切换服务。学习中心改为吸顶双入口、完整层级目录与章节折叠，调整统计卡和代码语言栏；阅读外观和字号由现有 Academic state 按账号保存。兼容旧资料及备份。通过两种能力组合的隔离 HTTP、桌面及手机宽度交互检查。本版尚未推送、合并或部署，见 GARYHUB_V2_3_2_0.md 和对应验证记录。
- **v2.3.1.1（PR #34 已合并，以下为交付时记录）**：基线 main `ea6a6d8acf7fc716a6de15d3c21afb165faa6e3c`，独立分支 `update/garyhub-v2.3.1.1`。修复 panel.close 撤销答疑：隐藏只收起，重新打开延续授权和记录；按钮改为 switch + 信息图标 tooltip。保留文档/账号变化和一小时到期保护。仅前端行为变化，无新依赖或数据库变更。复用共享更新器，新适配器严格要求 v2.3.1.0，9 项隔离检查及通知保护保持。详见 GARYHUB_V2_3_1_1.md / _TESTS.md。本版 DOM 59、每能力组合 HTTP 661、适配器 6、接线 2 项通过；共享更新器 35 通过/2 项缺 pwsh 跳过。Chromium 被系统拒绝启动，桌面/手机视觉、Windows 与生产现场未验收。本版本地准备，未推送/合并/部署；截图仅为旧版功能使用证据。

- **v2.3.1.0（历史交付记录，现已由 PR #33 合并）**：基础 main `c87e7efcf690fff40a6e4a53b63eac8f5bb6d837`（PR #32 已合并 v2.3.0.4）；独立分支 `update/garyhub-v2.3.1.0`，清单 `releases/2.3.1.0.json`，适配器 `scripts/releases/v2.3.1.0/`，安装器 v2.3.1.0-r1，严格要求两服务运行 v2.3.0.4。成绩规划与学习中心接入现有网站伙伴；订阅用户和管理员可在学习中心授权当前 Markdown，开启“讲义答疑”。对话面板加宽，独立保留最近 10 轮问答，按模型能力开启思考，结合讲义与模型知识讲解。 `assistant-tutor.js` 使用账号/登录会话/令牌/文档指纹/服务商绑定的内存授权，一小时过期、每分钟清理，无新表；退出即清理，重启重授权。Academic 服务从用户自己的已保存 JSON 读取当前 Markdown（60,000 字符上限），不读图片/链接/其他文档；答疑无工具，错误日志脱敏，失败与撤销退回 chat 额度。GLM 4.5+ enabled，5.2/5.3 high；单模型 75 s/总预算 110 s/转发 130 s。两个伴侣面板副本同步，安全 Markdown/公式与手机 CSS。两种能力差异保留；共享更新器未修改，隔离检查增加 tutor-http，共 9 项。相关单元 91、每能力组合 HTTP 661、DOM 39、适配器 6 通过；共享更新器 35 通过/2 个 pwsh 跳过。源码已准备、本地上述范围验证；未推送/合并或部署。真实浏览器、Windows、真实 AI 和生产 HTTPS 待现场。详见 `docs/GARYHUB_V2_3_1_0.md` 与 `_TESTS.md`。
- **v2.3.0.4 状态更新**：PR #32 已合并到上述 main，代码树与上一交付一致；未取得其生产安装输出，不推定已部署。以下保留该版本交付时记录。
- **v2.3.0.4（上一版本，交付时记录）**：基础为 main `c9096802a1e8dd3bba5f56a3bc38ed617df331f3`（PR #31 已合并 v2.3.0.3）；分支 `update/garyhub-v2.3.0.4`，清单 `releases/2.3.0.4.json`，适配器 `scripts/releases/v2.3.0.4/`，安装器 v2.3.0.4-r1，严格要求两服务运行 v2.3.0.3。三个管理员工具图标分开；Reading 说明入口只给管理员。新增 `notification-policy.js`：普通通知 14 天到期，启动/每分钟/读取列表清理，API 同时过滤到期项；`account`/`security`/`required` 保留。主页、Calendar、Access 提供按账号和分类的批量已读/删除（含未加载页），`userId` 防切换账号误操作，保持 CSRF/Origin 校验。发布台账 `hub_releases` 不清除；无数据库结构变化、新生产依赖或 host hooks。两种能力组合保持原有差异；共享更新器不改动，隔离检查新增 notifications-http，共 8 项。源码已准备、本地相关测试通过；尚未推送/合并/生产部署。浏览器视觉验收、Windows 双击及生产 HTTPS 待现场。详见 `docs/GARYHUB_V2_3_0_4.md` 和 `_TESTS.md`。v2.3.0.3 的历史“待合并”状态由上述 PR #31 证据更新；其生产证据仍为最新生产记录。
- **v2.3.0.3（上一版本，以下为当时记录）**：基础为 v2.3.0.2 源码提交 `9c61d249a98290e1d39e993552767cce747bfe48`（分支 `update/garyhub-v2.3.0.1`）；清单 `releases/2.3.0.3.json`，适配器 `scripts/releases/v2.3.0.3/`（baseline_adapter v2.3.0.2，隔离检查沿用 v2.3.0.0 的 7 项，`asset_checksums` 共 42 项，新增 `companion/puppet.js`、`pet.css`、`characters/pudding/rig.svg` 在三个主机的核对），安装器 v2.3.0.3-r1，要求两服务实际运行 v2.3.0.2。布丁改为 `kind:'rig'` 并带 `puppet` 配置：`characters/pudding/rig.svg`（134 KiB）以 GPT 坐姿拼装图为全部可见像素（遮挡感知的部件拟合 + 头部轮廓填充、按颜色扣出耳朵），GPT 部件只补被遮挡处；耳、尾分根部与末端，抬起的前爪单独一块，额外表情为矢量线条（closed／happy／drowsy；o／tongue／yawn／w），睡觉用单独的趴姿图 `rest`。新增 `companion/puppet.js`（boot.js 在 pet.js 前加载）：弹簧耳尾腿、呼吸、看鼠标、挥手抬爪、待机小动作（9–18 s）、摸头（头部范围内左右来回两次；触屏在头上水平来回滑动则不拖动）、60 s 后趴下睡觉（睡着后 CSS 呼吸，`.breathing` 在 pet.css）；`data-companion="quiet"` 页只保留呼吸／眨眼／弹簧／摸头。pet.js 把骨骼部件交给 puppet，并允许它用自己的表情覆盖状态表情（`paintFace`）。约定见与维护者 2026-11-04 的讨论：不走路、摸头互动、安静页收敛、米露与栗栗不变。拆图与组装脚本只在维护会话的临时目录中，未入库。审查分支已普通推送到 `2cbd6d4`，待合并。**生产：2026-11-04 安装输出 8/8 COMPLETE，通知核对 8 个账号，`SOURCE_BASELINE=1.3.4.2`；本地源码同步按预期因 main 不含基础提交而停止。** 安装器结束语沿用了 v2.3.0.1 模板的 GLM-5.3 提示（v2.3.0.2 同样），与本版无关；以后发版须重写这行。详见 `docs/GARYHUB_V2_3_0_3.md`。
- **v2.3.0.2（上一版本）**：v2.3.0.3 安装器第 1 阶段核对证明它已在运行；自身安装输出未收录。基础为 v2.3.0.1 源码提交 `5a45333942b7d2602f4645f328d6caea535a49b2`（分支 `update/garyhub-v2.3.0.1`）；清单 `releases/2.3.0.2.json`，适配器 `scripts/releases/v2.3.0.2/`（baseline_adapter v2.3.0.1，隔离检查沿用 v2.3.0.0 的 7 项，`asset_checksums` 新增 `companion/pet.js`、`characters.js`、`characters/lili/rig.svg` 在 tools／garyhub／calendar 三个主机的核对），安装器 v2.3.0.2-r1，要求两服务实际运行 v2.3.0.1；无 TOTP 覆盖仅版本号不同，与主文件差异仍为 12 行（app.js）与 7 行（server.cjs）。栗栗改为 `kind:'rig'`：`characters/lili/rig.svg`（187 KiB）由 GPT 生成的部件图与表情图拆层、vtracer 矢量化、`slim_rig.py` 精简，结构与米露相同（`actor`／`tail`／`body`／`paw-l`／`paw-r`／`head`{`ear-l`,`ear-r`,`head-fur`,`eyes-*`,`mouth-*`}）；尾巴大，摆动上限 3°。`pet.js`：降落伞摆动在落地前 200 px 内收到 0（身体绕头顶挂点转动，着地时残留倾角会让脚在地面滑动），所有角色生效；整张姿态角色的落地帧淡入淡出与 `LANDING_FRAME`（可选 touchdown／squash／rise 帧）保留，目前无角色使用。升级包只能新增／替换文件，栗栗旧的五个姿态 SVG 保留为未引用的静态文件。`scripts/companion/place_frames.py` 可把生成的姿态图裁切为帧。尚未推送／合并，生产未核验。详见 `docs/GARYHUB_V2_3_0_2.md`。
- **v2.3.0.1（上一版本，生产已安装）**：基础为 v2.3.0.0 提交 `e89fc65c5dad4011faf2089c2468fabe90f9f424`（同一分支 `feature/assistant-tiers`，两者均未推送／合并）；清单 `releases/2.3.0.1.json`，适配器 `scripts/releases/v2.3.0.1/`（baseline_adapter v2.3.0.0，隔离检查沿用 v2.3.0.0 的 7 项），安装器 v2.3.0.1-r1，要求两服务实际运行 v2.3.0.0。起因：维护者把主模型设为 `glm-5.3-flash` 后“测试连接”返回 HTTP 400、错误码 1210“该模型始终思考，不支持关闭思考；请使用 low、high 或 max”。`assistant-api.js` 的 `complete()` 改为：名称匹配 `glm-5.3` 的模型不发 `thinking`，改发 `reasoning_effort:'low'`，`max_tokens` 加 2048 留给思考；GLM 4.5+ 其他模型仍发 `thinking:{type:'disabled'}`；若某模型以 400 且说明含“思考／thinking／reasoning”拒绝，则在同一请求预算内改用 `reasoning_effort` 重试一次，并在进程内记住该模型（不计入错误日志、不触发备用模型）。无数据库结构变化。GitHub：v2.3.0.0 由 PR #28 合并为 main `b783804`（代码树与 `e89fc65` 相同，但不含该提交本身），因此 v2.3.0.1 的审查分支 `update/garyhub-v2.3.0.1` 在 `b783804` 上重放 v2.3.0.1 的两个提交另行准备，并核对树与本地 `7464b50` 相同，未使用安装包的源码同步。**生产：2026-11-03 安装输出 8/8 COMPLETE，通知核对 8 个账号，`SOURCE_BASELINE=1.3.4.2`；本地源码同步按预期因 main 不含基础提交而停止。**
- **v2.3.0.0**：维护者 2026-11-03 发回的管理页“测试连接”三项结果（主模型／备用模型／联网搜索）只在 v2.3.0.0 出现，说明已在运行；安装输出未收录。以下为当时记录：基础为已合并 main `a75a1e35b1d8ff6f81ff794a4080ccccacd22aa2`（PR #27，树与 v2.2.0.0-r2 提交 f98eac4 相同）；开发分支 `feature/assistant-tiers`，清单 `releases/2.3.0.0.json`，适配器 `scripts/releases/v2.3.0.0/`（baseline_adapter v2.2.0.0），安装器 v2.3.0.0-r1，要求两服务实际运行 v2.2.0.0，不改 Caddy／DNS／Compose。`assistant-api.js` 改为：
  - `assistant_settings` 原地新增 `fallback_model`（默认 `glm-4-flashx-250414`）、`search_enabled`、`quotas`（JSON，按 chat／data／search × standard／subscriber／admin，默认 200/200/500、30/50/200、5/30/100；`daily_limit` 列保留但不再使用）。
  - 新表 `assistant_quota`（每人每天每类计数）、`assistant_memory`（每人最近 5 轮）、`assistant_calls`（每条消息元数据）、`assistant_errors`（服务商／服务器错误，`recovered` 表示备用模型已完成）；均无外键，已加入 `account-admin.js` 删除清单；日志保留 30 天。
  - 等级每次从数据库读取（`role`／`account_tier`）。对话次数在调用前计入；日程工具和 `web_search` 在消息首次使用时各计 1 次（会话内互斥：搜索后拒绝日程工具，反之亦然）；上游失败时全部退回，搜索失败只退回搜索次数。
  - 主模型失败（非 401／403）后，本条消息其余轮次改用备用模型；只对 GLM 4.5+ 发送 `thinking`。单轮超时 25 s、整条预算 110 s。错误响应带 `code`：`disabled`／`quota`／`busy`／`config`。
  - 联网搜索调用 `POST /api/paas/v4/web_search`（`search_std`，5 条），结果作为工具数据返回，来源链接随回复给前端。`GARYHUB_ASSISTANT_SEARCH_ENDPOINT` 仅供隔离测试。
  - 新路由：`POST /api/assistant/memory/clear`、`GET /api/assistant/admin/calls`（`limit`／`before`／`user`／`outcome`，附 24 小时汇总与按用户统计）、`GET /api/assistant/admin/errors`（`source` 过滤）；`admin/test` 分别测试主模型、备用模型和搜索。
  - Tools/Lab `server.cjs`：转发上述路由并对 GET 透传查询字符串；`/ai-logs/` 页面管理员可见（游客 302 登录、普通账号 403），静态 `logs.js`／`logs.css` 公开。工具目录、主页 Dock、`auth-redirect.js` 与伙伴 `knowledge.js`（`ai-logs`，`access:'admin'`）加入该工具。部署核对把该页放在独立的 `admin_asset_checksums`（`asset-response.cjs` 以普通账号登录，不能读取它）。
  - 伙伴面板：不再发送浏览器历史；显示来源链接、分类剩余次数提示，“⋯”菜单新增“清空对话”；`busy`／`config` 错误保留 AI 模式，只有未登录／未启用转回本地向导，对话次数用完时由本地向导回答。
  尚未推送／合并，生产未核验。详见 `docs/GARYHUB_V2_3_0_0.md`。

### v2.2.0.0（上一版本）

- **v2.2.0.0**：PR #27 合并为 main `a75a1e3`；维护者 2026-11-03 提到使用中遇到免费模型调用失败，说明已在运行，但安装输出未收录于本仓库。以下为当时记录：基础为已合并 main `62f430a51afb019993871b2bd2f8594259670dd8`（PR #26）；开发分支 `feature/companion-assistant`，清单 `releases/2.2.0.0.json`，适配器 `scripts/releases/v2.2.0.0/`（baseline_adapter v2.1.0.0），安装器 v2.2.0.0-r2（r1 于 2026-11-03 在第 3 阶段 `sites-http.cjs` 停止：该检查要求外站页引用 `?v=<本次版本>`，r2 把 `sites/index.html` 的四处资源版本号改为 2.2.0.0；未部署），要求两服务实际运行 v2.1.0.0，不改 Caddy／DNS／Compose。新增伙伴 AI 日程助手：`calendar-app/assistant-api.js` 提供 `/api/assistant/{status,chat,actions/:id/confirm|cancel,admin/settings,admin/test}`，调用 OpenAI 兼容 chat completions（默认智谱 `https://open.bigmodel.cn/api/paas/v4/chat/completions`、`glm-4.7-flash`、`thinking` 关闭，可选 Z.ai），工具 `list_tasks`／`add_task`／`delete_task`／`open_page`；添加／删除只写入 `assistant_actions` 待确认记录，确认后经 `tasks-api.js` 新导出的 `createTask` 写入。新表 `assistant_settings`（单行，含 API Key）、`assistant_usage`（每人每天计数）、`assistant_actions`（15 分钟有效）；后两表无外键，已加入 `account-admin.js` 删除清单。`GARYHUB_ASSISTANT_ENDPOINT` 仅供隔离测试指向模拟服务。Tools/Lab `server.cjs` 转发上述路由（chat 与 test 超时 130 s，正文上限 16 KiB）；`assistant-admin.js` 与 `admin.html` 新卡片供管理员设置；伙伴 `assistant.js` + `panel.js` 在登录且启用时走 AI，并渲染确认卡片，确认后发出 `garyhub:records-changed`，`unified.js` 收到后刷新日历。修正 v2.1.0.0 遗留的 `companion-brain.test.cjs` 访问级别判断。尚未推送／合并，生产未核验。详见 `docs/GARYHUB_V2_2_0_0.md`。

### v2.1.0.0（上一版本）

- **v2.1.0.0**：基础为已合并 main `d21eecd738ff22a400957e948b8f413337525f31`；开发分支 `feature/sites-portal`，清单 `releases/2.1.0.0.json`，适配器 `scripts/releases/v2.1.0.0/`（baseline_adapter v2.0.1.0），安装器 v2.1.0.0-r1，要求两服务实际运行 v2.0.1.0。新增外站链接页 `lab-service/public/sites/`（`index.html`、`sites.css`、`sites.js`、`thumbs/*.webp`），由 `server.cjs` 在主机 `sites.garyhub.uk` 上以严格 CSP 只提供这些文件，其他主机 `/sites/` 返回 404；主页“其他”菜单与伙伴 `knowledge.js`（`sites`，`access:'public'`）链接该页；`brain.js` 不再把“有没有／是不是…”问句和“不是 PDF”中的空格误判。部署钩子在改动前检查 DNS，验证并在切换后写入一个 Caddy 站点块（`reverse_proxy garyhub-lab:3000`），等待证书，回滚时恢复原 Caddyfile。预览图由 `scripts/sites/capture_thumbnails.py` 在维护者本机生成。安装器与 PUSH 脚本默认仓库改为 `D:\Codes\Own_Project\garyhub`。PR #26 合并为 main `62f430a`；维护者 2026-11-03 报告已安装完成（安装输出未收录于本仓库）。详见 `docs/GARYHUB_V2_1_0_0.md`。

### v2.0.1.0（上一版本）

- **v2.0.1.0**：基础为 v2.0.0.0 `3a8f4f7060f2054ddd33cc994f1a7b4c63f62ddc`；清单 `releases/2.0.1.0.json`，适配器 `scripts/releases/v2.0.1.0/`（baseline_adapter v2.0.0.0），安装器 v2.0.1.0-r1，要求两服务实际运行 v2.0.0.0。新增栗栗、布丁（Step 1b 矢量姿态）与页芽、小航（Step 1c 设定图裁切 WebP 帧），`characters.js` 中 `kind:'frames'`；`tier` guest／member／subscriber 控制角色选择（访客米露，登录加栗栗，订阅／管理员五位），只是界面权益。`pet.js` 新增整张姿态渲染、`destroy()` 与共享聊天面板；`boot.js` 管理 `char` 偏好与权限回退；`server.cjs`（及 1.3.4.1 覆盖）新增 `.webp` MIME。PR #25 合并为 main `d21eecd`；2026-11-03 安装完成（8/8，8 个账号收到通知，两服务健康检查 2.0.1.0，线上 `characters.js` 与提交一致）。详见 `docs/GARYHUB_V2_0_1_0.md`。

### v2.0.0.0（上一版本）

- **v2.0.0.0**：基础为 main `aec0312513de5b86cbcd17e10cc35af568c7dbcb`（PR #23 合并的 v1.4.3.2）；开发分支 `feature/companion-guide`，清单 `releases/2.0.0.0.json`，适配器 `scripts/releases/v2.0.0.0/`（baseline_adapter v1.4.3.2），安装器 v2.0.0.0-r2。r1 于 2026-11-03 在服务器第 3 阶段停止（companion-http 对首页 `/admin.html` 错误期望 404，实际为既有登录跳转 302），未备份、未切换。尚未推送／合并，生产未核验；安装器要求两服务实际运行 v1.4.3.2。
- 网站伙伴米露：`lab-service/public/companion/`（boot 加载器、knowledge/brain 本地意图匹配、voices 五角色台词、panel 聊天面板、characters 角色清单、pet 动作引擎、`characters/milu/rig.svg`）。Calendar 的 `calendar-app/public/companion/` 与 `tools-catalog.js` 为逐字节副本，由 `lab-service/test/companion-wiring.test.cjs` 检查。首页／Tools 为 `data-companion="open"`，Lab 与八个 Calendar 页面为 `quiet`；登录、注册、改密码、Reading 不加载。只用身份判断工具权限，不读取页面内容，不调用外部模型。
- `lab-service/server.cjs` 首页白名单额外放行 `/companion/*` 与 `/tools-catalog.js`；带 `?v=` 的 `/companion/` 资源 `Cache-Control: public, max-age=86400`，其余仍 `no-store`。1.3.4.1 能力组合的 `server.cjs`／`app.js` 覆盖在 `scripts/releases/v2.0.0.0/variant-overrides/` 中做同样修改。无数据库迁移、新依赖或 Caddy 改动。
- 角色素材来自 Milu_Rig_v2 2.1.1，用 `scripts/companion/slim_rig.py` 精简；其余四个角色仅有台词，`characters.js` 中标为不可用。
- 构建机未安装 Node：意图回归、角色、接线与权限检查在浏览器中对实际文件运行，页面在两个服务 `public/` 的静态副本上验证；Node 测试套件与隔离 HTTP 检查由安装器在新镜像中执行。详见 `docs/GARYHUB_V2_0_0_0_TESTS.md`。

### v1.4.3.2（上一版本）

- 仓库 `Gary-BANG/garyhub`，本次审阅 main 为 `2b3d597e3f000b9340356aed6191af81970368cb`，PR #22 已合并 v1.4.3.1。GitHub 合并不等于生产部署。
- 当前源码入口 `releases/current.json`，清单 `releases/1.4.3.2.json`，独立开发分支 `update/garyhub-v1.4.3.2`；应用版本 v1.4.3.2，安装器 v1.4.3.2-r1。尚未推送／合并本次分支，生产完成及通知人数待现场输出。
- 用户指定从 v1.4.3.1 升级；本包严格核对两服务的实际版本均为 v1.4.3.1、对应源码与有效 Compose。缺少新的服务器现场证据时，不将其记录为已核实运行版本；不是 v1.4.3.1 时停止。
- ECE 470 Lab 的新 `public/lab/math-markdown.mjs` 在 Markdown 前保护公式，并使用既有本地 KaTeX 排版。支持四种标准 LaTeX 分隔符；为截图所示无标记的 `theta(s)`、五次时间标度、速度／加速度约束及已声明变量提供有限 ASCII 语法。保留原始题面作为排版元素 data-source，未知内容／非法 LaTeX 显示原文。代码块、行内代码、链接和 HTML 不做 ASCII 数学推断；HTML 仍经清理。显示转换不写回题包、不修改判题、不提前显示 formula_latex／答案。
- 练习视图每次重绘都排版，包括切题、同类变式、运行、提交完成；参考函数的数学维度与解析继续排版。题包格式和导入提示已说明优先使用显式 LaTeX。
- 成绩规划、学习中心、图片局部消除、Markdown Viewer、PDF 浅灰打印复用现有 ambient-music 播放器。显式配置挂载位置与 `data-music-library="false"`；两服务共享相同代码。选曲、播放进度、音频循环、多标签页租约及账号刷新逻辑沿用原实现。新页不增加 Music Library；原有 sky 页入口保留。
- 三个实用工具的 CSP 仅增加 `media-src 'self' https://*.r2.cloudflarestorage.com`，以播放现有签名 R2 曲目；connect-src、上传和本机文档处理边界不变。
- 本次独立适配器 `scripts/releases/v1.4.3.2/` 复用共享 build_overlay、deploy_runtime、既有 Windows 模板与独立 worktree 导入器。有／无 TOTP 仍分别核验，能力组合的 app/server 覆盖只改健康版本和必要媒体 CSP。无数据库迁移、新生产依赖或 host hooks；不注册 v1.4.3.1-r1 的历史索引修复 hook。
- 本地结果：7 项数学单元测试、23 项相关业务回归、35 项共享更新器／回滚及 8 项新适配器检查通过；两能力组合各 112 条 HTTP、61 条浏览器断言，第六阶段真实响应校验和 5 人合成通知去重通过。最终 ZIP 校验与源码导入测试在构建后执行。
- README、清单、功能说明、验证记录和 `calendar-app/releases/garyhub-1.4.3.2.json` 同步维护。测试范围与限制见 `docs/GARYHUB_V1_4_3_2_TESTS.md`，使用与回滚见 `docs/GARYHUB_V1_4_3_2.md`。
- 继承普通账号 5 项固定开支／5 条 Todo／每条 10 points，以及订阅／管理员 300 项和 100 points；保留已有超额数据和 MP3 库。音乐限额仍为每人 10 首／20 MiB 单首／100 MiB 合计，应用对象总限额 8 GiB，R2 凭据只在受限配置中。

### 最近的历史生产证据

v1.4.3.1-r1 曾在受保护 HTML 的未登录正文哈希检查失败后回滚至 v1.4.3.0；r2 在第一阶段发现回滚 Compose 标签与索引路径不一致而停止。r3 修正共享 restore，并提供仅针对完整已知 r1 证据的受限索引对齐。仓库已有 r3 的本地验证，但当前会话未取得其最终服务器输出。历史修订详情见 v1.4.3.1 文档；本次包不放宽 v1.4.3.1 安装基线。

## 模块定位

| 需求 | 首先读取 |
|---|---|
| 登录、会话、账号、通知 | calendar-app/app.js、auth-utils.js、account-admin.js、hub-api.js |
| 日历、Todo、私人记录 | calendar-app/ 对应 API 文件和 public/ 对应页面 |
| 账本、汇率、固定支出 | calendar-app/ledger-api.js、fixed-expenses.js、fx-rates.js |
| 工具权限、Reading 关联、每日金句 | calendar-app/tool-access.js、daily-quote.js；lab-service/reading-proxy.cjs |
| 服务器监控 | server-monitor/collect.py、lab-service/server-monitor.cjs、public/server-monitor/ |
| 粒子与音乐 | calendar-app/music-api.js、music-storage.js、public/music/；两个服务 public/ambient-music.* |
| 订阅额度 | calendar-app/entitlements.js、fixed-expenses.js、todos-api.js |
| Research Dictionary | calendar-app/research-api.js、public/research/、account-admin.js |
| 讲义答疑（v2.3.1.0） | calendar-app/assistant-tutor.js、assistant-api.js；lab-service/academic.cjs、public/academic/app.js、public/companion/panel.js |
| 用户个性化 | lab-service/public/personalize/，lab-service/academic.cjs 的 preferences 接口 |
| 学习中心与讲义 | lab-service/public/academic/；Viewer study-document.mjs 使用既有 academic/state 接口 |
| Markdown 阅读、章节与目录 | lab-service/public/useful/markdown-viewer/，避免打印 index.html 内嵌第三方 bundle |
| Tools 入口、搜索与 Dock | lab-service/public/index.html、tools-catalog.js、tools-dock.js、tools-dock.css |
| 跨站跳转 | 两服务的 public/auth-redirect.js |
| ECE 470 Lab | lab-service/server.cjs、public/lab/app.js、math-markdown.mjs、cloud.js、core.js |
| 作业题库分发 | lab-service/lab-distribution.cjs、public/lab/distribution.js、pack-validation.mjs |
| 三个本地实用工具 | lab-service/public/useful/，避免读取 vendor/ 的大文件 |
| 外站链接 | lab-service/public/sites/；server.cjs 中 sites.garyhub.uk 分支；scripts/sites/capture_thumbnails.py |
| 网站伙伴（米露等五个角色） | lab-service/public/companion/（Calendar 副本 calendar-app/public/companion/；puppet.js 驱动布丁）；lab-service/test/companion-*.cjs；scripts/companion/slim_rig.py、place_frames.py |
| A 股行情与 VIP | calendar-app/stocks/、stock-market.js、stock-api.js、account-admin.js、hub-api.js；lab-service/public/admin.js |
| 安装、打包、回滚 | scripts/updater/；当前适配器 scripts/releases/v2.4.0.4/ |

Calendar 使用 Node.js、Express、SQLite；Lab 使用 Node 原生 HTTP，浏览器运行 Python/WASM。生产运行代码须保持 Node 20 兼容。浏览器依赖已本地打包，无需让生产服务器在线安装依赖。

## 部署与数据边界

- Caddy 为 HTTPS 入口；主要容器 calendar-app、garyhub-lab。其他 RSS、文件、监控、网络服务按现有配置运行。
- 正式有效配置以 `/opt/my-services/garyhub-active-deployment.json` 及容器实际镜像、挂载为准，不能直接采用 README 中的历史路径。
- Calendar 数据挂载 `/app/data`，Lab 用户数据挂载 `/data`；实际宿主路径需现场核对。
- Calendar 统一账号；共享 Cookie `garyhub.shared.sid`、`.garyhub.uk`、HttpOnly、Secure、SameSite=Lax。保留明确 Origin 与 CSRF 校验。
- Lab 数据按用户独立保存，乐观修订号控制并发。分发为追加独立副本，保留作答与历史，禁止覆盖接收人空间。
- 服务器存在有 TOTP / 无 TOTP 两种历史组合。当前适配器的标识 1.3.4.2 / 1.3.4.1 代表能力组合，不代表当前应用版本。
- 不提交 `.env`、私有 Compose、数据库、会话、密钥、邮件授权、生产备份、homepage-protected.json、profile-private.json。

## 已有更新机制

统一入口为 `scripts/updater/manage.py`。v2.4.0.4-r1 的清单和 release-config 统一核对 v2.4.0.3，以已合并 main `0a5e86e` 为审阅源码基线；能力覆盖对应有／无 TOTP 两种历史组合，基础适配器为 v2.4.0.3。共享更新器未修改。

完整解压后双击 RUN-UPDATE.cmd。安装器按实际版本、源码、能力及有效 Compose 预检，执行离线构建、十组隔离检查、备份、切换、HTTPS/哈希和全体通知核对。ROLLBACK.cmd 恢复 v2.4.0.3 应用并保留当前用户记录；本版没有数据库变化。源码导入器使用独立 worktree 和审查分支，不强推或自动合并。

Markdown ZIP 在浏览器处理，使用原生 DEFLATE 流，不新增服务器运行依赖。支持普通未加密 ZIP（stored/DEFLATE），不支持 RAR、7z、多卷或 ZIP64；图片仅接受 PNG/JPEG/GIF/WebP，外部图片及 SVG 不加载。ZIP 最多 20 MiB、500 个条目、解压合计 50 MiB、单文件 10 MiB、Markdown 4 MiB。源码编辑和包内文档草稿仅保存在本次页面中，不写回原文件。

用户偏好：一次交付可运行 ZIP，减少往返复制代码；说明简洁，成功日志汇总、失败日志按需展开。开发环境验证与生产现场证据分开记录。
