# GaryHub v2.4.1.1 · 讲义答疑公式显示修复

源码基于 main `289662f545488cea0f52bf9c38a4948985978b88`（PR #43 合并的 v2.4.1.0），独立分支 `update/garyhub-v2.4.1.1`。源码准备、本地验证、GitHub 合并与生产验证分别记录；本版尚未部署服务器。

## 问题与改动

**现象**：学习中心讲义答疑的回答里，含 `\text{}`、`\texttt{}` 的公式（例如 `PA = \texttt{0x0000\_0077\_0000\_5000}`）在对话框中被拆成一列一两个字符，手机上尤其明显。

**原因**：KaTeX 把公式中的文字片段渲染为 `<span class="mord text">`。伙伴面板的气泡样式写成后代选择器 `.msg .text{…white-space:pre-wrap;overflow-wrap:anywhere;padding:8px 12px…}`、`.tutoring .msg.bot .text{white-space:normal}` 等，不仅作用于气泡本身，也作用于公式内部的这些 span，使每段公式文字带上气泡内边距并可在任意字符处换行。只有讲义答疑的回答经过 KaTeX，普通伙伴对话不受影响。

**修复**（只改 `companion/panel.css`，Tools/Lab 与 Calendar 两份副本逐字节相同）：

- 气泡相关的 10 条规则改用子选择器 `.msg>.text`（含 `.msg.bot>.text`、`.tutoring .msg>.text p` 等），只作用于气泡元素本身。`panel.js` 中每条消息的气泡都是 `.msg` 的直接子元素，界面其余样式不变。
- 新增 `.tutoring .katex-display{max-width:100%;overflow-x:auto;overflow-y:hidden;padding:2px 0}`：过宽的独立公式在气泡内横向滚动，不撑出对话框。

其余改动只是本版的版本引用（两服务 `/health`、`privacy-ledger-release.json`、学习中心 `release.json`，以及各页面 `?v=` 资源版本）。伙伴资源按 `?v=` 版本缓存一天，新版本号保证浏览器取到新的 `panel.css`。无数据库结构、依赖、Caddy 或 Compose 变化；讲义答疑的授权、计时、对话记录与权限不变。

## 安装、回滚与源码

完整解压 `GaryHub_v2.4.1.1_upgrade.zip`，在 Windows 双击 `RUN-UPDATE.cmd`。两服务必须实际运行 **v2.4.1.0**：2026-11-12 `tools.garyhub.uk/health` 与 `calendar.garyhub.uk/health` 均返回 `hubVersion: 2.4.1.0`（v2.4.1.0-r2 的安装输出与通知人数未收录）。版本、源码、能力或有效 Compose 不匹配时安装器停止。

本版注册自己的小型适配器 `scripts/releases/v2.4.1.1/`（安装器 v2.4.1.1-r1），复用共享 `build_overlay.py`、`deploy_runtime.py`、Windows 安装入口和源码导入器；部署模块以 `prior_0410.py` 载入 v2.4.1.0 适配器，沿用其主页／开发者档案核对、v2.4.0.4 的检查与 curl 重试。新镜像基于正在运行的 v2.4.1.0 镜像离线构建，已有的私有 `/lab/developer-profile.json` 随镜像保留，因此本包**不含私有文件**，构建也不需要本机的 `developer-profile.json`；沿用的第 6 阶段核对仍会确认运行容器里有该文件。隔离检查沿用 v2.4.1.0 的十一组；资源哈希按本版重算，`/companion/panel.css` 的核对从 Tools 扩展到 garyhub.uk 与 calendar.garyhub.uk。第 6 阶段另外确认三个主机返回的 `panel.css` 含新规则、不含旧的后代选择器，两个运行容器中的文件同样已更新。安装完成后向全体启用账号发布一条 `tools` 分类的站内通知，并核对人数与去重。

`ROLLBACK.cmd` 恢复安装前 v2.4.1.0 应用和有效配置，保留当前用户记录与设置。`PUSH-TO-GITHUB.cmd` 使用独立 worktree 和审查分支，不强推、不自动合并 main。

构建：`python scripts/updater/manage.py build --release 2.4.1.1 --output <ZIP绝对路径>`。验证范围见 [GARYHUB_V2_4_1_1_TESTS.md](GARYHUB_V2_4_1_1_TESTS.md)；适配器位于 `scripts/releases/v2.4.1.1/`。
