# 项目背景

## 要解决的问题

BI Studio 已经能够计算业务指标并导出图表数据，但从分析结果到管理汇报仍需要人工复制数据、选择版式、补充说明和维护多页结构。Slide Report 在这两个环节之间提供一个独立的汇报编排层：它接收 Data Spec，复用商业汇报模板，在浏览器中编辑页面，并生成可继续编辑的 PPTX。

典型流程如下：

1. 导入人工表格数据，或通过 BI Studio `chartId` 获取图表 Data Spec。
2. 选择模板或空白页，将图表数据绑定到页面并调整文字、图表、形状和资源。
3. 将页面组织为文稿，可选生成导航页，预览后导出多页 PPTX。

## 当前范围

当前版本已经覆盖文稿、模板、数据、资源、用户和导出记录的主要工作流，支持常用商业图表及 P0/P1 模板。前后端通过 HTTP API 分离，共享 presentation 包负责 Data Spec 校验、页面编译、SVG 预览和 PPTX 所需的确定性布局。

BI Studio 的真实 Data Spec 与 DAX 查询 API 尚未接入。当前 `chartId` 导入和刷新通过明确标识的 Mock 适配器演示，数据层已保留模型 ID、具名查询和刷新配置，后续可以替换传输适配器而不改变页面模型。

## 分阶段目标

| 阶段 | 目标 | 当前状态 |
| --- | --- | --- |
| 第一阶段 | 单页模板、常用图表、Data Spec 导入、编辑预览和 PPTX 导出 | 已实现 |
| 第二阶段 | 扩展图表/组件、数据和资源管理、模板编辑、多页文稿 | 已实现主要范围 |
| 第三阶段 | 导航、跨文稿页面导入、多页导出、真实 BI 刷新与生产化 | 前三项已实现；真实 BI 刷新待接入 |

本项目受 think-cell 的业务汇报工作流启发，但数据模型、界面和实现均为独立设计。公开发布时应避免使用第三方商标暗示官方关联。

参考资料：

- [think-cell Charts](https://www.think-cell.com/en/product/think-cell-charts)：数据驱动图表、表格和标注；
- [think-cell Library](https://www.think-cell.com/en/resources/manual/library)：幻灯片、模板、图像和图标复用；
- [Advanced report automation](https://www.think-cell.com/en/resources/manual/introductionautomation)：使用 Excel 或 JSON 数据填充 PowerPoint 模板。

## 后续 Roadmap

| 优先级 | 演进方向 | 目标 |
| --- | --- | --- |
| P0 | BI Studio 适配器 | 落地 `chartId` Data Spec 导出、模型 ID 和具名 DAX 查询刷新 |
| P0 | 生产安全 | 替换开发账号，完善密码/会话策略、密钥管理、TLS 和审计 |
| P1 | 对象存储与部署 | 把本地资源和导出文件迁移到共享对象存储，提供容器化部署 |
| P1 | API 契约 | 为 Data Spec、查询刷新和错误响应生成 OpenAPI/JSON Schema |
| P1 | 编辑器工程化 | 在行为测试保护下拆分大型编辑器、样式和后端装配模块 |
| P2 | 汇报智能化 | 增加叙事建议、数据异常提示和自动页面结构编排 |
