import type { DataSpec, NumberFormat } from "./schema";
import type { Binding, Rect, SlideElement, SlideSpec } from "./types";

type ScalarType = "string" | "decimal" | "integer" | "boolean" | "date" | "datetime";
type SampleField = {
  id: string;
  name: string;
  type: ScalarType;
  description: string;
  unit?: string;
  measure?: {
    baseUnit: string;
    currency?: string;
    format?: Partial<NumberFormat>;
    aggregationBehavior?: "additive" | "semiAdditive" | "nonAdditive";
    favorableDirection?: "higher" | "lower" | "neutral";
  };
};

export interface BusinessTemplateDefinition {
  id: string;
  name: string;
  scene: "budgetComparison" | "monthlyTrend" | "revenueBridge";
  folderId: string;
  previewText: string;
  payload: {
    seedRevision: number;
    chartType?: string;
    requiredBindings: Record<string, unknown>;
    bindingSchema: Record<string, unknown>;
    canvas: SlideSpec["canvas"];
    slots: unknown[];
    defaultElements: SlideElement[];
    defaultBindings: Record<string, Binding>;
    allowedControls: string[];
    exportCapabilities: string[];
    example: {
      identityVersion: 1;
      designVersion: number;
      slide: SlideSpec;
      dataSpec: DataSpec;
      businessContext: { background: string; scenarios: string[] };
    };
  };
}

export const BUSINESS_TEMPLATE_FOLDERS = [
  { id: "template-folder-general", name: "通用叙事" },
  { id: "template-folder-finance", name: "经营与财务" },
  { id: "template-folder-project", name: "项目管理" },
  { id: "template-folder-strategy", name: "战略与销售" },
  { id: "template-folder-organization", name: "组织与协作" },
  { id: "template-folder-analysis", name: "专业分析" },
] as const;

const canvas = { width: 960, height: 540, unit: "pt" } as const;
const blue = "2563EB";
const navy = "172033";
const muted = "64748B";
const lightBlue = "EFF6FF";
const paleBlue = "DBEAFE";
const paleGreen = "DCFCE7";
const paleAmber = "FEF3C7";
const paleRed = "FEE2E2";
const white = "FFFFFF";
const money: NumberFormat = { displayDivisor: "1", decimals: 0, suffix: "万元", percent: false };
const percent: NumberFormat = { displayDivisor: "1", decimals: 0, suffix: "%", percent: true };
const strategyUpgrade = { seedRevision: 10, designVersion: 11 } as const;
const strategyRepair = { seedRevision: 11, designVersion: 12 } as const;

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const text = (
  id: string,
  box: Rect,
  value: string,
  fontSize = 16,
  style: Record<string, unknown> = {},
): SlideElement => ({
  id,
  type: "text",
  rect: box,
  z: 10,
  style: { fontSize, color: navy, ...style },
  runs: [{ text: value }],
});
const shape = (
  id: string,
  box: Rect,
  value: string,
  fill = lightBlue,
  style: Record<string, unknown> = {},
  kind = "rect",
): SlideElement => ({
  id,
  type: "shape",
  shape: kind,
  rect: box,
  z: 3,
  fill,
  line: { color: fill, width: 0 },
  style: { fontSize: 15, color: navy, align: "center", valign: "middle", ...style },
  runs: [{ text: value }],
});
const table = (
  id: string,
  box: Rect,
  fields: string[],
  fontSize = 12,
  style: Record<string, unknown> = {},
): SlideElement => ({
  id,
  type: "table",
  rect: box,
  z: 4,
  bindingRef: "main",
  fields,
  style: { fontFace: "SimHei", fontSize, headerFontSize: Math.max(8, fontSize - 1), fill: "DCEAF7", headerColor: "173B67", headerBold: true, firstColumnBold: true, firstColumnWide: true, numericAlign: "right", formatNumbers: true, bodyFill: white, bodyStripeFill: "F8FAFC", borderMode: "horizontal", color: navy, line: { color: "D8E1EC", width: 0.6 }, ...style },
});
const chart = (
  id: string,
  box: Rect,
  chartType: string,
  options: Record<string, unknown> = {},
): SlideElement => ({
  id,
  type: "chart",
  rect: box,
  z: 4,
  bindingRef: "main",
  chartType,
  options: { showLegend: true, showLabels: true, ...options },
  style: { themeId: "executive", fontFace: "SimHei", fontSize: 11, labelFontSize: 9, labelColor: "334155", axisColor: "64748B", gridColor: "E2E8F0", barThickness: 0.74, plotHeight: 0.92, lineWidth: 2.5, markerSize: 3 },
  exportPolicy: chartType === "waterfall" ? "nativeShapes" : "nativeChart",
});
const status = (
  id: string,
  box: Rect,
  label: string,
  rowKey: Record<string, unknown>,
  fill = blue,
): SlideElement => ({
  id,
  type: "status",
  rect: box,
  z: 5,
  bindingRef: "main",
  rowKey,
  label,
  style: { fontSize: 13, fill },
});
const taglineFor = (id: string) => {
  if (["pnl-overview", "kpi-dashboard", "metric-scorecard", "multi-profit-bridge", "cost-variance", "scenario-comparison", "quarterly-business-review", "resource-capacity"].some((key) => id.includes(key))) return "稳健经营  ·  价值创造";
  if (["project", "roadmap", "milestone", "gantt", "workflow", "dependency", "risk", "action"].some((key) => id.includes(key))) return "按期交付  ·  创造价值";
  if (["competitive", "market", "sales", "customer", "swot", "decision", "portfolio", "operating", "process"].some((key) => id.includes(key))) return "立足当下  ·  赢得未来";
  return "聚焦重点  ·  推动决策";
};
const title = (id: string, value: string, subtitle: string): SlideElement[] => [
  { id: `${id}-frame`, type: "shape", shape: "rect", rect: rect(12, 12, 936, 516), z: 0, fill: white, line: { color: "DCE5EF", width: 0.8 }, runs: [] },
  text(`${id}-title`, rect(36, 26, 650, 42), value, 31, { bold: true, fontFace: "SimHei", color: "102B57" }),
  text(`${id}-subtitle`, rect(36, 70, 650, 24), subtitle, 14, { color: "29466F", fontFace: "SimHei" }),
  text(`${id}-tagline`, rect(716, 34, 208, 20), taglineFor(id), 10, { color: "315C93", bold: true, align: "right", fontFace: "SimHei" }),
  shape(`${id}-accent`, rect(852, 64, 72, 1.5), "", "4C86D7", {}, "rect"),
  text(`${id}-footer`, rect(36, 514, 260, 10), "以数据洞察  ·  以行动创未来", 7, { color: "8AA0BA", fontFace: "SimHei" }),
  text(`${id}-page`, rect(888, 514, 36, 10), "01", 7, { color: "315C93", align: "right", fontFace: "SimHei" }),
];

const metricCard = (id: string, x: number, label: string, value: string, delta: string, fill = "F5F8FC"): SlideElement[] => [
  shape(`${id}-card`, rect(x, 112, 204, 88), "", fill, {}, "rect"),
  text(`${id}-label`, rect(x + 18, 124, 168, 18), label, 12, { color: "173B67", bold: true }),
  text(`${id}-value`, rect(x + 18, 145, 168, 30), value, 24, { color: "102B57", bold: true }),
  text(`${id}-delta`, rect(x + 18, 177, 168, 16), delta, 10, { color: delta.includes("▼") ? "B45309" : "0F8A83", bold: true }),
];

function makeData(
  id: string,
  tableName: string,
  fields: SampleField[],
  rows: Record<string, unknown>[],
  chartHint?: { chartType: NonNullable<DataSpec["chartHints"]>[number]["chartType"]; roles: Record<string, string | string[]> },
): DataSpec {
  const columnRef = (field: SampleField) => `column-${id}-${field.id}`;
  const measureRef = (field: SampleField) => `measure-${id}-${field.id}`;
  return {
    specVersion: "1.0",
    id: `template-data-${id}`,
    mode: "snapshot",
    source: { system: "SlideBI 模板样例", modelId: `template-model-${id}`, modelRevision: "1" },
    snapshot: {
      id: `template-snapshot-${id}`,
      capturedAt: "2026-09-30T10:00:00+08:00",
      dataAsOf: "2026-09-30T23:59:59+08:00",
      consistency: "fixture",
    },
    context: { locale: "zh-CN", timezone: "Asia/Shanghai", parameters: {}, filters: [], effectiveFilters: [] },
    semanticSchema: {
      coverage: "referencedSubset",
      tables: [
        {
          id: `table-${id}`,
          name: tableName,
          columns: fields.filter((field) => !field.measure).map((field) => ({ id: columnRef(field), name: field.name, type: field.type })),
        },
      ],
      relationships: [],
    },
    measures: fields.filter((field) => field.measure).map((field) => ({
      id: measureRef(field),
      name: field.name,
      dax: `[${field.name}]`,
      description: field.description,
      unit: { baseUnit: field.measure!.baseUnit, ...(field.measure!.currency ? { currency: field.measure!.currency } : {}) },
      format: {
        displayDivisor: "1",
        decimals: 0,
        suffix: "",
        percent: false,
        ...field.measure!.format,
      },
      aggregationBehavior: field.measure!.aggregationBehavior ?? "additive",
      favorableDirection: field.measure!.favorableDirection ?? "higher",
      dependencies: [],
    })),
    queries: [
      {
        id: `query-${id}`,
        provider: "fixture",
        definition: { kind: "fixture", fixtureId: id },
        effectiveFilters: [],
      },
    ],
    resultSets: [
      {
        id: `result-${id}`,
        queryId: `query-${id}`,
        name: tableName,
        grain: [fields[0].id],
        primaryKey: [fields[0].id],
        fields: fields.map((field) => ({
          id: field.id,
          name: field.name,
          description: field.description,
          ...(field.unit ? { unit: field.unit } : {}),
          type: field.type,
          nullable: false,
          semanticRef: field.measure ? measureRef(field) : columnRef(field),
        })),
        rows,
        truncated: false,
      },
    ],
    ...(chartHint ? { chartHints: [{ resultSetId: `result-${id}`, ...chartHint }] } : {}),
  };
}

function roleSchema(binding: Binding, data: DataSpec) {
  const result = data.resultSets.find((item) => item.id === binding.resultSetId)!;
  return Object.fromEntries(
    Object.entries(binding.roles).map(([role, value]) => {
      const ids = Array.isArray(value) ? value : [value];
      const types = [...new Set(ids.map((fieldId) => result.fields.find((field) => field.id === fieldId)!.type))];
      return [role, { label: role, types, multiple: Array.isArray(value), ...(Array.isArray(value) ? { min: ids.length, max: ids.length } : {}) }];
    }),
  );
}

function makeTemplate(input: {
  id: string;
  name: string;
  scene: BusinessTemplateDefinition["scene"];
  folderId: string;
  previewText: string;
  dataSpec: DataSpec;
  binding: Binding;
  elements: SlideElement[];
  background: string;
  scenarios: string[];
  seedRevision?: number;
  designVersion?: number;
}): BusinessTemplateDefinition {
  const slide: SlideSpec = {
    specVersion: "1.0",
    id: `template-example-slide-${input.id}`,
    revision: 1,
    title: input.name,
    scene: input.scene,
    templateRef: { id: input.id, version: 1 },
    themeRef: { id: "corporate-blue", version: 1 },
    canvas: { ...canvas },
    snapshotRef: input.dataSpec.snapshot.id,
    bindings: { main: input.binding },
    elements: input.elements,
    annotations: [],
    layoutOverrides: {},
    reviewState: { status: "notRequired", snapshotId: input.dataSpec.snapshot.id },
  };
  const firstChart = input.elements.find((element) => element.type === "chart");
  return {
    id: input.id,
    name: input.name,
    scene: input.scene,
    folderId: input.folderId,
    previewText: input.previewText,
    payload: {
      seedRevision: input.seedRevision ?? 9,
      ...(firstChart?.chartType ? { chartType: firstChart.chartType } : {}),
      requiredBindings: { main: { roles: Object.keys(input.binding.roles), roleConstraints: roleSchema(input.binding, input.dataSpec) } },
      bindingSchema: { main: { roles: roleSchema(input.binding, input.dataSpec) } },
      canvas: { ...canvas },
      slots: [],
      defaultElements: structuredClone(input.elements),
      defaultBindings: { main: structuredClone(input.binding) },
      allowedControls: ["text", "layout", "theme", "chartOptions", "tableStyle", "shapeStyle"],
      exportCapabilities: ["nativeChart", "editableShapes", "nativeTable"],
      example: {
        identityVersion: 1,
        designVersion: input.designVersion ?? 10,
        slide,
        dataSpec: input.dataSpec,
        businessContext: { background: input.background, scenarios: input.scenarios },
      },
    },
  };
}

const executiveData = makeData(
  "executive-summary",
  "核心经营指标",
  [
    { id: "metricId", name: "指标ID", type: "string", description: "指标稳定标识" },
    { id: "metricName", name: "指标", type: "string", description: "经营指标名称" },
    { id: "current", name: "本期", type: "decimal", description: "本期实际值", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money } },
    { id: "target", name: "目标", type: "decimal", description: "本期目标值", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money } },
    { id: "status", name: "状态", type: "string", description: "指标状态" },
  ],
  [
    { metricId: "revenue", metricName: "营业收入", current: "12800", target: "13200", status: "关注" },
    { metricId: "gross", metricName: "毛利额", current: "4620", target: "4400", status: "良好" },
    { metricId: "cash", metricName: "经营现金流", current: "3180", target: "3000", status: "良好" },
  ],
);

const insightData = makeData(
  "chart-insights",
  "月度订单趋势",
  [
    { id: "month", name: "月份", type: "date", description: "自然月" },
    { id: "orders", name: "订单收入", type: "decimal", description: "当月确认订单收入", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money } },
  ],
  [
    { month: "2026-04-01", orders: "1720" },
    { month: "2026-05-01", orders: "1840" },
    { month: "2026-06-01", orders: "1790" },
    { month: "2026-07-01", orders: "2010" },
    { month: "2026-08-01", orders: "2180" },
    { month: "2026-09-01", orders: "2360" },
  ],
  { chartType: "line", roles: { categoryKey: "month", categoryLabel: "month", series: ["orders"] } },
);

