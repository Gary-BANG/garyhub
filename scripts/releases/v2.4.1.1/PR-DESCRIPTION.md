# GaryHub v2.4.1.1

修复讲义答疑回答中的公式显示：含 `\text{}`／`\texttt{}` 的公式此前在伙伴对话框里被拆成一列一两个字符。原因是 KaTeX 把公式文字渲染为 `class="mord text"` 的 span，而伙伴面板的气泡规则写成后代选择器 `.msg .text`（`white-space`、`overflow-wrap:anywhere`、内边距），同时作用到了公式内部。现在全部气泡规则改为子选择器 `.msg>.text`，过宽的独立公式在气泡内横向滚动。只改 `companion/panel.css`（两份副本相同）和本版的版本引用；无服务器逻辑、数据库、依赖、Caddy 或 Compose 变化。

基于 main 289662f（PR #43，v2.4.1.0），复用共享更新器并注册自己的 v2.4.1.1-r1 适配器，严格要求实际运行 v2.4.1.0（2026-11-12 tools／calendar `/health` 均为 2.4.1.0）。部署模块沿用 v2.4.1.0 的全部核对，不再携带私有开发者档案（新镜像基于运行中的 v2.4.1.0 镜像构建，档案随镜像保留）。适配器测试新增 CSS 回归检查：气泡规则不得命中 KaTeX 的类名，对旧样式会失败。修复前后的回复渲染流程在浏览器中实测：375 px 宽度下独立公式从 369／236／99 px 高恢复为单行。构建机没有 Node 与 Docker，Node 单元测试与十一组隔离 HTTP 检查由安装器在现场执行。完整验证与限制见 docs/GARYHUB_V2_4_1_1_TESTS.md。

源码已准备、本地验证；生产部署由升级 ZIP 完成，GitHub 合并不代表已上线。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
