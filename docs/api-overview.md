# API 概览

所有业务接口使用 `/api` 前缀，正文默认是 JSON；资源上传使用 `multipart/form-data`。登录成功后服务端通过 HttpOnly Cookie 识别用户，不接受客户端传入 owner ID。

## 通用约定

- 修改接口校验请求 Origin；允许列表由 `SLIDEBI_ALLOWED_ORIGINS` 配置。
- 创建、导入和导出等可重试操作使用 `Idempotency-Key`，最大 200 字符。
- 版本化写入携带期望修订，冲突返回 HTTP 409，客户端必须保留草稿并重新加载。
- 业务错误返回稳定错误码、中文消息和可选详情。
- 删除多为受引用保护的归档；导出记录删除会同步删除文件。

## 接口分组

| 分组 | 主要路径 | 职责 |
| --- | --- | --- |
| 健康 | `GET /api/health` | 数据库与 API 存活检查 |
| 身份 | `/api/auth/*`、`/api/users` | 登录、退出、当前用户和管理员用户维护 |
| 文稿 | `/api/contents/*` | 多页文稿、页面添加/导入/移除和快照 |
| 页面 | `/api/slides/*` | 页面创建、编辑、复制、预览和预检 |
| 文稿交付 | `/api/decks/*` | 导航、冻结预览和多页导出准备 |
| 模板 | `/api/templates/*` | 列表、详情、版本、收藏、导入和维护 |
| 数据 | `/api/datasets/*` | 数据集、版本、回滚、刷新、复制和模板匹配 |
| Data Spec | `/api/data-specs/validate` | 契约校验 |
| Mock BI | `/api/mock-bi/charts/*` | 本地 chartId 导入、变化和故障演示 |
| 资源 | `/api/assets/*` | 上传、读取、加工、另存和归档 |
| 目录 | `/api/folders/*` | 模板、数据和资源目录树维护 |
| 组件片段 | `/api/fragments/*` | 个人组件片段维护 |
| 导出 | `/api/export-jobs/*` | 任务查询、取消、重试、下载与删除 |

路由实现分布在 `backend/src/app.ts` 及各领域 `register*` 模块。真实 BI API 接入时，应保持内部 Data Spec 和数据集发布接口不变，只替换 `chartId` 导出与具名查询的适配层。

当前尚未生成 OpenAPI 文档。公共 API 稳定化前，应先从现有 Supertest 用例提取请求/响应契约，再引入 schema 驱动的文档，避免手写文档与实现漂移。