const kpiData = makeData(
  "kpi-dashboard",
  "经营KPI完成情况",
  [
    { id: "metricId", name: "指标ID", type: "string", description: "指标稳定标识" },
    { id: "metricName", name: "指标", type: "string", description: "经营指标名称" },
    { id: "actual", name: "实际", type: "decimal", description: "本期实际值", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money } },
    { id: "target", name: "目标", type: "decimal", description: "目标值", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money } },
    { id: "progress", name: "完成度", type: "decimal", description: "实际相对目标的完成比例", unit: "%", measure: { baseUnit: "ratio", format: percent, aggregationBehavior: "nonAdditive" } },
    { id: "trend", name: "环比趋势", type: "decimal", description: "相对上期变化比例", unit: "%", measure: { baseUnit: "ratio", format: percent, aggregationBehavior: "nonAdditive" } },
    { id: "status", name: "状态", type: "string", description: "指标管理状态" },
  ],
  [
    { metricId: "revenue", metricName: "收入", actual: "12800", target: "13200", progress: "0.97", trend: "0.04", status: "关注" },
    { metricId: "profit", metricName: "毛利", actual: "4620", target: "4400", progress: "1", trend: "0.08", status: "达成" },
    { metricId: "cash", metricName: "现金", actual: "3180", target: "3500", progress: "0.91", trend: "-0.02", status: "风险" },
    { metricId: "renewal", metricName: "续约", actual: "2650", target: "2900", progress: "0.91", trend: "0.03", status: "关注" },
  ],
  { chartType: "comparison", roles: { categoryKey: "metricId", categoryLabel: "metricName", series: ["actual", "target"] } },
);

const pnlData = makeData(
  "pnl-overview",
  "损益摘要",
  [
    { id: "accountId", name: "科目ID", type: "string", description: "损益科目稳定标识" },
    { id: "account", name: "科目", type: "string", description: "损益科目名称" },
    { id: "actual", name: "实际", type: "decimal", description: "本期实际金额", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money } },
    { id: "budget", name: "预算", type: "decimal", description: "本期预算金额", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money } },
    { id: "prior", name: "上年同期", type: "decimal", description: "上年同期金额", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money } },
    { id: "variance", name: "变动额", type: "decimal", description: "实际金额较上年同期的变动额", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money, favorableDirection: "neutral" } },
    { id: "varianceRate", name: "变动幅度", type: "decimal", description: "实际金额较上年同期的变动比例", unit: "%", measure: { baseUnit: "ratio", format: { ...percent, decimals: 0 }, aggregationBehavior: "nonAdditive", favorableDirection: "neutral" } },
  ],
  [
    { accountId: "revenue", account: "营业收入", actual: "12800", budget: "13200", prior: "11600", variance: "1200", varianceRate: "0.103" },
    { accountId: "cogs", account: "营业成本", actual: "8180", budget: "8500", prior: "7650", variance: "530", varianceRate: "0.069" },
    { accountId: "gross", account: "毛利", actual: "4620", budget: "4700", prior: "3950", variance: "670", varianceRate: "0.170" },
    { accountId: "expense", account: "期间费用", actual: "2180", budget: "2500", prior: "2260", variance: "-80", varianceRate: "-0.035" },
    { accountId: "profit", account: "经营利润", actual: "2270", budget: "2200", prior: "1690", variance: "580", varianceRate: "0.343" },
  ],
);

const actionData = makeData(
  "action-plan",
  "重点行动计划",
  [
    { id: "actionId", name: "行动ID", type: "string", description: "行动稳定标识" },
    { id: "action", name: "行动", type: "string", description: "需要完成的关键行动" },
    { id: "owner", name: "负责人", type: "string", description: "行动负责人" },
    { id: "dueDate", name: "截止日期", type: "date", description: "承诺完成日期" },
    { id: "status", name: "状态", type: "string", description: "当前执行状态" },
  ],
  [
    { actionId: "a1", action: "完成华东重点客户续约", owner: "Summer", dueDate: "2026-10-18", status: "进行中" },
    { actionId: "a2", action: "收敛渠道价格政策", owner: "Mary", dueDate: "2026-10-25", status: "待开始" },
    { actionId: "a3", action: "上线费用预警规则", owner: "Marx", dueDate: "2026-10-12", status: "已完成" },
    { actionId: "a4", action: "复盘低转化线索来源", owner: "Summer", dueDate: "2026-10-30", status: "有风险" },
  ],
);

const projectData = makeData(
  "project-status",
  "项目工作流状态",
  [
    { id: "workstreamId", name: "工作流ID", type: "string", description: "工作流稳定标识" },
    { id: "workstream", name: "工作流", type: "string", description: "项目工作流名称" },
    { id: "owner", name: "负责人", type: "string", description: "工作流负责人" },
    { id: "progress", name: "完成度", type: "decimal", description: "工作流完成比例", unit: "%", measure: { baseUnit: "ratio", format: percent, aggregationBehavior: "nonAdditive" } },
    { id: "status", name: "状态", type: "string", description: "工作流状态" },
    { id: "risk", name: "主要风险", type: "string", description: "当前最主要的风险" },
  ],
  [
    { workstreamId: "design", workstream: "方案设计", owner: "Mary", progress: "1", status: "正常", risk: "无" },
    { workstreamId: "build", workstream: "开发实施", owner: "Marx", progress: "0.78", status: "正常", risk: "资源紧张" },
    { workstreamId: "pilot", workstream: "试点验证", owner: "Summer", progress: "0.52", status: "关注", risk: "样本覆盖" },
    { workstreamId: "launch", workstream: "推广上线", owner: "Summer", progress: "0.25", status: "关注", risk: "培训排期" },
  ],
);

const roadmapData = makeData(
  "roadmap",
  "年度路线图",
  [
    { id: "initiativeId", name: "事项ID", type: "string", description: "路线图事项稳定标识" },
    { id: "initiative", name: "重点事项", type: "string", description: "阶段重点工作" },
    { id: "lane", name: "泳道", type: "string", description: "工作所属方向" },
    { id: "period", name: "阶段", type: "string", description: "计划完成阶段" },
    { id: "status", name: "状态", type: "string", description: "当前状态" },
  ],
  [
    { initiativeId: "r1", initiative: "经营指标统一", lane: "数据基础", period: "Q1", status: "已完成" },
    { initiativeId: "r2", initiative: "模板体系建设", lane: "产品能力", period: "Q2", status: "已完成" },
    { initiativeId: "r3", initiative: "自动刷新与交付", lane: "产品能力", period: "Q3", status: "进行中" },
    { initiativeId: "r4", initiative: "规模化推广", lane: "业务推广", period: "Q4", status: "待开始" },
  ],
);

const riskData = makeData(
  "risk-matrix",
  "关键风险清单",
  [
    { id: "riskId", name: "风险ID", type: "string", description: "风险稳定标识" },
    { id: "risk", name: "风险", type: "string", description: "风险描述" },
    { id: "probability", name: "概率", type: "integer", description: "发生概率等级，1至3" },
    { id: "impact", name: "影响", type: "integer", description: "影响等级，1至3" },
    { id: "owner", name: "负责人", type: "string", description: "风险责任人" },
    { id: "mitigation", name: "缓解措施", type: "string", description: "风险缓解行动" },
  ],
  [
    { riskId: "R1", risk: "关键客户延期", probability: 3, impact: 3, owner: "Summer", mitigation: "联合拜访并周跟踪" },
    { riskId: "R2", risk: "数据口径变更", probability: 2, impact: 3, owner: "Marx", mitigation: "冻结版本并回归验证" },
    { riskId: "R3", risk: "培训覆盖不足", probability: 2, impact: 2, owner: "Mary", mitigation: "增加两场工作坊" },
  ],
);

const processData = makeData(
  "business-process",
  "客户交付流程",
  [
    { id: "stepId", name: "步骤ID", type: "string", description: "流程步骤稳定标识" },
    { id: "step", name: "步骤", type: "string", description: "流程步骤名称" },
    { id: "owner", name: "责任团队", type: "string", description: "步骤责任团队" },
    { id: "output", name: "关键产出", type: "string", description: "步骤完成后的交付物" },
    { id: "sortOrder", name: "顺序", type: "integer", description: "流程顺序" },
  ],
  [
    { stepId: "p1", step: "需求澄清", owner: "售前", output: "需求清单", sortOrder: 1 },
    { stepId: "p2", step: "方案确认", owner: "产品", output: "实施方案", sortOrder: 2 },
    { stepId: "p3", step: "配置交付", owner: "实施", output: "可用环境", sortOrder: 3 },
    { stepId: "p4", step: "验收推广", owner: "客户成功", output: "验收报告", sortOrder: 4 },
  ],
);

const swotData = makeData(
  "swot-analysis",
  "SWOT分析要点",
  [
    { id: "itemId", name: "要点ID", type: "string", description: "分析要点稳定标识" },
    { id: "quadrant", name: "象限", type: "string", description: "优势、劣势、机会或威胁" },
    { id: "item", name: "分析要点", type: "string", description: "需要沟通的核心判断" },
    { id: "priority", name: "优先级", type: "string", description: "要点的重要程度" },
  ],
  [
    { itemId: "s1", quadrant: "优势", item: "数据与汇报链路一体化", priority: "高" },
    { itemId: "s2", quadrant: "劣势", item: "高级图表仍需补齐", priority: "高" },
    { itemId: "s3", quadrant: "机会", item: "经营汇报标准化需求增长", priority: "高" },
    { itemId: "s4", quadrant: "威胁", item: "组织模板标准不统一", priority: "中" },
  ],
);

const funnelData = makeData(
  "sales-funnel",
  "销售漏斗",
  [
    { id: "stageId", name: "阶段ID", type: "string", description: "销售阶段稳定标识" },
    { id: "stage", name: "销售阶段", type: "string", description: "销售漏斗阶段" },
    { id: "value", name: "商机金额", type: "decimal", description: "阶段内商机金额", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money } },
    { id: "conversion", name: "阶段转化率", type: "decimal", description: "进入下一阶段的转化率", unit: "%", measure: { baseUnit: "ratio", format: percent, aggregationBehavior: "nonAdditive" } },
  ],
  [
    { stageId: "lead", stage: "有效线索", value: "8600", conversion: "0.72" },
    { stageId: "qualified", stage: "确认商机", value: "6200", conversion: "0.65" },
    { stageId: "proposal", stage: "方案报价", value: "4050", conversion: "0.61" },
    { stageId: "negotiation", stage: "商务谈判", value: "2470", conversion: "0.57" },
    { stageId: "won", stage: "赢单", value: "1410", conversion: "1" },
  ],
  { chartType: "comparison", roles: { categoryKey: "stageId", categoryLabel: "stage", series: ["value"] } },
);

const competitionData = makeData(
  "competitive-positioning",
  "竞争定位样例",
  [
    { id: "companyId", name: "对象ID", type: "string", description: "竞争对象稳定标识" },
    { id: "company", name: "竞争对象", type: "string", description: "品牌或方案名称" },
    { id: "capability", name: "能力完整度", type: "decimal", description: "能力完整度评分", unit: "分", measure: { baseUnit: "score", format: { displayDivisor: "1", decimals: 1, suffix: "分", percent: false }, aggregationBehavior: "nonAdditive" } },
    { id: "value", name: "客户价值", type: "decimal", description: "客户价值评分", unit: "分", measure: { baseUnit: "score", format: { displayDivisor: "1", decimals: 1, suffix: "分", percent: false }, aggregationBehavior: "nonAdditive" } },
    { id: "group", name: "类型", type: "string", description: "竞争对象分组" },
  ],
  [
    { companyId: "ours", company: "本方案", capability: "8.6", value: "8.9", group: "本方案" },
    { companyId: "a", company: "方案A", capability: "7.2", value: "6.8", group: "竞品" },
    { companyId: "b", company: "方案B", capability: "6.4", value: "8.1", group: "竞品" },
    { companyId: "manual", company: "人工方式", capability: "4.2", value: "4.8", group: "替代方案" },
  ],
  { chartType: "scatter", roles: { categoryKey: "companyId", categoryLabel: "company", x: "capability", y: "value" } },
);

