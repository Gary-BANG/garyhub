# GaryHub v1.3.5.0 验证记录

## 已完成

- v1.3.4.2 基线：Calendar 原有 46 项 Node 测试、Tools/Lab 原有 4 项测试通过。
- 两个基线分别运行真实 Calendar + Tools/Lab HTTP 服务，使用生产 sqlite3 驱动和合成数据。每套通过原功能 smoke 79 条、Todo 29 条断言，以及账号生命周期、分阶段删除和双币种并发检查；v1.3.4.2 另通过 TOTP/订阅等级 38 条检查。
- Todo 覆盖：新增与子要点、完成状态、顺序、无截止日期模型、账号绑定、管理员不能跨用户读取、CSRF/Origin、重复请求去重、并发修订冲突、重新登录读取、账号删除与其他用户保留。
- Chromium 真实页面 29 项检查：跨子域语言记忆、用户文本不翻译、切换语言保留 point 草稿、默认折叠、鼠标、手机触摸拖拽与键盘排序、刷新后顺序和折叠状态、未授权 GPA 标题隐藏、授权查看及 390px 手机无横向溢出。
- 英文界面扫描：Homepage、Todo、Calendar 的五个展开面板、Journal、Health、Ledger、Tools、Access、Grades、Study、TOTP、成绩设置和 Admin 均无残留中文界面文案；用户内容被明确排除。
- 本地未访问真实账号、生产数据库、SSH 私钥、邮件令牌、网络连接凭据或 TOTP 主密钥。

- 安装器 6 项测试通过：一致性备份、防覆盖、Lab 逐字节备份、未知源码拒绝、有效 Compose/镜像索引、TOTP 密钥匹配、应用回滚保留当前 Todo 及未完成删除保护。

- 最终压缩包 5 项检查通过：完整性、SSH 引导程序语法、两种版本的资源、排除模块与私密文件、源码和运行覆盖层一致。直接从压缩包还原两套运行目录，分别解析 84 / 90 个 JavaScript 文件并通过实际 HTTP 与账号生命周期联调。

## 可复现

- `cd calendar-app && npm ci && npm test`
- 仓库根：`node --test lab-service/test/*.test.cjs`
- `python3 scripts/releases/v1.3.5.0/tests/run-local.py`
- 设置 `BROWSER_CHECK=1` 并安装 Playwright/Chromium 后运行同一脚本；可用 `PLAYWRIGHT_MODULE`、`CHROMIUM_PATH` 指定已有浏览器。
- `python3 scripts/releases/v1.3.5.0/tests/deploy.test.py`

## 生产边界

没有在本环境执行用户 Windows PowerShell 或生产 Docker/SSH。安装器会在当前 Node 镜像中再次运行隔离联调，随后生成一致性备份、切换镜像、核对 HTTPS 和通知去重。源码不匹配时停止，不将本地测试当作已上线。
