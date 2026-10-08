# Changelog

本项目采用 [Semantic Versioning](https://semver.org/)。公开版本的功能、修复和已知限制记录在此。

## [0.1.1] - 2026-10-08

### Fixed

- 把测试使用的 Data Spec、页面和导出 fixtures 收纳到仓库内，修复全新 checkout 的 TypeScript/CI 失败。
- 让 E2E 非 owner 场景遵循 `SLIDEBI_E2E_BASE_URL`，支持非默认前端端口。
- 为模板全屏编辑工作区补充稳定的对话框可访问语义。

## [0.1.0] - 2026-10-08

### Added

- 多页文稿、模板库、数据管理、资源库、用户权限和 PPTX 导出工作流。
- 常用图表、商业汇报模板、表格样式、正交连接器和页面编辑能力。
- PostgreSQL 版本化数据模型、18 个迁移、内置模板和资源种子。
- 环境检查、一键初始化、文档链接检查与发布检查脚本。
- 项目背景、系统功能、领域模型、架构、配置、数据库、开发、测试和使用文档。

### Changed

- `sharp` 及传递依赖升级到包含安全修复的兼容版本。
- Vitest 升级到 5.0.3，修复测试运行器相关安全公告。

### Known limitations

- BI Studio Data Spec/DAX 接入仍使用 Mock。
- `pptxgenjs` 的间接 `image-size` 公告仍待上游提供兼容修复。

[0.1.0]: https://github.com/zhangxiading1982/cognite-report/releases/tag/v0.1.0
[0.1.1]: https://github.com/zhangxiading1982/cognite-report/releases/tag/v0.1.1
