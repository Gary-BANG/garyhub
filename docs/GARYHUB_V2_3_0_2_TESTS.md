# GaryHub v2.3.0.2 验证记录

维护日期：2026-11-04（America/Chicago）。状态：本地已验证；未推送、未合并，生产未核验。Node 测试在 WSL Ubuntu 22.04 用官方 Node v22.23.4 运行；更新器测试用 WSL 的 Python 3.10.12。

## 已执行

| 范围 | 结果 |
|---|---|
| calendar-app `node --test test/*.test.js`（WSL 临时副本按锁文件 `npm ci`；sqlite3 预编译包需要 GLIBC 2.38，Ubuntu 22.04 为 2.35，改为从源码编译） | 87 通过／0 失败 |
| lab-service `node --test test/*.test.cjs` | 86 通过／1 失败。失败为布丁几何检查（挂点在画布外，自 v2.0.1.0 起存在）；v2.3.0.1 记录中同样存在的栗栗几何失败已因改为骨骼角色而通过 |
| 更新器 `python3 -m unittest discover -s scripts/updater/tests`（WSL；Windows 上符号链接权限与 `fcntl` 两类用例无法运行） | 37 项通过（2 项按设计跳过） |
| `manage.py check`；`plan --base 5a45333` 列出的改动组为伙伴静态文件、版本引用与发布工具 | 通过 |
| 栗栗 rig 静态检查（按 `companion-characters.test.cjs` 规则在浏览器中对实际文件运行）：方形画布、挂点／脚／边界／旋转中心在画布内、上限 ≤10、SVG 无脚本或外部引用、所需部件 id 齐全 | 通过 |
| demo 页（`lab-service/test/companion-demo.html`，本地静态服务）逐帧记录栗栗下落：fall 为 o 形嘴，开伞微笑，着地闭眼，起身 ^ ^，idle 睁眼并眨眼；打招呼时爪转到约 −7° 且为开心眼 | 通过 |
| 着地倾角（同一记录）：栗栗 0.65°、米露 0.94°（修改前约 6.7°）；空中摆动仍约 4° | 通过 |
| 各部件转到上限（头 ±4°、尾 ±3°、耳 ±2°、爪 ±8°）渲染检查：无空洞或缝隙 | 通过 |
| 站内通知 `garyhub-2.3.0.2.json`：scope 均为 home／tools／calendar，标题与正文非空（`hub-api.js` 的 `publishRelease` 校验规则） | 通过 |
| 资源哈希：先以 v2.3.0.1 配置在基础提交 `5a45333` 上反向验证“路由→文件”映射（33 项 0 不一致），再按 Git 索引中的字节计算 2.3.0.2 哈希（工作区 `core.autocrlf=true` 会把未改文件检出为 CRLF，不能按工作区字节计算） | 通过 |
| 升级包中的应用文件与 Git 中的字节一致（`server.cjs` 与一个测试文件在工作区为 CRLF，已写回 LF） | 通过 |
| 无 TOTP 覆盖与主文件的差异：app.js 12 行、server.cjs 7 行，与 v2.3.0.1 相同 | 通过 |

## 未在本地执行

- 安装器第 3 阶段在 Docker 隔离网络中的 7 项检查（useful、study、asset-response、music、companion、sites、assistant）与站内通知人数／去重，以及第 6 阶段 HTTPS 核对。这些由安装器在服务器上执行，失败会在切换前停止。
- 手机实机上的栗栗动作与性能。
