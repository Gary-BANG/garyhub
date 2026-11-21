# GaryHub v2.4.1.5 · 补齐外观、地区与学习中心设置

源码基于 main `0041a4ef2752fa5473bc6775452c864b3f68f17a`（PR #47 合并的 v2.4.1.4），独立分支 `update/garyhub-v2.4.1.5`。安装器 v2.4.1.5-r1 严格要求两服务实际运行 **v2.4.1.4**（2026-11-17 tools 与 calendar 的 `/health` 均返回 2.4.1.4）。源码已准备、本地验证；尚未推送、合并或部署。

## 为什么做

v2.4.1.4 的设置中心只完成了改进清单第 2、3、7 项的一部分。维护者 2026-11-17 要求把这三项补齐。本版补上剩下的七个设置，都随账号保存。

## 新增设置

| 分节 | 设置 | 取值 | 作用范围 |
|---|---|---|---|
| 外观 | 强调色 | 默认、蓝、紫、青、暖棕 | 带 GaryHub 页头的页面：链接、按钮、选中状态和标志。“默认”保留各页原来的颜色；浅色与深色主题各用一组色值 |
| 外观 | 界面密度 | 标准、紧凑 | 紧凑会减小页头、卡片、日历外框、记账指标卡、工具图标、主页入口与“今日”卡片、设置页分节和搜索结果周围的留白 |
| 语言与地区 | 每周开始于 | 周一、周日 | 日历月视图与周视图、日记的日期格（星期标题同时调整） |
| 语言与地区 | 日期格式 | 2026-11-17、2026年11月17日、11/17/2026、17/11/2026 | 日历事项列表与今日日期、记账明细与统计区间、日记列表与筛选提示、主页“今日”、搜索结果；日期输入框仍用浏览器的日期选择器，存储格式不变 |
| 语言与地区 | 日历默认视图 | 月、周、列表 | 打开日历时的视图；日历上方新增“月／周／列表”切换按钮 |
| 学习中心 | 代码字体 | 默认、Consolas、Courier、与正文一致 | 讲义中的代码；设置页预览同步显示 |
| 学习中心 | 公式大小 | 80%–150% | 讲义中的 KaTeX 公式；设置页预览同步显示 |

学习中心与本地工具不使用全站强调色，学习中心页面以 `data-gh-accent-off` 退出。原因是学习中心有自己的三种阅读外观，套用全站强调色会和这些配色冲突；本地工具则使用各自的固定配色。

## 实现

- **Calendar `preferences-api.js`**：`SCHEMA` 增加 `appearance.accent`、`appearance.density`、`region.weekStart`、`region.dateFormat`、`calendar.view`，共 15 个键，每个键都只接受固定取值。没有新表，`app.js` 只改了版本号。
- **共享 `hub-prefs.js`**：
  - **共享 Cookie**：这五个显示设置也镜像到 `garyhub_prefs` Cookie，页面第一次绘制前就能应用强调色和密度，脚本在账号数据返回前也能读到周起始日、日期格式和视图。
  - **账号优先**：这些设置只能在设置中心修改，所以账号上的值（包括未设置）始终覆盖 Cookie。共用同一台电脑时，前一个账号的选择不会被带进后一个账号。
  - **新接口**：`GaryHubPrefs.value()`、`setDisplay()`、`formatDate()`。
- **`brand.css`**：
  - **强调色**：按 `html[data-gh-accent]` 与 `html[data-gh-theme]` 同时覆盖根元素和 `body` 上的 `--accent`，因为部分页面把颜色变量定义在 `body` 上。主页和开发者页固定为深色，所以总是用深色主题的色值。
  - **紧凑密度**：按 `html[data-gh-density=compact]` 收紧留白。
- **页面接入**：
  - **日历与日记**：`calendar-page.js` 读取 `firstDay` 与 `initialView`，并加入视图切换按钮；`journal-page.js` 调整星期标题顺序和月初的空格数。
  - **日期显示**：`unified.js`、`ledger.js`、`journal-page.js`、`home/today.js`、`hub-search.js` 显示日期时经过 `formatDate()`。
- **学习中心**：
  - **校验与接口**：`academic/core.js` 校验 `codeFont` 与 `mathScale`（0.8–1.5）；`academic.cjs` 的阅读偏好接口读写这两项，旧客户端可以不传。
  - **应用到讲义**：`academic/app.js` 设置 `--reader-code-font` 与 `--reader-math-scale`，`style.css` 中代码与公式的样式改用这两个变量。

## 兼容与回滚

- **无表结构变化**：新的五个设置只是 `user_preferences` 里的新键；学习中心的两项写在学习中心自己的记录里，旧版只会忽略它们。
- **回滚**：回滚到 v2.4.1.4 后，旧版不会读取这些设置，页面回到默认的强调色、密度、周一开始、ISO 日期和月视图；账号里的值保留，重新升级后会恢复。

