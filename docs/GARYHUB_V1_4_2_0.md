# GaryHub v1.4.2.0

基础版本 v1.4.1.0；基础提交 `18cb483b3417b51686ab37b09ac2a69499233c71`（main / PR #19）。本次仅准备升级包，实际安装结果以服务器输出为准。

## 功能

- Tools 新增管理员专属 Server Monitor：CPU、内存已用/可用/缓存、Swap、RSS 进程排行、磁盘与主要目录、Docker 空间和容器资源、VPN 服务与握手探测、按用户统计的今日/本月/累计上传下载。监控由本机 systemd 定时采集，经管理员接口展示；不向 Web 容器开放 Docker Socket，也不公开 Xray 管理接口。
- Files、Status、Server Monitor 仅管理员可见及可访问；Reading 对管理员及 `subscriber` 账号开放。网格、搜索和 Dock 共用权限判断；加载中或身份失效时隐藏受限项目。Caddy 对 Files/Status 的所有路径先验证 GaryHub 权限。它们各自原有的服务登录仍保留。
- Reading 仍使用当前 Miniflux 镜像及 PostgreSQL 数据，网页入口沿用 GaryHub 登录。Lab 网关逐请求检查启用状态与当前等级，清除客户端身份头及 API 凭据，再注入经过验证的 Miniflux 身份。Miniflux Cookie 按 GaryHub 用户和关联目标隔离，防止换号后沿用另一账号的阅读会话。
- 新账号首次进入自动创建独立阅读空间。Tools 的 Reading 使用说明链接可用原 Miniflux API Token 关联已有账号；Token 只用于内部 `/v1/me` 验证，不保存。关联具有唯一性、CSRF、当前账号、角色及并发保护；Reading 管理账号只能关联 GaryHub 管理员。两个阅读空间不自动合并，原数据不删除。本版提供统一网页登录，不开放第三方 RSS 客户端 API。
- Calendar、Journal、Health、Ledger、Todo List 导航下新增每日金句，位于标题介绍上方。内置 24 条有出处的公版短句及自译英文，按账号 IANA 时区的日期稳定选取，不调用外部接口，不因刷新或切页改变。
- Research Dictionary 增加适配明暗主题的粒子；减少动态效果时停止运动，隐藏页面暂停。新增音乐按钮后重新调整手机导航换行。
- 所有已有 `sky` 粒子背景页面及 Research、Server Monitor 使用同一首原创 96 秒《Quiet Steps》，低音量循环。按钮在明暗切换左边，实际播放时唱片转动；暂停时显示禁止音符并停止。记住设备上的开关和播放进度，以同站 Cookie 协调跨页面/子域的播放租约。首次默认尝试播放；浏览器拦截时等待点击按钮。手动关闭后不会在下一页重新开启。

## 数据与指标含义

Reading 新增 `reading_links`，归属当前账号，并纳入账号删除预览和清理。删除 GaryHub 账号会移除关联；Miniflux 旧内容继续受独立数据保留策略管理，网页访问立即受 GaryHub 启用/权限检查控制。回滚到旧版后，旧账号删除器可能对新关联表要求审阅，不得绕过它。

无 TOTP 的历史能力组合保留无 TOTP 状态；如数据库尚无等级列，本次增量补充 `standard` 默认等级及版本号，提供与另一组合一致的管理员等级修改接口，无 TOTP 组合不打包仅有 TOTP 组合使用的页面，不假定缺失的可选历史模块一定存在，不自动给其他账号开通订阅。

监控私有状态为 `/var/lib/garyhub-monitor/state.json`，只读公共快照目录挂入 Lab `/server-metrics`。公开 HTTP 接口始终要求管理员。采集不记录 VPN UUID、订阅令牌、访问目标、完整进程命令或环境变量。主要目录每小时更新，扫描限时；其他数据约每 30 秒采样。缓存、目录父子及 Docker 共享层不能直接相加。

VPN 稳定度是服务器到本机 HTTPS/WSS 入口的握手结果，不等于端到端代理成功率或每位用户的当地网络质量。“近期活动”依据流量变化，不伪装为精确在线人数。VPN 用户计数为应用流量，不含所有 TLS/传输开销；按 UTC 日/月累计，自启用采集起计算，重启前未采样的流量可能缺失，界面显示重置提示。没有数据时显示“未采集”，采样过期时提示。

