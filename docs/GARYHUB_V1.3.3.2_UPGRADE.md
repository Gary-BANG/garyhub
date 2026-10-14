# GaryHub v1.3.3.2 — Study Hub 阅读兼容更新

## 使用方式

1. 将整个 ZIP 解压到新文件夹，双击 `RUN-UPDATE.cmd`。
2. 按提示输入你现有的 SSH 密钥口令。等待 `7/7 COMPLETE` 和最后的 `COMPLETE v1.3.3.2`。
3. 打开 https://tools.garyhub.uk/study/ ，按 Ctrl+F5 刷新。已导入的笔记直接获得新显示效果，不需要重新导入或提供 GitHub 令牌。
4. 检查一篇带文档属性、callout、wikilink 和公式的讲义。点击课程工具栏的“GitHub 导入与同步指南”。
5. 如果安装器显示 `Source committed locally on update/garyhub-v1.3.3.2`，可双击 `PUSH-TO-GITHUB.cmd`。它会推送该分支并打开 PR 页面。确认 base 是 main，再创建和合并 PR。

若出现 STOPPED，请保留窗口并发送末尾错误，不要跳过检查。若仅本地源码同步出现警告，线上升级可能已经成功：以部署日志为准，先将警告发回核对，暂不运行推送入口。

## 更新内容

- 浏览器识别开头的 YAML frontmatter，将属性放在折叠的“文档信息”中。正文没有一级标题时，可用 title 补上标题。不会用文档中的 status 改写个人学习进度。
- 属性格式异常时显示可展开的原属性和提示，正文继续可读。原文下载保持完整。
- Obsidian callout：note、tip、info、warning、danger、example、question、quote、success 等；支持自定义标题、嵌套及 + / - 折叠。公式、列表、代码和链接可保留。
- Wikilink：文件名、课程内路径、./ 或 ../ 相对路径、显示别名、同页/跨讲义标题锚点。文件名重复时提示歧义，完整路径可定位；未导入目标或不存在标题会显示原因。
- 常规 Markdown 文件链接也可跳到已导入讲义与标题。支持浏览器前进/后退，以及带讲义与标题地址的新标签页。
- “GitHub 导入与同步指南”包含公开/私有仓库、目录和分支、只读令牌、预览确认、手动更新及常见错误。

本次链接范围是当前课程已导入的 Markdown。Obsidian 插件、Dataview、笔记嵌入 ![[...]]、块引用锚点 ^id 不在本次范围；嵌入保留可读的原始语法。自定义 Obsidian 主题和 CSS 不会执行。

## 部署方式与数据

使用当前 Tools/Lab 镜像作为基础，保留原服务设置、数据挂载和网络，覆盖已核对的学术模块文件。检查当前源码是否对应已安装的上一版，遇到未知改动会停止。先运行隔离账户测试，再短暂停止 Tools/Lab、备份并校验数据，切换镜像并验证 HTTPS 页面和新文件校验值。失败自动恢复旧镜像。

本次功能运行在浏览器，不增加服务器常驻进程或数据库。新增前端代码主要是 reader.js、样式和 39.5 KB 的 js-yaml。安装包、旧镜像及数据备份会额外占用服务器磁盘；备份量取决于现有 Tools/Lab 数据，并非上述前端代码大小。

Calendar 数据库和提醒服务沿用现有部署。讲义原文、课程成绩、用户设置、学习进度保留。GitHub 同步为只读、手动触发，令牌仍不保存。

## 回滚

仅在需要撤回本次更新时，双击 `ROLLBACK.cmd`。恢复升级前镜像，保留升级后产生的所有用户数据。如后续已安装其他版本，脚本会停止，避免覆盖新版本。

服务器升级目录：`/opt/garyhub-update-v1.3.3.2-fix1`。本地源码与测试：`%LOCALAPPDATA%\GaryHub\updates\v1.3.3.2-fix1`。本地仓库默认：`D:\Codes\Own_Project\garyhub-repo`。

## 测试与依赖

详细结果见 TEST-RESULTS.md。需要复跑 DOM 测试时，可在解压后的 payload 工作目录（含 tests 的目录）运行 `npm install --prefix vendor-work --ignore-scripts --no-audit --no-fund jsdom@26.1.0`，然后运行 `node --test tests/reader.test.cjs` 和 `node tests/app-dom.test.cjs`。这些开发依赖不安装到生产服务器。

前端 YAML 依赖固定为 js-yaml 4.1.1（MIT），已随包附带，不依赖 CDN。属性解析使用 JSON_SCHEMA，并限制属性大小、深度和解析步骤。页面 HTML 继续使用 DOMPurify 清理，公式使用现有 KaTeX。

## 安装器修订 fix1

修复后端版本接口仍返回旧版本、导致隔离容器健康检查失败的问题。新的升级目录和本地缓存目录均使用 fix1 后缀，因此可以直接重试，不需删除旧缓存或绕过校验。源码同步同时包含后端版本常量更新。真实 HTTP 集成已加入版本接口断言。
