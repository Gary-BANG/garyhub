# GaryHub v2.4.4.1-r1 升级说明

本包将 Calendar 与 Tools/Lab 从 v2.4.4.0 升级到 v2.4.4.1，修复个人网站导航选择 HTML 或文件夹后难以继续的问题。

1. 在已配置原 GaryHub 更新器和 SSH 密钥的 Windows 电脑上完整解压，进入 GaryHub-v2.4.4.1-r1 目录后双击 RUN-UPDATE.cmd。
2. 等待 8/8 COMPLETE GaryHub v2.4.4.1。安装器会核对实际版本、配置和能力组合，执行隔离检查、备份、切换与 HTTPS 校验，再核对站内更新通知的实际人数。
3. 刷新 Tools → 个人网站导航，选好文件后可见文件名和入口。原生选择没有返回文件时，可在面板内的「普通文件选择」中重试。
4. 回滚入口为 ROLLBACK.cmd。它恢复上一版应用并保留当前记录。PUSH-TO-GITHUB.cmd 用于另行同步审查分支。

同目录包含[项目档案](PROJECT_CONTEXT.md)、[版本说明](GARYHUB_V2_4_4_1.md)、[完整验证记录](GARYHUB_V2_4_4_1_TESTS.md)和 SHA256SUMS.txt。
