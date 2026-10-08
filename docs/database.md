# 数据库初始化与维护

SlideBI 使用 PostgreSQL 保存用户、目录、模板版本、数据集版本、页面修订、文稿和导出任务。数据库结构由只追加迁移维护，初始化数据由迁移和显式种子命令共同生成。

## 权限模型

初始化脚本建立三个 PostgreSQL 角色：

| 角色 | 用途 |
| --- | --- |
| `slidebi_owner` | 拥有 schema 和数据库对象，不允许登录 |
| `slidebi_runtime` | 运行时最小权限的组角色，不允许登录 |
| `slidebi_app` | 应用登录角色，继承 `slidebi_runtime` |

应用对象位于 `app` schema。初始化撤销数据库的 PUBLIC 权限，并为应用角色设置 `search_path=app,pg_catalog`。管理员连接只用于建角色、建库和执行迁移，不应配置给 Web 进程。

## 初始化命令

当前 PostgreSQL 用户需要 `CREATEROLE` 和 `CREATEDB`，或使用 `SLIDEBI_ADMIN_URL` 指向具备对应权限的账号。

```bash
# 只创建/升级开发库
npm run db:init

# 同时创建/升级 slidebi_test
npm run db:init -- --with-test

# 写入可重复生成的主题、模板、目录和内置资源
npm run db:seed
```

命令入口分别是 [scripts/init-database.sh](../scripts/init-database.sh)、[backend/src/setup-db.ts](../backend/src/setup-db.ts) 和 [backend/src/seed-db.ts](../backend/src/seed-db.ts)。一键入口为 `npm run setup`，详细流程见[环境准备与初始化](environment-setup.md)。

自定义连接示例：

```bash
export SLIDEBI_ADMIN_URL='postgresql://postgres:secret@localhost:5432/postgres'
export DATABASE_URL='postgresql://slidebi_app:secret@localhost:5432/slidebi'
npm run db:init -- --with-test
npm run db:seed
```

## DDL 与迁移清单

`backend/migrations` 是 DDL 和静态 DML 的唯一事实来源。迁移按三位版本号排序；`app.schema_migrations` 保存版本、SHA-256 和执行时间。已执行文件如果被修改，初始化会中止，因此结构变更必须新增迁移。

| 迁移 | 主要内容 |
| --- | --- |
| `001-phase1.sql` | `app` schema、用户、存储、资源、快照、主题、模板、页面和导出任务 |
| `002-datasets.sql` | 稳定数据集和不可变数据集版本 |
| `003-catalog.sql` | 早期样本目录兼容表 |
| `004-unified-data.sql` | 样本并入统一数据集、标签和模板匹配 |
| `005-assets.sql` | 资源标签、原始对象和加工来源 |
| `006-fragments.sql` | 页面组件片段 |
| `007-decks.sql` | 多页文稿、文稿修订、页面引用和冻结预览 |
| `008-native-contents.sql` | 原生文稿页面关系与跨文稿导入记录 |
| `009-dataset-inputs.sql` | 数据集归档、拆分和结果表范围 |
| `010-query-config.sql` | 数据刷新模型 ID 与具名查询配置 |
| `011-users-visibility-folders.sql` | 登录、会话、角色、可见性和数据/资源目录 |
| `012-template-folders-vector-assets.sql` | 模板目录与矢量资源类型 |
| `013-dataset-data-id.sql` | 对外稳定的 `d_` 数据集 ID |
| `014-export-history-delete.sql` | 导出记录和存储对象删除权限 |
| `015-catalog-directory-plan.sql` | 模板/资源默认目录及已有对象归档 |
| `016-deduplicate-unlisted-assets.sql` | 未列入清单的重复内置资源归档 |
| `017-expand-builtin-asset-catalog.sql` | 扩展内置资源目录 |
| `018-add-people-and-data-tech-asset-folders.sql` | 人物角色与数据技术资源目录 |

核心关系：

```mermaid
erDiagram
  USERS ||--o{ DECKS : owns
  USERS ||--o{ TEMPLATES : owns
  USERS ||--o{ DATASETS : owns
  USERS ||--o{ ASSETS : owns
  DATASETS ||--o{ DATASET_VERSIONS : publishes
  DATA_SNAPSHOTS ||--o{ DATASET_VERSIONS : stores
  DECKS ||--o{ DECK_REVISIONS : versions
  DECK_REVISIONS ||--o{ DECK_SLIDE_REFS : orders
  SLIDES ||--o{ SLIDE_REVISIONS : versions
  TEMPLATES ||--o{ TEMPLATE_VERSIONS : versions
  EXPORT_JOBS }o--|| DECK_PREVIEWS : freezes
```

完整字段、约束、索引和授权请直接查阅迁移 SQL，避免维护一份会与实际 DDL 漂移的复制文件。

## 初始化数据

初始化分两层执行：

1. **迁移静态数据**：创建开发账号、目录迁移所需记录和兼容数据；
2. **应用种子**：`db:seed` 调用应用的幂等种子逻辑，写入主题、模板版本和内置资源，同时校验资源 manifest 与 SHA-256。

全新数据库完成 `db:init` 和 `db:seed` 后应包含：

| 类型 | 数量 | 来源 |
| --- | ---: | --- |
| 开发用户 | 3 | 迁移 011：`marx`、`summer`、`mary` |
| 主题 | 2 | `backend/src/db.ts`：商务蓝、中性灰 |
| 模板 | 52 | 3 个一期模板、7 个扩展图表模板、42 个业务模板 |
| 内置资源 | 118 | `backend/fixtures/assets/manifest.json` |
| 模板目录 | 8 | `backend/src/catalog-structure.ts` |
| 资源目录 | 18 | `backend/src/catalog-structure.ts` |

模板的样例表格和 Schema 保存在模板版本 payload 中；初始化不会创建用户文稿或数据管理中的用户数据集。内置资源二进制文件位于 `backend/fixtures/assets`，运行时规范化副本位于 `SLIDEBI_STORAGE_DIR`，后者不提交 Git。

可以用只读查询核对当前环境：

```bash
psql "$DATABASE_URL" -c 'TABLE app.schema_migrations'
psql "$DATABASE_URL" -c "SELECT count(*) FROM app.templates WHERE archived_at IS NULL"
psql "$DATABASE_URL" -c "SELECT count(*) FROM app.assets WHERE archived_at IS NULL"
```

## 新增迁移规则

1. 新建下一个编号的 SQL 文件，例如 `019-example.sql`。
2. 不修改已发布迁移，不在 SQL 中写真实凭据或个人路径。
3. 为运行角色授予所需的最小列级权限。
4. 先运行 `npm run db:test:setup` 和相关集成测试，再运行 `npm run verify`。
5. 数据回填应可在已有数据、空库和重复部署场景下安全执行。

## 数据、文件与备份边界

PostgreSQL 保存对象元数据、内容版本、引用和任务状态。资源原件、缩略图、PPTX 与 manifest 位于 `SLIDEBI_STORAGE_DIR`。备份和恢复必须同时覆盖 PostgreSQL 与该目录，否则数据库引用会失效。

建议备份顺序：暂停写入或建立一致性点，执行 `pg_dump`，同步复制 storage 目录，再记录应用版本和迁移版本。恢复后运行健康检查，并抽查资源预览和历史导出下载。

测试只能使用名称以 `_test` 结尾的独立数据库。故障注入与清理测试有显式保护，禁止对开发库或生产库运行。
