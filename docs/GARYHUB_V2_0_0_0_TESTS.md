# GaryHub v2.0.0.0 验证记录

维护日期：2026-11-03（America/Chicago）。状态：源码已准备、本地部分验证；未推送、未合并、生产未核验。

## 环境

Windows 11、Python 3.10、Git 2.52、PowerShell 5.1、Claude 桌面浏览器（Chromium）；更新器测试另在 WSL Ubuntu 的 Python 3 中运行。**构建机未安装 Node.js**：没有运行 `node --test`、Calendar/Lab 服务或本地 Docker。

## 已执行

| 范围 | 结果 |
|---|---|
| 意图匹配回归（`lab-service/test/companion-cases.cjs`：58 条中英文单句 + 4 段多轮对话，共 67 个检查点） | 浏览器中对实际 `brain.js`/`knowledge.js` 运行，全部通过 |
| 权限：每个目录说法以访客身份询问，不出现管理员／订阅工具；每个说法以管理员身份能到达对应工具 | 通过 |
| 五个角色台词键完整；角色清单几何在 viewBox 内；米露 SVG 无脚本、嵌入文档或外部引用，所需图层齐全 | 通过（与 `companion-brain/characters.test.cjs` 相同的断言，在浏览器中执行） |
| 动作：自由放置、重力下落→开伞→着地→起身→待机完整流程；开伞、下落、着地、起身、挥爪逐帧渲染检查 | 通过 |
| 交互：点击打开对话并定位在米露旁、Esc 关闭并归还焦点、方向键／Shift／Home、素材加载失败退回普通聊天按钮 | 通过 |
| 页面：Tools 与 Calendar 账本页以两个服务 `public/` 的静态副本运行；桌面与窄屏、日夜主题；加载顺序、默认显示／收起、设置菜单、共享 Cookie、边缘标签恢复、工具卡片 | 通过 |
| 接线：两服务 companion 与 `tools-catalog.js` 逐字节一致；11 个页面同一资源版本 2.0.0.0；登录／注册／改密码／Reading 未加载 | 通过（PowerShell 哈希比对，与 `companion-wiring.test.cjs` 相同规则） |
| 1.3.4.1 能力组合覆盖：与 v1.4.3.2 覆盖相比只有健康版本、首页白名单与缓存三处修改 | 已对比 |
| 资源哈希：由已提交 Git blob（LF）计算；三个未改动的受保护 Tools 页面与 v1.4.3.2 记录一致 | 已核对 |
| `manage.py check`、更新器单元测试、Python／JSON 语法、PowerShell 模板解析、最终 ZIP 内容与哈希 | 见下节 |

## 现场记录

- **r1（2026-11-03）**：服务器第 1、2 阶段通过（版本、源码基线、有效配置核对，离线构建）。第 3 阶段隔离检查 `companion-http.cjs` 停止：断言首页主机 `/admin.html` 为 404，实际 302。原因是 `server.cjs` 在首页白名单之前对管理页做登录跳转，属既有行为；测试与第 6 阶段校验的假设错误。停止前已通过的断言包括两服务米露资源逐字节一致与带版本缓存头。未备份、未切换、未发通知，生产仍为 v1.4.3.2。
- **r2**：只修正检查——首页主机对既有未列入白名单的 Tools 文件（`/tools-dock.js`、`/hub.js`，以及从 `/companion/` 用 `..`／`%2e%2e` 逃逸的路径）断言 404，对 `/admin.html` 断言 302；第 6 阶段 HTTPS 校验同步修正。应用代码与 r1 相同。

## 发布工具与安装包

- `manage.py check`：通过（Windows 与 WSL）。
- 更新器单元测试（WSL Ubuntu、Python 3.10.12，新克隆）：37 项，通过，2 项需要临时远端的推送集成测试跳过。Windows 上 4 项因 `fcntl` 与符号链接权限无法导入或执行，属平台限制。
- Python 语法、四个 JSON（清单、指针、适配器配置、站内通知）、PowerShell 安装模板解析：通过。
- 构建在 WSL 的新克隆中执行（LF 字节）。最终 ZIP 检查一次：外层 SHA256SUMS 与 payload manifest 全部匹配；安装脚本的包哈希、版本 v2.0.0.0／构建 v2.0.0.0-r2／要求 v1.4.3.2 已替换且无残留占位符；三个 CMD 为 CRLF；payload 无 CRLF；两个能力组合各 15 个基线文件、27 个新路径，1.3.4.1 版不含 TOTP 路由与注册而包含三处米露修改；包内 `rig.svg` 与 Tools 首页的哈希与 HTTPS 校验配置一致；九个隔离检查输入齐全（含 `companion-http.cjs`）；源码同步分支为 `update/garyhub-v2.0.0.0`。

## 未在本地执行

- Node 测试套件（含 `companion-brain/characters/wiring.test.cjs`）与 Calendar/Lab 既有回归。
- 隔离 HTTP 检查（`useful-http`、`study-http`、`asset-response`、`music-http` 与新增 `companion-http.cjs`）以及第 6 阶段 HTTPS 校验器。安装器会在新镜像中用合成账号先运行隔离检查，失败即停止，不切换服务。
- Safari／iOS 真机、真实账号的访客／普通／订阅／管理员差异、生产性能与帧率。
