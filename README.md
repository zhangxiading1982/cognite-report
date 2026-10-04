# SlideBI

SlideBI 把图表数据与商业汇报模板组合为可编辑的多页文稿，并导出可直接打开的 PPTX。当前仓库包含 React 前端、Express 后端、共享演示文稿引擎、PostgreSQL 迁移和浏览器验收测试。

## 快速开始

需要 Node.js 22+、npm 10+ 和 PostgreSQL 16+。

```bash
npm ci
npm run db:init -- --with-test
npm run dev
```

打开 <http://127.0.0.1:5173>，开发环境可使用以下账号：

| 用户 | 密码 | 角色 |
| --- | --- | --- |
| `marx` | `admin` | 管理员 |
| `summer` | `summer` | 普通用户 |
| `mary` | `mary` | 普通用户 |

数据库初始化需要当前 PostgreSQL 用户具备建库、建角色权限。若连接方式不同，请按 [.env.example](.env.example) 导出环境变量。应用不会自动读取 `.env` 文件。

## 常用命令

```bash
npm run dev             # 同时启动前端和后端
npm run dev:frontend    # 仅启动前端
npm run dev:backend     # 仅启动后端
npm run verify          # 类型检查、单元/集成测试、前端构建
npm run test:e2e        # dev 服务运行时执行浏览器验收
```

后端健康检查：<http://127.0.0.1:4310/api/health>。

完整文档从 [docs/README.md](docs/README.md) 开始。发布到公共仓库前，请先阅读 [开源准备审查](docs/open-source-readiness.md) 和 [安全说明](SECURITY.md)。
