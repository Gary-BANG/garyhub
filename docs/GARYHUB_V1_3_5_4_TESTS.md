# GaryHub v1.3.5.4 验证记录

源码基线：`da8c9b48722a27d4800e4c7750c98d0ad248a2c8`（已合并的 v1.3.5.3）。本地验证只使用合成账号、临时 SQLite 数据库、模拟邮件和独立 Lab 数据。

## 功能与回归验证

| 检查 | 结果 |
|---|---|
| Calendar 全量单元测试 | 58 项通过，包含 6 项新增导入格式、长度、容量、重复和提示词测试 |
| 新增导入 HTTP 联调 | 两种功能基线各通过 46 项断言 |
| 原 Todo HTTP 回归 | 两种功能基线各通过 29 项断言 |
| 隐私、账本与共享登录冒烟 | 两种功能基线各通过 79 项断言 |
| 固定开支与统一登录 | 两种功能基线各通过 67 项断言 |
| 登录返回地址修复回归 | 两种功能基线各通过 31 项断言 |
| 账号生命周期与权限 | 两种功能基线各通过 96 项断言；删除目标用户数据并保留其他用户，外键检查通过 |
| TOTP 与会员功能 | 已安装 TOTP 的基线通过 38 项额外检查；未安装基线保持该功能缺省 |
| 浏览器导入功能 | 38 项通过；真实 Chromium、桌面/手机、中英、明暗主题 |
| 浏览器登录与固定开支回归 | 29 项通过 |
| 部署、备份与回滚逻辑 | 10 项通过 |
| 私密文件排除和仓库来源校验 | 3 项通过 |
| 最终 ZIP、清单、版本基线与 Windows 入口 | 6 项通过 |
| JavaScript / Python 语法及 Git 空白检查 | 通过 |

真实 HTTP 流程使用生产 sqlite3 驱动与 Express 应用，没有用内存替身替代持久化。

新增导入验证涵盖：预览只读；整批追加；原内容和顺序保留；中英文长文本、换行、引号及路径；旧草稿兼容和重新生成编号；文件内及既有清单的完全重复内容；不同内容的同名待办；取消重复跳过；标题、子要点、条数和合并后字节上限；未知字段和错误路径；整批失败不写入；账号归属、管理员隔离和 CSRF；并发修订冲突；同一请求重试不重复追加，后续修改后拒绝旧请求。

浏览器额外模拟“服务器已保存，但成功响应丢失”，确认自动重试使用同一请求编号且只增加一批数据。还检查了复制提示词实际写入剪贴板、语言切换保留输入并翻译提示、文件过大时保留先前输入、长预览下确认按钮始终可见、另一页面改动后的重新预览，以及共享账号切换后关闭窗口和清除旧草稿。

## 可复现命令

```text
npm --prefix calendar-app ci
npm --prefix calendar-app test
npm --prefix calendar-app run check
python3 scripts/releases/v1.3.5.4/tests/run-local.py
python3 scripts/releases/v1.3.5.4/tests/deploy.test.py
python3 scripts/releases/v1.3.5.4/tests/review-security.test.py
python3 scripts/releases/v1.3.5.4/build-package.py /tmp/GaryHub_v1.3.5.4_Update.zip
python3 scripts/releases/v1.3.5.4/tests/package.test.py /tmp/GaryHub_v1.3.5.4_Update.zip
```

浏览器检查使用同一 run-local.py，设置 `BROWSER_CHECK=1`，并按环境设置 `PLAYWRIGHT_MODULE` 和 `CHROMIUM_PATH`。运行器用临时合成站点承接 GaryHub 域名请求，不连接生产网站。`CHECK_SOURCE_ROOT` 可指定按历史已审阅覆盖文件重建的另一功能基线。

本次本地环境为 Linux、Node 24 与 Chromium 151。Windows PowerShell、真实生产 SSH、Docker 离线镜像构建、正式挂载核对、生产 HTTPS 和实际通知人数没有在此环境执行。这些步骤由升级包在用户的实际 Windows 和服务器上继续验证；只有全部通过后才报告 COMPLETE。

## 升级与回滚检查

安装器要求 Calendar 和 Tools/Lab 均实际运行 v1.3.5.3，核对有效部署索引、Compose 标签、已审阅源码摘要和已有数据挂载。通过后在当前镜像上离线构建并用合成数据隔离联调；保留现有依赖、环境配置、数据和可选 TOTP 密钥。

正式切换前保留数据库一致性备份和逐字节验证的 Lab 备份。切换及 HTTPS 失败时恢复之前的应用镜像；手动回滚同样保留所有当前数据，不使用旧数据库覆盖新记录。后续部署或配置变化会阻止盲目回滚。

更新通知按已批准且启用的账号发布，包括管理员，并验证同一版本重试不重复发布。通知失败时记录为待重试，不能报告全部完成。实际服务器的验证结果记录在本次 deployment-state.json 中。
