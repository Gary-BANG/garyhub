# GaryHub v1.4.3.2-r1 upgrade

完整解压 ZIP 后，Windows 双击 RUN-UPDATE.cmd。复用既有 OpenSSH 和 SSH 密钥；要求 Calendar 与 Tools/Lab 都实际运行 v1.4.3.1，有／无 TOTP 分别核对源码。不匹配时停止，不能跳过校验。

本次修复 ECE 470 Lab 的标准 LaTeX 与常见旧式 ASCII 公式排版，并保持切题、运行和提交后的显示。无法可靠识别的公式显示原文；题包和作答不改写，首次提交前仍隐藏答案与解析。

成绩规划、学习中心、图片局部消除、Markdown Viewer、PDF 浅灰打印加入 Play Music，沿用既有曲目、进度与多标签页协调。这五个页面不增加 Music Library，原有页面的曲库入口保留。

安装器执行来源／有效配置核对、离线构建、合成数据隔离验证、备份、切换、HTTPS／资源哈希和全部批准启用账号的未读站内通知，并核对人数及去重。无需新服务器依赖；保留现有记录、音乐／R2 和 Reading／监控／VPN 集成。

ROLLBACK.cmd 恢复本次安装前的 v1.4.3.1 应用与配置，保留当前用户记录；已有后续部署时停止。PUSH-TO-GITHUB.cmd 用独立 worktree 准备并普通推送审查分支，保留原工作区，不强推、不自动合并 main。

SHA256SUMS.txt 和 payload manifest 校验完整文件。功能与验证记录在源码 docs/GARYHUB_V1_4_3_2.md 和 docs/GARYHUB_V1_4_3_2_TESTS.md。请保存最终安装输出用于核对生产结果；交付升级包不代表已上线。
