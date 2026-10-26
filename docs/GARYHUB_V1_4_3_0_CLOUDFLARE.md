# GaryHub 个人音乐：Cloudflare R2 设置

先完整解压升级 ZIP，双击 `RUN-UPDATE.cmd`。看到 `COMPLETE v1.4.3.0` 后再配置 R2；未配置时默认音乐与普通账号额度均可使用。保留安装包中的全部文件。

## 1. 开通并创建私有桶

1. 打开 [Cloudflare 控制台](https://dash.cloudflare.com/)，选择你的账号。
2. 进入 **Storage & databases → R2 → Overview**。未开通 R2 时按网页完成开通及计费确认；免费额度之外可能收费。
3. 创建单独的桶，例如 `garyhub-music`，使用 **Standard** 存储。位置可以选 Automatic；本安装器使用默认 jurisdiction 的 S3 端点，不选择 EU / US / FedRAMP 专用 jurisdiction 桶。
4. 桶的 Public access / `r2.dev` 保持关闭。不需要绑定公开音乐域名，不需要创建 Worker，也不需要把文件复制回 VPS。

## 2. 设置浏览器读取规则

在桶的 **Settings → CORS policy → Edit / Add** 中保存下列 JSON。界面名称可能因语言略有不同。它允许 GaryHub 页面读取和分段播放，上传仍由已登录的 GaryHub 后端执行。

```json
[
  {
    "AllowedOrigins": [
      "https://garyhub.uk",
      "https://calendar.garyhub.uk",
      "https://tools.garyhub.uk",
      "https://lab.garyhub.uk"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 3600
  }
]
```

可选：为前缀 `checks/` 添加“1 天后删除”的生命周期规则。该前缀仅存连接测试探针，不要给 `music/` 添加自动到期规则，否则会删除用户仍在使用的音乐。

## 3. 生成桶专用凭据

1. 返回 R2 Overview，在 Account Details 的 API Tokens 旁选择 **Manage**。
2. 创建 R2 API token。可使用 Account API token；界面或权限只提供 User API token 时也可使用，但该凭据依附于你的用户权限。
3. 权限选 **Object Read & Write**，作用范围仅选刚创建的音乐桶。不要给整个 Cloudflare 账号管理权限。
4. 记录 **Account ID**、桶名、**Access Key ID**、**Secret Access Key**。Secret 通常只显示一次，请保存在密码管理器中。安装工具需要这对 S3 凭据，不是一般的 Cloudflare Bearer API token。

## 4. 双击配置

双击升级包里的 `SETUP-R2.cmd`。按提示依次输入以上四项；Secret 输入隐藏。沿用你已有的 Windows OpenSSH、SSH 私钥及主机记录，提示时输入原私钥口令。

工具会确认服务器实际是 v1.4.3.0、有效镜像和只读挂载匹配，再把凭据写入服务器受限文件。它不会在本机生成密钥文件，不会把密钥提交 GitHub，也不会打印签名 URL。随后真实验证 R2 写入、读取和删除；失败恢复上一次配置。

成功显示 `R2 READY` 后，刷新 [个人音乐库](https://calendar.garyhub.uk/music/)，用订阅用户或管理员上传一首短 MP3，选中它，在 Calendar、Todo 和 Tools 页面试听。原来的唱片继续负责播放与暂停。

## 5. 验收与常见问题

- **音乐库提示未配置**：确认 RUN-UPDATE 已成功，再运行 SETUP-R2。不要把密钥发到聊天里。
- **R2 检查失败**：核对账号、桶名、默认 jurisdiction、凭据是否为 R2 S3 类型，以及该桶的对象读写权限；确认 VPS 能连接 R2。只需提供最后的 STOPPED 信息。
- **检测成功但网页不能播放**：确认 MP3 能在本机播放；检查 CORS 的 Origin 是否完全匹配，等待规则生效后刷新。浏览器阻止自动播放时点击唱片。
- **删除后额度未立即释放**：后台正在确认 R2 删除。失败/中断上传会延迟清理，不会通过重试绕过容量限制。
- **更换桶被拒绝**：已有曲目与清理任务绑定原账号/桶；先完成数据迁移或删除清理，不能直接改桶名。轮换同桶密钥可重新运行 SETUP-R2。
- **回滚**：双击 ROLLBACK，个人音乐功能暂停，原文件保留。回滚期间产生的删除任务会在再次使用 v1.4.3.0 时处理。

截至 2026-10-26，R2 Standard 的月度免费用量包括 10 GB-month 存储、100 万次 Class A 和 1,000 万次 Class B 操作，直接从 R2 出网免费；免费用量并不等于无限免费，也不构成账单上限。GaryHub 对自己管理的音乐设置 8 GiB 总容量保护；请在 Cloudflare 继续查看账号整体用量。

官方参考：[开通 R2](https://developers.cloudflare.com/r2/get-started/)、[R2 凭据与权限](https://developers.cloudflare.com/r2/api/tokens/)、[CORS](https://developers.cloudflare.com/r2/buckets/cors/)、[临时签名链接](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)、[价格](https://developers.cloudflare.com/r2/pricing/)。本地测试使用合成存储；真实账号、网络、CORS 和扣费状态须按上述步骤现场验证。
