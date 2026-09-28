# Outlook.com 发件配置（garyhub2026@outlook.com）

Outlook.com 目前要求 OAuth2。GaryHub 使用 Microsoft Graph 的委托 `Mail.Send`
权限发送验证码和事项提醒，不保存 Outlook 密码。正式邮箱授权文件属于密钥，不要加入 Git、
上传聊天或放入公开目录。

## 注册应用

在 [Microsoft Entra 应用注册](https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
创建名为 `GaryHub Mail` 的应用。支持的账户类型选择“任何组织目录中的帐户和
个人 Microsoft 帐户”，或只允许个人 Microsoft 帐户的选项。记录
`Application (client) ID`，不要创建 client secret。

在“API permissions”添加 **Microsoft Graph → Delegated permissions**：
`Mail.Send` 和 `User.Read`。在“Authentication → Advanced settings”将
“Allow public client flows”设为 **Yes**。授权脚本另请求 `offline_access`，
用于取得可刷新令牌。

如果个人 Microsoft 帐户无法进入应用注册，可能需要先创建一个 Azure/Entra 目录；
这一步由帐户所有者在微软后台完成。

## 一次性授权

在正式部署之前，用隔离容器或独立目录运行：

```bash
node scripts/connect-outlook.js \
  --client-id '<Application-client-ID>' \
  --account garyhub2026@outlook.com \
  --token-file /app/data/outlook-token.json
```

脚本会显示微软验证网址和一次性代码。只在微软页面登录
`garyhub2026@outlook.com` 并同意授权；脚本核对账户后将令牌保存为权限
`0600` 的文件。不要把代码或令牌贴到聊天里。若授权失败，先核查应用账户类型、
Graph 权限和公用客户端设置。

Web 与 reminder worker 必须共享受保护的令牌文件，并设置：

```text
GRAPH_CLIENT_ID=<Application-client-ID>
GRAPH_FROM_EMAIL=garyhub2026@outlook.com
GRAPH_TOKEN_FILE=/app/data/outlook-token.json
```

不要同时设置 `MAIL_CAPTURE_DIR`，它会优先捕获邮件而不真实发送。
部署前发送一封到本人控制的邮箱，确认验证码实际送达；然后从验证码和事项提醒
分别验证一次。Microsoft Graph 的 HTTP 202 表示接受请求，不能单独证明最终投递。
授权可能过期或被撤销，出现刷新失败时重新进行账户授权。

参考：[Outlook.com 邮件设置](https://support.microsoft.com/en-us/outlook/pop-imap-and-smtp-settings-for-outlook-com)、
[Graph sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0)、
[设备授权流程](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code)。
