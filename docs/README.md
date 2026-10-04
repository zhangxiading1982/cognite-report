# SlideBI 文档

本目录是源码仓库内的维护文档入口。架构、配置与运行说明以当前代码为准；历史产品评审材料不作为运行依赖。

## 产品与设计

- [项目背景](project-background.md)：目标、范围和阶段边界。
- [领域概念](domain-model.md)：文稿、页面、模板、数据、资源与导出的定义。
- [系统架构](architecture.md)：组件边界、关键数据流与设计约束。
- [使用说明](user-guide.md)：从数据或模板到多页 PPTX 的基本流程。
- [目录与内置资源](catalog-organization.md)：模板、资源的默认目录和第三方素材维护规则。

## 开发与运维

- [代码结构](code-structure.md)：目录职责和依赖方向。
- [项目配置](configuration.md)：全部环境变量、默认值与生产建议。
- [数据库](database.md)：初始化、迁移、备份与测试库隔离。
- [开发与启动](development.md)：安装、启动和日常命令。
- [测试](testing.md)：TDD、测试分层和验收命令。
- [API 概览](api-overview.md)：HTTP 约定与接口分组。
- [开源准备审查](open-source-readiness.md)：本次优化、已知债务和发布清单。

仓库级协作和漏洞报告方式见 [CONTRIBUTING.md](../CONTRIBUTING.md) 与 [SECURITY.md](../SECURITY.md)。
