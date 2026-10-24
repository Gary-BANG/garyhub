# GaryHub v1.4.1.0 Upgrade

Requires both live services at **v1.4.0.1**. Extract the complete ZIP, then double-click **RUN-UPDATE.cmd** and enter the existing SSH key passphrase. Keep the final summary for production verification. Do not run inside the ZIP.

新增 Research Dictionary：在 Tools 打开科研词典。顶部切换/新建 Research；下一行搜索、下载 Prompt、导入/导出、新增词条。下方左侧标签与词条，右侧释义、用法、双语例句。词条可以手动新增/编辑；导入先预览和处理冲突，支持撤销最近一次导入。

每个账号的词库独立。下载的 Prompt 带上研究简介，交给外部 AI 生成 JSON 后导入，无需接入模型 API。一个含义可有多个中英文表达；同词不同义保留独立记录。人工修改不会被静默覆盖。文件上限 3 MB、每项目 1,000 条，每条 1–2 组例句。

The installer reuses the checked updater, current images and dependencies, private configuration, consistent backups, isolated tests, health/HTTPS checks and in-app notification verification. Nothing is deployed if the source/version checks fail.

**ROLLBACK.cmd** returns to v1.4.0.1 application images and retains all current records, including Research data. It does not restore an old database. The previous UI does not expose the new dictionary. Its older account-deletion guard may request review of the new related tables; do not bypass that guard.

**PUSH-TO-GITHUB.cmd** safely imports source into a separate review worktree and pushes a normal update branch. It preserves existing local work and leaves merging main to the maintainer. Installation only prepares source locally.

Prepared and tested locally; GitHub merge and production deployment are not claimed. See **TEST-RESULTS.md** and the included source documentation for details. No private Compose files, runtime databases, credentials or server backups are included.
