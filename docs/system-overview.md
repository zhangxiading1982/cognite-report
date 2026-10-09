# 系统功能说明

## 系统定位

Slide Report 是 BI 分析与管理汇报之间的浏览器编排层。BI Studio 负责模型、DAX 计算和图表数据，Slide Report 接收结构化 Data Spec，把数据与商业汇报模板组合为可编辑页面，再组织成多页文稿并导出可继续编辑的 PPTX。

产品思路参考了 think-cell 在 PowerPoint 中的数据驱动图表、模板复用和报告自动化能力。think-cell 官方说明中，图表数据表会驱动页面即时更新，Library 集中管理幻灯片和图片资源，自动化接口可用 Excel 或 JSON 数据填充模板。Slide Report 将类似工作流实现为独立的前后端 Web 系统，并采用自己的领域模型、交互和代码实现：

- [think-cell Charts](https://www.think-cell.com/en/product/think-cell-charts)
- [think-cell Library](https://www.think-cell.com/en/resources/manual/library)
- [Advanced report automation](https://www.think-cell.com/en/resources/manual/introductionautomation)

Slide Report 与 think-cell GmbH 没有关联，也不是 think-cell 产品的兼容实现。

## 主要功能

| 模块 | 能力 |
| --- | --- |
| 我的文档 | 创建多页文稿，导入模板或空白页，编辑文字、形状、资源、表格与图表，配置导航并导出 PPTX |
| 模板库 | 按目录浏览商业汇报模板，查看业务背景、适用场景、页面样例和配套表格数据；owner 可维护模板 |
| 数据管理 | 管理图表输入表、字段 Schema、版本、来源和图表映射；支持人工录入与 Mock BI 刷新 |
| 资源库 | 按目录管理图片、图标和 SVG，支持上传、预览、颜色/背景加工、下载和另存 |
| 导出记录 | 查询历史 PPTX 导出任务，下载结果或连同文件删除记录 |
| 用户管理 | 管理 `admin`、`user` 角色以及对象 owner、公开/私有可见性 |

## 核心工作流

1. **准备数据**：人工录入表格，或用 BI Studio `chartId` 的 Mock 接口导入 Data Spec。
2. **创建页面**：从模板库导入完整页面，或从空白页插入图表、表格、文字、形状和资源。
3. **编辑与绑定**：在画布中调整布局和样式；图表可使用页面私有数据，也可绑定数据管理中的稳定数据集。
4. **组织文稿**：添加、复制、删除或跨文稿导入页面，配置章节、导航页和页码。
5. **冻结并导出**：保存文稿快照，预览后创建导出任务，下载标准 `.pptx` 文件。

页面编辑使用当前数据集版本；预览和历史导出使用冻结版本。这既允许数据持续更新，也保证已交付汇报可复现。

## 功能边界

- 当前 BI Studio `chartId` 导出和 DAX 查询使用 Mock；真实 API 适配器尚未实现。
- 当前交付目标是浏览器预览与 PPTX 尽量一致，字体最终渲染仍取决于打开文件的电脑。
- 内置账号和密码只用于开发环境，不能直接用于生产部署。
- 系统采用本地文件存储保存资源和导出文件；多实例部署前需接入共享对象存储或提供一致挂载。

## 编译、启动和使用入口

- 从零安装：[环境准备与初始化](environment-setup.md)
- 配置与启动：[开发与启动](development.md)
- 操作流程：[使用说明](user-guide.md)
- 系统结构：[系统架构](architecture.md)
- 后续演进：[项目背景与 Roadmap](project-background.md)
