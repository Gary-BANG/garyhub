# GaryHub v2.4.2.0：游戏厅与“白日梦想家”

维护日期：2026-11-20（America/Chicago）。状态：源码已准备、本地验证；未推送、未合并、生产未核验。

基线为 main `ca696d2ae307e5351821687155309c528963a560`（PR #49 合并的 v2.4.1.6），独立分支 `update/garyhub-v2.4.2.0`。需求由维护者 2026-11-20 提出，方案经沟通后批准：多轮规则为“发起人决定每轮揭开几个，参与人决定揭开哪几个”。

## 功能

### 游戏厅 `https://games.garyhub.uk/`

- **入口**：主页导航“更多”菜单新增 “Games”（中文模式显示“游戏厅”，说明“双人轮流小游戏：白日梦想家”），在同一标签页打开。全站搜索（两服务的 `hub-search.js`）和网站伙伴知识库（`games` 词条，需要登录）也能找到。
- **大厅**：夜空背景（Canvas 星点、缓慢漂移的云），白日梦想家卡片显示“N 局轮到你／N 局进行中／新游戏”，另有“更多游戏，敬请期待”占位。
- **语言与外观**：读取共享的 `garyhub_language` Cookie 并跟随账号语言（经 `hub-prefs.js` 的 `GaryHubI18n` 接口），右上角可切换；日夜跟随账号设置，◐ 按钮切换并保存。浅色为晨曦配色。

### 白日梦想家

1. **开局**：发起人设置 10–20 个奖品：金额（0.01–999,999），或礼品（名称 1–30 字、16 个图标之一、可选估值，估值只用于奖池排序与结算比较）。选择币种（CNY／USD／CAD／HKD，默认取记账默认币种）、第一轮揭开的盒子数（0 到 N−2，0 表示直接出价）、可选标题，输入对方用户名邀请。没有账号目录，只列出一起玩过的人。每人最多同时发起 5 局。
2. **封箱**：服务器用 `crypto.randomInt` 打乱，盒子编号 1…N 对应一个奖品；同时生成 16 字节随机盐，公布 `SHA-256(盐 | 顺序)` 作为封箱指纹。顺序和盐只在对局结束后返回。
3. **选盒**：参与人先看到完整奖池和第一轮盒子数，选一个盒子留给自己（即接受邀请），或婉拒。参与人选盒前发起人可以取消。
4. **揭盒**：参与人在其余未开的盒子中点选本轮要求的数量后一次揭开，盒子依次翻面，奖池划掉对应项。
5. **出价**：发起人看到未揭开数、平均值和最高值后出价（可附 60 字以内的话），同时设定“若不卖，下一轮揭开几个”（1 到剩余−1）。只剩一个别的盒子时，这是最后一次出价。
6. **答复**：参与人选择“成交”，或“不卖”进入下一轮（直接开始挑盒子，不用等发起人回来）。
7. **揭晓**：成交或拒绝最后一次出价后，发起人逐个点开剩下的盒子，或使用“依次自动揭开”（在参与人的盒子前停止），最后揭晓参与人的盒子：开盖动画、彩带，结论比较成交价与盒内价值（礼品无估值时不比较），显示“参与人获得”的内容。页面用浏览器的 `crypto.subtle` 核对公开顺序与指纹，徽标变为 ✓。
8. **兑现**：发起人可标记“已兑现”。游戏只做记录，不处理任何付款。

**轮流与通知**：轮到谁，谁就收到一条站内通知（类型 `game`、分类 `home`，主页铃铛可见，按普通通知 14 天到期）；推送跟随该账号“事项提醒”的推送设置和免打扰，点开推送进入该局（`sw.js` 允许打开 games 主机）。页面在等待对方时每 8 秒刷新一次，切回标签页时立即刷新。30 天没有进展的对局过期。

**界面**：盒子是带丝带和金色封蜡编号的礼盒，悬停浮起，选中发光，自己的盒子标“你的盒子／TA 的盒子”；揭开时 3D 翻转。奖池牌按金额从低到高分两列，高额项为金色，礼品单列，揭开的划掉；“过程”列出每轮揭开的盒子、出价、附言与答复。报价以信封卡片呈现。系统开启“减少动态效果”时只保留淡入。手机上盒子 4 列，奖池默认收起。

## 服务器与安全

