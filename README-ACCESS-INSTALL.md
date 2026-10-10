# 批量接入 GaryHub 网络授权

## 安装

1. 把安装包上传到服务器并解压。
2. 用 root 执行 `bash /root/garyhub-access-package/access-host/run-install.sh`。
3. 脚本显示 `[7/7] DONE` 后，打开 https://lab.garyhub.uk/access/ 并用 Calendar 管理员账号登录。

脚本会备份、构建、校验、切换 Lab、安装本地同步器和验证路由。后台执行可在 SSH 中断后继续。查看进度用 `tail -n 40 /root/garyhub-access-install.log`；不要因为断开而重复运行安装。

## 网页上一次完成

1. 在管理员区域填写闲鱼店铺首页 HTTPS 链接，保存。没有链接时入口保持关闭。
2. 给自己的账号生成一个永久邀请码，复制后在页面上方兑换。
3. 等“连接已开通”，复制个人订阅地址，在 v2rayN 主界面按 Ctrl+V 导入。若提示创建订阅分组，确认后更新订阅。
4. 使用订阅中的个人节点，实际打开网页确认联网。这是你的正式账号节点，不是先前的 `GaryHub-WSS-test`。
5. 后续管理员核对店铺收款后发放相应期限的邀请码；用户使用各自 Calendar 账号兑换。

## 完成旧入口迁移

只有在上面的个人节点确认能联网之后，运行：

```bash
bash /opt/garyhub-access/finish-migration.sh
```

它保留有效个人授权，备份后移除旧 8080 入站和 `garyhub-migration-test` 测试凭据。重启 Xray 时连接会短暂重连。脚本只在发现有效、已经同步的个人账号时执行，但它无法替代你实际联网的确认。日志在 `/root/garyhub-access-finish.log`。

## 运行注意

每轮同步结束后约 15 秒再运行；有凭据变化时重启 Xray，因此目前适合小规模使用。到期停用通常一分钟内完成，任务故障时需要管理员处理。浏览器端提供复制订阅/节点按钮，v2rayN 用 Ctrl+V 导入；未假定所有版本都支持浏览器直接唤起。

详细实现、备份路径和测试范围见 `docs/ACCESS_FEATURE.md`。
