# v2.4.4.1-r1 验证记录

基线为 v2.4.4.0（PR #56，`1aa5eca`）。截图显示已经填写网站名称、尚无文件名和入口。截图和测试都无法确定该设备的系统文件选择器具体返回了哪种错误。

| 检查 | 验证内容 |
|---|---|
| 原版复现 | 在旧版模拟拒绝读取，点击保存后原始错误被“请先选择本机文件或文件夹”覆盖。被中止的选择器也可留下同样提示。另以不带根目录前缀的 index.html 和 assets/a.png 复现“未找到 HTML 入口”。旧版拖入独立中文 HTML 能正常打开。 |
| 浏览器文件与目录 | Chromium 158 中使用合成登录账号。浏览器选择器被拒绝或中止后，点击普通输入或再次点击主按钮，实际触发浏览器文件选择事件。为选择器指定磁盘上的中文 HTML 或测试题库目录，确认已选择文件名、嵌套入口、手填名称、保存、重新载入与关联。 |
| 取消和交替选择 | 没有文件时按回车保留原始提示。缺少 HTML 的文件夹给出具体原因。失败后换回合法文件可以继续，重选失败可继续使用上一份有效文件。迟到的文件句柄不会覆盖后来已经选好的普通文件。 |
| 既有使用方式 | 可持久化目录句柄、刷新重开、失效通知去重、通知返回对应书签和重新授权清理均通过。实际 ECE 470 压缩包可打开深层入口、作业图片与公式，PDF 引用转到第 21 页。375 像素布局通过。ECE 310 使用同类自建样例。 |
| 服务与更新器 | Calendar 单测 161 项、Tools/Lab 单测 115 项，另有 3 项目录路径回归、4 项版本适配检查。旧版全部 21 组隔离检查在 Node 20 含／不含 TOTP 两种配置下执行，包括书签授权、静态资源摘要和通知。正式通知在每组的合成账号中核对收件数和重复发布。 |
| 包与边界 | 共享更新器检查及源码同步测试使用临时 bare 仓库。成包后核对两层文件摘要、两个能力组合的载荷和基线，以及源码补丁生成的完整 Git 树。安装和回滚脚本使用本地 SSH 替身演练。实际 Windows 或 macOS 系统选择窗口、用户自己的文件和生产部署依赖现场验收。 |

## 重现主要用例

浏览器测试需要本机 Chromium、Python Playwright 和两个临时服务。给临时 Calendar 与 Tools/Lab 使用发布配置的合成数据库种子。下面的脚本只对回环地址发起测试账号登录。

```sh
python scripts/updater/manage.py check
python scripts/releases/v2.4.4.1/tests/adapter.test.py
node --test scripts/releases/v2.4.4.1/tests/folder-input.test.mjs
python scripts/releases/v2.4.4.1/tests/browser-pickers.py --tools http://localhost:18442 --calendar http://localhost:18441 --browser /path/to/chromium
python scripts/releases/v2.4.4.0/tests/browser-course.py /path/to/course.zip --tools http://localhost:18442 --browser /path/to/chromium
```

普通选择的文件／文件夹由自动化交给真实浏览器文件输入框，授权拒绝、中止和延迟通过可控的选择器复现。真实系统对话框的人工点击未计入本地测试。
