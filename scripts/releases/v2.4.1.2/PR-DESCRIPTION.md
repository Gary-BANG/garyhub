# GaryHub v2.4.1.2

讲义答疑回答中的代码块不再自动换行。v2.4.1.1 修好公式后，维护者反馈 `satp` 寄存器字段图这类 ASCII 代码块在手机上仍会折行错位。原因是 `.tutoring pre{white-space:pre-wrap;overflow-wrap:anywhere}`。现在代码块规则改为 `.tutoring .msg>.text pre{white-space:pre;overflow-x:auto;max-width:100%;…}`：保留原有每一行，过长时在气泡内横向滚动，行距收紧到 1.45。普通文字、行内代码、表格和公式不变。只改 `companion/panel.css`（两份副本相同）和本版的版本引用；无服务器逻辑、数据库、依赖、Caddy 或 Compose 变化。

基于 main 3b7f794（PR #44，v2.4.1.1），复用共享更新器并注册自己的 v2.4.1.2-r1 适配器，严格要求实际运行 v2.4.1.1（2026-11-12 tools／calendar `/health` 均为 2.4.1.1）。部署模块沿用 v2.4.1.1 的公式样式核对和更早的全部核对，另核对三个主机与两个容器中的新代码块规则；适配器测试新增代码块检查。浏览器中用实际回复渲染流程测量：375 px 下 5 行字段图从折成 10 行恢复为 5 行并可横向滚动。构建机没有 Node 与 Docker，Node 单元测试与十一组隔离 HTTP 检查由安装器在现场执行。完整验证与限制见 docs/GARYHUB_V2_4_1_2_TESTS.md。

源码已准备、本地验证；生产部署由升级 ZIP 完成，GitHub 合并不代表已上线。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
