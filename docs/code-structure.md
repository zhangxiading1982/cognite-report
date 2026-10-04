# 代码结构

```text
.
├── backend/
│   ├── fixtures/                 # 开发样例、内置资源及许可
│   ├── migrations/               # 只追加的 PostgreSQL 迁移
│   ├── packages/presentation/    # 前后端共享契约、编译与布局
│   ├── src/
│   │   ├── export/               # PPTX 与字体处理
│   │   ├── http/                 # HTTP 传输策略
│   │   ├── app.ts                # 应用装配及一期兼容路由
│   │   ├── config.ts             # 运行和数据库初始化配置
│   │   ├── errors.ts             # HTTP 错误原语
│   │   ├── datasets.ts           # 数据集、版本和刷新
│   │   ├── contents.ts           # 原生多页文稿
│   │   ├── decks.ts              # 预览、导航和多页导出
│   │   ├── assets.ts             # 资源上传、处理和读取
│   │   ├── asset-manifest.ts     # 内置资源清单校验
│   │   ├── catalog-structure.ts  # 模板与资源默认目录规划
│   │   ├── template-management.ts# 模板维护
│   │   ├── worker.ts             # 持久导出任务
│   │   └── setup-db.ts           # 角色、数据库和迁移初始化
│   └── tests/                    # 后端单元/集成测试
├── frontend/
│   ├── public/                   # 直接发布的静态文件
│   └── src/                      # React 页面、组件和测试
├── e2e/
│   ├── current/                  # 当前 Playwright 浏览器验收
│   └── legacy/                   # 早期评审交互脚本（不作为门禁）
├── scripts/                      # 可重复执行的维护脚本
├── docs/                         # 当前维护文档
├── package.json                  # npm workspace 与统一命令
├── tsconfig.json                 # 严格 TypeScript 检查
└── vitest.config.ts              # 串行数据库测试配置
```

## 依赖方向

`frontend` 和 `backend` 可以依赖 `@slidebi/presentation`，presentation 不应反向导入任一应用。presentation 内部模块直接导入 `layout.ts` 等具体依赖，避免通过 `index.ts` 桶文件形成循环依赖。

后端路由模块通过 `register*` 函数挂载到 Express 应用，数据库连接和当前用户解析由应用装配层传入。运行参数只从 `config.ts` 读取；模块不应各自解析环境变量。

## 后续拆分原则

目前 `frontend/src/Editor.tsx`、`frontend/src/style.css`、`backend/src/app.ts` 和 presentation 模板定义仍然较大。后续应按“先写现状测试、再提取纯函数/组件、最后运行完整回归”的顺序渐进拆分。一次提交只移动一个稳定边界，不在结构重构中修改交互或业务规则。
