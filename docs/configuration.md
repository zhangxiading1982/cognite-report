# 项目配置

应用从进程环境读取配置，不自动加载 `.env`。本地可以复制 [.env.example](../.env.example)，再用 shell 或进程管理器导出变量。

从零安装和 `.env` 加载示例见[环境准备与初始化](environment-setup.md)。

## 后端运行参数

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://slidebi_app@localhost:5432/slidebi` | 应用数据库连接 |
| `SLIDEBI_HOST` | `127.0.0.1` | API 监听地址 |
| `SLIDEBI_PORT` | `4310` | API 端口；兼容旧变量 `PORT` |
| `SLIDEBI_JSON_LIMIT` | `10mb` | JSON 请求体上限，仅接受 `kb`/`mb` |
| `SLIDEBI_ALLOWED_ORIGINS` | 当前 `SLIDEBI_WEB_PORT` 对应的本地地址与 API 地址 | 逗号分隔的允许 Origin；显式设置后完全覆盖默认列表 |
| `SLIDEBI_STORAGE_DIR` | `backend/var` | 资源、临时文件和导出目录 |
| `SLIDEBI_BI_BASE_URL` | 未设置 | 真实 BI Studio 基础地址；当前适配器尚未实现 |

## 数据库初始化参数

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `SLIDEBI_ADMIN_URL` | `postgresql://localhost:5432/postgres` | 仅初始化命令使用的管理员连接 |
| `SLIDEBI_DB_NAME` | `slidebi` | 要创建/迁移的数据库名 |
| `SLIDEBI_TEST_DATABASE_URL` | `postgresql://slidebi_app@localhost:5432/slidebi_test` | 测试数据库连接约定 |

管理员连接不会传给运行中的 Web 应用。生产环境应为 `slidebi_app` 设置强密码或使用短期凭据，并在连接串中启用环境所需的 TLS 参数。

## 前端与端到端测试

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `SLIDEBI_WEB_HOST` | `127.0.0.1` | Vite 监听地址 |
| `SLIDEBI_WEB_PORT` | `5173` | Vite 端口 |
| `SLIDEBI_API_PROXY_TARGET` | `http://127.0.0.1:4310` | `/api` 开发代理目标 |
| `SLIDEBI_E2E_BASE_URL` | `http://127.0.0.1:5173` | Playwright 测试入口 |
| `SLIDEBI_E2E_USERNAME` | `marx` | E2E 登录用户 |
| `SLIDEBI_E2E_PASSWORD` | `admin` | E2E 登录密码 |
| `SLIDEBI_CHROME_PATH` | macOS Chrome 标准路径 | Playwright 使用的浏览器可执行文件 |

本地修改 `SLIDEBI_WEB_PORT` 时，后端会自动允许该端口的 `localhost` 与 `127.0.0.1` 来源；如果显式设置了 `SLIDEBI_ALLOWED_ORIGINS`，仍需把实际前端地址加入列表。运行端到端测试时还需同步更新 `SLIDEBI_E2E_BASE_URL`。生产部署应由反向代理终止 TLS，并只允许实际站点 Origin。