const CORE_BUSINESS_TEMPLATES: readonly BusinessTemplateDefinition[] = [
  makeTemplate({
    id: "executive-summary",
    name: "执行摘要 · 一页结论",
    scene: "budgetComparison",
    folderId: "template-folder-general",
    previewText: "本期经营总体稳健",
    dataSpec: executiveData,
    binding: { resultSetId: "result-executive-summary", roles: { columns: ["metricName", "current", "target", "status"], categoryKey: "metricId", categoryLabel: "metricName", series: ["current", "target"] }, computations: [] },
    elements: [
      ...title("executive-summary", "本期经营总体稳健，利润与现金流优于目标", "2026年9月经营执行摘要"),
      ...metricCard("executive-revenue", 36, "营业收入", "12,800 万元", "同比 +10%  ▲", "F3F7FC"),
      ...metricCard("executive-profit", 256, "毛利额", "4,620 万元", "同比 +17%  ▲", "F1F9F6"),
      ...metricCard("executive-cash", 476, "经营现金流", "3,180 万元", "同比 +22%  ▲", "F2F8FC"),
      ...metricCard("executive-status", 696, "整体判断", "稳中向好", "利润、现金流达成", "FFF8E8"),
      text("executive-chart-label", rect(36, 222, 590, 22), "核心指标（万元）", 13, { bold: true, color: "173B67" }),
      chart("executive-chart", rect(36, 248, 590, 224), "comparison", { numberFormat: money, direction: "column", showLegend: true, showLabels: true }),
      shape("executive-conclusion-bg", rect(660, 232, 264, 240), "", "F1F8FA", {}, "rect"),
      text("executive-conclusion-title", rect(684, 252, 216, 30), "关键结论", 20, { color: "102B57", bold: true }),
      shape("executive-conclusion-rule", rect(684, 288, 54, 3), "", "159A9C", {}, "rect"),
      text("executive-conclusion", rect(684, 306, 216, 88), "毛利和现金流超过目标，经营韧性持续增强。", 15, { color: "29466F" }),
      text("executive-risk", rect(684, 392, 216, 70), "下一步：聚焦客户续约与渠道价格治理", 11, { color: "0F766E", bold: true }),
    ],
    background: "在一页内汇总管理层需要的核心指标、总体判断、风险与下一步，作为经营汇报首页。",
    scenarios: ["月度经营会", "季度业务复盘", "管理层执行摘要"],
  }),
  makeTemplate({
    id: "chart-insights",
    name: "图表与关键洞察",
    scene: "monthlyTrend",
    folderId: "template-folder-general",
    previewText: "订单收入连续两月加速增长",
    dataSpec: insightData,
    binding: { resultSetId: "result-chart-insights", roles: { categoryKey: "month", categoryLabel: "month", series: ["orders"] }, computations: [] },
    elements: [
      ...title("chart-insights", "订单收入连续两月加速增长", "月度订单趋势与业务解读"),
      chart("insight-chart", rect(36, 112, 610, 330), "line", { numberFormat: money }),
      text("insight-observation", rect(676, 112, 248, 124), "关键洞察\n8–9月增长提速，重点行业客户贡献约六成新增订单。", 16, { fill: lightBlue, line: { color: "93C5FD", width: 1 }, bold: true }),
      text("insight-cause", rect(676, 252, 248, 92), "主要原因\n渠道活动转化提升，重点客户签约提前。", 14, { fill: "F8FAFC", line: { color: "CBD5E1", width: 1 } }),
      text("insight-action", rect(676, 360, 248, 82), "下一步\n复制高转化行业打法，跟进10月交付节奏。", 14, { fill: paleGreen, line: { color: "86EFAC", width: 1 } }),
    ],
    background: "把一张数据图与观察、原因和行动放在同一页，帮助汇报者从展示数据转向解释业务。",
    scenarios: ["经营趋势分析", "销售复盘", "管理层数据故事"],
  }),
  makeTemplate({
    id: "kpi-dashboard",
    name: "经营 KPI 驾驶舱",
    scene: "budgetComparison",
    folderId: "template-folder-finance",
    previewText: "经营 KPI 驾驶舱",
    dataSpec: kpiData,
    binding: { resultSetId: "result-kpi-dashboard", roles: { categoryKey: "metricId", categoryLabel: "metricName", series: ["actual", "target"], label: "metricName", value: "actual", target: "target", trend: "trend", status: "status" }, computations: [] },
    elements: [
      ...title("kpi-dashboard", "经营 KPI 驾驶舱", "实际、目标与完成度一页掌握"),
      chart("kpi-chart", rect(36, 112, 560, 310), "comparison", { numberFormat: money, direction: "bar" }),
      { id: "kpi-cards", type: "kpiCards", rect: rect(626, 112, 298, 310), z: 4, bindingRef: "main", columns: 2, style: { fontSize: 12 } },
      text("kpi-note", rect(36, 444, 888, 44), "关注：收入和现金流仍低于目标；毛利受产品组合改善带动已提前达成。", 14, { fill: "FFF7ED", line: { color: "F59E0B", width: 1 } }),
    ],
    background: "以实际和目标对比、完成度状态及管理提示形成经营驾驶舱，适合周期性复盘。",
    scenarios: ["经营周报", "月度管理会", "季度业务回顾"],
  }),
  makeTemplate({
    id: "pnl-overview",
    name: "损益表 · 经营结果",
    scene: "budgetComparison",
    folderId: "template-folder-finance",
    previewText: "财务表现",
    dataSpec: pnlData,
    binding: { resultSetId: "result-pnl-overview", roles: { columns: ["account", "prior", "actual", "variance", "varianceRate"] }, computations: [] },
    elements: [
      ...title("pnl-overview", "财务表现", "2025 vs 2026｜单位：万元"),
      table("pnl-table", rect(36, 118, 888, 324), ["account", "prior", "actual", "variance", "varianceRate"], 15, { headerFontSize: 13, columnWidths: [1.55, 1, 1, 1, 1], directionFields: ["variance", "varianceRate"], positiveColor: "16845B", negativeColor: "C53B43", lastRowBold: true, bodyStripeFill: "FFFFFF" }),
      shape("pnl-conclusion-accent", rect(36, 462, 5, 46), "", "E6A100", {}, "rect"),
      shape("pnl-conclusion-bg", rect(41, 462, 883, 46), "", "F5F8FC", {}, "rect"),
      text("pnl-conclusion-label", rect(58, 474, 94, 22), "关键结论", 16, { bold: true, color: "102B57" }),
      text("pnl-note", rect(162, 476, 738, 20), "经营利润高于预算70万元，主要由费用控制和产品组合改善贡献。", 12, { color: "29466F" }),
    ],
    background: "以可编辑表格展示收入、成本、毛利、费用和利润的实际、预算与同期结果，并突出管理结论。",
    scenarios: ["财务月报", "损益复盘", "预算执行分析"],
  }),
  makeTemplate({
    id: "action-plan",
    name: "行动计划 · 下一步",
    scene: "budgetComparison",
    folderId: "template-folder-general",
    previewText: "重点行动计划",
    dataSpec: actionData,
    binding: { resultSetId: "result-action-plan", roles: { columns: ["action", "owner", "dueDate", "status"] }, computations: [] },
    elements: [
      ...title("action-plan", "重点行动计划", "明确责任、期限与当前状态"),
      shape("action-focus", rect(36, 112, 276, 70), "本月聚焦\n续约、定价与线索转化", lightBlue, { fontSize: 16, bold: true }),
      shape("action-due", rect(328, 112, 276, 70), "最近截止\n2026-10-12", paleAmber, { fontSize: 16, bold: true }),
      shape("action-risk", rect(620, 112, 304, 70), "需要升级\n低转化线索来源复盘", paleRed, { fontSize: 16, bold: true }),
      table("action-table", rect(36, 204, 888, 268), ["action", "owner", "dueDate", "status"], 13),
      text("action-note", rect(36, 486, 888, 24), "状态在每次经营会更新；逾期或有风险的行动优先讨论。", 12, { color: muted }),
    ],
    background: "把经营结论转换为具备负责人、截止日期和状态的行动清单，适合作为汇报收尾页。",
    scenarios: ["经营会行动跟踪", "项目下一步", "客户会议纪要"],
  }),
  makeTemplate({
    id: "project-status",
    name: "项目状态总览",
    scene: "budgetComparison",
    folderId: "template-folder-project",
    previewText: "项目整体按计划推进",
    dataSpec: projectData,
    binding: { resultSetId: "result-project-status", roles: { columns: ["workstream", "owner", "progress", "status", "risk"], value: "progress", label: "workstream", owner: "owner", progress: "progress", status: "status", comment: "risk" }, computations: [] },
    elements: [
      ...title("project-status", "项目整体按计划推进，试点与培训需要关注", "项目状态总览｜2026年9月"),
      { id: "project-status-list", type: "statusTable", rect: rect(36, 116, 414, 304), z: 4, bindingRef: "main", style: { fontSize: 11 } },
      text("project-summary", rect(480, 116, 444, 98), "总体判断\n核心功能按期交付，试点样本覆盖和培训排期是当前关键路径。", 17, { fill: lightBlue, line: { color: "93C5FD", width: 1 }, bold: true }),
      table("project-table", rect(480, 230, 444, 190), ["workstream", "owner", "status", "risk"], 10),
      text("project-next", rect(36, 448, 888, 42), "下阶段：完成试点验收，锁定推广名单，并按部门分批开展培训。", 14, { fill: paleGreen, line: { color: "86EFAC", width: 1 } }),
    ],
    background: "将项目工作流完成度、负责人、状态、主要风险和下一阶段动作集中展示。",
    scenarios: ["项目周报", "项目委员会", "客户项目状态汇报"],
  }),
  makeTemplate({
    id: "roadmap",
    name: "年度路线图",
    scene: "budgetComparison",
    folderId: "template-folder-project",
    previewText: "年度路线图",
    dataSpec: roadmapData,
    binding: { resultSetId: "result-roadmap", roles: { columns: ["initiative", "lane", "period", "status"], label: "initiative", lane: "lane", period: "period", status: "status" }, computations: [] },
    elements: [
      ...title("roadmap", "年度路线图", "从数据基础到规模化推广的四阶段计划"),
      ...["Q1 规划与启动", "Q2 建设与迭代", "Q3 测试与验证", "Q4 上线与推广"].map((label, index) => shape(`roadmap-phase-${index}`, rect(176 + index * 184, 112, 188, 42), label, ["DCEBFA", "5794DF", "2870C9", "123E78"][index], { fontSize: 13, bold: true, color: index ? white : "173B67" }, "chevron")),
      text("roadmap-lane-label", rect(36, 124, 122, 22), "工作流", 13, { bold: true, color: "173B67" }),
      { id: "roadmap-data-view", type: "roadmap", rect: rect(36, 168, 888, 286), z: 4, bindingRef: "main", style: { fontSize: 12 } },
      text("roadmap-note", rect(36, 474, 888, 26), "当前处于 Q3：自动刷新与多页交付能力进入验收。", 12, { color: "315C93" }),
    ],
    background: "按季度或阶段展示重点事项、工作泳道、里程碑和状态，用于沟通高层计划与推进节奏。",
    scenarios: ["产品路线图", "年度战略规划", "项目阶段计划"],
  }),
  makeTemplate({
    id: "risk-matrix",
    name: "风险与问题矩阵",
    scene: "budgetComparison",
    folderId: "template-folder-project",
    previewText: "关键风险与应对",
    dataSpec: riskData,
    binding: { resultSetId: "result-risk-matrix", roles: { columns: ["riskId", "risk", "probability", "impact", "owner", "mitigation"], key: "riskId", label: "risk", probability: "probability", impact: "impact" }, computations: [] },
    elements: [
      ...title("risk-matrix", "关键风险与应对", "概率 × 影响矩阵及责任人"),
      { id: "risk-data-matrix", type: "riskMatrix", rect: rect(36, 116, 378, 232), z: 4, bindingRef: "main", style: { fontSize: 11 } },
      table("risk-table", rect(444, 116, 480, 232), ["riskId", "risk", "owner", "mitigation"], 10),
      text("risk-action", rect(36, 382, 888, 84), "管理提示\nR1 需要每周升级跟踪；R2 在每次数据口径变更前冻结版本并执行回归验证。", 15, { fill: "FFF7ED", line: { color: "F59E0B", width: 1 }, bold: true }),
    ],
    background: "以概率和影响识别重点风险，同时列出责任人和缓解措施，支持项目与经营风险讨论。",
    scenarios: ["项目风险评审", "经营风险复盘", "重大事项升级"],
  }),
  makeTemplate({
    id: "business-process",
    name: "业务流程",
    scene: "budgetComparison",
    folderId: "template-folder-strategy",
    previewText: "四步形成可复用的客户交付闭环",
    ...strategyUpgrade,
    dataSpec: processData,
    binding: { resultSetId: "result-business-process", roles: { columns: ["step", "owner", "output", "sortOrder"], label: "step", owner: "owner", output: "output", sort: "sortOrder" }, computations: [] },
    elements: [
      ...title("business-process", "四步形成可复用的客户交付闭环", "从需求对齐到验收推广｜责任与产出同步落位"),
      { id: "business-process-flow", type: "processFlow", rect: rect(36, 120, 888, 284), z: 4, bindingRef: "main", style: { fontSize: 12, variant: "executive" } },
      shape("business-process-note-accent", rect(36, 432, 5, 54), "", "168E96", {}, "rect"),
      shape("business-process-note-bg", rect(41, 432, 883, 54), "", "F4F7FB", {}, "rect"),
      text("business-process-note-label", rect(58, 447, 100, 22), "管理控制点", 14, { color: "102B57", bold: true }),
      text("business-process-note", rect(168, 448, 732, 20), "每一步均明确责任团队与可验收产出，交接时只确认结果，不重复确认范围。", 11, { color: "29466F" }),
    ],
    background: "用标准步骤和责任产出解释跨团队业务流程，减少口头沟通歧义。",
    scenarios: ["客户交付流程", "运营流程优化", "解决方案说明"],
  }),
  makeTemplate({
    id: "swot-analysis",
    name: "SWOT 分析与结论",
    scene: "budgetComparison",
    folderId: "template-folder-strategy",
    previewText: "标准化窗口已打开，先建立高频模板优势",
    ...strategyRepair,
    dataSpec: swotData,
    binding: { resultSetId: "result-swot-analysis", roles: { quadrant: "quadrant", item: "item", priority: "priority", columns: ["quadrant", "item", "priority"] }, computations: [] },
    elements: [
      ...title("swot-analysis", "标准化窗口已打开，先建立高频模板优势", "SWOT 分析｜从能力盘点收敛到清晰行动"),
      { id: "swot-analysis-view", type: "swotMatrix", rect: rect(36, 118, 602, 332), z: 4, bindingRef: "main", style: { fontSize: 12 } },
      shape("swot-conclusion-bg", rect(666, 118, 258, 332), "", "F3F7FC", {}, "roundRect"),
      text("swot-conclusion-kicker", rect(690, 142, 210, 18), "战略建议", 10, { color: "168E96", bold: true }),
      text("swot-conclusion-title", rect(690, 172, 210, 76), "先标准化\n再规模化", 25, { color: "102B57", bold: true }),
      shape("swot-conclusion-rule", rect(690, 260, 54, 3), "", "168E96", {}, "rect"),
      text("swot-conclusion", rect(690, 282, 202, 104), "优先用高频模板统一表达，再补齐差异化图表能力。", 14, { color: "29466F", bold: true }),
      text("swot-conclusion-action", rect(690, 402, 202, 30), "以真实使用数据持续迭代", 10, { color: "5B6F88", bold: true }),
    ],
    background: "将优势、劣势、机会和威胁放在统一框架中，并把分析结果收敛为明确建议。",
    scenarios: ["战略研讨", "业务规划", "风险与机会分析"],
  }),
  makeTemplate({
    id: "sales-funnel",
    name: "销售与营销漏斗",
    scene: "budgetComparison",
    folderId: "template-folder-strategy",
    previewText: "销售漏斗与转化机会",
    dataSpec: funnelData,
    binding: { resultSetId: "result-sales-funnel", roles: { categoryKey: "stageId", categoryLabel: "stage", series: ["value"], label: "stage", value: "value", conversion: "conversion" }, computations: [] },
    elements: [
      ...title("sales-funnel", "销售漏斗与转化机会", "当前商机金额与阶段转化"),
      { id: "sales-funnel-chart", type: "funnel", rect: rect(36, 112, 574, 342), z: 4, bindingRef: "main", style: { fontSize: 12 } },
      shape("sales-funnel-rate", rect(640, 112, 284, 86), "线索→商机\n72%", lightBlue, { fontSize: 19, bold: true }),
      shape("sales-funnel-proposal", rect(640, 214, 284, 86), "商机→报价\n65%", paleGreen, { fontSize: 19, bold: true }),
      shape("sales-funnel-win", rect(640, 316, 284, 86), "谈判→赢单\n57%", paleAmber, { fontSize: 19, bold: true }),
      text("sales-funnel-note", rect(640, 420, 284, 50), "重点提升报价后跟进效率，缩短商务谈判周期。", 14, { color: muted }),
    ],
    background: "按销售或营销阶段展示规模、转化率和主要改善机会，帮助团队定位漏斗损失。",
    scenarios: ["销售周会", "营销转化复盘", "季度销售回顾"],
  }),
  makeTemplate({
    id: "competitive-positioning",
    name: "竞争定位 · 2×2",
    scene: "budgetComparison",
    folderId: "template-folder-strategy",
    previewText: "竞争定位",
    dataSpec: competitionData,
    binding: { resultSetId: "result-competitive-positioning", roles: { categoryKey: "companyId", categoryLabel: "company", x: "capability", y: "value" }, computations: [] },
    elements: [
      ...title("competitive-positioning", "竞争定位", "能力完整度 × 客户价值"),
      shape("competition-q1", rect(82, 116, 220, 142), "重点发展\n高潜力领域\n加大资源投入", "EAF3FC", { fontSize: 15, bold: true }),
      shape("competition-q2", rect(306, 116, 220, 142), "核心优势\n巩固领先地位\n扩大市场份额", "E8F6F1", { fontSize: 15, bold: true, color: "0F766E" }),
      shape("competition-q3", rect(82, 262, 220, 142), "谨慎进入\n保持观察\n控制投入节奏", "F4F5F7", { fontSize: 15, bold: true, color: "475569" }),
      shape("competition-q4", rect(306, 262, 220, 142), "优化提升\n补齐能力短板\n寻找差异机会", "FFF3DE", { fontSize: 15, bold: true, color: "B45309" }),
      text("competition-y", rect(36, 196, 34, 142), "客\n户\n价\n值", 12, { bold: true, color: "173B67", align: "center" }),
      text("competition-x", rect(226, 416, 158, 22), "能力完整度", 12, { bold: true, color: "173B67", align: "center" }),
      text("competition-insight-title", rect(574, 116, 310, 34), "关键结论", 20, { bold: true, color: "102B57" }),
      shape("competition-insight-rule", rect(574, 154, 54, 3), "", "1B5FAE", {}, "rect"),
      ...[
        ["1", "聚焦一体化数据刷新与业务模板，持续扩大核心优势。", "159A9C"],
        ["2", "加强项目管理图表，补齐规模化交付能力。", "2D6CC4"],
        ["3", "用高频模板降低首次使用成本，提升采用率。", "E6A100"],
      ].flatMap(([number, copy, color], index) => [
        shape(`competition-index-${index}`, rect(574, 184 + index * 82, 30, 30), String(number), String(color), { fontSize: 13, bold: true, color: white }, "circle"),
        text(`competition-copy-${index}`, rect(618, 178 + index * 82, 282, 54), String(copy), 13, { color: "29466F" }),
      ]),
    ],
    background: "用两个关键维度比较方案、品牌或竞争对象，并在页面右侧解释差异与建议。",
    scenarios: ["竞争分析", "方案选型", "产品定位讨论"],
  }),
] as const;

