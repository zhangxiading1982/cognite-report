# 测试与 TDD

本项目使用 Vitest、Supertest、真实 PostgreSQL 测试库和 Playwright。结构优化遵循“先固定现状、再重构、最后完整回归”，测试断言的是已有行为，而不是重构后的实现细节。

## TDD 流程

1. **Red**：为要移动的边界补充现状测试，确认它在缺少目标实现时失败。
2. **Green**：提取最小实现，保持输入、输出、错误码、默认配置和持久化行为不变。
3. **Refactor**：清理命名和依赖方向，运行目标测试。
4. **Regression**：执行全量 `npm run verify`；涉及完整用户流程时再执行 E2E。

本次结构优化新增了运行配置、HTTP 策略和 presentation 布局的特征测试，用于保护默认端口、Origin/幂等规则以及中英文布局算法。

## 测试分层

| 层级 | 位置 | 作用 |
| --- | --- | --- |
| 纯函数/组件 | `frontend/src/*.test.tsx`、`backend/packages/presentation/test` | 校验组件交互、数据计算、布局与 SVG |
| API/数据库集成 | `backend/tests` | 使用 Supertest 和 `slidebi_test` 校验权限、事务、版本及导出 |
| 浏览器验收 | `e2e/current` | 使用真实前后端、Chrome 和数据库覆盖当前关键用户路径 |
| 构建检查 | `npm run typecheck`、`npm run build` | 校验跨 workspace 类型和生产前端打包 |

## 命令

```bash
npm run db:test:setup            # 建立/升级测试库
npm test                         # Vitest 全量测试
npm test -- path/to/file.test.ts # 单文件反馈
npm run verify                   # 类型 + Vitest + 前端构建
npm run test:e2e                 # 需要先启动 npm run dev
```

数据库集成测试串行运行，因为测试文件共享 `slidebi_test`。不要提高 `vitest.config.ts` 的 worker 数量，除非先完成每个测试的数据库隔离。

`e2e/legacy` 保存早期评审版本的交互脚本。后续需求已明确移除或改名其中部分控件，因此这些脚本不作为发布门禁；仍有效的业务场景应按当前交互重写到 `e2e/current`。

失败时先保留首个业务错误和对应输入。不要通过延长等待、放宽断言或跳过测试来隐藏竞争条件。
