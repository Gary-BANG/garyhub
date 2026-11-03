# GaryHub v2.1.0.0-r1 upgrade

**安装前先在 Cloudflare 添加一条 DNS 记录**：类型 A，名称 `sites`，IPv4 与 `garyhub.uk` 相同（162.35.168.17），代理状态选“仅 DNS”（灰色云朵）。安装器第 1 阶段会从服务器解析 `sites.garyhub.uk`；记录不存在或没有指向本服务器时停止，不做任何改动。

完整解压 ZIP 后，Windows 双击 RUN-UPDATE.cmd。复用既有 OpenSSH 和 SSH 密钥；要求 Calendar 与 Tools/Lab 都实际运行 v2.0.1.0，有／无 TOTP 分别核对源码。不匹配时停止，不能跳过校验。

本次新增“外站链接”页面 `https://sites.garyhub.uk/`：深色背景上有随鼠标散开、带连线的景深粒子、缓慢流动的极光和偶尔划过的流星，点击空白处荡开波纹；中间的列表每行是网站名称和网址，鼠标附近的行按 Tools Dock 同样的弹簧方式放大，旁边浮出该网站的预览图。首批收录 ECE 470 Motion Notes 与光影手记摄影课程。主页“其他”菜单加入入口，网站伙伴也能推荐该页面，并修正了把“有没有……”误判为否定的问题。

页面由现有 Tools/Lab 容器提供：该主机只允许页面、样式、脚本和预览图，使用严格 CSP；其他主机的 `/sites/` 一律 404。安装器在切换前验证带新站点的 Caddyfile，切换并确认两个应用健康后写入 Caddy 并重载，等待证书签发后再做 HTTPS／资源哈希校验。预览图由维护者本机的 `scripts/sites/capture_thumbnails.py` 生成，服务器不访问外部网站。无数据库迁移、无新生产依赖。

安装器执行来源／有效配置核对、DNS 检查、离线构建、合成数据隔离验证（新增 sites-http 检查）、备份、切换、Caddy 更新、HTTPS 和全部批准启用账号的未读站内通知，并核对人数及去重。

ROLLBACK.cmd 恢复本次安装前的 v2.0.1.0 应用与原 Caddyfile，保留当前用户记录；已有后续部署或 Caddy 被另行修改时停止。PUSH-TO-GITHUB.cmd 用独立 worktree 准备并普通推送审查分支，保留原工作区，不强推、不自动合并 main；默认仓库为 `D:\Codes\Own_Project\garyhub`。

SHA256SUMS.txt 和 payload manifest 校验完整文件。功能与验证记录在源码 docs/GARYHUB_V2_1_0_0.md 和 docs/GARYHUB_V2_1_0_0_TESTS.md。请保存最终安装输出用于核对生产结果；交付升级包不代表已上线。
