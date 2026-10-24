# v1.4.1.0 验证记录

日期：2026-10-24（America/Chicago）。基础提交 `637d86faae37d6c06b74b15bf850e82e301c8ad7`，来源 main / PR #18。测试使用合成账号、临时 SQLite 和本地服务，不访问正式用户数据。

## 本地检查

- Node 20 术语格式与数据库检查：18 项。覆盖双语多表达、空例句/译文/重复 ID/大小限制、同词异义、中文同词、外部 ID 隔离、人工编辑保护、显式合并/替换、两句例句限制、预览候选上限、Prompt、增量迁移重复执行、旧记录不变、重开数据库和账号删除级联。
- HTTP：在有 TOTP（1.3.4.2）和无 TOTP（1.3.4.1）两种发布能力组合分别验证 Research 62 项、旧实用工具 29 项、Lab 分发 49 项。包含登录、Origin、CSRF、账号快照、管理员无越权读取、修订冲突、并发单一胜者、导入重试去重、撤销限制、禁用会话拒绝、删除预览识别新增表。
- 两种能力组合分别验证新版站内通知发布：5 个合成启用账号（含管理员）收到通知；同版本第二次发布不重复。该数字仅为隔离测试人数，不是正式服务器收件人数。
- 真实 Chromium：1440px 桌面和 390px 手机，明暗主题。验证项目新建、词条新增/编辑、中文/英文/别名搜索、标签、Prompt 与 JSON 下载、冲突合并和撤销、用户文本不被当作 HTML、无横向溢出。已检查截图并修正搜索框受通用 label 样式影响的高度；测试环境补充中文字体后复查。
- 既有账号密码/跳转/会话与新增 Tools 检查：Node20 下 8 项通过；通知 hub-api 单元测试使用其现有的 node:sqlite 测试工具，在 Node24 下 3 项通过。生产 HTTP 和数据库驱动已另在 Node20 下验证。
- 统一更新器测试：22 项中 20 项通过，2 项需要最终源码包的 PowerShell 集成测试留待生成包后单独执行；本版部署适配器及复用保护 14 项通过。
- 相关 JavaScript 语法检查，统一更新入口清单检查，既有更新器测试以及新发布适配器保护测试。适配器检查实际基础版本、目标版本健康、陈旧 HTML/资源拒绝和未登录 Research API 401。
- 复用的保护测试覆盖一致性数据库备份、数据保留回滚、后续未知镜像拒绝、Compose 环境/挂载保留、通知失败可重试、通知幂等和密钥备份保护。

## 复现入口

```bash
node --test calendar-app/test/research-format.test.js calendar-app/test/research-db.test.js
python scripts/releases/v1.4.1.0/tests/run-local.py
python scripts/updater/manage.py check
python -m unittest discover -s scripts/updater/tests -p 'test_*.py'
python scripts/releases/v1.4.1.0/tests/adapter.test.py
```

本地 HTTP 测试脚本可通过 GARYHUB_TEST_NODE 指定 Node 20；需要已安装的 Calendar 依赖。真实浏览器测试通过 GARYHUB_PLAYWRIGHT 和 GARYHUB_CHROME 指定本机测试依赖；这些不是新增的生产依赖。没有改动 vendor bundle。

## 最终包检查

完成上述检查、提交干净源码后，通过 `manage.py build --release 1.4.1.0` 只构建最终包一次。生成后执行 `tests/package.test.py <ZIP>` 核验全部内外层哈希、目标与基础版本、两个能力组合的精确源码基线、Windows 入口/回滚、嵌入 bootstrap、资源校验和、私有文件排除及源码导入范围。用 PowerShell 解析最终安装器和导入器。最终 ZIP 的 SHA256 另在交付校验文件中记录；包检查结果见交付摘要。

## 状态边界

源码已准备，本地功能与相关保护已验证。升级包附可复现源码及验证入口；本次未推送或合并 v1.4.1.0，未执行正式服务器安装，未验证 Windows 上的真实双击与 SSH/Compose/Docker 切换，不声明生产完成。正式 HTTPS、镜像、有效 Compose、备份、通知人数由安装器在现场核验。
