# GaryHub

GaryHub 是使用统一账号的个人工作空间，包含日历与私人记录、账本、待办、学习工具和服务器工具。仓库保存应用源码、脱敏文档与可复现更新器；正式服务通过经过验证的升级包部署，GitHub 合并不会自动更新服务器。

**当前源码版本：v2.3.0.3。** 在 v2.3.0.2（提交 `9c61d249a98290e1d39e993552767cce747bfe48`）基础上，把伙伴布丁改成可活动的骨骼角色：耳朵、尾巴、腿挂在弹簧上随动作甩动，会呼吸、看鼠标、自己打哈欠／摇尾巴／抬爪，鼠标在头上来回划可以摸头，一分钟没人理会趴下睡觉；Calendar、Lab 上保持安静。动作由新增的 `companion/puppet.js` 驱动，米露与栗栗不变。v2.3.0.2 把栗栗改成分层矢量骨骼角色，并让所有伙伴开伞降落时在着地前收住摆动。v2.3.0.1 修复 AI 助手无法使用始终思考的 GLM-5.3 系列模型（改发 `reasoning_effort: "low"`）；v2.3.0.0 为 AI 助手加入按等级计次、备用模型、对话记忆、联网搜索和管理员“AI 日志”。

当前安装器为 **v2.3.0.3-r1**，严格要求 Calendar 与 Tools/Lab 均实际运行 v2.3.0.2，只替换静态伙伴文件与版本引用，不改动数据库结构、Caddy、DNS 或 Compose。**v2.3.0.3：源码已准备、本地已验证；未推送、未合并，生产未核验。** **v2.3.0.2：维护者 2026-11-04 告知已安装，安装输出未收录**（v2.3.0.3 安装器第 1 阶段会核实）。**生产：v2.3.0.1 已于 2026-11-03 安装完成**（安装输出 8/8 COMPLETE，站内通知核对 8 个账号，`SOURCE_BASELINE=1.3.4.2`）；其第 1 阶段核对同时证明此前 v2.3.0.0 已在运行（v2.3.0.0 自身的安装输出未收录）。v2.3.0.0 已由 PR #28 合并（main `b783804`，代码树与 `e89fc65` 相同）；v2.3.0.1 至 v2.3.0.3 在审查分支 `update/garyhub-v2.3.0.1`，待维护者合并。

维护日期：2026-11-04（America/Chicago）。

## 应用入口

