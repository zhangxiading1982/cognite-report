# 数据库初始化与维护

## 权限模型

初始化脚本建立三个 PostgreSQL 角色：

| 角色 | 用途 |
| --- | --- |
| `slidebi_owner` | 拥有 schema 和数据库对象，不允许登录 |
| `slidebi_runtime` | 运行时最小权限的组角色，不允许登录 |
| `slidebi_app` | 应用登录角色，继承 `slidebi_runtime` |

应用对象位于 `app` schema。初始化还会撤销数据库的 PUBLIC 权限，并为应用角色设置 `search_path=app,pg_catalog`。

## 初始化脚本

当前 PostgreSQL 用户需要 `CREATEROLE` 和 `CREATEDB`，或使用 `SLIDEBI_ADMIN_URL` 指向具备对应权限的账号。

```bash
# 只初始化开发库
npm run db:init

# 同时初始化开发库和 slidebi_test
npm run db:init -- --with-test
```

命令入口是 [scripts/init-database.sh](../scripts/init-database.sh)，实际角色、建库和迁移逻辑位于 [backend/src/setup-db.ts](../backend/src/setup-db.ts)。脚本可重复执行。

自定义连接示例：

```bash
export SLIDEBI_ADMIN_URL='postgresql://postgres:secret@localhost:5432/postgres'
export DATABASE_URL='postgresql://slidebi_app:secret@localhost:5432/slidebi'
npm run db:init -- --with-test
```

## 迁移规则

`backend/migrations` 按三位版本号排序。`app.schema_migrations` 保存每个文件的 SHA-256；已执行文件如果被修改，初始化会中止。结构变更必须新增迁移，不能重写已发布迁移。

新增迁移步骤：

1. 新建下一个编号的 SQL 文件，例如 `015-example.sql`。
2. 让迁移可重复验证，避免依赖开发者本机状态。
3. 先运行 `npm run db:test:setup`，再运行相关集成测试和 `npm run verify`。
4. 不在迁移中写入真实凭据或个人路径。

## 数据边界

数据库保存用户、目录、业务对象、版本、引用和任务状态。资源原件、缩略图、PPTX 与 manifest 位于 `SLIDEBI_STORAGE_DIR`。备份和恢复必须同时覆盖 PostgreSQL 与该目录，否则数据库引用会失效。

测试只能使用名称以 `_test` 结尾的独立数据库。故障注入与清理测试有显式保护，禁止对开发库运行。