const scorecardData = makeData(
  "metric-scorecard",
  "指标记分卡",
  [
    { id: "metricId", name: "指标ID", type: "string", description: "指标稳定标识" },
    { id: "metric", name: "指标", type: "string", description: "考核指标名称" },
    { id: "actual", name: "实际", type: "decimal", description: "本期实际值", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money } },
    { id: "target", name: "目标", type: "decimal", description: "本期目标值", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money } },
    { id: "prior", name: "同期", type: "decimal", description: "上年同期值", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money } },
    { id: "status", name: "状态", type: "string", description: "指标状态" },
    { id: "owner", name: "负责人", type: "string", description: "指标责任人" },
  ],
  [
    { metricId: "m1", metric: "营业收入", actual: "12800", target: "13200", prior: "11600", status: "关注", owner: "Summer" },
    { metricId: "m2", metric: "毛利额", actual: "4620", target: "4400", prior: "3950", status: "达成", owner: "Mary" },
    { metricId: "m3", metric: "经营现金流", actual: "3180", target: "3000", prior: "2510", status: "达成", owner: "Marx" },
    { metricId: "m4", metric: "续约收入", actual: "2650", target: "2900", prior: "2380", status: "风险", owner: "Summer" },
  ],
  { chartType: "comparison", roles: { categoryKey: "metricId", categoryLabel: "metric", series: ["actual", "target"] } },
);

const multiBridgeData = makeData(
  "multi-profit-bridge",
  "多业务利润桥",
  [
    { id: "stepId", name: "步骤ID", type: "string", description: "步骤稳定标识" },
    { id: "step", name: "利润步骤", type: "string", description: "利润桥步骤" },
    { id: "kind", name: "步骤类型", type: "string", description: "total 或 delta" },
    { id: "sortOrder", name: "顺序", type: "integer", description: "展示顺序" },
    { id: "product", name: "产品业务", type: "decimal", description: "产品业务贡献", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money } },
    { id: "service", name: "服务业务", type: "decimal", description: "服务业务贡献", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money } },
    { id: "channel", name: "渠道业务", type: "decimal", description: "渠道业务贡献", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money } },
  ],
  [
    { stepId: "revenue", step: "营业收入", kind: "total", sortOrder: 1, product: "7000", service: "3800", channel: "2000" },
    { stepId: "cost", step: "营业成本", kind: "delta", sortOrder: 2, product: "-4200", service: "-2500", channel: "-1480" },
    { stepId: "gross", step: "毛利", kind: "total", sortOrder: 3, product: "2800", service: "1300", channel: "520" },
    { stepId: "expense", step: "期间费用", kind: "delta", sortOrder: 4, product: "-900", service: "-850", channel: "-600" },
    { stepId: "ebitda", step: "经营利润", kind: "total", sortOrder: 5, product: "1900", service: "450", channel: "-80" },
  ],
);

const costVarianceData = makeData(
  "cost-variance",
  "成本结构与差异",
  [
    { id: "costId", name: "成本ID", type: "string", description: "成本项目稳定标识" },
    { id: "cost", name: "成本项目", type: "string", description: "成本项目名称" },
    { id: "actual", name: "实际", type: "decimal", description: "实际成本", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money, favorableDirection: "lower" } },
    { id: "budget", name: "预算", type: "decimal", description: "预算成本", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money, favorableDirection: "lower" } },
    { id: "variance", name: "差异", type: "decimal", description: "实际减预算", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money, favorableDirection: "lower" } },
    { id: "reason", name: "主要原因", type: "string", description: "差异原因" },
  ],
  [
    { costId: "material", cost: "采购与材料", actual: "3280", budget: "3100", variance: "180", reason: "核心部件涨价" },
    { costId: "delivery", cost: "交付成本", actual: "1860", budget: "1950", variance: "-90", reason: "远程交付占比提升" },
    { costId: "sales", cost: "销售费用", actual: "1280", budget: "1400", variance: "-120", reason: "活动投放优化" },
    { costId: "admin", cost: "管理费用", actual: "1070", budget: "1000", variance: "70", reason: "一次性咨询费用" },
  ],
  { chartType: "comparison", roles: { categoryKey: "costId", categoryLabel: "cost", series: ["actual", "budget"] } },
);

const scenarioData = makeData(
  "scenario-comparison",
  "经营情景对比",
  [
    { id: "metricId", name: "指标ID", type: "string", description: "指标稳定标识" },
    { id: "metric", name: "经营指标", type: "string", description: "对比指标" },
    { id: "base", name: "基准", type: "decimal", description: "基准情景", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money } },
    { id: "upside", name: "乐观", type: "decimal", description: "乐观情景", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money } },
    { id: "downside", name: "保守", type: "decimal", description: "保守情景", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money } },
  ],
  [
    { metricId: "revenue", metric: "营业收入", base: "13200", upside: "14600", downside: "11800" },
    { metricId: "gross", metric: "毛利额", base: "4700", upside: "5480", downside: "3890" },
    { metricId: "cash", metric: "经营现金流", base: "3500", upside: "4200", downside: "2680" },
  ],
  { chartType: "comparison", roles: { categoryKey: "metricId", categoryLabel: "metric", series: ["base", "upside", "downside"] } },
);

const coverData = makeData("cover-page", "文稿封面信息", [
  { id: "itemId", name: "信息ID", type: "string", description: "封面信息稳定标识" },
  { id: "label", name: "项目", type: "string", description: "信息项目" },
  { id: "content", name: "内容", type: "string", description: "封面展示内容" },
], [
  { itemId: "period", label: "汇报周期", content: "2026年第三季度" },
  { itemId: "owner", label: "汇报部门", content: "经营管理部" },
  { itemId: "date", label: "汇报日期", content: "2026-10-04" },
]);

const sectionData = makeData("section-page", "章节信息", [
  { id: "itemId", name: "章节ID", type: "string", description: "章节项目稳定标识" },
  { id: "section", name: "章节", type: "string", description: "章节名称" },
  { id: "summary", name: "摘要", type: "string", description: "章节摘要" },
], [
  { itemId: "01", section: "经营结果", summary: "收入、利润与现金流" },
  { itemId: "02", section: "关键问题", summary: "偏差、风险与原因" },
  { itemId: "03", section: "下一步", summary: "行动、责任与期限" },
]);

const closingData = makeData("closing-page", "结束页行动", [
  { id: "actionId", name: "行动ID", type: "string", description: "行动稳定标识" },
  { id: "action", name: "下一步", type: "string", description: "会后行动" },
  { id: "owner", name: "负责人", type: "string", description: "行动负责人" },
  { id: "dueDate", name: "截止日期", type: "date", description: "行动期限" },
], [
  { actionId: "a1", action: "确认重点客户续约方案", owner: "Summer", dueDate: "2026-10-12" },
  { actionId: "a2", action: "完成费用预警规则上线", owner: "Marx", dueDate: "2026-10-18" },
]);

const projectOverviewData = makeData("project-overview", "项目概览", [
  { id: "itemId", name: "项目ID", type: "string", description: "项目要素稳定标识" },
  { id: "category", name: "项目要素", type: "string", description: "背景、目标、范围或交付物" },
  { id: "detail", name: "说明", type: "string", description: "项目要素说明" },
  { id: "owner", name: "责任方", type: "string", description: "项目责任方" },
], [
  { itemId: "background", category: "业务背景", detail: "经营汇报制作周期长，口径复核成本高", owner: "经营管理部" },
  { itemId: "objective", category: "项目目标", detail: "建立数据到可编辑PPT的一体化工作台", owner: "项目委员会" },
  { itemId: "scope", category: "本期范围", detail: "模板、数据、编辑、预览和多页导出", owner: "产品与研发" },
  { itemId: "deliverable", category: "核心交付", detail: "34个商用模板与标准化文稿流程", owner: "SlideBI团队" },
]);

const milestoneData = makeData("milestone-plan", "里程碑与近期计划", [
  { id: "milestoneId", name: "里程碑ID", type: "string", description: "里程碑稳定标识" },
  { id: "milestone", name: "里程碑", type: "string", description: "里程碑名称" },
  { id: "startDate", name: "开始日期", type: "date", description: "计划开始日期" },
  { id: "endDate", name: "完成日期", type: "date", description: "计划完成日期" },
  { id: "owner", name: "负责人", type: "string", description: "里程碑负责人" },
  { id: "status", name: "状态", type: "string", description: "里程碑状态" },
  { id: "isMilestone", name: "里程碑标记", type: "boolean", description: "是否为关键里程碑" },
], [
  { milestoneId: "m1", milestone: "交互方案确认", startDate: "2026-09-15", endDate: "2026-09-15", owner: "Mary", status: "已完成", isMilestone: true },
  { milestoneId: "m2", milestone: "首批模板验收", startDate: "2026-10-04", endDate: "2026-10-04", owner: "Marx", status: "已完成", isMilestone: true },
  { milestoneId: "m3", milestone: "P0/P1模板验收", startDate: "2026-10-05", endDate: "2026-10-18", owner: "Summer", status: "进行中", isMilestone: false },
  { milestoneId: "m4", milestone: "试点推广", startDate: "2026-10-20", endDate: "2026-11-15", owner: "Summer", status: "待开始", isMilestone: false },
]);

const ganttData = makeData("gantt-project-plan", "项目计划", [
  { id: "taskId", name: "任务ID", type: "string", description: "任务稳定标识" },
  { id: "task", name: "任务", type: "string", description: "项目任务" },
  { id: "startDate", name: "开始日期", type: "date", description: "计划开始日期" },
  { id: "endDate", name: "结束日期", type: "date", description: "计划结束日期" },
  { id: "owner", name: "负责人", type: "string", description: "任务负责人" },
  { id: "status", name: "状态", type: "string", description: "任务状态" },
  { id: "isMilestone", name: "里程碑", type: "boolean", description: "是否为里程碑" },
], [
  { taskId: "t1", task: "需求与设计", startDate: "2026-09-01", endDate: "2026-09-18", owner: "Mary", status: "已完成", isMilestone: false },
  { taskId: "t2", task: "组件开发", startDate: "2026-09-15", endDate: "2026-10-10", owner: "Marx", status: "进行中", isMilestone: false },
  { taskId: "t3", task: "集成测试", startDate: "2026-10-06", endDate: "2026-10-20", owner: "Summer", status: "关注", isMilestone: false },
  { taskId: "t4", task: "试点上线", startDate: "2026-10-24", endDate: "2026-10-24", owner: "Summer", status: "待开始", isMilestone: true },
  { taskId: "t5", task: "规模推广", startDate: "2026-10-26", endDate: "2026-11-20", owner: "Mary", status: "待开始", isMilestone: false },
]);

