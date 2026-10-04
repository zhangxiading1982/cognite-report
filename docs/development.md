# 开发与启动

## 环境要求

- Node.js 22 或更高版本（仓库含 `.nvmrc`）
- npm 10 或更高版本
- PostgreSQL 16 或兼容版本
- 运行端到端测试时需要 Google Chrome，或配置 `SLIDEBI_CHROME_PATH`

## 首次启动

```bash
git clone <repository-url>
cd slidebi
npm ci
npm run db:init -- --with-test
npm run dev
```

默认入口：

- Web：<http://127.0.0.1:5173>
- API 健康检查：<http://127.0.0.1:4310/api/health>

`npm run dev` 会同时启动前端和后端，并在任一进程退出时关闭另一个进程。调试时可用 `npm run dev:frontend` 或 `npm run dev:backend` 单独启动。

## 开发数据

初始化迁移会建立本地演示账号和基础内容。BI Studio 尚未接入时，可在数据管理中使用 Mock chartId：

- `chart-demo-budget`
- `chart-demo-trend`
- `chart-demo-bridge`

这些标识只用于本地演示。Mock 状态随后端重启重置，已经保存的数据集不会被删除。

## 日常检查

```bash
npm run typecheck
npm test
npm run build
npm run verify
```

提交前运行 `npm run verify`。如果修改了用户路径、目录交互、画布编辑或导出流程，还应在开发服务运行时执行 `npm run test:e2e`。
