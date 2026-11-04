# GaryHub v2.3.0.3 验证记录

维护日期：2026-11-04（America/Chicago）。状态：本地已验证；**生产已安装并由安装输出核验**；已推送审查分支 `update/garyhub-v2.3.0.1`，未合并。测试在 WSL Ubuntu 22.04 上运行：Node 测试用官方 Node v22.23.4，更新器测试用 Python 3.10.12。

## 生产安装（2026-11-04，维护者发回的安装输出）

- 安装器 v2.3.0.3-r1 依次完成 1/8–8/8：第 1 阶段核对通过，说明两服务当时实际运行 v2.3.0.2（v2.3.0.2 自身的安装输出未收录）；第 3 阶段隔离检查全部通过；“8/8 COMPLETE GaryHub v2.3.0.3. Update notices verified for 8 accounts.”
- `SOURCE_BASELINE=1.3.4.2`（有 TOTP 的组合）。
- 本地源码同步按预期停止：“Remote main does not contain the reviewed base; no patch applied.”——main 仍停在 PR #28，不含基础提交 `9c61d24`。服务器更新不受影响。之后审查分支已普通推送到 `2cbd6d4`，待维护者合并。
- 安装器最后一行仍是从 v2.3.0.1 模板沿用的“GLM-5.3 models now work…”提示，与本版无关（v2.3.0.2 的安装器同样如此）；以后每次发版都要重写这行结束语。

## 已执行

| 范围 | 结果 |
|---|---|
| lab-service `node --test test/*.test.cjs` | 87 通过／0 失败。自 v2.0.1.0 起一直失败的布丁几何检查，改为骨骼角色后通过 |
| calendar-app `node --test test/*.test.js`，在 WSL 临时副本中运行（按锁文件 `npm ci`；sqlite3 从源码编译以适配 GLIBC 2.35） | 87 通过／0 失败；`/health` 返回 `hubVersion` 2.3.0.3 |
| 更新器 `python3 -m unittest discover -s scripts/updater/tests`；`manage.py check` | 37 项通过（2 项按设计跳过）；check 通过 |
| 伙伴脚本 `node --check`（`companion/*.js`） | 通过 |
| 布丁 rig 渲染检查：默认、眨眼、开心+吐舌、o 形嘴、打哈欠、困倦+w、抬爪、趴姿，以及头 ±5°、耳根 ±10°、耳尖 ±18°、尾根 ±12°、尾尖 ±18° 的转动 | 默认姿态与设定图一致；各表情位置正确；只在超出实际使用幅度时才出现细小瑕疵 |
| demo 页（`lab-service/test/companion-demo.html`）记录：下落时耳尖晃动 3.6–4.8°；落地时耳尖 4–5°、尾尖 7°（冲击力度上调后更大）；摸头时为开心眼加吐舌头，尾巴摇到 9°，停下约 1.6 秒后恢复；打招呼时换上抬起的前爪 | 通过 |
| 睡觉：60 秒后困倦脸加 w 形嘴，0.3 秒内淡入趴姿，之后 CSS 呼吸；鼠标靠近后趴姿淡出、打哈欠、恢复睁眼（已修复醒来瞬间闪一下睁眼的问题） | 通过 |
| 安静模式：20 秒内只有眨眼，尾巴不动；普通页面在鼠标靠近期间每 9–18 秒出现摇尾巴、打哈欠等小动作 | 通过 |
| 资源哈希：v2.3.0.2 的 33 项哈希在基础提交 `9c61d24` 上全部复现，确认映射未变；按 Git 索引字节计算 2.3.0.3 的 42 项（新增三个主机上的 `puppet.js`、`pet.css`、`characters/pudding/rig.svg`） | 通过 |
| 无 TOTP 覆盖与主文件的差异仍为 app.js 12 行、server.cjs 7 行 | 通过 |

## 未在本地执行

- 安装器第 3 阶段在 Docker 隔离网络中的 7 项检查、站内通知人数与去重，以及第 6 阶段 HTTPS 核对。这些都由安装器在服务器上执行。
- 手机真机上的手指摸头与动作流畅度。