const workflowData = makeData(
  "workflow-progress",
  "工作流完成度",
  [
    { id: "flowId", name: "工作流ID", type: "string", description: "工作流稳定标识" },
    { id: "flow", name: "工作流", type: "string", description: "工作流名称" },
    { id: "owner", name: "负责人", type: "string", description: "工作流负责人" },
    { id: "progress", name: "完成度", type: "decimal", description: "完成比例", unit: "%", measure: { baseUnit: "ratio", format: percent, aggregationBehavior: "nonAdditive" } },
    { id: "status", name: "状态", type: "string", description: "工作流状态" },
    { id: "deliverable", name: "交付物", type: "string", description: "当前交付物" },
  ],
  [
    { flowId: "design", flow: "产品设计", owner: "Mary", progress: "1", status: "已完成", deliverable: "交互与规格" },
    { flowId: "build", flow: "工程实施", owner: "Marx", progress: "0.78", status: "进行中", deliverable: "可运行版本" },
    { flowId: "test", flow: "验收测试", owner: "Summer", progress: "0.52", status: "关注", deliverable: "验收记录" },
    { flowId: "rollout", flow: "推广运营", owner: "Mary", progress: "0.25", status: "待开始", deliverable: "推广计划" },
  ],
  { chartType: "comparison", roles: { categoryKey: "flowId", categoryLabel: "flow", series: ["progress"] } },
);

const dependencyData = makeData("dependency-map", "项目依赖关系", [
  { id: "nodeId", name: "节点ID", type: "string", description: "依赖节点稳定标识" },
  { id: "node", name: "工作项", type: "string", description: "工作项名称" },
  { id: "parentId", name: "前置节点", type: "string", description: "直接前置依赖" },
  { id: "status", name: "状态", type: "string", description: "工作项状态" },
  { id: "owner", name: "负责人", type: "string", description: "工作项负责人" },
], [
  { nodeId: "source", node: "数据接口", parentId: "", status: "已完成", owner: "Marx" },
  { nodeId: "template", node: "模板体系", parentId: "source", status: "进行中", owner: "Mary" },
  { nodeId: "editor", node: "页面编辑", parentId: "source", status: "进行中", owner: "Marx" },
  { nodeId: "acceptance", node: "业务验收", parentId: "template", status: "待开始", owner: "Summer" },
  { nodeId: "rollout", node: "试点推广", parentId: "acceptance", status: "待开始", owner: "Summer" },
]);

const mekkoData = makeData("market-segmentation-mekko", "市场细分", [
  { id: "rowId", name: "行ID", type: "string", description: "细分数据稳定标识" },
  { id: "market", name: "市场", type: "string", description: "市场类别" },
  { id: "segment", name: "细分", type: "string", description: "客户或产品细分" },
  { id: "value", name: "市场规模", type: "decimal", description: "细分市场规模", unit: "亿元", measure: { baseUnit: "CNY", currency: "CNY", format: { ...money, suffix: "亿元" } } },
], [
  { rowId: "e1", market: "大型企业", segment: "软件", value: "42" },
  { rowId: "e2", market: "大型企业", segment: "服务", value: "28" },
  { rowId: "m1", market: "中型企业", segment: "软件", value: "31" },
  { rowId: "m2", market: "中型企业", segment: "服务", value: "26" },
  { rowId: "s1", market: "成长企业", segment: "软件", value: "18" },
  { rowId: "s2", market: "成长企业", segment: "服务", value: "14" },
]);

const bubbleData = makeData("customer-portfolio-bubble", "客户组合", [
  { id: "customerId", name: "客户ID", type: "string", description: "客户稳定标识" },
  { id: "customer", name: "客户", type: "string", description: "客户名称" },
  { id: "growth", name: "增长潜力", type: "decimal", description: "增长潜力评分", unit: "分", measure: { baseUnit: "score", format: { displayDivisor: "1", decimals: 1, suffix: "分", percent: false }, aggregationBehavior: "nonAdditive" } },
  { id: "margin", name: "利润质量", type: "decimal", description: "利润质量评分", unit: "分", measure: { baseUnit: "score", format: { displayDivisor: "1", decimals: 1, suffix: "分", percent: false }, aggregationBehavior: "nonAdditive" } },
  { id: "revenue", name: "客户收入", type: "decimal", description: "客户收入规模", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money } },
  { id: "group", name: "客户类型", type: "string", description: "客户组合分组" },
], [
  { customerId: "a", customer: "客户A", growth: "8.7", margin: "8.1", revenue: "2300", group: "战略" },
  { customerId: "b", customer: "客户B", growth: "7.2", margin: "5.6", revenue: "1800", group: "成长" },
  { customerId: "c", customer: "客户C", growth: "4.1", margin: "8.8", revenue: "1500", group: "价值" },
  { customerId: "d", customer: "客户D", growth: "3.4", margin: "3.8", revenue: "700", group: "观察" },
]);

const regionData = makeData("regional-market-map", "区域市场表现", [
  { id: "regionId", name: "区域ID", type: "string", description: "区域稳定标识" },
  { id: "region", name: "区域", type: "string", description: "销售区域" },
  { id: "revenue", name: "收入", type: "decimal", description: "区域收入", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money } },
  { id: "status", name: "状态", type: "string", description: "区域经营状态" },
], [
  { regionId: "east", region: "华东", revenue: "4380", status: "领先" },
  { regionId: "south", region: "华南", revenue: "3260", status: "达成" },
  { regionId: "north", region: "华北", revenue: "2740", status: "关注" },
  { regionId: "central", region: "华中", revenue: "1560", status: "增长" },
  { regionId: "west", region: "西部", revenue: "860", status: "待提升" },
]);

const decisionTreeData = makeData("decision-tree", "方案决策树", [
  { id: "nodeId", name: "节点ID", type: "string", description: "节点稳定标识" },
  { id: "node", name: "判断或结果", type: "string", description: "决策节点内容" },
  { id: "parentId", name: "父节点", type: "string", description: "上级决策节点" },
  { id: "outcome", name: "建议", type: "string", description: "该节点对应建议" },
], [
  { nodeId: "root", node: "数据是否标准化？", parentId: "", outcome: "先判断数据基础" },
  { nodeId: "yes", node: "是：是否需持续刷新？", parentId: "root", outcome: "评估数据托管" },
  { nodeId: "no", node: "否：先整理DataSpec", parentId: "root", outcome: "人工导入" },
  { nodeId: "managed", node: "需要：托管数据集", parentId: "yes", outcome: "启用刷新" },
  { nodeId: "private", node: "不需要：页面私有数据", parentId: "yes", outcome: "随文稿保存" },
]);

const decisionMatrixData = makeData("decision-matrix", "方案决策矩阵", [
  { id: "optionId", name: "方案ID", type: "string", description: "方案稳定标识" },
  { id: "option", name: "方案", type: "string", description: "候选方案" },
  { id: "fit", name: "业务适配", type: "decimal", description: "业务适配评分", unit: "分", measure: { baseUnit: "score", format: { displayDivisor: "1", decimals: 1, suffix: "分", percent: false }, aggregationBehavior: "nonAdditive" } },
  { id: "speed", name: "交付速度", type: "decimal", description: "交付速度评分", unit: "分", measure: { baseUnit: "score", format: { displayDivisor: "1", decimals: 1, suffix: "分", percent: false }, aggregationBehavior: "nonAdditive" } },
  { id: "cost", name: "成本效率", type: "decimal", description: "成本效率评分", unit: "分", measure: { baseUnit: "score", format: { displayDivisor: "1", decimals: 1, suffix: "分", percent: false }, aggregationBehavior: "nonAdditive" } },
  { id: "total", name: "加权总分", type: "decimal", description: "加权评分", unit: "分", measure: { baseUnit: "score", format: { displayDivisor: "1", decimals: 1, suffix: "分", percent: false }, aggregationBehavior: "nonAdditive" } },
], [
  { optionId: "a", option: "标准化模板", fit: "9.1", speed: "8.5", cost: "8.8", total: "8.9" },
  { optionId: "b", option: "定制页面", fit: "9.5", speed: "5.2", cost: "4.8", total: "6.8" },
  { optionId: "c", option: "人工制作", fit: "6.8", speed: "4.5", cost: "3.9", total: "5.1" },
]);

const salesProposalData = makeData("sales-proposal", "客户提案结构", [
  { id: "sectionId", name: "模块ID", type: "string", description: "提案模块稳定标识" },
  { id: "section", name: "提案模块", type: "string", description: "提案信息模块" },
  { id: "message", name: "核心信息", type: "string", description: "面向客户的核心信息" },
  { id: "evidence", name: "证据", type: "string", description: "支撑信息" },
], [
  { sectionId: "problem", section: "客户问题", message: "汇报制作耗时且数据易失真", evidence: "每月跨系统复制与人工复核" },
  { sectionId: "solution", section: "解决方案", message: "数据驱动的可编辑汇报工作台", evidence: "模板、数据、编辑和导出闭环" },
  { sectionId: "value", section: "业务价值", message: "缩短交付周期并统一业务表达", evidence: "样例模板与多页PPTX验证" },
  { sectionId: "next", section: "下一步", message: "选择一个经营汇报场景试点", evidence: "两周完成模板与数据适配" },
]);

const teamData = makeData("team-introduction", "核心团队", [
  { id: "personId", name: "成员ID", type: "string", description: "成员稳定标识" },
  { id: "name", name: "姓名", type: "string", description: "成员姓名" },
  { id: "role", name: "角色", type: "string", description: "项目角色" },
  { id: "expertise", name: "核心能力", type: "string", description: "成员擅长领域" },
], [
  { personId: "marx", name: "Marx", role: "项目负责人", expertise: "产品架构与交付" },
  { personId: "summer", name: "Summer", role: "业务负责人", expertise: "经营分析与模板" },
  { personId: "mary", name: "Mary", role: "体验负责人", expertise: "交互设计与用户研究" },
]);

const orgData = makeData("org-chart", "组织结构", [
  { id: "nodeId", name: "节点ID", type: "string", description: "组织节点稳定标识" },
  { id: "name", name: "组织或成员", type: "string", description: "组织节点名称" },
  { id: "parentId", name: "上级节点", type: "string", description: "直接上级节点" },
  { id: "title", name: "职责", type: "string", description: "岗位或组织职责" },
], [
  { nodeId: "committee", name: "项目委员会", parentId: "", title: "方向与资源决策" },
  { nodeId: "product", name: "产品组", parentId: "committee", title: "需求与体验" },
  { nodeId: "engineering", name: "研发组", parentId: "committee", title: "平台与质量" },
  { nodeId: "business", name: "业务试点组", parentId: "committee", title: "场景与验收" },
  { nodeId: "customer-success", name: "客户成功组", parentId: "committee", title: "落地与运营" },
  { nodeId: "design", name: "模板设计", parentId: "product", title: "商业模板" },
  { nodeId: "backend", name: "平台研发", parentId: "engineering", title: "数据与导出" },
]);

const raciData = makeData("raci-matrix", "RACI责任矩阵", [
  { id: "taskId", name: "任务ID", type: "string", description: "任务稳定标识" },
  { id: "task", name: "任务", type: "string", description: "项目任务" },
  { id: "sponsor", name: "项目委员会", type: "string", description: "项目委员会责任" },
  { id: "product", name: "产品组", type: "string", description: "产品组责任" },
  { id: "engineering", name: "研发组", type: "string", description: "研发组责任" },
  { id: "business", name: "业务组", type: "string", description: "业务组责任" },
], [
  { taskId: "scope", task: "确认范围", sponsor: "A", product: "R", engineering: "C", business: "C" },
  { taskId: "design", task: "模板设计", sponsor: "I", product: "A/R", engineering: "C", business: "C" },
  { taskId: "build", task: "开发交付", sponsor: "I", product: "C", engineering: "A/R", business: "I" },
  { taskId: "accept", task: "业务验收", sponsor: "I", product: "C", engineering: "C", business: "A/R" },
]);

const statusTableData = makeData("status-table", "重点事项状态", [
  { id: "itemId", name: "事项ID", type: "string", description: "事项稳定标识" },
  { id: "item", name: "事项", type: "string", description: "重点事项" },
  { id: "owner", name: "负责人", type: "string", description: "事项负责人" },
  { id: "progress", name: "完成度", type: "decimal", description: "完成比例", unit: "%", measure: { baseUnit: "ratio", format: percent, aggregationBehavior: "nonAdditive" } },
  { id: "status", name: "状态", type: "string", description: "事项状态" },
  { id: "comment", name: "说明", type: "string", description: "状态说明" },
], [
  { itemId: "i1", item: "核心模板交付", owner: "Mary", progress: "1", status: "已完成", comment: "进入业务验收" },
  { itemId: "i2", item: "高级图表组件", owner: "Marx", progress: "0.82", status: "进行中", comment: "完成主要引擎" },
  { itemId: "i3", item: "BI接口联调", owner: "Summer", progress: "0.35", status: "关注", comment: "等待上游接口" },
  { itemId: "i4", item: "试点推广", owner: "Summer", progress: "0.15", status: "待开始", comment: "确认首个业务场景" },
]);

