# GaryHub v1.3.5.3 · 合并后的审查修复

适用于已经成功安装 **v1.3.5.2** 的服务器。本次保留 PR #11 的合并，在该版本上追加三项修复，无需撤销合并。

## 操作

1. 将 `GaryHub_v1.3.5.3_Update.zip` 完整解压到新文件夹。
2. 保存网页中正在编辑的内容，双击 `RUN-UPDATE.cmd`。
3. 如提示 SSH 密钥口令，输入原来的口令，等待 `8/8 COMPLETE GaryHub v1.3.5.3`。
4. 安装器会尝试在本机建立并提交 `update/garyhub-v1.3.5.3`。成功后双击 `PUSH-TO-GITHUB.cmd`，在打开的页面创建一条新的 PR，审查后合并。

GitHub 合并与服务器部署是两个步骤：原 PR 已合并不影响安装此修复包；新 PR 的推送、合并不会再次部署服务器。不需要来回复制代码。

## 三项修复

- 推送及源码同步脚本校验整个仓库地址，只接受 Gary-BANG/garyhub 的明确 GitHub HTTPS/SSH 地址，拒绝 notgithub.com 等相似域名。
- 两代打包脚本统一排除 `.env`、`.env.*`、大小写变体及其目录中的文件，同时覆盖运行代码、源码、工具、测试和可选功能覆盖文件的复制路径；已知数据库、密钥和私密资料也继续排除。`.env.example` 可作为公开模板保留。显式的私密或链接文件输入使打包停止。
- 登录返回地址接受已有白名单目录的 `index.html` 形式，如 `/lab/index.html`、`/ledger/fixed/index.html`，规范为目录入口，保留查询参数和锚点。允许的域名和功能页面范围保持原规则。

## 安装与数据

沿用现有 Windows OpenSSH、SSH 私钥、服务器镜像、依赖、挂载与环境设置，不保存密钥口令。安装器核对两项服务均为 v1.3.5.2、精确源码摘要及有效部署索引，然后离线构建、隔离联调、备份、切换、HTTPS 验证，并向启用账号发布一次未读站内更新通知。

账号、账目、固定开支、Todo、Lab 记录及可选 TOTP 数据继续使用原数据目录；本次不新增数据库表或依赖。切换 Calendar 和 Tools/Lab 时会短暂不可用。

本机仓库默认 `D:\Codes\Own_Project\garyhub-repo`。来源、工作区和源码基线通过检查后才写入更新分支；若源码同步停止，已完成的服务器更新保留，完整源码和测试位于 `%LOCALAPPDATA%\GaryHub\updates\v1.3.5.3-r1`。请保留末尾输出以核对现场结果。

成功后重跑不会重复部署或通知；通知发布单独失败时重跑只重试该步骤。`ROLLBACK.cmd` 恢复本次更新前的 v1.3.5.2 应用镜像，保留全部当前数据。检测到后续部署、配置变动或未完成的账号删除时停止回滚。

实际部署索引为 `/opt/my-services/garyhub-active-deployment.json`；本次状态记录为 `/opt/garyhub-update-v1.3.5.3-r1/deployment-state.json`。真实备份只保留在服务器受限目录，不进入更新包或 Git。

开发环境未运行用户 Windows PowerShell、生产 SSH 或 Docker。相关检查由安装器在实际服务器上执行；只有完成 HTTPS 与通知核验才报告 COMPLETE。
