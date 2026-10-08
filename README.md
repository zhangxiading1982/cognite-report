# SlideBI

SlideBI 把 BI 图表数据与商业汇报模板组合为可编辑的多页文稿，并导出可直接打开和继续编辑的 PPTX。项目包含 React 前端、Express 后端、共享演示文稿引擎、PostgreSQL 迁移以及完整的自动化测试。

当前公开版本：**v0.1.0**。真实 BI Studio Data Spec/DAX 接口尚未接入，开发环境使用 Mock 适配器。

## 快速开始

需要 Node.js 22+、npm 10+ 和 PostgreSQL 16+。

```bash
git clone git@github.com:zhangxiading1982/cognite-report.git
cd cognite-report
npm run setup
npm run dev
```

打开 <http://127.0.0.1:5173>。开发账号：

| 用户 | 密码 | 角色 |
| --- | --- | --- |
| `marx` | `admin` | 管理员 |
| `summer` | `summer` | 普通用户 |
| `mary` | `mary` | 普通用户 |

默认数据库初始化需要当前 PostgreSQL 用户具备建库、建角色权限。连接方式不同或端口冲突时，请参考 [.env.example](.env.example) 和[环境准备文档](docs/environment-setup.md)。

## 常用命令

```bash
npm run env:check       # 检查本机依赖
npm run db:init -- --with-test
npm run db:seed         # 写入内置主题、模板、目录和资源
npm run dev             # 同时启动前端和后端
npm run verify          # 类型检查、单元/集成测试、前端构建
npm run test:e2e        # dev 服务运行时执行浏览器验收
npm run release:check   # 完整发布检查
```

后端健康检查：<http://127.0.0.1:4310/api/health>。

## 文档

- [文档导航](docs/README.md)
- [系统功能说明](docs/system-overview.md)
- [环境准备与初始化](docs/environment-setup.md)
- [系统架构](docs/architecture.md)
- [使用说明](docs/user-guide.md)
- [v0.1.0 发布说明](docs/releases/v0.1.0.md)
- [贡献指南](CONTRIBUTING.md)与[安全说明](SECURITY.md)

项目受数据驱动汇报工具的工作流启发，采用独立设计与实现，与 think-cell GmbH 没有关联。

> 项目所有者尚未选择开源许可证。在许可证文件加入前，公开源码不自动授予复制、修改或再分发权利。
