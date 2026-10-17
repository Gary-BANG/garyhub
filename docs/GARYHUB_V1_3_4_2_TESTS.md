# v1.3.4.2 验证记录

## 开发环境已完成

- Calendar：完整 Node 自动化测试 46 项通过，包含新增 9 组 TOTP、加密、权限、账号等级、三档资料保护、限流及删除测试。
- Tools/Lab：4 项测试通过，包含原有账号隔离、CSRF、并发版本比较和重启持久化。修正旧测试漏传 `accountId` 的请求，使其符合现有生产接口约定。
- 新增 9 组权限测试同时使用生产 `sqlite3` 驱动在 Node 24.19.0 与 Node 20.19.0 通过，没有依赖 Node 22 才提供的内置 SQLite。
- 真实 Calendar + Tools/Lab HTTP 联调在 Node 24、Node 20 通过：原功能 smoke 79 条断言、新功能 38 条断言，以及既有账号生命周期与双币种并发校验。生命周期测试包含停用、改密、网络撤销确认、Lab 重启恢复、删除预览和最终清理；TOTP 授权的两个方向同步清理，其它所有者条目保留，SQLite 外键检查通过。
- Chromium 真实页面 16 项检查通过：添加与改名、六位码和倒计时、输入密钥清空、普通用户无原文按钮、管理员显式查看和关闭清空、限时授权与撤销、三类规则、管理员设置订阅等级、共享账号切换清理旧表单；检查 1365px 桌面与 390px 手机，页面没有横向溢出或未捕获脚本异常。
- 安装器 16 项 Python 测试通过：一致性数据库备份、逐字节 Lab 备份、主密钥生成与复用、0600 私密副本、缺失/错误主密钥保护、精确账号匹配、有效部署索引检查、回滚保留当前数据、重复成功执行及通知失败/重试状态。
- r2 打包回归 6 项：历史两种首页通过线上校验、Git 基线保持严格、未知首页及后端改动仍拒绝并完整列出、审阅样本被改动时拒绝打包、原有 8 个工具链接保留且 TOTP 只出现一次、ZIP 与全部文件完整性、执行实际 Python 引导程序验证首包残留不阻塞 r2 且同一 r2 目录仍拒绝不同包。

RFC 6238 SHA-1 标准向量覆盖 59、1111111109、1111111111、1234567890、2000000000 和 20000000000 秒，验证截取六位及开头零。AES-GCM 测试验证随机 nonce，并拒绝篡改标签、密文、条目 ID、所有者 ID 和错误主密钥。

## 可复现入口

- `cd calendar-app && npm ci && npm test`
- 在仓库根运行 `node --test lab-service/test/*.test.cjs`
- `python3 scripts/releases/v1.3.4.2/tests/deploy.test.py`
- `python3 scripts/releases/v1.3.4.2/tests/package.test.py`
- `python3 scripts/releases/v1.3.4.2/tests/run-local.py`：只创建临时合成账号与数据。
- 浏览器检查：安装 Playwright 及 Chromium 后，设置 `BROWSER_CHECK=1` 运行上述 `run-local.py`；可用 `PLAYWRIGHT_MODULE`、`CHROMIUM_PATH` 指定开发机已安装的工具。
- `python3 scripts/releases/v1.3.4.2/build-package.py /absolute/output/path`：从固定基线生成带校验的一次运行升级包。

## 生产验证边界

开发环境没有连接用户生产 SSH 会话，也没有在用户 Windows 电脑执行 PowerShell。生产 Docker 构建、真实环境变量与挂载、实际数据库备份、真实 HTTPS 和通知人数尚需安装器现场验证，全部通过才会报告 COMPLETE。更新包不包含生产主密钥；开发测试使用公开的合成密钥。

安装器会在现有镜像与 Node 运行时再次执行真实 HTTP、权限和账号生命周期测试，使用内部隔离网络与临时数据挂载；通过后才切换。任何正式源码与审阅基线不符时，停止并保留核对报告，不绕过校验。
