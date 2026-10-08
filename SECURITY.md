# Security Policy

## 报告方式

请勿在公开 issue 中披露未修复漏洞。公共仓库建立后，项目维护者应启用 GitHub Private Vulnerability Reporting，并在此处补充安全联系人和响应时限。

报告请包含受影响版本、复现步骤、潜在影响和建议修复方式。不要附带真实业务数据、密码、Cookie、数据库备份或导出文稿。

## 部署边界

- README 中的账号和密码只用于本地开发，不得用于生产。
- Web 应用使用 `slidebi_app` 最小权限角色；`SLIDEBI_ADMIN_URL` 只用于初始化命令。
- 生产环境必须使用 TLS、强凭据、受控 Origin 和不可公开访问的存储目录。
- 数据库与 `SLIDEBI_STORAGE_DIR` 必须一起保护和备份。

## 已知依赖公告

截至 2026-10-08，兼容升级已修复 `proxy-addr`、`sharp`、Vitest 和 Tinypool 公告。`npm audit --omit=dev` 仍报告 `pptxgenjs@4.0.1` 间接依赖的 `image-size` 两个 high 拒绝服务公告（GHSA-5p2g-fcmc-qvqq、GHSA-w3rx-r6r6-pgpr）。npm 当前只提供把 `pptxgenjs` 强制降到 4.0.0 的路径，无法作为无回归升级采用。

应用不会把原始上传文件直接交给该解析器：图片先由 sharp 按像素上限解码、重编码，PPTX 导出入口再次只接受 PNG/JPEG。该限制降低了可利用面，但不能替代依赖升级；维护者应持续跟踪上游版本，在修复可用后运行 PPTX 全量回归并升级。
