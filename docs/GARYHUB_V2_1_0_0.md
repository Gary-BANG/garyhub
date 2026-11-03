# GaryHub v2.1.0.0：外站链接

维护日期：2026-11-03（America/Chicago）。状态：源码已准备、本地部分验证；未推送、未合并、生产未核验。

## 功能

- **外站链接页 `https://sites.garyhub.uk/`**：列出 GaryHub 之外的公开网站。首批为 ECE 470 Motion Notes（`gary-bang.github.io/ece470-course`）与光影手记摄影课程（`gary-bang.github.io/photography-course`）。每行显示网站名称和网址，点击在当前标签页打开。
- **背景**：Canvas 景深粒子。粒子沿缓慢旋转的流场漂移，相近深度的粒子之间连线；鼠标附近的粒子被推开并略带旋涡，近处粒子随鼠标视差移动；点击空白处荡开一圈波纹，偶尔有流星划过；下层是缓慢流动的 CSS 极光。页面隐藏时停止绘制；系统选择“减少动态效果”时只画一帧静止画面。粒子数量随屏幕面积在 70–230 之间。
- **列表悬停**：沿用 Tools Dock 的弹簧参数。鼠标所在行放大约 7%，相邻行按距离略微放大，高亮与阴影随放大量变化；键盘聚焦时同样放大。
- **网站预览**：宽屏且使用鼠标（`hover: hover` 与 `pointer: fine`），并且列表右侧至少有 360px 时，在列表旁显示该网站首页截图，卡片随悬停行平滑移动。手机、平板和窄窗口不显示预览。页面加载后空闲时预取预览图。
- **语言**：读取并写入共享的 `garyhub_language` Cookie（`.garyhub.uk`），与其他子站的中英文选择同步。
- **入口**：主页“其他”菜单新增“外站链接 ↗ / Elsewhere ↗”。网站伙伴的知识库新增 `sites` 页面（`access:'public'`，归入学习类），可回答“有没有摄影课程的网站”“还有别的网站吗”等。

## 服务器与安全

- 页面由现有 Tools/Lab 容器提供，不新增容器或依赖。`server.cjs` 在主机 `sites.garyhub.uk` 上只允许 GET/HEAD `/`、`/index.html`、`/sites.css`、`/sites.js` 和 `/thumbs/<name>.webp`，映射到 `public/sites/`，其余一律 404（包括 API、伙伴文件、登录跳转和 `/health`）。
- 该主机返回 `Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`。页面没有内联脚本、`style` 属性或第三方资源。
- 其他主机（Tools、Lab、主页）访问 `/sites/` 一律 404。带 `?v=` 的 sites 资源与伙伴资源一样缓存一天，其余 `no-store`。
- 1.3.4.1（无 TOTP）能力组合的 `server.cjs` 覆盖做了相同修改，与主文件的差异仍只有原来的 7 行 TOTP 相关代码。

## 预览图

`scripts/sites/capture_thumbnails.py` 从 `index.html` 读取每个链接的网址与 `data-thumb` 名称，用本机 Edge/Chrome 无头模式按 1440×900 截图，再用 Pillow 缩放为 640×400 WebP（质量 80）。服务器从不访问这些外部网站。新增网站：在 `index.html` 的列表加一行（网址、名称、`data-en` 英文名、`data-thumb`），运行脚本，并把新的 WebP 一起提交。

## 伙伴修正

`brain.js` 的否定判断原来只看匹配词前两个字符，因此“有没有摄影课程”中的“没”会把“摄影”记为否定，“不是 PDF”中的空格又让“不”落在窗口外。现在，前面是“有没有、是不是、能不能、会不会、要不要、可不可以、有木有”时视为提问，并忽略否定词与目标词之间的一个空格。

## 安装

1. **安装前在 Cloudflare 添加 DNS 记录**：类型 A，名称 `sites`，IPv4 与 `garyhub.uk` 相同，代理状态“仅 DNS”。其余子域名也是这种设置。
2. 要求 Calendar 与 Tools/Lab 实际运行 v2.0.1.0。完整解压 ZIP，双击 `RUN-UPDATE.cmd`。
3. 第 1 阶段在服务器上解析 `sites.garyhub.uk`。没有记录，或记录不指向本服务器（与 `garyhub.uk`／`tools.garyhub.uk` 的解析结果或本机地址比较）时停止，不做任何改动。
4. 同一阶段生成在原 Caddyfile 末尾追加站点块的候选文件，并在 Caddy 容器内 `caddy validate`；如果 Caddyfile 已以不同方式定义该主机则停止。追加的站点块为：
   ```
   sites.garyhub.uk {
       encode zstd gzip
       reverse_proxy garyhub-lab:3000
   }
   ```
5. 新镜像通过隔离检查（新增 `sites-http.cjs`）、备份和切换后，确认 Caddyfile 未被他人改动，再原位写入并重载 Caddy。第 6 阶段最多等待 3 分钟让 Caddy 签发证书，然后执行原有 HTTPS 校验、资源哈希校验、sites 主机校验和主页入口检查。任何一步失败都会自动恢复原 Caddyfile 与 v2.0.1.0 镜像。
6. 第 7 阶段向全部已批准且启用的账号发布未读站内通知（主页、Tools、Calendar、Lab 四个范围），并核对人数与去重。

## 回滚

`ROLLBACK.cmd` 先确认 Caddyfile 仍是本次写入的内容（被另行修改则停止），恢复原 Caddyfile，再恢复 v2.0.1.0 应用镜像和有效配置，保留当前用户记录。回滚后 `sites.garyhub.uk` 不再提供服务；Cloudflare 记录可以保留，也可以手动删除。

## 版本与源码同步

- 两服务健康版本、`privacy-ledger-release.json` 与 11 个页面的 `companion/boot.js?v=` 改为 2.1.0.0（`knowledge.js`、`brain.js` 有变化）。
- 本版基础是已合并的 main 提交，`PUSH-TO-GITHUB.cmd` 的“main 包含基线”检查可以直接通过。安装器与推送脚本的默认仓库改为 `D:\Codes\Own_Project\garyhub`，不再使用已不存在的 `garyhub-repo`。