| 入口 | 功能 | 源码 |
|---|---|---|
| [GaryHub](https://garyhub.uk) | 个人主页、统一账号与站内通知 | `lab-service/public/homepage.html`、`calendar-app/` |
| [Calendar](https://calendar.garyhub.uk) | 日历事项、日记、健康记录、私人账本、固定开支、Todo、Research Dictionary、个人音乐库 | `calendar-app/` |
| [Tools](https://tools.garyhub.uk) | 可搜索工具图标与 Dock；学习中心、成绩规划、Markdown Viewer、PDF 浅灰转换、图片局部消除、Reading、服务器监控、AI 日志及权限控制工具 | `lab-service/` |
| [ECE 470 Lab](https://lab.garyhub.uk/lab/) | 机器人学练习、题库导入、代码运行、个人进度与作业分发 | `lab-service/public/lab/` |
| [外站链接](https://sites.garyhub.uk) | GaryHub 之外的公开网站（ECE 470 Motion Notes、光影手记摄影课程），粒子背景与悬停预览 | `lab-service/public/sites/` |

Calendar 使用 Node.js 20、Express 与 SQLite；Tools/Lab 使用 Node 原生 HTTP，浏览器端运行文档处理和 Python/WASM。应用依赖已包含在既有生产镜像和本地静态资源中；升级器基于现场镜像离线构建，无需在生产服务器在线安装 npm 包。

## 当前功能与使用边界

- 网站伙伴米露：首页与 Tools 显示可拖动的米露，默认松手即停；设置中可切换重力模式，从高处松手会开伞落地。Lab 和 Calendar 的日历、账本、固定支出、待办、日记、健康记录、科研词典、音乐页面默认显示收起的小米露；窄屏同样默认收起。点击米露可用中英文描述需求，浏览器内本地匹配推荐站内工具，只推荐当前账号可打开的工具，对话只保存在当前页面内存；本地向导不调用外部模型（AI 日程助手见下条）。收起／关闭／重力模式保存在 `.garyhub.uk` 偏好 Cookie，位置按子站保存在浏览器。源码在 `lab-service/public/companion/`，Calendar 的 `calendar-app/public/companion/` 是逐字节相同的副本。
- AI 助手（v2.2.0.0 起，v2.3.0.0 扩展）：管理员在 Tools 用户管理页的“AI 助手”卡片填写服务商 API Key、主模型（默认智谱免费 `glm-4.7-flash`）、备用模型（默认付费 `glm-4-flashx-250414`）、是否允许联网搜索和各等级每日次数并启用后，登录账号的伙伴改用 AI 回答（OpenAI 兼容 chat completions）。
  - 工具：查看某段日期的日程、准备添加、准备删除（先查到事项编号）、打开站内页面，以及联网搜索（智谱 Web Search `search_std`，回答附来源链接）。同一条消息不能既搜索网页又处理日程，避免网页内容影响私人数据。
  - 添加／删除只生成待确认卡片，用户点“确认”后服务器才写入自己的日程，卡片 15 分钟后失效，他人无法确认。
  - 每日次数按普通用户／订阅用户／管理员分别设置，默认对话 200／200／500（每条消息的保护上限）、日程操作 30／50／200、联网搜索 5／30／100；日程操作和搜索在消息实际用到时各计 1 次，用完时伙伴直接说明“今日额度已用完”。
  - GLM 4.5 起的模型请求时关闭思考；始终思考的 GLM-5.3 系列（如 `glm-5.3-flash`、`glm-5.3-flashx`）改用最低思考强度 `reasoning_effort: "low"`，其他模型若同样拒绝关闭思考，会自动改用这种方式重试一次并记住（v2.3.0.1）。
  - 主模型出错（限流、超时、5xx）时，同一条消息自动改用备用模型；两者都失败时提示“AI 服务暂时繁忙”，本条不计次数。密钥被拒（401／403）不切换，提示联系管理员。
  - 服务器为每个账号保存最近 5 轮对话（第 8 轮时模型看到第 3–7 轮），换页面也能接上；伙伴“⋯”菜单可清空。
  - 用户消息、最近 5 轮对话、相关日程和搜索词会发送给所选服务商；API Key 只存在 Calendar 数据库，不会返回浏览器或写入日志。
  - 管理员工具“AI 日志”（`https://tools.garyhub.uk/ai-logs/`）显示最近 24 小时概况、按用户统计、每条消息的模型／是否切换／计次／Token／耗时，以及全部错误（服务商状态码、错误代码、是否已由备用模型恢复）。只记录元数据，不保存对话内容，保留 30 天。
  - 游客、未启用或对话次数用完时回到本地向导。源码为 `calendar-app/assistant-api.js`、`lab-service/public/companion/assistant.js`、`lab-service/public/assistant-admin.js` 与 `lab-service/public/ai-logs/`。
- 伙伴角色：聊天面板设置中的“换个伙伴”可在米露（所有访问者）、栗栗（登录账号）以及布丁、页芽、小航（订阅用户与管理员）之间切换；对话保留，选择随偏好 Cookie 同步，账号权限变化时自动回到可用角色。这是界面权益，角色图片与其他页面资源一样公开。新角色只在被选中时加载。米露与栗栗（v2.3.0.2 起）是分层矢量骨骼角色，头、耳、尾、爪单独转动并切换表情；布丁（v2.3.0.3 起）在此基础上由 `puppet.js` 驱动弹簧耳尾、摸头、待机小动作和睡觉；页芽、小航仍按整张姿态图切换。
- 外站链接 `sites.garyhub.uk`：由 Tools/Lab 容器提供的公开静态页，只开放页面、样式、脚本和预览图，并使用严格 CSP；其他主机的 `/sites/` 返回 404。背景为景深粒子、极光与流星，鼠标附近的条目按 Tools Dock 方式放大，宽屏且使用鼠标时在列表旁显示网站预览图；减少动态效果时只绘制静止画面。语言跟随共享 `garyhub_language` Cookie。新增网站时在 `lab-service/public/sites/index.html` 加一行，再运行 `python scripts/sites/capture_thumbnails.py`（需本机 Edge/Chrome 与 Pillow）生成预览图。
- ECE 470 Lab 题干与解析支持 `$...$`、`$$...$$`、`\(...\)`、`\[...\]`，常见旧式 ASCII 数学记法可自动排版。题目切换、运行与提交后保持排版；无法解析的内容显示原文。转换只影响显示，首次提交前仍隐藏公式答案与解析。
- 学习中心按账号保存课程、讲次、进度与配图，支持 Markdown、文件夹、ZIP 和 GitHub 导入。课程／讲次左栏可用图标收起；Lecture Notes 可在新标签页直接打开当前讲义的 Markdown Viewer。
- Markdown Viewer 支持源码编辑、公式、表格及 ZIP 内配图。章节默认收起，可逐节或全部展开；左侧层级目录默认收起，点击标题自动展开并定位。普通本地文件在浏览器处理；学习中心讲义通过既有登录接口读取，账号变化后清除已打开的私人讲义。Viewer 编辑仅留在本次页面，不写回原讲义或文件。
- 普通账号最多保存 5 项固定开支、5 条 Todo、每条 10 个 points；订阅用户和管理员保留现有 300 项／条和每条 100 points 上限。已有超额内容保留，已完成／停用内容仍计数。
- 订阅用户和管理员可上传个人 MP3：每人最多 10 首、单首 20 MiB、合计 100 MiB；应用管理的 R2 音乐对象总上限为 8 GiB。选曲随账号保存，降级后使用默认音乐，原文件保留。默认音乐不要求配置 R2；个人音乐需要管理员完成私有桶配置。
- 成绩规划、学习中心与三个实用工具页使用现有音乐选曲、播放进度和多标签页协调，只提供 Play Music 按钮。原有主页／Calendar／Tools 的 Music Library 入口保留。实用工具页仅对 R2 音频新增 media-src 许可，文件处理仍受本机连接限制。
- Research Dictionary、账本、讲义与练习数据按账号隔离；管理员身份不额外授予读取他人私人内容的权限。界面支持中文、英文和日夜主题。

ZIP 阅读支持普通未加密 stored／DEFLATE ZIP，不支持 RAR、7z、多卷或 ZIP64；只加载允许的本地位图。完整格式与大小限制见[项目档案](docs/PROJECT_CONTEXT.md)。

## 从这里维护项目

**AI 或维护者开始更新前，先读 [AGENTS.md](AGENTS.md)、[项目档案](docs/PROJECT_CONTEXT.md) 和[固定更新流程](docs/UPDATE_WORKFLOW.md)。**

```bash
python scripts/updater/manage.py context
python scripts/updater/manage.py plan --base <实际审阅的基础提交>
python scripts/updater/manage.py check
```

用独立分支开发，按实际行为变化选择测试；同步 README、项目档案、发布清单、版本说明与验证记录，再通过统一入口生成 upgrade ZIP。每次发布都必须检查根 README 的版本、功能、文档链接和状态表述；长期规则以 `docs/UPDATE_WORKFLOW.md` 为准。

## v2.3.0.3 安装与回滚

v2.3.0.3 只替换静态伙伴文件（`companion/pet.js`、`pet.css`、`characters.js`、`boot.js`，新增 `companion/puppet.js` 与 `companion/characters/pudding/rig.svg`）和各页面的版本引用：安装前两服务必须均实际运行 v2.3.0.2；流程与 v2.3.0.2 相同（隔离验证沿用 v2.3.0.0 的 7 项检查，资源哈希按 2.3.0.3 重算，新增三处伙伴文件在三个主机上的核对）。安装后以订阅或管理员账号选布丁，试重力落地、在头上来回划摸头、放置一分钟看它睡觉。`ROLLBACK.cmd` 恢复 v2.3.0.2 应用，保留当前记录与设置；布丁回到整张姿态图。构建入口为 `python scripts/updater/manage.py build --release 2.3.0.3 --output <新的ZIP绝对路径>`。

## v2.3.0.2 安装与回滚

v2.3.0.2 只替换静态伙伴文件（`companion/pet.js`、`companion/characters.js`、新增 `companion/characters/lili/rig.svg`）和各页面的版本引用：安装前两服务必须均实际运行 v2.3.0.1；流程与 v2.3.0.1 相同（隔离验证沿用 v2.3.0.0 的 7 项检查，资源哈希按 2.3.0.2 重算，新增三处伙伴文件在三个主机上的核对）。安装后登录账号，在伙伴面板“换个伙伴”选栗栗，切到重力模式从高处松手，确认落地时闭眼、起身后开心并会眨眼。`ROLLBACK.cmd` 恢复 v2.3.0.1 应用，保留当前记录与设置；栗栗回到整张姿态图。升级包只能新增或替换文件，栗栗旧的姿态 SVG 保留在服务器上但不再使用。构建入口为 `python scripts/updater/manage.py build --release 2.3.0.2 --output <新的ZIP绝对路径>`。

## v2.3.0.1 安装与回滚

v2.3.0.1 只替换应用文件：安装前两服务必须均实际运行 v2.3.0.0；流程与下面 v2.3.0.0 相同（隔离验证沿用 v2.3.0.0 的 7 项检查），安装后在“AI 助手”把主模型设为 `glm-5.3-flash`（备用可设 `glm-5.3-flashx` 或保留 `glm-4-flashx-250414`）并点“测试连接”。`ROLLBACK.cmd` 恢复 v2.3.0.0 应用，保留当前记录与设置；回滚后 GLM-5.3 模型会再次报错，请先把模型改回 `glm-4.7-flash`。构建入口为 `python scripts/updater/manage.py build --release 2.3.0.1 --output <新的ZIP绝对路径>`。

## v2.3.0.0 安装与回滚

1. 安装前，Calendar 与 Tools/Lab 必须均实际运行 v2.2.0.0。源码版本不能代替现场版本证据；版本或源码不符时安装器在改动前停止。
2. 完整解压 upgrade ZIP，在 Windows 双击 `RUN-UPDATE.cmd`，使用已有 OpenSSH 与 SSH 密钥。安装器执行源码／配置核对、离线构建、合成数据隔离验证（`assistant-http.cjs` 用容器内的模拟模型与搜索服务，覆盖备用模型、失败不计次、搜索、记忆、分级次数和 AI 日志，不需要真实 Key）、一致性备份、切换、HTTPS 与资源校验。
3. 部署健康后，向全部已批准且启用的账号（含管理员）发布未读站内通知，并核对人数和去重。执行输出用于确认生产是否完成。
4. 已保存的 API Key、主模型和启用状态保持不变；备用模型默认 `glm-4-flashx-250414`、联网搜索默认开启、次数为上述默认值。管理员在 `https://tools.garyhub.uk/admin/` 的“AI 助手”核对后点“测试连接”（会分别测试主模型、备用模型和一次约 0.01 元的搜索），再到 `https://tools.garyhub.uk/ai-logs/` 查看记录。
5. `ROLLBACK.cmd` 恢复本次安装前的 v2.2.0.0 应用和有效配置，保留当前用户记录；新增的列和 `assistant_quota`／`assistant_memory`／`assistant_calls`／`assistant_errors` 表留在数据库中但不再被使用（均无指向用户表的外键，不影响旧版账号删除）。若已有后续部署或配置变化，回滚会停止等待核对。
6. `PUSH-TO-GITHUB.cmd` 使用独立工作目录准备并推送审查分支，保留原工作区，不强推、不自动合并 `main`。默认本地仓库为 `D:\Codes\Own_Project\garyhub`。

构建入口：

```bash
python scripts/updater/manage.py build --release 2.3.0.0 --output <新的ZIP绝对路径>
```

Windows 工作区若启用 `core.autocrlf`，请在 `core.autocrlf=false` 的独立 worktree 中构建，使包内文件与资源哈希都使用仓库中的 LF 字节。

详见 [v2.3.0.3 说明](docs/GARYHUB_V2_3_0_3.md)与[验证记录](docs/GARYHUB_V2_3_0_3_TESTS.md)、[v2.3.0.2 说明](docs/GARYHUB_V2_3_0_2.md)与[验证记录](docs/GARYHUB_V2_3_0_2_TESTS.md)、[v2.3.0.1 说明](docs/GARYHUB_V2_3_0_1.md)与[验证记录](docs/GARYHUB_V2_3_0_1_TESTS.md)、[v2.3.0.0 说明](docs/GARYHUB_V2_3_0_0.md)与[验证记录](docs/GARYHUB_V2_3_0_0_TESTS.md)、上一版 [v2.2.0.0 说明](docs/GARYHUB_V2_2_0_0.md)及[发布通知规则](docs/RELEASE_POLICY.md)。

## 部署与私密数据

正式运行目录为 `/opt/my-services`，不是 Git working tree。**有效配置以 `/opt/my-services/garyhub-active-deployment.json`、实际容器镜像和挂载为准。** 不要直接套用旧文档的 Compose 路径或在服务器执行未经验证的 `git pull`。

Calendar 数据挂载 `/app/data`，Lab 数据挂载 `/data`，实际宿主路径须现场核对。保留现有共享登录 Cookie、明确 Origin、CSRF、TOTP 能力组合、R2 只读配置挂载和 Reading／监控／VPN 集成。Caddy 是 HTTPS 入口；相关外部服务与网络配置按既有配置继承。

不得提交 `.env`、私有 Compose、数据库、会话、密钥、邮件授权、生产备份、`homepage-protected.json` 或 `profile-private.json`。GitHub 不是数据库备份；恢复数据库前必须评估备份之后的用户操作。

## 文档导航

| 文档 | 用途 |
|---|---|
| [项目档案](docs/PROJECT_CONTEXT.md) | 当前源码、已知生产证据、模块定位与数据边界 |
| [固定更新流程](docs/UPDATE_WORKFLOW.md) | 每次更新必须遵循的开发、验证、文档与交付流程 |
| [统一更新器](scripts/updater/README.md) | context／plan／check／build 与源码同步工具 |
| [当前版本清单](releases/current.json) | 源码版本及对应发布清单 |
| [v1.4.3.2](docs/GARYHUB_V1_4_3_2.md) | 本版继承的 Lab 公式排版与工具页音乐 |
| [v1.4.3.0](docs/GARYHUB_V1_4_3_0.md)／[R2 配置说明](docs/GARYHUB_V1_4_3_0_CLOUDFLARE.md) | 本版继承的订阅额度与音乐存储规则 |
| [架构](docs/ARCHITECTURE.md)／[数据与备份](docs/DATA_AND_BACKUP.md) | 系统背景与备份原则；历史路径须现场复核 |
| [历史升级与回滚记录](docs/UPDATE_GUIDE.md) | 早期部署记录，不作为当前有效 Compose 的依据 |

旧服务器迁移、已退役 Study 服务及早期版本说明保留在 `docs/`，历史记录不代表当前部署状态。仓库地址：[Gary-BANG/garyhub](https://github.com/Gary-BANG/garyhub)，默认分支 `main`。
