# GaryHub v2.3.1.0 验证记录

日期：2026-11-04（America/Chicago）。基础提交 `c87e7efcf690fff40a6e4a53b63eac8f5bb6d837`。本地 Node 24.22.1/Python；运行代码使用 Node 20 可用 API，生产 Docker/Node 20 由安装器隔离检查。

| 检查 | 结果 |
|---|---|
| 助手、答疑生命周期、伙伴意图/角色/接线、Study 文档隔离、发布幂等单元 | 91 项通过 |
| 答疑 HTTP，真实 Calendar + Lab、模拟模型 | 75 条断言通过 |
| 全部 9 项隔离 HTTP 场景，两种能力组合 | 每种 661 条断言通过 |
| 答疑 DOM 实际交互 | 39 条断言通过 |
| 共享更新器、失败恢复与回滚索引 | 37 项中 35 项通过，2 项 PowerShell 检查因未安装 pwsh 跳过 |
| 本版适配器、资源哈希、能力覆盖、通知与安装模板 | 6 项通过 |
| 合成发布通知 | 5 个启用账号（含管理员），重复发布不重复通知；外键完整性通过 |
| 最终包 | 构建后核对外层/内层哈希、基线与源码补丁；结果在交付时记录 |

HTTP 项目：useful 29、study 24、asset-response 103、music 25、companion 253、sites 59、assistant 63、notifications 30、tutor 75。测试使用合成数据、模拟服务商，无真实 AI Key，无生产操作。

## 重点覆盖

- 游客、普通用户拒绝；订阅/管理员允许。直接 Calendar 与 Lab 代理均在服务端校验，未授权不发模型请求。
- 账号绑定、当前讲义 ID、保存版本、登录会话、CSRF/Origin、文档修改、服务商更换、重新授权和停止。
- 第 12 次提问只带第 2–11 轮历史（10 对问答）；清空重置。普通聊天无讲义内容，其他讲义不出现在模型请求。
- GLM 4.7 enabled、GLM 5.3 high；备用旧模型无不支持的参数；上游失败退回额度；请求和错误日志无讲义/API Key。
- 同时提问拒绝第二条；请求中撤销、到期、订阅降级或账号停用后丢弃结果并退款；重启不恢复授权。
- DOM 检查真实 Academic/伙伴代码：取消授权不发送、加宽面板的位置参数、切换视图/讲义/账号/关闭面板、迟到授权与回复、HTML/外链移除、公式排版。
- 源码有/无 TOTP 覆盖保留既有差异。新增受限 JSON 解析仅用于 tutor，普通助手回归通过。

## 复现

```bash
node --test calendar-app/test/assistant-api.test.js calendar-app/test/assistant-tutor.test.js calendar-app/test/ui-release.test.js lab-service/test/companion-brain.test.cjs lab-service/test/companion-characters.test.cjs lab-service/test/companion-wiring.test.cjs lab-service/test/study-document.test.mjs
JSDOM_MODULE=<测试用jsdom路径> node scripts/releases/v2.3.1.0/tests/tutor-dom.cjs
python -m unittest discover -s scripts/updater/tests -p 'test_*.py'
python scripts/releases/v2.3.1.0/tests/adapter.test.py
python scripts/updater/manage.py check
```

HTTP 复现使用适配器 `test_inputs`/`isolation_checks`，实际启动两服务；测试配置 `GARYHUB_ASSISTANT_ENDPOINT` 指向同进程模拟模型。安装器在内部 Docker 网络运行相同脚本，随后执行通知人数及去重。新增独立场景使用保留测试 IP `192.0.2.231`，避免重复登录脚本共用同一访客地址触发已有 12 次/15 分钟限制；生产登录限制未调整。旧 companion-http 的 `/app` 绝对路径仅在本地临时副本中映射，交付包仍使用容器路径。jsdom 只放临时测试目录，未加入生产依赖。

## 验收限制

本环境不能启动可用的 Chromium，浏览器连接亦不可用；DOM 不提供真实布局引擎。因此桌面/手机视觉布局仍需现场验收。没有 Docker、Windows/pwsh 或生产凭据，未运行 Windows 双击、真实 Docker 切换、生产 HTTPS 或真实模型质量测试；安装器保留强制隔离、备份、失败恢复、健康、资源和通知检查。测试未用模拟文件字节冒充 HTTP 响应。

现场应检查：成绩规划与学习中心伙伴展开/收起；390px 窄屏面板与键盘；授权框讲义与服务商名称；数学/代码回答；换讲义需重授权；普通账号按钮禁用；清空、退出、关闭后的记忆结束。最终 ZIP 的 Windows 安装入口采用已审阅模板。

状态：源码已准备、本地上述范围已验证；本版未推送/合并/生产部署。README 当前源码、功能边界、安装基线、构建入口、回滚和历史生产证据同步维护。
