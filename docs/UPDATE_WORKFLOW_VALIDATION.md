# 固定更新流程验证记录

2026-10-23；GitHub 基线 main `34d3072e2f11c416c0dbb4c8db6750489b19cfbd`。

本次仅调整仓库文档、清单和更新工具，应用源码及运行版本不变。

- 统一入口 check：源码版本、清单、适配器常量及基础提交一致。
- 6 项单元检查：当前适配器、路径越界、符号链接、错误版本适配器、基础提交不匹配、输出有界和未知路径提示。
- 既有安装器 10 项回归检查通过，备份、回滚和通知逻辑未改变。
- context / plan 已执行，输出仅含摘要，不读取应用源码和 vendor 正文。
- PowerShell 7（Linux）实际执行 2 项隔离集成测试通过：在临时本地 bare remote 上验证 PrepareOnly、补丁应用、目标 Git blob、普通推送、重复运行去重、main 未改变、原工作区未提交内容保留、含无关改动的分支停止推送、损坏补丁在建分支前停止。没有对真实 GitHub 执行测试推送。
- PowerShell 语法解析通过；脚本使用 PowerShell 5.1 兼容语法，但本环境没有 Windows 桌面，未实测 Windows 双击和用户实际 GitHub 登录。
- 最终 ZIP 检查包文件 SHA-256、补丁变更范围、CRLF 入口和目标 Git blob。

未连接生产或执行实际 GitHub 推送。本次变更不宣称完成生产部署，不发布生产更新通知。

## push 包 r2 路径修复

用户在 Windows 启动时，参数默认目录为空，GetFullPath 在 Git 操作前报错。r2 改为在脚本主体解析自身目录，同时 CMD 显式传入带尾部点号的目录，避免引号与末尾反斜杠组合问题。测试改为不传 PackageRoot，并在含中文与空格的解压目录中运行。当前环境仍为 Linux PowerShell 7，Windows PowerShell 5.1 的实机结果由用户重跑核对。
