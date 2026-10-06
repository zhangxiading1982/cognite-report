export type TableStylePresetId = "editorial" | "variance" | "matrix" | "trend" | "heatmap" | "scorecard";

export const TABLE_STYLE_PRESETS: ReadonlyArray<{ id: TableStylePresetId; label: string; description: string }> = [
  { id: "editorial", label: "简洁叙事", description: "弱网格和清晰层级，适合议程、说明和通用业务表。" },
  { id: "variance", label: "财务差异", description: "突出涨跌、合计和数值比较，适合经营与财务汇报。" },
  { id: "matrix", label: "层级矩阵", description: "强化行列关系和角色编码，适合 RACI 与对照矩阵。" },
  { id: "trend", label: "指标趋势", description: "强调指标变化和状态，适合 KPI 与周期趋势。" },
  { id: "scorecard", label: "状态评分", description: "用状态色快速定位风险、进度和责任事项。" },
  { id: "heatmap", label: "热力矩阵", description: "用分级色块表达强弱，适合风险和优先级矩阵。" },
] as const;

const statusCells = {
  "正常": { fill: "E8F5EF", color: "18745A", bold: true, align: "center" },
  "良好": { fill: "E8F5EF", color: "18745A", bold: true, align: "center" },
  "完成": { fill: "E8F5EF", color: "18745A", bold: true, align: "center" },
  "达成": { fill: "E8F5EF", color: "18745A", bold: true, align: "center" },
  "进行中": { fill: "E8F1FA", color: "1F5F99", bold: true, align: "center" },
  "关注": { fill: "FFF2D6", color: "9A5B13", bold: true, align: "center" },
  "预警": { fill: "FFF2D6", color: "9A5B13", bold: true, align: "center" },
  "风险": { fill: "FBE9E7", color: "B13A32", bold: true, align: "center" },
  "延期": { fill: "FBE9E7", color: "B13A32", bold: true, align: "center" },
  "阻塞": { fill: "FBE9E7", color: "B13A32", bold: true, align: "center" },
  green: { fill: "E8F5EF", color: "18745A", bold: true, align: "center" },
  yellow: { fill: "FFF2D6", color: "9A5B13", bold: true, align: "center" },
  red: { fill: "FBE9E7", color: "B13A32", bold: true, align: "center" },
};

const matrixCells = {
  r: { fill: "DCEBFA", color: "174A7E", bold: true, align: "center" },
  a: { fill: "DFF1EA", color: "176B55", bold: true, align: "center" },
  c: { fill: "FFF0D5", color: "8A5518", bold: true, align: "center" },
  i: { fill: "EEF1F4", color: "536171", bold: true, align: "center" },
};

const presetStyles: Record<TableStylePresetId, Record<string, any>> = {
  editorial: { fill: "F5F7FA", headerColor: "344054", bodyFill: "FFFFFF", bodyStripeFill: "FFFFFF", borderMode: "horizontal", line: { color: "D8DEE7", width: 0.65 }, headerLine: { color: "98A2B3", width: 1.15 }, firstColumnBold: true, cellPaddingX: 10 },
  variance: { fill: "EEF2F6", headerColor: "223148", bodyFill: "FFFFFF", bodyStripeFill: "F8FAFC", borderMode: "horizontal", line: { color: "C9D2DE", width: 0.65 }, headerLine: { color: "7A899C", width: 1.25 }, firstColumnBold: true, lastRowBold: true, lastRowFill: "E9EEF5", positiveColor: "16845B", negativeColor: "C53B43", cellPaddingX: 9 },
  matrix: { fill: "263B55", headerColor: "FFFFFF", bodyFill: "FFFFFF", bodyStripeFill: "F8FAFC", borderMode: "grid", line: { color: "D3DAE4", width: 0.65 }, firstColumnBold: true, categoricalCellStyles: matrixCells, cellPaddingX: 9 },
  trend: { fill: "F0F4F7", headerColor: "344054", bodyFill: "FFFFFF", bodyStripeFill: "F8FAFC", borderMode: "horizontal", line: { color: "D6DDE6", width: 0.65 }, headerLine: { color: "98A2B3", width: 1.1 }, firstColumnBold: true, valueColorMode: "direction", categoricalCellStyles: statusCells, cellPaddingX: 9 },
  scorecard: { fill: "F2F4F7", headerColor: "344054", bodyFill: "FFFFFF", bodyStripeFill: "FFFFFF", borderMode: "horizontal", line: { color: "E0E5EC", width: 0.65 }, headerLine: { color: "A7B0BE", width: 1.1 }, firstColumnBold: true, categoricalCellStyles: statusCells, cellPaddingX: 9 },
  heatmap: { fill: "27374D", headerColor: "FFFFFF", bodyFill: "F8FAFC", bodyStripeFill: "F8FAFC", borderMode: "grid", line: { color: "FFFFFF", width: 1 }, categoricalCellStyles: { ...statusCells, ...matrixCells }, cellPaddingX: 8 },
};