- **Calendar `games-api.js`**（经 `extras.js` 注册，与其他附加接口同一入口）：
  - `GET /api/hub/games`（我的对局、一起玩过的人、限制）、`POST /api/hub/games`（开局，每 IP 每小时 20 次）、`GET /api/hub/games/:id`、`POST /api/hub/games/:id/{decline|cancel|choose|open|offer|answer|reveal|honor}`（每 IP 每分钟 240 次）。写入核对 `accountId` 与会话一致。
  - 每一步先核对：是对局双方之一（否则 404）、修订号一致（否则 409）、是该步骤的一方（否则 403）、状态允许（否则 409），再以 `UPDATE … WHERE id=? AND revision=?` 一条语句写入；两次同时操作只有一次成功。
  - 返回给双方的数据只含奖池、已揭开盒子的奖品、轮次与指纹；顺序与盐只在结束后返回。
  - 新表 `dream_games`：一局一行（发起人为 `user_id`，参与人为 `player_id`），无外键，已加入账号删除清单（删除发起人的账号时删除其发起的对局）；参与人或发起人账号已不存在的对局由每小时清理删除。
- **可信来源**：`app.js` 在 `TRUSTED_ORIGINS`（或默认列表）之外明确加入 `https://games.garyhub.uk` 这一项，不改 Compose 环境变量，也不放开任意子域；Lab 的 `TRUSTED` 同样加入这一项。
- **Lab `games-host.cjs`**（`server.cjs` 新增 2 行调用，另改 3 行：可信来源、代理路由、版本号）：
  - 游戏主机只提供：大厅与对局页（需要登录，未登录跳转到 `calendar.garyhub.uk/login/?next=` 原页面）、`games.css`／`games.js`／`dream/dream.css`／`dream/dream.js`、共享的 `hub-prefs.js`、站点图标；接口只放行 `/api/csrf`、`/api/me`、`/api/hub/me`、`/api/hub/preferences` 与游戏接口，其余一律 404。
  - 游戏主机页面与脚本带 CSP：`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`。页面没有内联脚本和 style 属性（动态位置用 CSSOM）。
  - 其他主机访问 `/games/` 一律 404。
  - Tools 代理路由同样放行游戏接口（游戏页面只用自己的主机）。
- **共享登录跳转**：两服务 `auth-redirect.js` 加入 `https://games.garyhub.uk` 的 `/` 与 `/dream/`（两份副本相同）。
- 1.3.4.1（无 TOTP）能力组合的 `app.js` 与 `server.cjs` 覆盖做了相同修改，适配器测试核对两者差异逐行一致。

## 安装

1. **安装前在 Cloudflare 添加 DNS 记录**：类型 A，名称 `games`，IPv4 与 `garyhub.uk` 相同，代理状态“仅 DNS”。
2. 要求 Calendar 与 Tools/Lab 实际运行 v2.4.1.6。完整解压 ZIP，双击 `RUN-UPDATE.cmd`。
3. 第 1 阶段在服务器上解析 `games.garyhub.uk`。没有记录，或不指向本服务器（与 `garyhub.uk`／`tools.garyhub.uk` 的解析结果或本机地址比较）时停止，不做任何改动。同一阶段在原 Caddyfile 末尾追加下面的站点块生成候选文件，并在 Caddy 容器内 `caddy validate`；已用不同方式定义该主机则停止。
   ```
   games.garyhub.uk {
       encode zstd gzip
       reverse_proxy garyhub-lab:3000
   }
   ```
4. 新镜像通过十五组隔离检查（新增 `games-http.cjs`）、备份和切换后，确认 Caddyfile 未被他人改动，再原位写入并重载 Caddy。第 6 阶段最多等待 3 分钟让 Caddy 签发证书，然后执行原有全部核对和本版新增核对（见 `scripts/releases/v2.4.2.0/README.md`）。任何一步失败都会自动恢复原 Caddyfile 与 v2.4.1.6 镜像。
5. 第 7 阶段向全部已批准且启用的账号发布一条未读站内通知（home），并核对人数与去重。

## 回滚

`ROLLBACK.cmd` 先确认 Caddyfile 仍是本次写入的内容（被另行修改则停止），恢复原 Caddyfile，再恢复 v2.4.1.6 应用镜像和有效配置，保留当前用户记录；`dream_games` 表保留，旧版忽略。回滚后 `games.garyhub.uk` 不再提供服务；Cloudflare 记录可以保留，也可以手动删除。

## 版本与源码同步

