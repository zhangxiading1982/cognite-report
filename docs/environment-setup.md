# 环境准备与初始化

本文面向第一次获取仓库的开发者，覆盖系统依赖安装、源码依赖下载、数据库 DDL 与初始化数据、编译和测试。生产部署需要另行配置 TLS、强数据库凭据、持久存储和备份。

## 1. 环境依赖

| 依赖 | 最低版本 | 用途 |
| --- | --- | --- |
| Git | 2.40+ | 获取源码和版本管理 |
| Node.js | 22+ | 前后端 TypeScript 运行时 |
| npm | 10+ | workspace 依赖安装和脚本入口 |
| PostgreSQL | 16+ | 业务数据、版本和导出任务 |
| Google Chrome | 当前稳定版 | Playwright 端到端验收；日常开发可不安装 |

仓库的 [.nvmrc](../.nvmrc) 固定 Node.js 主版本。安装后先运行环境检查：

```bash
npm run env:check
```

### macOS

推荐通过 [nvm](https://github.com/nvm-sh/nvm) 管理 Node.js，通过 Homebrew 管理 PostgreSQL：

```bash
nvm install 22
nvm use 22
brew install postgresql@16
brew services start postgresql@16
```

如 Homebrew 没有加入 PATH，按安装提示添加 `postgresql@16/bin`。Apple Silicon 通常位于 `/opt/homebrew/opt/postgresql@16/bin`。

### Ubuntu / Debian

使用 nvm 安装 Node.js 22；PostgreSQL 可从系统包管理器或 [PostgreSQL 官方下载页](https://www.postgresql.org/download/linux/ubuntu/) 安装：

```bash
nvm install 22
nvm use 22
sudo apt update
sudo apt install postgresql-16 postgresql-client-16
sudo systemctl enable --now postgresql
```

若发行版默认仓库没有 PostgreSQL 16，请先按官方文档配置 PGDG 仓库。

## 2. 获取源码和 Node.js 依赖

```bash
git clone git@github.com:zhangxiading1982/cognite-report.git
cd cognite-report
nvm use
npm ci
```

`npm ci` 严格按 `package-lock.json` 下载根 workspace、前端、后端和 presentation 共享包依赖。不要提交 `node_modules`。

## 3. 配置连接

默认配置适用于本机免密码 PostgreSQL。不同环境可复制示例并导出变量：

```bash
cp .env.example .env
set -a
source .env
set +a
```

应用不会自动读取 `.env`。完整变量、默认值和生产建议见[项目配置](configuration.md)。数据库管理员连接只供初始化使用，运行中的 API 使用最小权限账号 `slidebi_app`。

## 4. 初始化数据库

推荐的一键初始化会安装锁定依赖、创建开发库和测试库、执行全部 DDL/DML 迁移，并写入内置模板和资源：

```bash
npm run setup
```

已经执行过 `npm ci` 时可跳过依赖安装：

```bash
bash scripts/bootstrap-development.sh --skip-install
```

手工执行的等价步骤是：

```bash
npm run db:init -- --with-test  # 创建角色、开发/测试数据库并执行迁移
npm run db:seed                 # 写入主题、模板、目录和内置资源
```

数据库 DDL 和静态 DML 的唯一事实来源是 `backend/migrations/001-*.sql` 至 `018-*.sql`。`app.schema_migrations` 保存每个迁移的 SHA-256，已执行迁移不得修改。`db:seed` 可重复运行，不覆盖用户修改；它同时把内置资源文件物化到 `backend/var`。

全新环境完成初始化后包含：

- 3 个开发账号：`marx`、`summer`、`mary`；
- 2 套主题；
- 52 个内置图表与业务模板及各自样例数据；
- 118 个内置图片、图标和矢量资源；
- 8 个模板目录和 18 个资源目录。

初始化不会创建用户文稿或用户数据集。详细表结构、迁移清单和数据边界见[数据库初始化与维护](database.md)。

## 5. 编译、测试和发布检查

```bash
npm run typecheck       # TypeScript 类型检查
npm test                # Vitest 单元与 PostgreSQL 集成测试
npm run build           # Vite 生产构建，输出到 frontend/dist
npm run verify          # 依次执行以上三项
npm run docs:check      # 检查仓库 Markdown 本地链接
npm run release:check   # 检查发布内容、文档、测试和构建
```

端到端测试需要先运行 `npm run dev`，再在另一个终端执行 `npm run test:e2e`。测试库必须以 `_test` 结尾，防止清理逻辑误操作开发数据。

## 6. 启动和验证

```bash
npm run dev
```

- Web：<http://127.0.0.1:5173>
- API 健康检查：<http://127.0.0.1:4310/api/health>

健康检查应返回 `{"status":"ok"}`。如端口已被占用，可设置 `SLIDEBI_WEB_PORT`、`SLIDEBI_PORT`，并在修改 API 端口时同步更新 `SLIDEBI_API_PROXY_TARGET`。未显式设置 `SLIDEBI_ALLOWED_ORIGINS` 时，后端会自动允许 `SLIDEBI_WEB_PORT` 对应的本地来源。

## 7. 常见问题

- **无法创建角色或数据库**：`SLIDEBI_ADMIN_URL` 对应用户需要 `CREATEROLE` 和 `CREATEDB`。
- **应用连接失败**：确认 PostgreSQL 已启动，`DATABASE_URL` 指向已初始化的数据库。
- **页面提示 Origin 不允许**：把实际前端地址加入 `SLIDEBI_ALLOWED_ORIGINS`。
- **资源预览缺失**：运行 `npm run db:seed`，确认 `SLIDEBI_STORAGE_DIR` 可写。
- **E2E 找不到浏览器**：安装 Chrome，或通过 `SLIDEBI_CHROME_PATH` 指定可执行文件。