const legacyVisualDefaults: Record<string, unknown> = {
  fill: "DCEAF7",
  headerColor: "173B67",
  bodyFill: "FFFFFF",
  bodyStripeFill: "F8FAFC",
  borderMode: "horizontal",
};

const ids = new Set<TableStylePresetId>(TABLE_STYLE_PRESETS.map(item => item.id));

export function inferTableStylePreset(elementId = "", fields: string[] = []): TableStylePresetId {
  const value = `${elementId} ${fields.join(" ")}`.toLowerCase();
  if (/raci|matrix|矩阵/.test(value)) return "matrix";
  if (/pnl|profit|cost-variance|variance|budget|差异|预算|利润/.test(value)) return "variance";
  if (/metric|kpi|trend|scorecard|指标|趋势/.test(value)) return "trend";
  if (/risk|status|milestone|action|dependency|progress|风险|状态|里程碑|行动|进度/.test(value)) return "scorecard";
  return "editorial";
}

export function applyTableStylePreset(id: TableStylePresetId): Record<string, any> {
  const preset = presetStyles[id];
  return {
    lastRowBold: false,
    lastRowFill: undefined,
    valueColorMode: "none",
    directionFields: undefined,
    ...preset,
    line: preset.line ? { ...preset.line } : undefined,
    headerLine: preset.headerLine ? { ...preset.headerLine } : undefined,
    categoricalCellStyles: preset.categoricalCellStyles ? { ...preset.categoricalCellStyles } : undefined,
    tablePreset: id,
    tableDesignVersion: 2,
  };
}

export function resolveTableStyle(elementId: string, fields: string[] = [], input: Record<string, any> = {}): Record<string, any> {
  const explicit = ids.has(input.tablePreset) ? input.tablePreset as TableStylePresetId : undefined;
  const presetId = explicit ?? inferTableStylePreset(elementId, fields);
  const preset = applyTableStylePreset(presetId);
  if (explicit || Number(input.tableDesignVersion) >= 2) {
    return { ...preset, ...input, line: { ...preset.line, ...input.line }, headerLine: { ...preset.headerLine, ...input.headerLine } };
  }
  const upgraded = { ...input };
  for (const [key, value] of Object.entries(preset)) {
    const current = input[key];
    if (current === undefined || (key in legacyVisualDefaults && current === legacyVisualDefaults[key])) upgraded[key] = value;
  }
  const legacyLine = input.line && input.line.color === "D8E1EC" && Number(input.line.width) === 0.6;
  if (!input.line || legacyLine) upgraded.line = { ...preset.line };
  if (!input.headerLine) upgraded.headerLine = preset.headerLine ? { ...preset.headerLine } : undefined;
  return { ...upgraded, tablePreset: presetId, tableDesignVersion: 2 };
}
