# 开源准备审查

## 本次完成

本轮只调整工程结构和配置，没有改变业务功能或界面行为。

- 将数据库、存储、监听地址、JSON 上限、Origin 和 BI 地址集中到 `backend/src/config.ts`，保留原默认值。
- 从应用装配中提取 HTTP 策略与错误原语，减少路由文件职责。
- 从 presentation 桶文件中提取布局函数，消除核心渲染模块的循环导入。
- 配置 Vite、Playwright 和 E2E 登录参数，移除开发者个人 PostgreSQL 用户名。
- 增加 `.editorconfig`、`.gitattributes`、Node 版本和数据库初始化入口。
- 扩充 `.gitignore`，排除依赖、构建目录、运行数据、日志、测试报告和导出文件。
- 删除未被源码引用的 16MB 字体文件；运行时仍使用系统黑体，行为不变。
- 将直接上传依赖 `multer` 升级到已修复版本。
- 以 TDD 增加配置、HTTP 策略和 presentation 布局特征测试，并执行全量回归。
- 将仍符合当前需求的浏览器验收整理到 `e2e/current`；早期评审中已被后续需求替代的交互脚本移入 `e2e/legacy`。

## 验证记录

2026-10-04 在本机 PostgreSQL 环境完成：

- `npm run db:init -- --with-test`：开发库和测试库初始化/迁移成功。
- `npm run verify`：TypeScript 通过，76 个 Vitest 文件、464 项测试通过，前端生产构建成功。
- `npm run test:e2e`：12 项当前浏览器验收通过。
- 文档内部链接、个人绝对路径和大文件提交候选检查通过。
- `npm audit --omit=dev` 仍报告 `pptxgenjs` 的两个间接 `image-size` 公告，处理边界见 [SECURITY.md](../SECURITY.md)。

## 代码审查结论

### 已解决的高优先级问题

| 问题 | 影响 | 处理 |
| --- | --- | --- |
| 管理员连接写死个人用户名 | 其他开发者无法初始化 | 改为标准本机连接并支持环境变量 |
| 运行配置散落 | 部署容易遗漏和不一致 | 统一解析、校验与文档 |
| presentation 循环依赖 | 构建顺序和测试存在隐患 | 直接依赖 `layout.ts` |
| 运行产物混在工作目录 | 容易误提交数据和导出物 | 完善 ignore 并在提交前核对 |
| 根 README 是历史评审日志 | 新贡献者无法快速启动 | 改为独立仓库入口，细节移入 docs |

### 后续技术债务

1. `frontend/src/Editor.tsx`、`frontend/src/style.css`、`backend/src/app.ts` 和模板定义文件体积较大。建议按已有特征测试逐个拆分，避免与产品改动混合。
2. 若干旧模块仍使用紧凑单行代码和 `any`。应按领域逐步收紧类型，不宜一次性格式化整库造成不可审查的大 diff。
3. 集成测试共享 `slidebi_test` 并串行运行。并行化前需要按 worker 创建独立数据库或 schema。
4. API 尚无 OpenAPI 契约。真实 BI 集成前应建立 Data Spec、DAX 查询与错误响应的机器可读 schema。
5. 内置账号和简单密码只适用于开发。生产发布前需提供首次管理员创建、密码策略、密钥轮换和会话安全配置。
6. 真实 BI Studio Data Spec/DAX 适配器尚未实现，当前只能使用 Mock。
7. `pptxgenjs@4.0.1` 间接依赖 `image-size@1.2.1`，npm 报告两个拒绝服务高危公告。当前输入会先经 sharp 解码和重编码，并在导出前限制为 PNG/JPEG；仍应跟踪上游修复并在升级后重新执行 PPTX 回归。

## 公开发布前清单

- [ ] 由项目所有者选择并添加开源许可证。
- [ ] 确认项目名称和说明不会暗示与 think-cell 官方有关联。
- [ ] 配置 GitHub Actions 执行 `npm ci`、数据库初始化和 `npm run verify`。
- [ ] 配置 Dependabot 或同类依赖更新，并处理剩余安全公告。
- [ ] 删除或替换开发默认账号，补充生产部署与密钥管理方案。
- [ ] 检查 `backend/fixtures/assets/licenses` 中每份素材的再分发条款。
- [ ] 再次确认提交不包含 `.env`、数据库文件、日志、PPTX 或测试截图。
