# 开源准备审查

本文件记录 v0.1.0 公开仓库准备情况、发布边界和后续事项。发布命令以[环境准备与初始化](environment-setup.md)和[测试文档](testing.md)为准。

## v0.1.0 已完成

- 数据库、存储、监听地址、JSON 上限、Origin、前端代理和 BI 地址均可配置；
- PostgreSQL 角色、开发库、测试库、18 个迁移和内置数据可以重复初始化；
- 增加环境检查、一键初始化、显式数据种子、文档链接检查和发布检查脚本；
- 根 README 保持简洁，详细背景、领域、架构、配置、数据库、测试和使用说明放入 `docs`；
- `.gitignore` 排除依赖、构建目录、运行数据、日志、测试报告、导出文件和本地 agent/task 状态；
- 内置资源保留来源 URL、许可证、本地 SHA-256 和修改说明；
- 兼容升级修复 `proxy-addr`、`sharp`、Vitest 和 Tinypool 的公开安全公告；
- GitHub Actions 使用 PostgreSQL 16 执行数据库初始化、数据种子、文档检查、完整验证和 critical 依赖门禁；
- Dependabot 每周检查 npm 依赖、每月检查 GitHub Actions；
- 采用统一的 v0.1.0 workspace 版本、CHANGELOG 和版本发布说明。

## 发布验证

发布前执行：

```bash
npm run release:check
npm audit --omit=dev
git status --short
```

2026-10-08 本地验证结果：`release:check` 已通过工作区版本、误跟踪产物、20 个 Markdown 文件链接、类型检查、81 个测试文件/564 项 Vitest 测试和前端生产构建；`e2e/current` 的 13 项浏览器验收全部通过。

依赖审计当前只剩 `pptxgenjs` 间接 `image-size` 的两个 high 拒绝服务公告，原因和输入缓解措施记录在 [SECURITY.md](../SECURITY.md)。发布不得使用 `npm audit fix --force` 自动降级 PPTX 引擎。

## 仓库内容边界

允许提交：

- 前后端和 presentation 源码；
- PostgreSQL 迁移、确定性 fixtures 与资源许可；
- 单元、集成和当前浏览器验收测试；
- 构建配置、环境示例、维护脚本和设计/使用/发布文档。

禁止提交：

- `.env`、Cookie、密码之外的真实凭据和业务数据；
- `node_modules`、`dist`、coverage、Playwright/test reports；
- `backend/var` 中的上传文件、缓存、导出 PPTX 和会话状态；
- Codex/Claude/agent 工作状态、临时任务文件、日志和 PID；
- 真实客户截图、数据库备份或生产导出文稿。

## 已知技术债务

1. 真实 BI Studio Data Spec/DAX 适配器尚未实现，当前使用 Mock。
2. `frontend/src/Editor.tsx`、`frontend/src/style.css`、`backend/src/app.ts` 和模板定义仍较大，应在行为测试保护下渐进拆分。
3. 集成测试共享 `slidebi_test` 并串行运行，并行前需要按 worker 隔离数据库或 schema。
4. API 尚无 OpenAPI 契约；真实 BI 接入前应固化 Data Spec、DAX 和错误响应 schema。
5. 开发账号和简单密码不能用于生产，需增加首次管理员创建、密码策略和会话密钥配置。
6. 本地文件存储不支持无状态多实例，生产化需要共享对象存储或一致挂载。

## 项目所有者待办

- [ ] 选择并提交开源许可证；未添加许可证时，公开源码不自动授予再分发权利。
- [ ] 在 GitHub 启用 Private Vulnerability Reporting，并在 `SECURITY.md` 填写联系人和响应时限。
- [ ] 再次复核 `backend/fixtures/assets/licenses` 中照片和品牌标识的再分发/商标边界。
- [ ] 为 `main` 开启分支保护，要求测试通过后合并。

## 版本发布流程

1. 更新所有 workspace 版本、`CHANGELOG.md` 和 `docs/releases/vX.Y.Z.md`。
2. 执行 `npm run release:check`，涉及 UI 时执行当前 E2E。
3. 检查 `git status`、`git diff --check`、`git ls-files` 和依赖审计。
4. 使用 Conventional Commit 提交，创建 annotated tag `vX.Y.Z`。
5. 推送 `main` 和标签，把版本发布说明同步到 GitHub Release。
