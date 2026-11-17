# GaryHub v2.4.1.4 · 设置中心

源码基于 main `5306dd9b56d753b4b7fd99a92400196b392fe6f8`（PR #46 合并的 v2.4.1.3），独立分支 `update/garyhub-v2.4.1.4`。源码准备、本地验证、GitHub 合并与生产验证分别记录；本版尚未部署服务器。

## 本版内容

- **设置中心**：原来的个性化页（`tools.garyhub.uk/personalize/`）改为设置中心，分为外观、语言与地区、网站伙伴、学习中心、记账与工具台、通知与订阅。每一项改动立即保存，按账号跨设备同步。
- **日夜主题**：一个设置管全站。各页面的 ◐ 按钮保留，切换后全站一起变化并保存到账号。主页与开发者页固定为星空深色。
- **学习中心**：新增行距与正文宽度两项设置。
- **数据库**：新表 `user_preferences`，无外键，回滚时保留不用。没有新依赖，Caddy、Compose 和环境变量都不变。

详细说明见 `docs/GARYHUB_V2_4_1_4.md`。

## 安装、回滚与源码

完整解压 `GaryHub_v2.4.1.4_upgrade.zip`，在 Windows 双击 `RUN-UPDATE.cmd`。两服务必须实际运行 **v2.4.1.3**（2026-11-17 两个 `/health` 均返回 2.4.1.3）。

- **核对链**：`deploy.py` 以 `prior_0413.py` 载入 v2.4.1.3 适配器，沿用其全部核对、本地工具对访客开放的替换检查和 curl 重试。新镜像基于正在运行的镜像构建，包内不含私有文件。
- **隔离检查**：十三组，新增 `prefs-http.cjs`；`study-http.cjs` 换成本版副本，只改了期望的偏好字段。
- **第 6 阶段新增核对**：
  - 偏好接口在三个主机上的登录门，以及写入时的 Origin 门；
  - `hub-prefs.js` 在三个主机上字节相同，并位于页面 `<head>` 中；
  - 设置页的登录门；
  - 两个运行容器中的新文件；
  - `user_preferences` 表已创建（只读查询）。
- **站内通知**：两条（home、tools），核对人数与去重。

`ROLLBACK.cmd` 恢复 v2.4.1.3 应用和有效配置，保留当前用户记录与设置。`PUSH-TO-GITHUB.cmd` 使用独立 worktree 和审查分支，不强推、不自动合并 main。

构建：`python scripts/updater/manage.py build --release 2.4.1.4 --output <ZIP绝对路径>`。验证范围见 [TEST-RESULTS.md](TEST-RESULTS.md)。