- 两服务健康版本、`privacy-ledger-release.json`、学习中心版本标记（`academic.cjs` RELEASE 与 `academic/release.json`，由 `study-http.cjs` 核对）以及各页面资源的 `?v=` 改为 2.4.2.0；只记录功能出处的注释保留旧版本号。
- 适配器 `scripts/releases/v2.4.2.0/`：`deploy.py` 以 `prior_0416.py` 载入 v2.4.1.6 适配器并沿用全部核对，DNS 与 Caddy 步骤沿用 v2.1.0.0 已审阅的做法（主机名与提示改为 games）；共享更新器未修改。

## 项目档案历史记录

以下条目于 2026-11-21 从 `docs/PROJECT_CONTEXT.md` 原样移入，是写入当时的记录；其中“尚未推送／合并／部署”等状态描述以写入时为准，后续状态见项目档案的版本索引。

- **v2.4.2.0（PR #50 已合并为 main `4511bd7`；2026-11-20 tools／calendar `/health` 返回 2.4.2.0、`games.garyhub.uk` 已响应，安装输出与通知人数未收录；以下为交付时记录）** 基于 PR #49 的 main `ca696d2ae307e5351821687155309c528963a560`（树与 v2.4.1.6 提交 `a05f41c` 相同），独立分支 `update/garyhub-v2.4.2.0`；清单 `releases/2.4.2.0.json`，适配器 `scripts/releases/v2.4.2.0/`（baseline_adapter v2.4.1.6，安装器 v2.4.2.0-r1，严格要求实际 v2.4.1.6）。按维护者 2026-11-20 要求（方案沟通后批准）新增子站 **`games.garyhub.uk`**（游戏厅）与双人轮流游戏“白日梦想家”：发起人设 10–20 个金额或礼品（礼品可选估值），服务器 `crypto.randomInt` 打乱并只公布 `SHA-256(盐|顺序)` 指纹；参与人看奖池后选盒；每轮发起人定揭开数（首轮 0..N−2 在开局时定，之后随出价定“若不卖下一轮揭开几个”，1..剩余−1）、参与人选揭开哪几个；只剩一个别的盒子时为最后一次出价；成交或拒绝最后出价后发起人逐个揭开（可自动依次），最后揭晓参与人的盒子，结束后公开盐与顺序、页面核对指纹；只做记录，不处理付款。Calendar 新文件 `games-api.js`（经 `extras.js` 注册；新表 `dream_games`，一局一行，`user_id`=发起人、`player_id`=参与人，无外键，已入删除清单；每步一条带修订号的条件 UPDATE，双方之外 404、错方 403、过期 409；轮到谁谁收站内通知 type `game`／scope `home`，推送跟随“事项提醒”推送与免打扰；每小时把 30 天无进展的局置为过期并删除账号已不存在的局）。`app.js` 在 `TRUSTED_ORIGINS` 之外**代码中明确加入** `https://games.garyhub.uk`（不改 Compose）；Lab `TRUSTED` 同样加入。Lab 新文件 `games-host.cjs`：游戏主机只给大厅／对局页（需登录，跳转回原页面）、四个静态脚本样式、`hub-prefs.js` 与图标，以及 csrf/me/hub-me/preferences/games 接口，其余 404，CSP `default-src 'none'`；其他主机 `/games/` 404。`server.cjs` 新增 2 行、改 3 行（可信来源、代理路由、版本号），无 TOTP 覆盖逐行相同。两服务 `auth-redirect.js` 加入 games 的 `/`、`/dream/`；`sw.js` 允许打开 games 主机；主页“更多”菜单加 “Games”（`i18n/dictionary.js` 中英）、两份 `hub-search.js` 与伙伴 `knowledge.js`（两份相同）加入口。学习中心版本标记随应用改为 v2.4.2.0。适配器沿用 v2.4.1.6 全部核对，DNS 预检与 Caddy 追加／validate／健康后写入／回滚恢复沿用 v2.1.0.0 做法；游戏文件哈希单独成组（`games_asset_checksums`、`games_page_checksums`）。隔离检查 15 组（新增 `games-http.cjs`，登录地址 192.0.2.221–223）。站内通知一条：home。本地验证：Calendar 128、Lab 113；浏览器以发起人与参与人分别完成整局，中英文、日夜、375 px。**安装前需在 Cloudflare 添加 `games` A 记录（仅 DNS）**。源码已准备／本地已验证，尚未推送、合并或部署。详见 GARYHUB_V2_4_2_0.md 与 _TESTS.md。