const EXTENDED_BUSINESS_TEMPLATES: readonly BusinessTemplateDefinition[] = [
  makeTemplate({
    id: "metric-scorecard", name: "指标记分卡", scene: "budgetComparison", folderId: "template-folder-finance", previewText: "指标记分卡", dataSpec: scorecardData,
    binding: { resultSetId: "result-metric-scorecard", roles: { categoryKey: "metricId", categoryLabel: "metric", series: ["actual", "target"], label: "metric", value: "actual", target: "target", status: "status", owner: "owner", columns: ["metric", "actual", "target", "prior", "status", "owner"] }, computations: [] },
    elements: [...title("metric-scorecard", "指标记分卡", "目标、实际、同期、状态与责任人"), chart("metric-scorecard-chart", rect(36, 112, 520, 280), "comparison", { numberFormat: money }), { id: "metric-scorecard-cards", type: "kpiCards", rect: rect(582, 112, 342, 280), z: 4, bindingRef: "main", columns: 2, style: { fontSize: 11 } }, table("metric-scorecard-table", rect(36, 408, 888, 100), ["metric", "actual", "target", "status", "owner"], 8)],
    background: "把关键指标的目标、实际、同期、状态和负责人集中展示，用于周期性绩效讨论。", scenarios: ["经营记分卡", "部门绩效复盘", "管理层周报"],
  }),
  makeTemplate({
    id: "multi-profit-bridge", name: "多系列利润桥", scene: "revenueBridge", folderId: "template-folder-finance", previewText: "多业务利润桥", dataSpec: multiBridgeData,
    binding: { resultSetId: "result-multi-profit-bridge", roles: { label: "step", kind: "kind", sort: "sortOrder", series: ["product", "service", "channel"] }, computations: [] },
    elements: [...title("multi-profit-bridge", "多业务利润桥", "产品、服务和渠道对经营利润的分步贡献"), { id: "multi-profit-bridge-view", type: "multiWaterfall", rect: rect(36, 112, 650, 344), z: 4, bindingRef: "main", style: { fontSize: 11 } }, text("multi-profit-bridge-note", rect(714, 112, 210, 150), "核心判断\n产品业务贡献主要毛利，服务业务受交付成本影响，渠道业务仍需改善费用效率。", 15, { fill: lightBlue, line: { color: "93C5FD", width: 1 }, bold: true }), text("multi-profit-bridge-legend", rect(714, 288, 210, 116), "蓝色：产品\n青色：服务\n紫色：渠道\n红色：负向贡献", 13, { fill: "F8FAFC", line: { color: "CBD5E1", width: 1 } })],
    background: "按业务、区域或产品拆分收入到利润的多系列贡献，解释利润形成过程。", scenarios: ["利润复盘", "业务组合分析", "区域经营分析"],
  }),
  makeTemplate({
    id: "cost-variance", name: "成本结构与差异", scene: "budgetComparison", folderId: "template-folder-finance", previewText: "成本结构与差异", dataSpec: costVarianceData,
    binding: { resultSetId: "result-cost-variance", roles: { categoryKey: "costId", categoryLabel: "cost", series: ["actual", "budget"], columns: ["cost", "actual", "budget", "variance", "reason"] }, computations: [] },
    elements: [...title("cost-variance", "成本结构与差异", "实际成本对比预算及主要原因"), chart("cost-variance-chart", rect(36, 112, 560, 326), "comparison", { numberFormat: money }), table("cost-variance-table", rect(620, 112, 304, 250), ["cost", "variance", "reason"], 10), text("cost-variance-note", rect(620, 382, 304, 64), "材料与管理费用超预算270万元，交付和销售费用节约210万元。", 14, { fill: "FFF7ED", line: { color: "F59E0B", width: 1 }, bold: true })],
    background: "同时展示成本结构、预算差异、原因和措施，支持费用治理讨论。", scenarios: ["成本复盘", "预算差异分析", "费用管理会"],
  }),
  makeTemplate({
    id: "scenario-comparison", name: "情景与方案对比", scene: "budgetComparison", folderId: "template-folder-finance", previewText: "三种经营情景", dataSpec: scenarioData,
    binding: { resultSetId: "result-scenario-comparison", roles: { categoryKey: "metricId", categoryLabel: "metric", series: ["base", "upside", "downside"], columns: ["metric", "base", "upside", "downside"] }, computations: [] },
    elements: [...title("scenario-comparison", "三种经营情景", "基准、乐观与保守方案的核心指标"), chart("scenario-comparison-chart", rect(36, 112, 610, 330), "comparison", { numberFormat: money }), shape("scenario-base", rect(676, 112, 248, 76), "基准\n按当前转化与续约", lightBlue, { bold: true }), shape("scenario-upside", rect(676, 204, 248, 76), "乐观\n重点客户提前签约", paleGreen, { bold: true }), shape("scenario-downside", rect(676, 296, 248, 76), "保守\n续约延迟一个月", paleAmber, { bold: true }), text("scenario-recommendation", rect(676, 390, 248, 60), "建议：以基准方案配置资源，同时保留保守情景现金储备。", 13, { fill: "F8FAFC", line: { color: "CBD5E1", width: 1 } })],
    background: "对比多个经营或投资情景的指标、假设和影响，形成可执行建议。", scenarios: ["预算情景分析", "方案选择", "经营预测"],
  }),
  makeTemplate({
    id: "cover-page", name: "文稿封面", scene: "budgetComparison", folderId: "template-folder-general", previewText: "季度经营复盘", dataSpec: coverData,
    binding: { resultSetId: "result-cover-page", roles: { columns: ["label", "content"] }, computations: [] },
    elements: [shape("cover-accent", rect(0, 0, 280, 540), "", "172033", {}, "rect"), text("cover-kicker", rect(48, 92, 184, 28), "SLIDEBI · BUSINESS REVIEW", 11, { color: "93C5FD", bold: true }), text("cover-title", rect(330, 126, 560, 112), "季度经营复盘", 34, { bold: true, valign: "middle" }), text("cover-subtitle", rect(334, 246, 520, 48), "2026年第三季度｜经营管理部", 17, { color: muted }), shape("cover-line", rect(334, 318, 150, 5), "", "2563EB", {}, "rect"), text("cover-date", rect(334, 352, 520, 28), "2026-10-04", 13, { color: muted })],
    background: "用于经营、项目或客户汇报的首页，明确主题、周期、汇报部门和日期。", scenarios: ["经营汇报封面", "项目汇报封面", "客户提案封面"],
  }),
  makeTemplate({
    id: "section-page", name: "章节过渡页", scene: "budgetComparison", folderId: "template-folder-general", previewText: "关键问题", dataSpec: sectionData,
    binding: { resultSetId: "result-section-page", roles: { columns: ["section", "summary"] }, computations: [] },
    elements: [shape("section-band", rect(0, 0, 960, 540), "", "172033", {}, "rect"), text("section-number", rect(72, 104, 180, 84), "02", 58, { color: "60A5FA", bold: true }), text("section-title", rect(72, 204, 720, 74), "关键问题", 36, { color: white, bold: true }), text("section-summary", rect(76, 292, 710, 48), "识别偏差、风险及其根本原因", 18, { color: "CBD5E1" }), shape("section-rule", rect(76, 370, 240, 5), "", "2563EB", {}, "rect")],
    background: "用于多页文稿章节之间的过渡，明确章节编号、主题和本节重点。", scenarios: ["经营汇报章节", "项目汇报章节", "客户提案章节"],
  }),
  makeTemplate({
    id: "closing-page", name: "结束与下一步", scene: "budgetComparison", folderId: "template-folder-general", previewText: "结论与下一步", dataSpec: closingData,
    binding: { resultSetId: "result-closing-page", roles: { columns: ["action", "owner", "dueDate"] }, computations: [] },
    elements: [...title("closing-page", "结论与下一步", "把会议共识转化为明确行动"), shape("closing-conclusion", rect(36, 126, 360, 254), "核心结论\n\n经营总体稳健，利润与现金流优于目标。\n\n下一阶段聚焦重点客户续约和费用预警。", lightBlue, { fontSize: 18, bold: true, align: "left" }), table("closing-actions", rect(426, 126, 498, 186), ["action", "owner", "dueDate"], 11), text("closing-contact", rect(426, 336, 498, 72), "会后联系人\n经营管理部 · SlideBI 项目组", 16, { fill: "F8FAFC", line: { color: "CBD5E1", width: 1 }, bold: true }), text("closing-thanks", rect(36, 440, 888, 42), "谢谢", 24, { bold: true, align: "right" })],
    background: "用于文稿收尾，重申结论、下一步行动和会后联系人。", scenarios: ["经营会结束页", "项目总结页", "客户提案下一步"],
  }),
  makeTemplate({
    id: "project-overview", name: "项目概览", scene: "budgetComparison", folderId: "template-folder-project", previewText: "项目概览", dataSpec: projectOverviewData,
    binding: { resultSetId: "result-project-overview", roles: { columns: ["category", "detail", "owner"] }, computations: [] },
    elements: [...title("project-overview", "项目概览", "背景、目标、范围、交付物与治理"), shape("project-overview-goal", rect(36, 116, 426, 112), "项目目标\n建立数据到可编辑PPT的一体化工作台", lightBlue, { fontSize: 18, bold: true }), shape("project-overview-scope", rect(480, 116, 444, 112), "本期范围\n模板、数据、编辑、预览和多页导出", paleGreen, { fontSize: 18, bold: true }), table("project-overview-table", rect(36, 250, 888, 210), ["category", "detail", "owner"], 12), text("project-overview-governance", rect(36, 476, 888, 28), "治理：项目委员会双周决策，产品与研发周度交付，业务试点组按里程碑验收。", 12, { color: muted })],
    background: "在一页中说明项目背景、目标、范围、交付物和治理方式。", scenarios: ["项目启动会", "项目委员会", "客户项目概览"],
  }),
  makeTemplate({
    id: "milestone-plan", name: "里程碑与近期计划", scene: "budgetComparison", folderId: "template-folder-project", previewText: "里程碑与近期计划", dataSpec: milestoneData,
    binding: { resultSetId: "result-milestone-plan", roles: { label: "milestone", start: "startDate", end: "endDate", owner: "owner", status: "status", milestone: "isMilestone", columns: ["milestone", "endDate", "owner", "status"] }, computations: [] },
    elements: [...title("milestone-plan", "里程碑与近期计划", "已完成、进行中与即将开始"), { id: "milestone-plan-view", type: "gantt", rect: rect(36, 116, 888, 244), z: 4, bindingRef: "main", style: { fontSize: 11 } }, table("milestone-plan-table", rect(36, 382, 888, 112), ["milestone", "endDate", "owner", "status"], 8)],
    background: "把关键里程碑、完成状态和近期计划放在同一时间轴中。", scenarios: ["项目周报", "里程碑评审", "近期计划沟通"],
  }),
  makeTemplate({
    id: "gantt-project-plan", name: "甘特项目计划", scene: "budgetComparison", folderId: "template-folder-project", previewText: "甘特项目计划", dataSpec: ganttData,
    binding: { resultSetId: "result-gantt-project-plan", roles: { label: "task", start: "startDate", end: "endDate", owner: "owner", status: "status", milestone: "isMilestone", columns: ["task", "startDate", "endDate", "owner", "status"] }, computations: [] },
    elements: [...title("gantt-project-plan", "甘特项目计划", "任务、时间、负责人、状态与里程碑"), { id: "gantt-project-plan-view", type: "gantt", rect: rect(36, 112, 888, 340), z: 4, bindingRef: "main", style: { fontSize: 11 } }, text("gantt-project-plan-note", rect(36, 472, 888, 28), "关键路径：组件开发 → 集成测试 → 试点上线。", 13, { color: muted })],
    background: "以时间轴展示任务起止、责任人、状态和里程碑，并保留原生可编辑形状。", scenarios: ["项目计划", "实施排期", "产品发布计划"],
  }),
  makeTemplate({
    id: "workflow-progress", name: "工作流与完成度", scene: "budgetComparison", folderId: "template-folder-project", previewText: "工作流与完成度", dataSpec: workflowData,
    binding: { resultSetId: "result-workflow-progress", roles: { categoryKey: "flowId", categoryLabel: "flow", series: ["progress"], label: "flow", owner: "owner", progress: "progress", status: "status", comment: "deliverable" }, computations: [] },
    elements: [...title("workflow-progress", "工作流与完成度", "责任、进度、状态与当前交付物"), { id: "workflow-progress-table", type: "statusTable", rect: rect(36, 116, 560, 318), z: 4, bindingRef: "main", style: { fontSize: 11 } }, chart("workflow-progress-chart", rect(626, 116, 298, 318), "comparison", { numberFormat: percent, direction: "bar", showLegend: false }), text("workflow-progress-note", rect(36, 458, 888, 34), "试点验收是当前关键路径，需同步锁定业务样本和验收排期。", 13, { fill: "FFF7ED", line: { color: "F59E0B", width: 1 } })],
    background: "动态展示多条工作流的完成度、RAG状态、责任人和交付物。", scenarios: ["项目状态会", "多工作流管理", "项目委员会"],
  }),
  makeTemplate({
    id: "dependency-map", name: "依赖关系图", scene: "budgetComparison", folderId: "template-folder-project", previewText: "项目依赖关系", dataSpec: dependencyData,
    binding: { resultSetId: "result-dependency-map", roles: { key: "nodeId", label: "node", parent: "parentId", subtitle: "status", columns: ["node", "parentId", "owner", "status"] }, computations: [] },
    elements: [...title("dependency-map", "项目依赖关系", "关键路径、前置工作和当前状态"), { id: "dependency-map-view", type: "hierarchy", rect: rect(36, 112, 610, 350), z: 4, bindingRef: "main", style: { fontSize: 11 } }, table("dependency-map-table", rect(676, 112, 248, 270), ["node", "owner", "status"], 9), text("dependency-map-note", rect(676, 400, 248, 62), "关键路径\n数据接口 → 模板体系 → 业务验收 → 试点推广", 13, { fill: lightBlue, line: { color: "93C5FD", width: 1 }, bold: true })],
    background: "展示工作流之间的直接依赖、关键路径、负责人和阻塞状态。", scenarios: ["项目依赖评审", "关键路径分析", "跨团队协同"],
  }),
  makeTemplate({
    id: "market-segmentation-mekko", name: "市场细分 · Mekko", scene: "budgetComparison", folderId: "template-folder-strategy", previewText: "市场细分", dataSpec: mekkoData,
    binding: { resultSetId: "result-market-segmentation-mekko", roles: { category: "market", segment: "segment", value: "value", columns: ["market", "segment", "value"] }, computations: [] },
    elements: [...title("market-segmentation-mekko", "市场细分", "市场规模 × 产品与服务结构"), { id: "market-segmentation-mekko-view", type: "mekko", rect: rect(36, 112, 650, 344), z: 4, bindingRef: "main", style: { fontSize: 10 } }, text("market-segmentation-mekko-insight", rect(716, 112, 208, 130), "关键洞察\n大型企业规模最大，成长企业的软件占比更高。", 15, { fill: lightBlue, line: { color: "93C5FD", width: 1 }, bold: true }), text("market-segmentation-mekko-action", rect(716, 262, 208, 120), "建议\n大型企业主推软件＋服务组合；成长企业采用标准化软件方案。", 14, { fill: paleGreen, line: { color: "86EFAC", width: 1 } })],
    background: "用宽度表示市场规模、堆积高度表示细分结构，支持市场和产品组合分析。", scenarios: ["市场细分", "产品组合", "战略规划"],
  }),
  makeTemplate({
    id: "customer-portfolio-bubble", name: "客户与产品组合气泡", scene: "budgetComparison", folderId: "template-folder-strategy", previewText: "客户组合", dataSpec: bubbleData,
    binding: { resultSetId: "result-customer-portfolio-bubble", roles: { label: "customer", x: "growth", y: "margin", size: "revenue", group: "group", columns: ["customer", "growth", "margin", "revenue", "group"] }, computations: [] },
    elements: [...title("customer-portfolio-bubble", "客户组合", "增长潜力 × 利润质量 × 收入规模"), { id: "customer-portfolio-bubble-view", type: "bubble", rect: rect(36, 112, 640, 350), z: 4, bindingRef: "main", style: { fontSize: 10 } }, text("customer-portfolio-bubble-insight", rect(706, 112, 218, 120), "优先级\n客户A：战略投入\n客户B：增长培育\n客户C：价值深耕", 14, { fill: lightBlue, line: { color: "93C5FD", width: 1 }, bold: true }), text("customer-portfolio-bubble-action", rect(706, 252, 218, 112), "资源建议\n把售前资源优先配置到高增长、高利润客户。", 14, { fill: paleGreen, line: { color: "86EFAC", width: 1 } })],
    background: "以两个评价维度和规模三变量展示客户或产品组合优先级。", scenarios: ["客户组合", "产品组合", "资源配置"],
  }),
  makeTemplate({
    id: "regional-market-map", name: "区域市场图", scene: "budgetComparison", folderId: "template-folder-strategy", previewText: "华东贡献最高，华北与西部是下一轮覆盖重点", dataSpec: regionData,
    ...strategyUpgrade,
    binding: { resultSetId: "result-regional-market-map", roles: { region: "region", value: "revenue", status: "status", columns: ["region", "revenue", "status"] }, computations: [] },
    elements: [...title("regional-market-map", "华东贡献最高，华北与西部是下一轮覆盖重点", "区域收入规模与经营状态｜热力分布及贡献排序"), { id: "regional-market-map-view", type: "regionMap", rect: rect(36, 116, 888, 318), z: 4, bindingRef: "main", style: { fontSize: 12, variant: "executive" } }, shape("regional-market-map-action-bg", rect(36, 452, 888, 38), "", "F4F7FB", {}, "rect"), shape("regional-market-map-action-accent", rect(36, 452, 5, 38), "", "D39A1A", {}, "rect"), text("regional-market-map-note", rect(56, 461, 844, 20), "行动：复制华东重点客户打法；华北加强行业覆盖，西部优先建设标杆客户。", 11, { color: "29466F", bold: true })],
    background: "用区域色阶与指标展示区域业绩、覆盖和状态；当前采用可编辑区域块布局。", scenarios: ["区域经营复盘", "销售覆盖分析", "门店区域分析"],
  }),
  makeTemplate({
    id: "decision-tree", name: "决策树", scene: "budgetComparison", folderId: "template-folder-strategy", previewText: "数据先标准化，再按刷新频率选择托管方式", dataSpec: decisionTreeData,
    ...strategyRepair,
    binding: { resultSetId: "result-decision-tree", roles: { key: "nodeId", label: "node", parent: "parentId", subtitle: "outcome", columns: ["node", "parentId", "outcome"] }, computations: [] },
    elements: [...title("decision-tree", "数据先标准化，再按刷新频率选择托管方式", "决策路径｜用三个问题快速确定数据接入策略"), { id: "decision-tree-view", type: "hierarchy", rect: rect(36, 118, 888, 330), z: 4, bindingRef: "main", style: { fontSize: 10, variant: "decision", orientation: "horizontal" } }, shape("decision-tree-note-accent", rect(36, 466, 5, 32), "", "4C86D7", {}, "rect"), text("decision-tree-note", rect(54, 472, 870, 20), "判断顺序：标准化程度 → 刷新频率 → 托管方式。", 11, { color: "29466F", bold: true })],
    background: "以条件、分支、结果和建议展示决策路径，适合方案选择与流程说明。", scenarios: ["方案选型", "业务规则说明", "产品决策"],
  }),
  makeTemplate({
    id: "decision-matrix", name: "决策矩阵", scene: "budgetComparison", folderId: "template-folder-strategy", previewText: "标准化模板在速度与成本之间取得最佳平衡", dataSpec: decisionMatrixData,
    ...strategyUpgrade,
    binding: { resultSetId: "result-decision-matrix", roles: { option: "option", criteria: ["fit", "speed", "cost"], total: "total", columns: ["option", "fit", "speed", "cost", "total"] }, computations: [] },
    elements: [...title("decision-matrix", "标准化模板在速度与成本之间取得最佳平衡", "方案评估｜业务适配 40% · 交付速度 30% · 成本效率 30%"), { id: "decision-matrix-view", type: "decisionScorecard", rect: rect(36, 124, 888, 290), z: 4, bindingRef: "main", style: { fontSize: 12 } }, shape("decision-matrix-note-bg", rect(36, 438, 888, 50), "", "F4F7FB", {}, "rect"), shape("decision-matrix-note-accent", rect(36, 438, 5, 50), "", "168E96", {}, "rect"), text("decision-matrix-note-label", rect(56, 453, 84, 18), "决策建议", 12, { color: "167567", bold: true }), text("decision-matrix-note", rect(150, 452, 750, 20), "采用标准化模板作为默认方案，为高价值特殊场景保留定制入口。", 11, { color: "29466F", bold: true })],
    background: "按多个标准、权重和评分比较候选方案，并突出推荐结论。", scenarios: ["方案评审", "供应商选择", "产品决策"],
  }),
  makeTemplate({
    id: "sales-proposal", name: "销售提案页面", scene: "budgetComparison", folderId: "template-folder-strategy", previewText: "让月度汇报从人工复制走向持续刷新", dataSpec: salesProposalData,
    ...strategyRepair,
    binding: { resultSetId: "result-sales-proposal", roles: { section: "section", message: "message", evidence: "evidence", columns: ["section", "message", "evidence"] }, computations: [] },
    elements: [...title("sales-proposal", "让月度汇报从人工复制走向持续刷新", "客户提案｜问题、方案、价值与试点路径一页讲清"), { id: "sales-proposal-view", type: "proposalFlow", rect: rect(36, 122, 888, 292), z: 4, bindingRef: "main", style: { fontSize: 12 } }, shape("sales-proposal-commitment-bg", rect(36, 440, 888, 48), "", "EEF7F4", {}, "rect"), text("sales-proposal-commitment-value", rect(56, 448, 98, 30), "2 周", 21, { color: "167567", bold: true }), text("sales-proposal-commitment", rect(154, 454, 742, 20), "完成一个经营场景的模板适配、数据接入与多页 PPTX 交付验证", 11, { color: "29466F", bold: true })],
    background: "以客户问题、解决方案、价值、证据和下一步构成一页销售提案。", scenarios: ["客户提案", "售前方案", "内部立项"],
  }),
  makeTemplate({
    id: "team-introduction", name: "团队介绍", scene: "budgetComparison", folderId: "template-folder-organization", previewText: "核心团队", dataSpec: teamData,
    binding: { resultSetId: "result-team-introduction", roles: { columns: ["name", "role", "expertise"] }, computations: [] },
    elements: [...title("team-introduction", "核心团队", "清晰展示角色、能力与客户联系人"), shape("team-marx-avatar", rect(70, 132, 96, 96), "M", "2563EB", { fontSize: 36, bold: true, color: white }, "ellipse"), shape("team-summer-avatar", rect(344, 132, 96, 96), "S", "0891B2", { fontSize: 36, bold: true, color: white }, "ellipse"), shape("team-mary-avatar", rect(618, 132, 96, 96), "M", "7C3AED", { fontSize: 36, bold: true, color: white }, "ellipse"), table("team-table", rect(70, 254, 644, 156), ["name", "role", "expertise"], 12), text("team-contact", rect(746, 132, 178, 278), "客户联系人\n\nSummer\n业务场景与验收\n\nMarx\n技术架构与交付", 15, { fill: "F8FAFC", line: { color: "CBD5E1", width: 1 }, bold: true, align: "center" })],
    background: "介绍项目核心成员、角色、经验能力和客户联系人。", scenarios: ["客户提案", "项目启动", "团队能力介绍"],
  }),
  makeTemplate({
    id: "org-chart", name: "组织结构图", scene: "budgetComparison", folderId: "template-folder-organization", previewText: "项目组织结构", dataSpec: orgData, ...strategyUpgrade,
    binding: { resultSetId: "result-org-chart", roles: { key: "nodeId", label: "name", parent: "parentId", subtitle: "title", columns: ["name", "parentId", "title"] }, computations: [] },
    elements: [...title("org-chart", "项目组织结构", "决策、产品、研发与业务试点协同"), { id: "org-chart-view", type: "hierarchy", rect: rect(36, 112, 888, 350), z: 4, bindingRef: "main", style: { fontSize: 11, variant: "organization", orientation: "vertical" } }, text("org-chart-note", rect(36, 478, 888, 26), "实线表示直接汇报或治理关系；组织节点和职责均来自模板数据。", 12, { color: muted })],
    background: "以数据驱动层级布局展示组织、职位、部门或项目治理关系。", scenarios: ["组织介绍", "项目治理", "客户联系人结构"],
  }),
  makeTemplate({
    id: "raci-matrix", name: "RACI 责任矩阵", scene: "budgetComparison", folderId: "template-folder-organization", previewText: "RACI 责任矩阵", dataSpec: raciData,
    binding: { resultSetId: "result-raci-matrix", roles: { columns: ["task", "sponsor", "product", "engineering", "business"] }, computations: [] },
    elements: [...title("raci-matrix", "RACI 责任矩阵", "明确负责、批准、协作与知会角色"), table("raci-matrix-table", rect(36, 120, 888, 254), ["task", "sponsor", "product", "engineering", "business"], 13), shape("raci-r", rect(36, 406, 204, 62), "R · Responsible\n负责执行", lightBlue, { fontSize: 13, bold: true }), shape("raci-a", rect(252, 406, 204, 62), "A · Accountable\n最终批准", paleGreen, { fontSize: 13, bold: true }), shape("raci-c", rect(468, 406, 204, 62), "C · Consulted\n参与协作", paleAmber, { fontSize: 13, bold: true }), shape("raci-i", rect(684, 406, 240, 62), "I · Informed\n同步知会", "F1F5F9", { fontSize: 13, bold: true })],
    background: "以任务和角色矩阵明确R、A、C、I责任，减少跨团队协作歧义。", scenarios: ["项目治理", "流程责任", "跨团队协作"],
  }),
  makeTemplate({
    id: "status-table", name: "状态表", scene: "budgetComparison", folderId: "template-folder-analysis", previewText: "重点事项状态", dataSpec: statusTableData,
    binding: { resultSetId: "result-status-table", roles: { label: "item", owner: "owner", progress: "progress", status: "status", comment: "comment", columns: ["item", "owner", "progress", "status", "comment"] }, computations: [] },
    elements: [...title("status-table", "重点事项状态", "RAG状态、完成度与管理说明"), { id: "status-table-view", type: "statusTable", rect: rect(36, 120, 888, 286), z: 4, bindingRef: "main", style: { fontSize: 11 } }, text("status-table-note", rect(36, 434, 888, 54), "状态规则：绿色表示达成或正常；黄色表示需要关注；红色表示阻塞、延期或重大风险。", 13, { fill: "F8FAFC", line: { color: "CBD5E1", width: 1 } })],
    background: "通过状态色、进度、负责人和说明快速复核重点事项。", scenarios: ["项目状态表", "经营事项跟踪", "管理层例会"],
  }),
] as const;

