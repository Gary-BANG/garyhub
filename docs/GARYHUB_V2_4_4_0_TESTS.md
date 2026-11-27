# v2.4.4.0-r1 验证记录

测试从 PR #55 的合并提交 `46039938205395492a7dcd212025ecc6760ced01` 起步。数据来自本机隔离测试账号和使用者提供的课程 ZIP。真实课件、测试数据库和开发者档案没有进入源码或安装包。

| 检查 | 结果 |
|---|---|
| Calendar、Tools/Lab 的 Node 单元测试 | 在 Node 24.22.3 分别通过 161 项、115 项，均无跳过。覆盖既有账号、通知、阅读器和游戏等模块。 |
| 两种安装能力组合 | 按发布配置在隔离进程中运行真实 Calendar、Tools/Lab 和 SQLite。含 TOTP、无 TOTP 各通过 21 组 HTTP／实时连接和资源检查。无 TOTP 使用单独的生产入口覆盖文件，移除 TOTP 后端模块。SQLite 外键检查通过。 |
| 本版新增导航 HTTP 组 | 两种组合各通过 44 项，覆盖公开静态资源、真实字节摘要、登录、CSRF、账号切换、书签归属、重复创建、相对入口、并发修订、两设备分别失效、同一次去重、重新授权、已删除提醒不复现和移除书签后的清理。 |
| 旧库升级、回滚再升级 | 对同一个合成 SQLite 库实际启动 v2.4.3.4、v2.4.4.0、v2.4.3.4、v2.4.4.0 四次。核对原通知、原账号及新版创建的书签，回滚再升级后均可读取，外键检查通过。 |
| 发布通知 | 两种组合各向 5 个启用的合成账号发布 5 条；第二次执行识别为已发布，无重复。实际收件人数在正式安装第 8 阶段记录。 |
| 真实课程 ZIP | Chromium 打开 35,909,662 字节的 ECE 470 压缩包。识别深层入口 study-site/dist/index.html。进入作业题后原图自然宽度 973 像素，题面有 3 处 KaTeX。点击原引用打开 Lecture 14 第 21／28 页，并可返回课程网站。 |
| 设备与界面 | 访客临时打开后导航列表为空。合成账号在真实浏览器中选择文件夹、切换两个 HTML、保存、刷新重开、搜索、改名、移除并打开 localhost 网址。桌面与 375 像素窄屏均检查过。 |
| 授权与通知中心 | 浏览器使用真实、可序列化的目录句柄与 IndexedDB，用可控的选择器和权限状态模拟从允许到需重授。切回 Tools 后三次检查只有一条通知，主页通知链接定位到正确卡片，重新授权后可读且提示清除。操作系统原生授权弹窗由现场浏览器控制。 |
| 发布适配器 | 6 项测试校验基础版本、能力组合、既有保护和运行标记、资源摘要、共用资源、Caddy 只读门槛，以及导航页面或新数据库表的部署检查。 |
| 共享更新器 | 检查注册清单与两服务版本；运行共用更新器测试，包括失败切换后的回滚／重试、手动回滚与配置一致性。成包后核对外层全部摘要、内层载荷、两个能力变体，以及源码补丁在审阅基线上的应用结果。 |

Calendar 的 17 个既有测试文件使用测试专用内置模块 `node:sqlite`，在 Node 20.20.2 上无法启动；完整 Calendar 单测在 Node 24.22.3 下执行。另以生产主版本 Node 20 运行实际服务（sqlite3 驱动）和两个安装组合的隔离检查。

## 重现

在仓库根目录执行以下命令。Calendar 按自己的 package-lock.json 准备依赖。真实课程测试需本机已有 Chromium、Python Playwright 和课程压缩包。

```sh
python scripts/updater/manage.py check
python scripts/releases/v2.4.4.0/tests/adapter.test.py
python -m unittest discover -s scripts/updater/tests
(cd calendar-app && npm test)
(cd lab-service && node --test test/*.test.cjs test/*.test.mjs)
python scripts/releases/v2.4.4.0/tests/browser-course.py /path/to/course.zip --tools http://localhost:3000 --browser /path/to/chromium
```

全部隔离测试的输入与执行顺序见同版本 release-config.json。管理员通知、私人书签和重新授权记录由测试用临时数据库生成。运行源码同步测试时，将 GARYHUB_PUSH_TEST_PACKAGE 设为包内 git-source 的单根目录 ZIP，GARYHUB_TEST_PWSH 设为 PowerShell 可执行文件，工具只访问临时 bare 仓库。

PowerShell 7.4.13 的包验收使用实际安装与回滚脚本，以本地 SSH 替身检查启动程序、载荷和模式。在转发前篡改测试副本时安装器拒绝继续。源码导入另外使用本地 bare 仓库验证。

## 现场验收

安装器基于上一版现场镜像构建。私有挂载、SSH、正式 Caddy 和 Docker 切换须在维护电脑和目标服务器验收。这里未在 Windows 实机双击运行，也未向生产服务器写入。正式安装的通知人数、健康状态和回滚记录均以现场输出为准。
