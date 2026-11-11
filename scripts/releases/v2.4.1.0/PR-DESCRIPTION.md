# GaryHub v2.4.1.0

主页改为星空主题（Canvas 三层视差星空、星座线、流星，CSS 星云与轨道，四张发光入口卡片），不再放个人资料；减少动态效果时静止，后台标签页暂停。个人资料移到新的“开发者档案”页面 garyhub.uk/developer/，从导航“更多”菜单进入，改写为正式双语介绍。服务器只返回当前身份可见的栏目：全部不可见时整页显示“你无权访问”，部分可见时按可见栏目连续编号，不出现“已隐藏”字样。访问规则、访问码与 GPA 单独授权不变；管理页面板改名为“开发者档案访问控制”。

正式文案保存在被 .gitignore 排除的 lab-service/developer-profile.json，只随升级包上传，不进入本 PR；格式示例见 docs/developer-profile.example.json。

基于 main 97ad2f2（PR #42），复用共享更新器并注册自己的 v2.4.1.0-r2 适配器，严格要求实际运行 v2.4.0.4，隔离检查新增 developer-http.cjs（共十一组）；r1 在第 3 阶段因该组登录超过 Calendar 每地址 12 次的限制而停止（生产未改动），r2 让该组用专用测试地址登录。无数据库结构、依赖、Caddy 或 Compose 变化。构建机没有 Node 与 Docker：页面在浏览器中以模拟接口验证（桌面／手机、中英文、全部／部分／无权访问、访问码流程），网站伙伴 865 项意图检查与服务器栏目过滤函数在浏览器中运行通过；Node 单元测试与十一组隔离 HTTP 检查由安装器在现场执行。完整验证与限制见 docs/GARYHUB_V2_4_1_0_TESTS.md。

源码已准备、本地验证；生产部署由升级 ZIP 完成，GitHub 合并不代表已上线。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