## 安装、检查与恢复

复用 `scripts/updater/manage.py`、`build_overlay.py`、`deploy_runtime.py` 与既有 Windows 安装/源码导入器。本版新增独立清单、小型适配器和 host integration 模块；共享运行时仅增加可选生命周期 hooks、明确的隔离测试环境和有效外部服务配置记录。

安装器严格核对两个 Web 服务实际 v1.4.1.0、对应源码及有/无 TOTP 能力、有效 Compose 与共享 Secure Cookie。额外核对 Miniflux 2.x、唯一的相关服务、私有网络、无公网后端端口、Caddy 结构、Xray 配置与本机统计端口；未知现状会停止，不放宽匹配。

基于现有镜像离线构建，运行两项应用隔离检查及通知去重，并在独立内部网络中以服务器当前 Miniflux/PostgreSQL 镜像额外验证真实代理认证、自动建号及会话隔离。该现场检查不使用正式数据库。正式 Miniflux 数据先 `pg_dump -Fc` 并通过 `pg_restore --list` 核验；现有 SQLite online backup、Lab 字节校验、TOTP 密钥备份保护保留。

启用统计需要为 Xray 增加仅监听 `127.0.0.1:10085` 的 StatsService，并重启一次；VPN 会短暂重连。授权同步器使用原锁与原有客户凭据。切换后核对版本、HTTPS 字节、匿名权限拒绝、监控快照及 VPN 统计可用，再发布全体启用账号的未读站内通知，重复执行验证不重发。

`ROLLBACK.cmd` 恢复 v1.4.1.0 镜像、原 Caddy/Miniflux 配置及原统计设置，停用本次采集定时器；保留当前 Calendar、Lab、Miniflux 及监控历史数据。Xray 回滚仅撤销本次统计字段，保留其后新增的 VPN 用户与其他非统计配置。后续部署、外部配置、镜像或统计设置变化时停止自动覆盖并要求审阅。

源码同步继续使用独立 worktree，保护已有工作，不强推、不自动合并 main。

## 安装器 r3 修复

用户报告 r2 在 1/8 提示 `Expected one running miniflux-db service`。原因是安装器将历史架构记录里的服务名当作固定标识；该错误发生在 host integration 准备阶段，未执行镜像/服务切换，未发布本次通知。

r3 从当前 Caddy 的 Reading/Files/Status 上游确定目标，在对应源容器的真实网络命名空间解析主机地址，并与同网络的运行容器 IP 唯一匹配。数据库连接来自当前 Miniflux 的 DATABASE_URL、DATABASE_URL_FILE 或明确配置文件，支持 PostgreSQL URI 和关键字格式。随后只读验证实际数据库名、数据库用户和服务器端口，成功才备份该数据库；不再依赖 miniflux-db 服务标签或 POSTGRES_DB/POSTGRES_USER 默认值。

密码经 stdin 传给容器内的备份客户端，不进入命令行、控制台或兼容报告。多个匹配、外部数据库、未知配置或身份不符继续停止，不绕过保护。Reading 内部服务地址与测试 PGDATA 也来自现场证据。r3 使用独立本地/服务器缓存目录，完整解压后可直接重新运行 RUN-UPDATE.cmd；对这次 r2 检查阶段的停止不需要回滚。

## 安装器 r4 修复

用户 r3 输出表明：实际数据库识别及离线镜像构建通过，3/8 隔离测试停止，尚未执行正式服务切换。原错误没有具体 Docker 子命令，不能仅凭该输出确认全部底层原因。检查发现安装器缺少测试专用 Origin，而原本地运行器单独加入了它；按 r3 配置本地复现 features-http.cjs 的模拟登录 403（期望 200）。

r4 为一次性测试容器加入准确的 `http://calendar-check:3000` Origin，并让本地测试直接读取同一发布配置；正式服务的 Origin 设置不受此修改影响。两种能力组合的真实 Node 20 HTTP 检查及合成通知核验均通过。隔离测试失败时标明具体步骤、固定错误码、数字/布尔断言结果和私有日志位置；临时容器删除前先保存其日志，任意异常文本、请求正文和凭据不显示到控制台。

完整解压 r4 到新目录后双击 RUN-UPDATE.cmd；这次 r3 在切换前停止，无需回滚。版本仍为 v1.4.2.0，生产完成及实际通知人数继续以现场成功输出为准。
