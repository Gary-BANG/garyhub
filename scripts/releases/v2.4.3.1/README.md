# GaryHub v2.4.3.1 · 合作小车

源码基于 main `e61b20051c4db52b709b01cec04c736134ab0585`（PR #51 合并的 v2.4.3.0），独立分支 `update/garyhub-v2.4.3.1`。本版尚未部署服务器。

## 本版内容

- **合作小车**（游戏厅实时房间，双人）：两人开同一辆车，一人只管方向，另一人管油门、刹车和氮气。3 关（直道起步；S 弯与锥桶；窄桥、跳台与油污），3 颗心、检查点、限时、1–3 星；快捷呼叫；油门手有前方提示与小地图；宽松模式；结束后房主可“再试一次”或“下一关”直接开始。
- **同步**：服务器为准，每秒 20 帧（物理每秒 60 步），页面晚 110 毫秒绘制并插值，自己的操作在本机立即显示；“操作回显”显示从按下到服务器回应的毫秒数。一方掉线立即松开其按键，3 秒后暂停，回来后倒数 3 秒继续。
- **入口**：游戏厅大厅新增“合作小车”卡片；房间页新增游戏选项。

没有新表、没有新依赖，Compose、环境变量与 Caddy 均不变；`app.js` 与 `server.cjs` 只改版本号。

详细说明见 `docs/GARYHUB_V2_4_3_1.md`。

## 安装、回滚与源码

完整解压 `GaryHub_v2.4.3.1_upgrade.zip`，在 Windows 双击 `RUN-UPDATE.cmd`。两服务必须实际运行 **v2.4.3.0**（2026-11-20 生产 `/health` 已返回 2.4.3.0）。

- **核对链**：`deploy.py` 以 `prior_0430.py` 载入 v2.4.3.0 适配器，沿用其全部核对（含房间 socket 经 Caddy 的 401／403／404 门）。
- **Caddy**：第 1 阶段只读核对 `games.garyhub.uk` 站点块仍在；不写入、不恢复。
- **第 6 阶段新增核对**：两个小车脚本的哈希（游戏资源组）、运行容器中的新文件，以及 Calendar 的 `/app/play-car-sim.js` 与 Lab 的 `/lab/public/games/play/car-sim.js` 哈希一致。
- **隔离检查**：十七组，新增 `car-http.cjs`。
- **站内通知**：一条（home）。

`ROLLBACK.cmd` 恢复 v2.4.3.0，保留当前记录与设置；小车房间留在 `play_rooms`，旧版不加载。`PUSH-TO-GITHUB.cmd` 只推审查分支，不合并 main。

构建：`python scripts/updater/manage.py build --release 2.4.3.1 --output <ZIP绝对路径>`。验证范围见 [TEST-RESULTS.md](TEST-RESULTS.md)。
