# GaryHub v2.2.0.0 验证记录

维护日期：2026-11-03（America/Chicago）。状态：源码已准备、本地已验证；未推送、未合并、生产未核验。

## 环境

- Windows 11、Python 3.10、Git 2.52、PowerShell 5.1。
- WSL Ubuntu 22.04，装有官方 Node.js：
  - v20.20.2：与生产镜像同为 Node 20，用于启动服务和语法检查。
  - v22.23.4：测试辅助代码使用 `node:sqlite`，需要 Node 22。
- calendar-app 依赖按 `package-lock.json` 执行 `npm ci --build-from-source`。
- 测试在 WSL 中的 LF 副本里运行；Claude 桌面浏览器用于检查伙伴面板。

## 已执行

| 范围 | 结果 |
|---|---|
| calendar-app 全部 `node --test`（含新增 `assistant-api.test.js`：确认前不写入、他人确认 404、重复确认 409、取消后不可再确认、删除流程、分类匹配与错误回传、92 天范围、`open_page` 权限、上游 401 映射、每日上限、Key 不出现在任何响应、管理操作审计、用户时区） | 86 通过／0 失败 |
| lab-service 全部 `node --test` | 85 通过／2 失败（见下） |
| 本地隔离联调：种子数据 + Calendar 与 Tools/Lab（Node 20）+ 模拟模型服务，运行 `assistant-http.cjs` | 36 项断言通过 |
| 同一环境运行 `asset-response.cjs`（新配置 10 个资源与 Lab 受保护页）、`companion-http.cjs`（两服务 41 个伙伴文件一致、缓存、主页白名单）、`music-http.cjs` | 45、301、25 项通过 |
| r2：按 release-config 复制全部测试输入，依次运行全部 7 项隔离检查（useful 29、study 19、asset-response 45、music 25、companion 301、sites 59、assistant 36） | 全部通过 |
| 站内通知 `publish-hub-release.js garyhub-2.2.0.0.json` 连续两次 | 首次 5 个账号（含管理员）、20 条；第二次 `alreadyPublished`，人数相同 |
| 无 TOTP 覆盖：与主文件的差异仍为原有的 7 行（server.cjs）与 12 行（app.js） | 通过 |
| 两服务伙伴文件逐字节一致；中英文词典两份一致 | 通过 |
| 浏览器（伙伴演示页 `?ai`，模拟助手）：AI 副标题、快捷问题与输入提示、使用说明、添加卡片（日期范围、分类、提醒、备注）、页面卡片、删除卡片、确认后“已添加到日程 ✓”、次数提示 | 通过 |

## 发现并处理

- r1 在服务器第 3 阶段停止（未部署）：`sites-http.cjs` 要求外站页引用 `?v=<本次版本>`，而页面仍写着 2.1.0.0。r1 本地联调只挑选了部分检查，漏掉了这一项。r2 更新了这四处版本号，本地联调改为按配置运行全部检查。
- v2.1.0.0 遗留问题：`companion-brain.test.cjs` 把新增的 `public` 访问级别当成受限，导致“外站”被判为泄露。已改为直接使用 `knowledge.permitted` 判断。
- AI 模式下输入框仍显示本地向导的示例，已改为日程示例。
- 新表原本设计了指向 users 的外键。这样回滚到 v2.1.0.0 后，旧版删除账号的结构检查会拒绝执行，因此改为不设外键、删除账号时显式清除。

## 已知问题（未在本版修改）

- `companion-characters.test.cjs` 的栗栗、布丁两项几何检查失败：挂绳点 y=150 在显示框（y 从 167 起）上方 17 个单位。这是 v2.0.1.0 起就存在的问题，浏览器中显示正常。修正需要调整角色取景，未纳入本次助手更新。

## 未在本地执行

- 真实模型调用（需要管理员的智谱 API Key），以及生产容器访问 `open.bigmodel.cn` 的外网连接。
- 安装器第 3 阶段在 Docker 隔离网络中运行的其余检查（useful、study、sites），以及第 6 阶段 HTTPS 核对。
- 移动端真机、Safari。浏览器截图在此环境中不稳定，卡片布局主要通过 DOM 与一张桌面截图核对。
