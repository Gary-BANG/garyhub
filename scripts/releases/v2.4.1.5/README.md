# GaryHub v2.4.1.5 · 补齐外观、地区与学习中心设置

源码基于 main `0041a4ef2752fa5473bc6775452c864b3f68f17a`（PR #47 合并的 v2.4.1.4），独立分支 `update/garyhub-v2.4.1.5`。本版尚未部署服务器。

## 本版内容

设置中心新增七项设置，都随账号保存：

- **外观**：强调色（默认、蓝、紫、青、暖棕），界面密度（标准、紧凑）。
- **语言与地区**：
  - 每周开始于（周一、周日）；
  - 日期格式（四种）；
  - 日历默认视图（月、周、列表），日历上方同时新增“月／周／列表”切换按钮。
- **学习中心**：代码字体，公式大小（80%–150%）。

学习中心与本地工具保留各自的配色。没有新表，也没有新依赖、Caddy、Compose 或环境变量变化。

详细说明见 `docs/GARYHUB_V2_4_1_5.md`。

## 安装、回滚与源码

完整解压 `GaryHub_v2.4.1.5_upgrade.zip`，在 Windows 双击 `RUN-UPDATE.cmd`。两服务必须实际运行 **v2.4.1.4**。

- **核对链**：`deploy.py` 以 `prior_0414.py` 载入 v2.4.1.4 适配器，沿用其全部核对。
- **第 6 阶段新增核对**：三个主机的 `brand.css` 字节相同，并含强调色与密度规则；学习中心页面退出全站强调色；两个运行容器中的新文件。
- **隔离检查**：仍为十三组，`prefs-http.cjs` 与 `study-http.cjs` 换成本版副本。
- **站内通知**：两条（home、tools）。

`ROLLBACK.cmd` 恢复 v2.4.1.4，保留当前记录与设置。`PUSH-TO-GITHUB.cmd` 只推审查分支，不合并 main。

构建：`python scripts/updater/manage.py build --release 2.4.1.5 --output <ZIP绝对路径>`。验证范围见 [TEST-RESULTS.md](TEST-RESULTS.md)。
