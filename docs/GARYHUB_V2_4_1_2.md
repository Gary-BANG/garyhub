# GaryHub v2.4.1.2 · 讲义答疑代码块不再自动换行

源码基于 main `3b7f794db69a2aa26173206ecc0260e1441736ea`（PR #44 合并的 v2.4.1.1），独立分支 `update/garyhub-v2.4.1.2`。源码准备、本地验证、GitHub 合并与生产验证分别记录；本版尚未部署服务器。

## 问题与改动

**现象**：维护者 2026-11-12 安装 v2.4.1.1 后反馈，公式已正常显示，但讲义答疑回答里的代码块（如 `satp` 寄存器的 ASCII 字段图）在手机上自动折行，对齐的示意图被拆散。

**原因**：伙伴面板的 `.tutoring pre{white-space:pre-wrap;overflow-wrap:anywhere;…}` 允许代码块在任意字符处换行。

**修复**（只改 `companion/panel.css`，Tools/Lab 与 Calendar 两份副本逐字节相同）：代码块规则改为 `.tutoring .msg>.text pre{max-width:100%;overflow-x:auto;white-space:pre;overflow-wrap:normal;word-break:normal;line-height:1.45;…}`。

- 代码块保留原有每一行，过长时在气泡内左右滑动。
- 行距收紧到 1.45，让框线示意图更紧凑。
- 选择器与 v2.4.1.1 一致，只作用于气泡内的代码块。
- 普通文字、行内代码、表格和公式的显示不变。

其余改动只是本版的版本引用（两服务 `/health`、`privacy-ledger-release.json`、学习中心 `release.json`，以及各页面 `?v=` 资源版本），新版本号保证浏览器取到新的 `panel.css`。无服务器逻辑、数据库结构、依赖、Caddy 或 Compose 变化。

## 安装、回滚与源码

完整解压 `GaryHub_v2.4.1.2_upgrade.zip`，在 Windows 双击 `RUN-UPDATE.cmd`。两服务必须实际运行 **v2.4.1.1**：2026-11-12 `tools.garyhub.uk/health` 与 `calendar.garyhub.uk/health` 均返回 `hubVersion: 2.4.1.1`。v2.4.1.1 的安装输出与通知人数未收录，维护者的手机截图显示公式修复已生效。版本、源码、能力或有效 Compose 不匹配时，安装器在改动前停止。

本版注册自己的小型适配器 `scripts/releases/v2.4.1.2/`（安装器 v2.4.1.2-r1），复用共享 `build_overlay.py`、`deploy_runtime.py`、Windows 安装入口和源码导入器。

- **核对链**：部署模块以 `prior_0411.py` 载入 v2.4.1.1 适配器，沿用其公式样式核对；再经 v2.4.1.0 沿用主页／开发者档案核对、v2.4.0.4 的检查与 curl 重试。
- **私有档案**：新镜像基于正在运行的镜像离线构建，私有开发者档案随镜像保留，包内不含私有文件。
- **隔离检查**：沿用十一组。
- **资源哈希**：按本版重算。
- **第 6 阶段新增核对**：三个主机返回的 `panel.css` 含新的代码块规则、不含旧的 `pre-wrap` 规则，两个运行容器中的文件同样已更新。
- **站内通知**：安装完成后向全体启用账号发布一条 `tools` 分类的通知，并核对人数与去重。

`ROLLBACK.cmd` 恢复安装前的 v2.4.1.1 应用和有效配置，保留当前用户记录与设置。`PUSH-TO-GITHUB.cmd` 使用独立 worktree 和审查分支，不强推、不自动合并 main。

构建：`python scripts/updater/manage.py build --release 2.4.1.2 --output <ZIP绝对路径>`。验证范围见 [GARYHUB_V2_4_1_2_TESTS.md](GARYHUB_V2_4_1_2_TESTS.md)；适配器位于 `scripts/releases/v2.4.1.2/`。

## 项目档案历史记录

以下条目于 2026-11-18 从 `docs/PROJECT_CONTEXT.md` 原样移入，是写入当时的记录；其中“尚未推送／合并／部署”等状态描述以写入时为准，后续状态见项目档案的版本索引。

- **v2.4.1.2（PR #45 已合并为 main `2d19775`；2026-11-16 tools／calendar `/health` 返回 2.4.1.2，安装输出与通知人数未收录；以下为交付时记录）** 基于 PR #44 的 main `3b7f794db69a2aa26173206ecc0260e1441736ea`（树与 v2.4.1.1 提交 `013d6c9` 相同），独立分支 `update/garyhub-v2.4.1.2`；清单 `releases/2.4.1.2.json`，适配器 `scripts/releases/v2.4.1.2/`（baseline_adapter v2.4.1.1，安装器 v2.4.1.2-r1，严格要求实际 v2.4.1.1）。讲义答疑代码块不再自动换行：维护者 2026-11-12 安装 v2.4.1.1 后的手机截图显示公式已正常，但 `satp` 字段图等 ASCII 代码块被 `.tutoring pre{white-space:pre-wrap;overflow-wrap:anywhere}` 折行错位。`companion/panel.css`（两份副本相同）改为 `.tutoring .msg>.text pre{max-width:100%;overflow-x:auto;white-space:pre;overflow-wrap:normal;word-break:normal;line-height:1.45;…}`，代码块保留原有行并在气泡内横向滚动；普通文字、行内代码、表格、公式不变。其余变更只是版本引用。`deploy.py` 以 `prior_0411.py` 载入 v2.4.1.1 适配器（再经 `prior_0410.py`、`prior_0404.py`、`prior_checks.py`），沿用公式样式核对与全部更早核对，另核对三个主机与两个容器中的新代码块规则；同样基于运行中的镜像构建，不携带私有档案。隔离检查十一组，站内通知一条 `tools`。无数据库、依赖、Caddy 或 Compose 变化。本地验证：实际回复渲染流程在浏览器中测量，375 px 下 5 行字段图修复前折成 10 行、修复后 5 行并可横向滚动，1280 px 下完整显示；适配器 13 项（WSL）、共享更新器 37 通过／2 个 pwsh 跳过。2026-11-12 tools／calendar `/health` 返回 2.4.1.1。源码已准备／本地已验证，尚未推送、合并或部署。详见 GARYHUB_V2_4_1_2.md 与 _TESTS.md。
