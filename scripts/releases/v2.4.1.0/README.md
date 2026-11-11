# GaryHub v2.4.1.0 · 星空主页与开发者档案

源码基于 main `97ad2f22761547f216b0794915debb1ac3cfc17e`（PR #42，v2.4.0.4），独立分支 `update/garyhub-v2.4.1.0`。源码准备、本地验证、GitHub 合并与生产验证分别记录；本版尚未部署服务器。

## 改动

**主页（garyhub.uk）改为星空主题，不再放个人资料。**

- 背景：Canvas 绘制三层视差星空（随鼠标轻微移动、星星闪烁、鼠标附近的亮星连成星座线、不时划过流星），CSS 绘制缓慢流动的星云；标题后方有两条带“行星”的轨道。系统开启“减少动态效果”时只画一帧静止星空，切到其他标签页时动画暂停，手机上星星更少。
- 内容：标题 Gary Hub、标语、“进入工具台”和“浏览全部入口”两个按钮；下方四张入口卡片（工具台、日历与记录、学习中心、外站与课程），鼠标移上去按指针位置发光。
- 导航：首页 · 工具 · 日历 · 更多 ▾。“更多”里是“开发者档案”（新）和原有的 Elsewhere（新标签页打开）。
- 主页不再有访问码按钮、隐藏占位框或个人信息，构建与安装都会检查主页不含旧资料中的文字。

**开发者档案（garyhub.uk/developer/）**

- 原主页上的个人资料移到这里，改写为正式的双语介绍：概览（姓名、身份、简介、GitHub）、教育背景、学业成绩（GPA／排名，沿用原有单独授权）、研究与项目、专业技能。
- 访问规则不变：管理员在“开发者档案访问控制”（原“个人资料访问控制”）中分别为路人、普通用户、订阅用户设置默认可见内容；管理员始终可见；访问码解锁 24 小时。
- **全部不可见**：整页只显示“你无权访问”（已设置访问码时附“输入访问码”按钮）。
- **部分可见**：只显示可见的栏目，编号连续（01、02…），不出现“已隐藏”之类的字样或占位框；顶部只留一个中性的“使用访问码”按钮。
- 服务器端 `/api/hub/developer-profile` 只返回允许的栏目，不返回规则列表、修订号或其他栏目的存在信息；页面全部用 `textContent` 渲染。
- 页面只在 garyhub.uk 提供，`tools.garyhub.uk/developer/` 等返回 404；`/developer` 跳转到 `/developer/`。

**私有内容**：正式文案保存在 `lab-service/developer-profile.json`（已加入 `.gitignore`，不提交 GitHub，格式示例见 `docs/developer-profile.example.json`）。它作为本升级包的私有附件随包上传，安装器第 1 阶段校验结构后放入 Tools/Lab 新镜像的 `/lab/developer-profile.json`（public/ 之外）。GPA／排名仍来自服务器上已有的 `profile-private.json`，`homepage-protected.json` 原样保留（旧接口 `/api/hub/profile-content` 仍在，便于回滚）。

**其他**：网站伙伴认识“开发者档案”（两份副本相同）；管理页隐私面板改名，“预览”链接改为打开开发者档案；中英文字典补充新文案。无数据库结构、依赖、Caddy 或 Compose 变化。

## 安装、回滚与源码

完整解压 `GaryHub_v2.4.1.0_upgrade.zip`，在 Windows 双击 `RUN-UPDATE.cmd`。两服务必须实际运行 **v2.4.0.4**：2026-11-10 `tools.garyhub.uk` 与 `calendar.garyhub.uk` 的公开 `/health` 均返回 `hubVersion: 2.4.0.4`（v2.4.0.4-r2 的安装输出与通知人数未收录）。版本、源码、能力或有效 Compose 不匹配时安装器停止。

本版注册自己的小型适配器 `scripts/releases/v2.4.1.0/`（安装器 v2.4.1.0-r2），复用共享 `build_overlay.py`、`deploy_runtime.py`、Windows 安装入口和源码导入器，并沿用 v2.4.0.4 适配器的 HTTPS 核对与 curl 重试。隔离检查在 v2.4.0.4 的十组基础上新增 `developer-http.cjs`，共十一组。2026-11-10（服务器时间 11-11 02:58 UTC）维护者运行 r1：第 1 阶段（含私有开发者档案校验与预置）、第 2 阶段离线构建通过，第 3 阶段第十一组 `developer-http.cjs` 报 `ERR_ASSERTION; actual=429; expected=200` 后停止。停在备份与切换之前，生产服务未改动，仍为 v2.4.0.4，没有发布通知。原因：Calendar 登录按客户端地址限 15 分钟 12 次，前十组在共享容器地址上已登录 11 次（useful 1、study 2、asset-response 1、music 1、companion 1、assistant 3、notifications 2；stocks 与 tutor 使用各自的测试地址），本组第二次登录（管理员）为第 13 次。r2 只改 `developer-http.cjs`：登录及其 CSRF 请求带本组专用的文档测试地址 `X-Forwarded-For: 192.0.2.241`（与 stocks-http、tutor-http 的做法相同；会话不绑定地址），适配器测试新增对应检查。应用文件、资源哈希与其余检查不变。安装执行严格预检、离线镜像构建、十一组隔离 HTTP 检查、一致备份、切换、HTTPS／资源哈希、主页与开发者档案核对，并向全体启用账号发布站内通知、核对人数与去重。

`ROLLBACK.cmd` 恢复安装前 v2.4.0.4 应用（旧主页与旧资料片段）和有效配置，保留当前用户记录与访问规则。`PUSH-TO-GITHUB.cmd` 使用独立 worktree 和审查分支，不强推、不自动合并 main；源码同步不含私有的 `developer-profile.json`。

构建：`python scripts/updater/manage.py build --release 2.4.1.0 --output <ZIP绝对路径>`（需要本机存在 `lab-service/developer-profile.json`）。验证范围见 [TEST-RESULTS.md](TEST-RESULTS.md)。
