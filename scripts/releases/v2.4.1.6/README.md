# GaryHub v2.4.1.6 · 主页与工具台自定义、通知与提醒集中管理

源码基于 main `d0e49a9643a32fa3c64a9774680e457c3b29c8e9`（PR #48 合并的 v2.4.1.5），独立分支 `update/garyhub-v2.4.1.6`。本版尚未部署服务器。

## 本版内容

- **主页**：选择“今天”面板显示哪些卡片和顺序，新增“本月预算”卡；入口卡片可排序。
- **工具台**：置顶常用工具（最多 8 个），隐藏用不到的工具（搜索仍能找到），顶部显示“最近使用”。
- **通知与提醒**：
  - 网站更新、事项提醒、A 股到价提醒分别选择站内、推送或邮件；网站更新始终保留站内通知；
  - 推送免打扰时段；
  - 新建事项的默认提醒；
  - 已开启推送的设备列表，可逐台移除；
  - 日历订阅的生成和关闭。

没改过设置的账号行为不变。新增一张表 `notify_deliveries` 和一个可空列 `push_subscriptions.label`；没有新依赖，Caddy、Compose 和环境变量都不变，提醒 worker 也不改动、不切换。

详细说明见 `docs/GARYHUB_V2_4_1_6.md`。

## 安装、回滚与源码

完整解压 `GaryHub_v2.4.1.6_upgrade.zip`，在 Windows 双击 `RUN-UPDATE.cmd`。两服务必须实际运行 **v2.4.1.5**。

- **核对链**：`deploy.py` 以 `prior_0415.py` 载入 v2.4.1.5 适配器，沿用其全部核对。
- **第 6 阶段新增核对**：
  - 通知接口在三个主机上的登录门，以及写入的 Origin／令牌门；
  - 三个页面脚本中的新代码；
  - 两个运行容器中的新文件；
  - 新表与新列（只读查询）。
- **隔离检查**：十四组，新增 `notify-http.cjs`，`prefs-http.cjs` 换成本版副本。
- **站内通知**：三条（home、tools、calendar）。

`ROLLBACK.cmd` 恢复 v2.4.1.5，保留当前记录与设置。`PUSH-TO-GITHUB.cmd` 只推审查分支，不合并 main。

构建：`python scripts/updater/manage.py build --release 2.4.1.6 --output <ZIP绝对路径>`。验证范围见 [TEST-RESULTS.md](TEST-RESULTS.md)。
