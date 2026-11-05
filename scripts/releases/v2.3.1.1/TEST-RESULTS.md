# GaryHub v2.3.1.1 验证记录

2026-11-05，审阅基线 ea6a6d8acf7fc716a6de15d3c21afb165faa6e3c（main / PR #33，v2.3.1.0）。

| 检查 | 结果 |
|---|---|
| 当前清单与共享入口 `manage.py check` | 通过，源码版本 2.3.1.1 |
| 共享更新器 unittest | 37 项：35 通过，2 项因无 pwsh 跳过；覆盖备份、失败恢复、回滚索引与后续升级预检 |
| 本版适配器 `tests/adapter.test.py` | 6 项通过：基线、资产哈希、两能力差异、共享运行时、安装模板、发布通知 |
| `lab-service/test/companion-wiring.test.cjs` | 2 项通过：两服务伙伴副本一致，页面单次加载及同一资源版本 |
| 本版 `tests/tutor-dom.cjs`（jsdom） | 59 项断言通过；真实 Academic 与 panel 代码，模拟接口。隐藏/重开不撤销或重授权，原记录保留，同一讲义继续提问；生成中隐藏后回复保留；显式开关关闭撤销；关闭未完成授权不会被迟到响应恢复；订阅限制、账号/讲义切换、Markdown 安全、公式、switch/tooltip 语义 |
| 真实本地 HTTP：有 TOTP 能力 | 9 组、661 项检查通过 |
| 真实本地 HTTP：无 TOTP 能力 | 9 组、661 项检查通过 |
| 两种能力的通知发布与重试 | 各核对 5 个合成启用账号（含管理员），未读通知、重复发布去重与外键完整性通过 |

HTTP 分组：useful 29、study 24、asset-response 103、music 25、companion 253、sites 59、assistant 63、notifications 30、tutor 75。验证实际服务返回字节，包括受保护页面、公开资源、权限与 CSRF、10 轮记忆、推理参数、撤销与退款。使用合成账号和模拟模型，不访问生产数据或真实收费模型。除本版 study-http 的伙伴缓存版本断言外，复用既有服务测试。

本环境 Chromium 启动在 process_singleton 的 socket 创建处被系统拒绝（Operation not permitted），未完成真实桌面/手机视觉验收。DOM 不包含布局引擎；已检查响应式宽度、tooltip 悬停/聚焦 CSS 与减少动效规则，但不将其记为浏览器通过。Windows 双击、真实 AI 与生产 HTTPS 仍待现场。生产检查继续由安装器执行。

打包使用统一入口，源码提交后仅构建一次；交付阶段另核对外层 SHA256SUMS、内层全部 manifest 哈希、两能力基线、安装器占位符以及源码补丁在基线应用后与提交树完全一致。构建后报告随交付工作记录保存，避免为把包自身哈希写入包而重复构建。

根 README 已检查：当前版本/基线/安装回滚/源码同步/构建示例/文档链接均指向本版，v2.3.1.0 安装说明明确标为历史。源码、本地验证、GitHub 合并与生产部署状态分开；本版未推送、未合并、未部署。