## 安装、回滚与源码

- **安装**：完整解压 `GaryHub_v2.4.1.5_upgrade.zip`，在 Windows 双击 `RUN-UPDATE.cmd`。
- **核对链**：适配器 `scripts/releases/v2.4.1.5/` 以 `prior_0414.py` 载入 v2.4.1.4 的全部核对。
- **第 6 阶段新增核对**：三个主机的 `brand.css` 字节相同，并含强调色与密度规则；学习中心页面带 `data-gh-accent-off`；两个运行容器中的新文件。
- **隔离检查**：仍为十三组。`prefs-http.cjs` 与 `study-http.cjs` 换成本版副本，以覆盖新的键和学习中心的新字段。
- **站内通知**：两条，分类为 home 和 tools。
- **回滚与源码**：`ROLLBACK.cmd` 恢复 v2.4.1.4 并保留当前记录；`PUSH-TO-GITHUB.cmd` 只推审查分支。

构建：`python scripts/updater/manage.py build --release 2.4.1.5 --output <ZIP绝对路径>`（在 `core.autocrlf=false` 的 LF worktree 中）。验证见 [GARYHUB_V2_4_1_5_TESTS.md](GARYHUB_V2_4_1_5_TESTS.md)。

## 项目档案历史记录

以下条目于 2026-11-20 从 `docs/PROJECT_CONTEXT.md` 原样移入，是写入当时的记录；其中“尚未推送／合并／部署”等状态描述以写入时为准，后续状态见项目档案的版本索引。

- **v2.4.1.5（PR #48 已合并为 main `d0e49a9`；2026-11-18 tools／calendar `/health` 返回 2.4.1.5，安装输出与通知人数未收录；以下为交付时记录）** 基于 PR #47 的 main `0041a4ef2752fa5473bc6775452c864b3f68f17a`（树与 v2.4.1.4 提交 `ef85c1d` 相同），独立分支 `update/garyhub-v2.4.1.5`；清单 `releases/2.4.1.5.json`，适配器 `scripts/releases/v2.4.1.5/`（baseline_adapter v2.4.1.4，安装器 v2.4.1.5-r1，严格要求实际 v2.4.1.4）。按维护者 2026-11-17 要求补齐设置清单第 2、3、7 项：`preferences-api.js` 新增 `appearance.accent`（blue/violet/teal/brown，null=页面原色）、`appearance.density`（standard/compact）、`region.weekStart`（monday/sunday）、`region.dateFormat`（iso/zh/us/eu）、`calendar.view`（month/week/list），共 15 键；`hub-prefs.js` 把这五项镜像到 `garyhub_prefs` Cookie（a/d/w/f/v，首屏前生效），账号值（含未设置）始终覆盖 Cookie、不从浏览器上传，提供 `value()`／`setDisplay()`／`formatDate()`；`brand.css` 按 `html[data-gh-accent][data-gh-theme]` 同时覆盖根元素与 body 的 `--accent`（主页与开发者页总用深色色值），`html[data-gh-density=compact]` 收紧页头、卡片、日历外框、记账指标、工具图标、主页卡片、设置分节与搜索结果；学习中心 `<html data-gh-accent-off>` 退出强调色。`calendar-page.js` 读 `firstDay`／`initialView` 并加月／周／列表切换按钮；`journal-page.js` 按周起始日调整星期标题与月初空格；日期经 `formatDate()` 显示于日历事项列表与今日日期、记账明细与区间、日记列表与筛选、主页“今日”、搜索结果（存储与输入仍为 YYYY-MM-DD）。学习中心：`core.js` 校验 `codeFont`（default/consolas/courier/sans）与 `mathScale`（0.8–1.5），`academic.cjs` 读写，`app.js` 设 `--reader-code-font`／`--reader-math-scale`，`style.css` 代码与 KaTeX 使用它们。无新表，`app.js` 只改版本号。隔离检查仍 13 组，`prefs-http.cjs`（77 项）与 `study-http.cjs`（只改期望字段）换成本版副本。站内通知两条：home、tools。本地验证：Calendar 115、Lab 113；13 组隔离套件两种能力组合通过；浏览器检查强调色、密度、周日开始、中文日期、周视图、日记星期顺序、学习中心代码字体与公式大小。开发中 PowerShell 把中文弯引号当字符串分隔符，截断了 `settings.js` 一行，已在语法检查中发现并改正——**以后写含中文弯引号的文本用 Write/Edit 工具或 Python，不要用 PowerShell 字符串**。源码已准备／本地已验证，尚未推送、合并或部署。详见 GARYHUB_V2_4_1_5.md 与 _TESTS.md。
