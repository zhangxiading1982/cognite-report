# Contributing

感谢参与 SlideBI。提交应聚焦一个可审查的问题，并保持已有业务行为。

## 开发流程

1. 按[环境准备文档](docs/environment-setup.md)安装 Node.js 22、npm 10 和 PostgreSQL 16，并运行 `npm ci`。
2. 通过 `npm run db:init -- --with-test` 和 `npm run db:seed` 准备开发/测试环境。
3. 先为预期行为补充或更新测试，再实现最小改动。
4. 运行 `npm run verify`；涉及完整用户流程时运行 `npm run test:e2e`。
5. 不提交 `.env`、`backend/var`、`node_modules`、`dist`、日志、测试报告或导出文件。

数据库迁移只能追加，不能修改已经发布的迁移。页面、模板和数据字段之间的引用必须使用稳定 ID，不能使用可编辑名称。

结构重构应与产品功能分开提交。大文件拆分时先增加特征测试，并在提交说明中列出保持不变的外部行为。

提交信息采用 Conventional Commits，例如 `feat(editor): add table border controls`、`fix(template): show previews on library home`。准备版本标签前运行 `npm run release:check`，并更新 `CHANGELOG.md` 和对应的 `docs/releases` 发布说明。
