# GaryHub v1.3.6.1 · 工具双语与 Markdown ZIP

本包仅用于生产服务实际运行 v1.3.6.0 的环境。安装器会核对 Calendar 与 Tools/Lab 的实际版本、源码和有效 Compose，保留服务器原有 TOTP 或无 TOTP 组合。

## 安装

1. 下载并完整解压 ZIP 到新文件夹，不能直接在压缩包里运行。
2. 保存网页正在编辑的内容，双击 `RUN-UPDATE.cmd`。需要时输入原有 SSH 私钥口令。
3. 等待 `8/8 COMPLETE GaryHub v1.3.6.1` 以及更新通知收件人数；本机源码随后在独立工作目录准备。
4. 刷新 Tools，必要时 Ctrl+F5。检查三个工具的语言按钮，并在 Markdown 工具里打开含文档与图片的 ZIP。
5. 把安装器末尾输出发回，核实实际生产结果。如果显示 STOPPED，保留末尾报错并停止，按现场证据处理。

安装器沿用 Windows OpenSSH、`%USERPROFILE%\.ssh\garyhub_interserver_ed25519` 和已知主机记录，连接 `root@162.35.168.17`。默认源码仓库 `D:\Codes\Own_Project\garyhub-repo`。可在 PowerShell 使用 Install-GaryHub.ps1 的 Server、KeyPath、Repo 参数调整已有路径。

连续执行：核对版本与能力 → 基于现有镜像离线构建 → 合成账号隔离验证 → 数据库一致性备份和 Lab 文件校验 → 切换 → HTTPS/健康验证 → 未读站内通知与去重 → 本机源码准备。服务切换期间会短暂不可用。

## 中英文切换

图片局部消除、Markdown 实时预览、PDF 浅灰转换和 Tools 入口卡片支持中文/English，沿用全站语言偏好。切换时保留已打开文件、Markdown 编辑内容、图片标记及 PDF 设置；用户文件名、文档正文、代码、公式和图片说明保持原文。

## Markdown ZIP 使用

将文档和配图按原目录结构打包为普通 ZIP，然后选择或拖入预览器。包内多个文档可通过下拉框选择；默认优先打开 README。配图路径以所选 Markdown 所在目录为起点，支持 `./`、包内 `../`、中文文件名及 `%20` 空格。

例如 `book/notes.md` 中的 `![图](images/figure.png)` 对应包内 `book/images/figure.png`；`book/chapter/notes.md` 中的 `../images/figure.png` 指向同一张图片。

支持 Markdown 图片语法、引用式图片和经过过滤的 HTML img。图片格式为 PNG、JPEG、GIF、WebP；外部图片及 SVG 不加载。缺图会显示提示。源码区可展开并编辑，预览实时刷新；切换包内文档时保留各自的编辑内容。编辑只影响当前页面，不会改写原 Markdown 或 ZIP，刷新/关闭页面后不保留这些编辑。

限制：ZIP 最大 20 MiB，最多 500 个条目，解压合计 50 MiB，单个条目最大 10 MiB，Markdown 最大 4 MiB。支持 stored/DEFLATE；不支持加密、多卷、ZIP64、RAR 或 7z。文档使用 UTF-8。损坏或不受支持的包会给出提示，并保留此前成功打开的文档。

所有文件都在浏览器本地处理，浏览器依赖已本地托管，安装不在线下载 npm 依赖。浏览器需要支持原生 deflate-raw 解压流；开发验证使用 Chromium 131。

## 源码和 GitHub

安装成功后，程序复用既有源码导入器，在独立 worktree 核验补丁并准备 `update/garyhub-v1.3.6.1`。原工作区和未提交内容保留；不会自动 push 或合并 main。源码准备遇到问题会显示警告，已成功的服务器升级保持完成状态。

需要同步 GitHub 时，双击外层 `PUSH-TO-GITHUB.cmd`，推送审查分支并打开 PR 页面。核对 PR-DESCRIPTION.md 和改动后创建、合并 PR。已有同名分支会核验再复用，内容不一致时停止。

完整源码补丁、精确 Git blob 清单及导入器位于 `git-source/`；安装缓存位于 `%LOCALAPPDATA%\GaryHub\updates\v1.3.6.1-r1`。本包独立可用，无需保留旧升级包。

## 重试与回滚

成功后重跑不会重复部署或通知。仅通知失败时重跑只重试通知。`ROLLBACK.cmd` 恢复更新前的 v1.3.6.0 应用镜像，保留当前数据库、题库和用户记录；发现后续部署或配置变化时停止回滚。

服务器状态文件 `/opt/garyhub-update-v1.3.6.1-r1/deployment-state.json`；有效部署索引 `/opt/my-services/garyhub-active-deployment.json`。数据库、私有配置、密钥与备份留在服务器，不进入升级包。

本包已完成开发验证；尚无生产 SSH 安装证据或 Windows PowerShell 5.1 实机双击结果。实际部署成功以现场 COMPLETE、HTTPS 和通知验证输出为准。测试明细见 TEST-RESULTS.md。