const HIGH_FREQUENCY_BUSINESS_TEMPLATES: readonly BusinessTemplateDefinition[] = (() => {
  const quarterly = makeData("quarterly-business-review", "季度经营趋势", [
    { id: "quarter", name: "季度", type: "string", description: "经营季度" },
    { id: "revenue", name: "营业收入", type: "decimal", description: "季度营业收入", unit: "万元", measure: { baseUnit: "CNY", currency: "CNY", format: money } },
    { id: "margin", name: "利润率", type: "decimal", description: "季度营业利润率", unit: "%", measure: { baseUnit: "ratio", format: { displayDivisor: "1", decimals: 1, suffix: "%", percent: true }, aggregationBehavior: "nonAdditive" } },
  ], [{ quarter: "Q1", revenue: "10800", margin: "16.8" }, { quarter: "Q2", revenue: "11600", margin: "17.5" }, { quarter: "Q3", revenue: "12800", margin: "18.2" }, { quarter: "Q4E", revenue: "13900", margin: "19.0" }]);
  const journey = makeData("customer-journey", "客户旅程", [
    { id: "stage", name: "阶段", type: "string", description: "客户旅程阶段" }, { id: "goal", name: "客户目标", type: "string", description: "阶段核心目标" }, { id: "pain", name: "关键痛点", type: "string", description: "阶段主要阻碍" }, { id: "opportunity", name: "改进机会", type: "string", description: "建议行动" },
  ], [{ stage: "认知", goal: "快速理解价值", pain: "信息分散", opportunity: "行业化案例" }, { stage: "评估", goal: "确认适配性", pain: "试用成本高", opportunity: "场景化演示" }, { stage: "采购", goal: "降低决策风险", pain: "收益不清晰", opportunity: "量化ROI" }, { stage: "使用", goal: "快速产生价值", pain: "上手周期长", opportunity: "模板与培训" }]);
  const portfolio = makeData("portfolio-prioritization", "项目组合", [
    { id: "initiative", name: "项目", type: "string", description: "项目名称" }, { id: "impact", name: "业务影响", type: "integer", description: "业务影响评分", measure: { baseUnit: "score", format: { displayDivisor: "1", decimals: 0, suffix: "分", percent: false }, aggregationBehavior: "nonAdditive" } }, { id: "effort", name: "实施成本", type: "integer", description: "实施成本评分", measure: { baseUnit: "score", format: { displayDivisor: "1", decimals: 0, suffix: "分", percent: false }, aggregationBehavior: "nonAdditive", favorableDirection: "lower" } }, { id: "decision", name: "决策", type: "string", description: "组合决策" },
  ], [{ initiative: "客户洞察", impact: 9, effort: 4, decision: "优先投入" }, { initiative: "自动化报表", impact: 8, effort: 3, decision: "快速推进" }, { initiative: "主数据治理", impact: 7, effort: 8, decision: "分期实施" }, { initiative: "渠道改版", impact: 4, effort: 7, decision: "暂缓" }]);
  const operating = makeData("operating-model", "目标运营模式", [
    { id: "pillar", name: "支柱", type: "string", description: "运营模式支柱" }, { id: "design", name: "目标设计", type: "string", description: "目标状态" }, { id: "owner", name: "责任团队", type: "string", description: "牵头团队" },
  ], [{ pillar: "治理", design: "统一指标与决策节奏", owner: "经营管理" }, { pillar: "流程", design: "端到端闭环", owner: "业务运营" }, { pillar: "组织", design: "跨职能小队", owner: "人力资源" }, { pillar: "技术", design: "数据与自动化平台", owner: "数字化团队" }]);
  const agenda = makeData("meeting-agenda", "会议议程", [
    { id: "order", name: "序号", type: "integer", description: "议程顺序" }, { id: "topic", name: "议题", type: "string", description: "会议议题" }, { id: "purpose", name: "目标", type: "string", description: "讨论目标" }, { id: "owner", name: "主讲人", type: "string", description: "议题负责人" }, { id: "minutes", name: "时长", type: "integer", description: "计划时长", unit: "分钟", measure: { baseUnit: "minute", format: { displayDivisor: "1", decimals: 0, suffix: "分钟", percent: false } } },
  ], [{ order: 1, topic: "目标与进展", purpose: "对齐经营结果", owner: "Marx", minutes: 15 }, { order: 2, topic: "关键问题", purpose: "确认根因与影响", owner: "Summer", minutes: 20 }, { order: 3, topic: "决策事项", purpose: "形成资源决策", owner: "Mary", minutes: 15 }, { order: 4, topic: "行动计划", purpose: "锁定责任与时间", owner: "Marx", minutes: 10 }]);
  const rootCause = makeData("root-cause-analysis", "根因分析", [
    { id: "branch", name: "原因分支", type: "string", description: "一级原因" }, { id: "evidence", name: "证据", type: "string", description: "事实证据" }, { id: "action", name: "改进动作", type: "string", description: "针对性行动" },
  ], [{ branch: "流程", evidence: "审批平均增加3天", action: "压缩审批层级" }, { branch: "系统", evidence: "关键字段重复录入", action: "打通主数据" }, { branch: "能力", evidence: "新员工熟练度不足", action: "场景化培训" }, { branch: "协同", evidence: "需求口径反复变更", action: "统一需求入口" }]);
  const market = makeData("market-sizing", "市场规模", [
    { id: "segment", name: "市场层级", type: "string", description: "TAM/SAM/SOM稳定标识" }, { id: "label", name: "层级简称", type: "string", description: "图表显示标签" }, { id: "amount", name: "市场规模", type: "decimal", description: "可服务市场规模", unit: "亿元", measure: { baseUnit: "CNY", currency: "CNY", format: { displayDivisor: "1", decimals: 0, suffix: "亿元", percent: false } } },
  ], [{ segment: "total", label: "TAM", amount: "420" }, { segment: "serviceable", label: "SAM", amount: "168" }, { segment: "obtainable", label: "SOM", amount: "42" }], { chartType: "comparison", roles: { categoryKey: "segment", categoryLabel: "label", series: ["amount"] } });
  const capacity = makeData("resource-capacity", "资源与产能", [
    { id: "team", name: "团队", type: "string", description: "交付团队" }, { id: "committed", name: "已承诺", type: "decimal", description: "已承诺投入", unit: "FTE", measure: { baseUnit: "FTE", format: { displayDivisor: "1", decimals: 0, suffix: "人", percent: false } } }, { id: "available", name: "可用产能", type: "decimal", description: "仍可用投入", unit: "FTE", measure: { baseUnit: "FTE", format: { displayDivisor: "1", decimals: 0, suffix: "人", percent: false } } },
  ], [{ team: "产品", committed: "8", available: "2" }, { team: "研发", committed: "18", available: "4" }, { team: "数据", committed: "10", available: "1" }, { team: "交付", committed: "12", available: "5" }], { chartType: "stackedColumn", roles: { categoryKey: "team", categoryLabel: "team", series: ["committed", "available"] } });

  return [
    makeTemplate({ id: "quarterly-business-review", name: "季度经营复盘", scene: "budgetComparison", folderId: "template-folder-finance", previewText: "季度经营复盘", dataSpec: quarterly, binding: { resultSetId: "result-quarterly-business-review", roles: { categoryKey: "quarter", categoryLabel: "quarter", barSeries: ["revenue"], lineSeries: ["margin"] }, computations: [] }, elements: [...title("quarterly-business-review", "季度经营复盘", "收入保持增长，盈利质量逐季改善"), chart("quarterly-business-review-chart", rect(36, 124, 640, 330), "combo", { secondaryAxis: true, showLabels: false }), text("quarterly-business-review-insight", rect(716, 132, 208, 178), "核心判断\n\n收入连续四季增长\n利润率提升 2.2pt\nQ4 需守住交付质量", 16, { bold: true, color: navy }), shape("quarterly-business-review-action", rect(716, 334, 208, 94), "下一步\n聚焦高毛利客户与回款", paleGreen, { fontSize: 14, bold: true })], background: "用于季度经营会，将核心趋势、判断和下一步放在同一页。", scenarios: ["季度经营复盘", "董事会汇报", "年度滚动预测"] }),
    makeTemplate({ id: "customer-journey", name: "客户旅程地图", scene: "budgetComparison", folderId: "template-folder-strategy", previewText: "评估与采购是转化损失最集中的关键阶段", dataSpec: journey, ...strategyUpgrade, binding: { resultSetId: "result-customer-journey", roles: { stage: "stage", goal: "goal", pain: "pain", opportunity: "opportunity", columns: ["stage", "goal", "pain", "opportunity"] }, computations: [] }, elements: [...title("customer-journey", "评估与采购是转化损失最集中的关键阶段", "客户旅程｜从认知到使用，逐段识别目标、痛点与机会"), { id: "customer-journey-view", type: "journeyMap", rect: rect(36, 120, 888, 322), z: 4, bindingRef: "main", style: { fontSize: 11 } }, shape("customer-journey-note-bg", rect(36, 462, 888, 34), "", "EEF7F4", {}, "rect"), text("customer-journey-note", rect(54, 469, 852, 20), "优先动作：用场景化演示和量化 ROI 降低评估、采购阶段的决策成本。", 11, { color: "167567", bold: true })], background: "按客户阶段展示目标、触点、痛点和机会，支持体验改进与增长讨论。", scenarios: ["客户体验", "销售转化", "服务流程优化"] }),
    makeTemplate({ id: "portfolio-prioritization", name: "项目组合优先级", scene: "budgetComparison", folderId: "template-folder-strategy", previewText: "客户洞察与自动化报表应进入优先投入队列", dataSpec: portfolio, ...strategyUpgrade, binding: { resultSetId: "result-portfolio-prioritization", roles: { label: "initiative", x: "effort", y: "impact", decision: "decision", columns: ["initiative", "impact", "effort", "decision"] }, computations: [] }, elements: [...title("portfolio-prioritization", "客户洞察与自动化报表应进入优先投入队列", "项目组合｜业务影响 × 实施成本"), { id: "portfolio-prioritization-view", type: "portfolioMatrix", rect: rect(36, 118, 624, 348), z: 4, bindingRef: "main", style: { fontSize: 11 } }, shape("portfolio-summary-bg", rect(690, 118, 234, 348), "", "F3F7FC", {}, "roundRect"), text("portfolio-summary-kicker", rect(714, 144, 186, 18), "资源取舍", 10, { color: "168E96", bold: true }), text("portfolio-summary-title", rect(714, 174, 186, 62), "先投高影响\n低成本项目", 21, { color: "102B57", bold: true }), shape("portfolio-summary-rule", rect(714, 250, 52, 3), "", "168E96", {}, "rect"), text("portfolio-summary-fast", rect(714, 274, 186, 58), "立即推进\n客户洞察 · 自动化报表", 11, { color: "167567", bold: true }), text("portfolio-summary-stage", rect(714, 344, 186, 58), "分期实施\n主数据治理", 11, { color: "315C93", bold: true }), text("portfolio-summary-hold", rect(714, 412, 186, 34), "暂缓：渠道改版", 10, { color: "A45C12", bold: true })], background: "用于项目或投资组合讨论，把影响、成本和决策放到统一框架中。", scenarios: ["项目组合", "年度投资规划", "产品路线图取舍"] }),
    makeTemplate({ id: "operating-model", name: "目标运营模式", scene: "budgetComparison", folderId: "template-folder-organization", previewText: "目标运营模式", dataSpec: operating, binding: { resultSetId: "result-operating-model", roles: { columns: ["pillar", "design", "owner"] }, computations: [] }, elements: [...title("operating-model", "目标运营模式", "治理、流程、组织与技术共同支撑业务目标"), ...["治理\n统一指标与决策节奏","流程\n端到端闭环","组织\n跨职能小队","技术\n数据与自动化平台"].map((label,index)=>shape(`operating-pillar-${index}`,rect(36+index*222,122,204,104),label,["EAF1FF","E7F6F2","FFF4E5","F3EEFF"][index],{fontSize:15,bold:true})), table("operating-model-table",rect(36,258,888,190),["pillar","design","owner"],12), text("operating-model-note",rect(36,470,888,26),"落地顺序：先统一治理与流程，再通过组织机制和技术平台规模化。",12,{color:muted})], background: "把目标运营模式拆解为治理、流程、组织与技术四个支柱。", scenarios: ["组织转型", "运营模式设计", "数字化规划"] }),
    makeTemplate({ id: "meeting-agenda", name: "会议议程与决策导航", scene: "budgetComparison", folderId: "template-folder-general", previewText: "会议议程", dataSpec: agenda, binding: { resultSetId: "result-meeting-agenda", roles: { columns: ["order", "topic", "purpose", "owner", "minutes"] }, computations: [] }, elements: [...title("meeting-agenda", "会议议程", "60 分钟形成问题共识、关键决策与行动计划"), shape("meeting-focus",rect(36,122,888,68),"本次会议输出：3 项关键决策 · 4 项责任到人的行动",navy,{fontSize:18,bold:true,color:white}), table("meeting-agenda-table",rect(36,218,888,236),["order","topic","purpose","owner","minutes"],12), text("meeting-agenda-note",rect(36,474,888,24),"会前材料请提前 24 小时提交；需要决策的事项必须给出明确选项和建议。",11,{color:muted})], background: "用于会议首页或章节导航，明确议题、目标、负责人、时长和预期输出。", scenarios: ["经营会", "项目委员会", "客户工作坊"] }),
    makeTemplate({ id: "root-cause-analysis", name: "根因分析 · 问题树", scene: "budgetComparison", folderId: "template-folder-analysis", previewText: "根因分析", dataSpec: rootCause, binding: { resultSetId: "result-root-cause-analysis", roles: { columns: ["branch", "evidence", "action"] }, computations: [] }, elements: [...title("root-cause-analysis", "根因分析", "从事实证据定位流程、系统、能力与协同问题"), shape("root-problem",rect(36,124,228,88),"核心问题\n交付周期偏长",navy,{fontSize:18,bold:true,color:white}), ...["流程","系统","能力","协同"].map((label,index)=>shape(`root-branch-${index}`,rect(300+index%2*168,118+Math.floor(index/2)*78,150,58),label,["EAF1FF","E7F6F2","FFF4E5","F3EEFF"][index],{fontSize:15,bold:true})), table("root-cause-table",rect(36,252,888,196),["branch","evidence","action"],11), text("root-cause-note",rect(36,470,888,28),"优先动作：压缩审批层级并打通主数据，预计缩短 4–5 个工作日。",13,{color:"0F766E",bold:true})], background: "以问题树和证据表区分表象与根因，并关联针对性改进动作。", scenarios: ["问题诊断", "质量复盘", "运营改善"] }),
    makeTemplate({ id: "market-sizing", name: "市场规模 · TAM SAM SOM", scene: "budgetComparison", folderId: "template-folder-strategy", previewText: "市场规模", dataSpec: market, binding: { resultSetId: "result-market-sizing", roles: { categoryKey: "segment", categoryLabel: "label", series: ["amount"] }, computations: [] }, elements: [...title("market-sizing", "市场规模", "从总市场到三年可获取市场的收敛路径"), chart("market-sizing-chart",rect(36,122,610,330),"comparison",{direction:"bar",showLegend:false,showLabels:true}), text("market-sizing-insight",rect(688,126,236,134),"规模判断\n\nTAM 420 亿元\nSAM 168 亿元\n三年 SOM 42 亿元",17,{bold:true}), shape("market-sizing-action",rect(688,286,236,116),"进入策略\n聚焦大型企业的数据分析与管理汇报场景",paleGreen,{fontSize:14,bold:true})], background: "用TAM、SAM、SOM说明市场规模、可服务边界与阶段目标。", scenarios: ["商业计划", "市场进入", "投资人汇报"] }),
    makeTemplate({ id: "resource-capacity", name: "资源与产能规划", scene: "budgetComparison", folderId: "template-folder-project", previewText: "资源与产能规划", dataSpec: capacity, binding: { resultSetId: "result-resource-capacity", roles: { categoryKey: "team", categoryLabel: "team", series: ["committed", "available"] }, computations: [] }, elements: [...title("resource-capacity", "资源与产能规划", "识别团队承诺投入、可用产能与交付风险"), chart("resource-capacity-chart",rect(36,122,640,326),"stackedColumn",{showLabels:true,showLegend:true}), text("resource-capacity-insight",rect(714,128,210,128),"产能判断\n\n数据团队余量最低\n交付团队仍有 5 FTE\n研发需预留缺陷修复",15,{bold:true}), shape("resource-capacity-action",rect(714,284,210,112),"调配建议\n将 2 FTE 交付资源前置支持数据验收",paleAmber,{fontSize:14,bold:true})], background: "按团队展示已承诺和可用产能，为排期与资源调配提供依据。", scenarios: ["资源规划", "项目排期", "交付风险评审"] }),
  ];
})();

export const BUSINESS_TEMPLATES: readonly BusinessTemplateDefinition[] = [
  ...CORE_BUSINESS_TEMPLATES,
  ...EXTENDED_BUSINESS_TEMPLATES,
  ...HIGH_FREQUENCY_BUSINESS_TEMPLATES,
];
