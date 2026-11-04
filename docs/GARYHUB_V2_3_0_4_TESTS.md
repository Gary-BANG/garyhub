# GaryHub v2.3.0.4 验证记录

日期：2026-11-04（America/Chicago）。审阅基线：main `c9096802a1e8dd3bba5f56a3bc38ed617df331f3`。本地 Node v24.22.1、Python；应用代码保持 Node 20 兼容，生产 Node/Docker 验证由安装器执行。

| 检查 | 结果 |
|---|---|
| Calendar 相关单元：通知策略、Hub API、迁移、邮箱验证、任务 API | 15 项通过 |
| Lab 伙伴接线与 Reading 代理 | 4 项通过 |
| 更新器、失败恢复、回滚索引保护 | 37 项中 35 项通过，2 项 PowerShell 包导入测试因无 pwsh 跳过 |
| 本版适配器：基线、版本、全部资源哈希、两能力覆盖、隔离测试输入、安装器结束语、发布说明 | 6 项通过 |
| DOM：真实 Tools 脚本、角色变化、图标引用、grid/dock、两个通知面板及 CSRF 请求参数 | 26 条断言通过 |
| 真实 HTTP，有 TOTP 组合 | 8 项脚本、577 条断言通过 |
| 真实 HTTP，无 TOTP 组合 | 8 项脚本、577 条断言通过 |
| 本版发布通知实测 | 5 个启用的合成账号（含管理员），10 条通知；重跑不重复、不重置已读 |
| 修改的 JS/CJS 语法、git diff --check、统一入口清单校验 | 通过 |

## 行为覆盖

- 14 天精确边界、已读与未读消息同时到期、13 天消息保留；账号/安全/必须处理消息即使 90 天仍保留。
- 启动清理与每分钟清理无需用户打开通知；列表读取清理并过滤到期消息。SQLite 文件重开后状态保持。
- 121 条消息超过分页范围仍全部处理；批量操作按当前账号与分类隔离。并发重复删除安全；页面账号与会话不一致返回 409。
- 直接 Calendar 与 Tools/Lab 代理均验证登录、Origin、CSRF；禁用账号不能操作；必要通知不会被批量已读/删除。
- 发布台账不随消息到期删除；清理后重跑旧发布不重新补发。
- Tools 访客、普通用户、订阅用户均隐藏 Reading 说明入口，管理员显示；退出或身份变化立即隐藏。订阅用户仍可使用订阅阅读工具。
- 三个管理员图标引用不同且存在的 SVG symbol；实际 grid/dock 按钮及通知批量按钮的 DOM 行为通过。

HTTP 脚本计数：useful 29、study 19、asset-response 99、music 25、companion 253、sites 59、assistant 63、notifications 30。所有请求使用本地合成数据库与模拟模型服务，未操作生产。

## 复现入口

```bash
node --test calendar-app/test/hub-api.test.js calendar-app/test/notification-policy.test.js calendar-app/test/migration.test.js calendar-app/test/email-api.test.js calendar-app/test/tasks-api.test.js
node --test lab-service/test/companion-wiring.test.cjs lab-service/test/reading-proxy.test.cjs
python -m unittest discover -s scripts/updater/tests -p 'test_*.py'
python scripts/releases/v2.3.0.4/tests/adapter.test.py
python scripts/updater/manage.py check
```

DOM 检查：`JSDOM_MODULE=<测试用jsdom模块路径> node scripts/releases/v2.3.0.4/tests/dom.cjs`。jsdom 仅在临时测试目录安装，不加入生产依赖。

真实 HTTP 检查复用适配器 test_inputs 与 isolation_checks；本地启动实际 Calendar/Lab 服务，配置 CHECK_CALENDAR、CHECK_LAB、CHECK_VERSION、APP_DIR、DATA_DIR 后依次执行。历史 companion-http 的 `/app/public/companion/characters.js` 在本地临时副本中映射至测试源码路径；交付包保持生产容器 `/app` 路径。两能力组合分别运行，未以模拟文件内容替代 HTTP 响应哈希。

## 修复与验收边界

- 检查发现遗漏的发布资源版本标记，已同步 Sites、管理员页及 AI 日志引用；所有资源哈希重新对应实际文件。测试环境的硬编码 `/app` 路径仅在本地临时测试副本适配。
- 本地 Chromium 启动被运行环境的 socket 限制阻止；云浏览器也不允许读取本地文件。因此未完成真实浏览器桌面/手机截图与布局验收。已保留 `tests/browser.cjs` 供具备浏览器的环境继续验收；DOM 测试不等同视觉验收。
- 无 Docker 或 Windows/pwsh，未本地执行 Docker 网络隔离、Windows 双击与生产 HTTPS。安装器继续强制执行 Docker 隔离、备份、健康/HTTPS、资源哈希、通知人数及去重，任一步失败不能宣称完成。
- 最终 ZIP 构建后须检查外层 SHA256SUMS、内层 manifest、两个能力组合的应用文件、源码导入补丁与基线；只有全部通过才交付。构建后的检验结果见交付摘要。

状态：源码已准备、本地上述范围已验证；本版尚未推送/合并，生产未部署。README 当前源码、功能边界、安装基线、构建命令、回滚说明及历史生产证据已同步检查。
