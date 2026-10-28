# 统一更新入口

`manage.py` 提供 context、plan、check、build 四个命令。前三个只读；build 显式调用已注册版本适配器生成 ZIP。不会自行连接生产或推送 GitHub。

当前 v1.4.3.1 使用独立发布配置和共享 build_overlay.py、deploy_runtime.py，保留经过验证的备份、回滚和通知逻辑。历史适配器不变。新版本仍须注册独立清单和小型适配器，明确基础提交与实际基础版本。build_overlay 只打包已提交且工作区干净的源码，通过既有 push-source 在独立 worktree 准备源码，保留用户原工作区。

`plan` 根据实际 Git 差异给出模块及验证建议，默认只显示每组少量文件；未知路径明确列为人工核对。命令输出有界，不读取源码正文或 vendor bundle。详细流程见 docs/UPDATE_WORKFLOW.md。

`build-push-package.py` 将明确基础提交至 HEAD 的已提交差异封装为 push ZIP，附补丁和精确 Git blob 清单。只接受普通源码文件，排除私有配置/数据/密钥；删除、链接或文件模式变化需单独审阅。示例参数：

```bash
python scripts/updater/build-push-package.py --base <reviewed-commit> --branch chore/<name> --output <new.zip> --subject "<commit subject>" --pr-body <description.md>
```

push-source.ps1 在包内作为 Push-GitHub.ps1 使用，默认创建独立工作目录，验证后普通 push 到 chore/ 或 update/ 分支，保留 main 和用户原工作区。用 -PrepareOnly 仅准备本机提交。集成测试需要设置 GARYHUB_PUSH_TEST_PACKAGE、GARYHUB_TEST_PWSH，使用临时本地 remote，不向真实 GitHub 推送。
