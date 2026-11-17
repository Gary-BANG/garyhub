# GaryHub v1.4.3.2

日期：2026-10-28（America/Chicago）。审阅基线：`2b3d597e3f000b9340356aed6191af81970368cb`（已合并 PR #22，源码 v1.4.3.1）。独立分支 `update/garyhub-v1.4.3.2`；安装器 `v1.4.3.2-r1`。

## ECE 470 Lab 公式

截图中的旧题面没有 LaTeX 分隔符，例如 `theta(s)=theta0+s*(theta1-theta0)`、五次时间标度及 `abs(theta_dot_i)<=vmax_i`。Markdown 把部分下划线和星号当作强调标记，仅调用自动 LaTeX 渲染器不能解决这类输入。

新显示模块在 Markdown 解析前保护标准公式，并为常见 ASCII 数学记法提供有限、无求值的语法转换：四则运算、显式乘法、幂、括号、关系式、希腊字母、下标、dot／ddot、abs、sqrt、三角函数、max／min 和科学记数法。既有输入／输出变量名参与识别。每个排版元素保留原始表达式 `data-source`；题包、参数、代码、作答及历史不改写。

标准题包建议明确写 `$...$`、`$$...$$`、`\(...\)` 或 `\[...\]`；JSON 中反斜杠需要转义。行内代码、代码块和链接不自动转换，HTML 仍经既有清理。未知函数／记法不推测含义；非法 LaTeX 显示安全的原始文本。复杂无标记公式无法保证自动识别，应使用显式 LaTeX。KaTeX 使用已有本地资源，不增加联网渲染依赖。

切题、同类变式、运行、提交完成、历史恢复和参考函数刷新后均保持排版。题面转换仅使用 statement_en；formula_latex、explanation_md 和参考答案继续在首次提交后显示，“运行”不会解锁。

## 五个页面的 Play Music

成绩规划、学习中心、图片局部消除、Markdown Viewer、PDF 浅灰打印复用现有播放器。按钮在主题按钮旁，支持键盘与 aria-pressed。沿用当前账号选曲、默认曲目、进度 Cookie、循环、可见性处理和跨标签页租约。

这五个页面显式关闭 Music Library 入口；原有主页／Calendar／Tools 等 sky 页面保留原功能。两服务使用相同 ambient-music.js／css。三个实用工具的 CSP 只增加 R2 HTTPS 音频来源，connect-src 仍为 self，文档、PDF 和图片继续在浏览器处理。

## 安装和回滚

1. 完整解压 upgrade ZIP，Windows 双击 `RUN-UPDATE.cmd`。继续使用既有 OpenSSH 和 SSH 密钥。
2. Calendar 和 Tools/Lab 必须都实际运行 v1.4.3.1；安装器分别核对有／无 TOTP 源码基线、实际镜像、挂载与有效 Compose。未知基线停止，不跳过校验。
3. 基于当前镜像离线构建，使用合成账号／数据隔离验证，备份 SQLite 与 Lab 数据并检查，再切换。没有新数据库迁移或服务器 npm 安装。
4. 公开资源校验 HTTPS 正文哈希；受保护 HTML 分别校验运行容器文件哈希和未登录 HTTPS 跳转，登录后正文亦在隔离 HTTP 测试中核对。
5. 健康后按 RELEASE_POLICY 向全部已批准、启用账号（含管理员）发布未读通知，核对人数与重复执行去重。保存最终输出作为生产证据。
6. `ROLLBACK.cmd` 恢复安装前的 v1.4.3.1 应用与有效配置，保留当前用户记录和音乐；已有后续部署／配置变化时拒绝覆盖。复用已修正的 Compose 路径索引恢复及严格复核。

本次仅增加独立清单、配置和适配器，复用共享更新器、Windows 模板和源码导入器，不注册旧 r1 的历史索引修复 hook，不更改 R2 凭据、Reading、监控、Caddy 或 VPN 配置。

`PUSH-TO-GITHUB.cmd` 在独立 worktree 准备和普通推送审查分支，保留原工作区，不强推、不自动合并 main。GitHub 合并不会自动部署服务器。

## 状态

源码和本地验证见 [验证记录](GARYHUB_V1_4_3_2_TESTS.md)。本次未直接连接生产、推送或合并 GitHub；生产版本与通知人数仍待现场输出。当前包完成不代表已上线。

## 项目档案历史记录

以下条目于 2026-11-16 从 `docs/PROJECT_CONTEXT.md` 原样移入，是写入当时的记录；其中“尚未推送／合并／部署”等状态描述以写入时为准，后续状态见项目档案的版本索引。

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
