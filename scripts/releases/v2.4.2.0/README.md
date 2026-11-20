# GaryHub v2.4.2.0 · 游戏厅与“白日梦想家”

源码基于 main `ca696d2ae307e5351821687155309c528963a560`（PR #49 合并的 v2.4.1.6），独立分支 `update/garyhub-v2.4.2.0`。本版尚未部署服务器。

## 本版内容

- **游戏厅 `https://games.garyhub.uk/`**：主页“更多”菜单新增入口，用 GaryHub 账号登录；目前只有“白日梦想家”。
- **白日梦想家**（双人，不需要同时在线）：
  - 发起人设置 10–20 个金额或礼品（礼品可选填估值），输入对方用户名邀请；服务器打乱封箱，只公布封箱指纹；
  - 参与人看到奖品清单后选一个盒子；每轮由发起人决定揭开几个，参与人挑选揭开哪几个，发起人再出价收购；
  - 成交，或拒绝最后一次出价后，发起人逐个揭开剩余盒子，最后揭晓参与人的盒子；结束后公开顺序，页面自动核对指纹；
  - 轮到谁时，谁收到站内通知；推送跟随“事项提醒”的推送设置与免打扰；
  - 只做记录，不处理任何付款。
- **其他入口**：全站搜索与网站伙伴都能找到“游戏厅”。

新增一张表 `dream_games`（无外键，已加入账号删除清单），没有新依赖，Compose 与环境变量不变。**Caddy 新增一个站点块**（见下）。

详细说明见 `docs/GARYHUB_V2_4_2_0.md`。

## 安装前：Cloudflare DNS

在 Cloudflare 添加 **A 记录**：名称 `games`，IPv4 与 `garyhub.uk` 相同，代理状态 **仅 DNS**（灰色云朵）。没有这条记录，或记录不指向本服务器时，安装器在第 1 阶段停止，不做任何改动。

## 安装、回滚与源码

完整解压 `GaryHub_v2.4.2.0_upgrade.zip`，在 Windows 双击 `RUN-UPDATE.cmd`。两服务必须实际运行 **v2.4.1.6**。

- **核对链**：`deploy.py` 以 `prior_0416.py` 载入 v2.4.1.6 适配器，沿用其全部核对。
- **第 1 阶段新增**：解析 `games.garyhub.uk` 并与本服务器比对；在原 Caddyfile 末尾追加下面的站点块，生成候选文件并在 Caddy 容器内 `caddy validate`。Caddyfile 已以别的方式定义该主机时停止。
  ```
  games.garyhub.uk {
      encode zstd gzip
      reverse_proxy garyhub-lab:3000
  }
  ```
- **第 5 阶段**：两服务切换并健康后，确认 Caddyfile 未被改动，再原位写入并重载 Caddy。
- **第 6 阶段新增核对**：最多等 3 分钟签发证书；游戏脚本与样式哈希、两个游戏页面的容器文件哈希与登录跳转、CSP、该主机对其他文件和接口返回 404、其他主机不暴露 `/games/`、游戏接口的登录门与 Origin／令牌门、主页入口、运行容器中的新文件、新表（只读查询）。
- **隔离检查**：十五组，新增 `games-http.cjs`。
- **站内通知**：一条（home）。

`ROLLBACK.cmd` 先确认 Caddyfile 仍是本次写入的内容（被另行修改则停止），恢复原 Caddyfile，再恢复 v2.4.1.6，保留当前记录与设置；`dream_games` 表保留，旧版忽略。回滚后 `games.garyhub.uk` 不再提供服务，Cloudflare 记录可以保留。`PUSH-TO-GITHUB.cmd` 只推审查分支，不合并 main。

构建：`python scripts/updater/manage.py build --release 2.4.2.0 --output <ZIP绝对路径>`。验证范围见 [TEST-RESULTS.md](TEST-RESULTS.md)。
