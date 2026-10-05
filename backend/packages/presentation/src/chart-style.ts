import type { CompiledSlide } from "./types";

export const CHART_PALETTES = {
  "corporate-blue": { label: "商务蓝灰", colors: ["2563EB", "94A3B8", "0891B2", "7C3AED"] },
  executive: { label: "高管深蓝", colors: ["1D4ED8", "60A5FA", "0F766E", "F59E0B"] },
  teal: { label: "青绿洞察", colors: ["0F766E", "2DD4BF", "155E75", "A7F3D0"] },
  warm: { label: "暖色重点", colors: ["C2410C", "F59E0B", "B91C1C", "FCA5A5"] },
  neutral: { label: "中性简洁", colors: ["475569", "94A3B8", "64748B", "CBD5E1"] },
} as const;

export type ChartPaletteId = keyof typeof CHART_PALETTES;

const hex = (value: unknown) => typeof value === "string" && /^#?[0-9a-f]{6}$/i.test(value)
  ? value.replace("#", "").toUpperCase()
  : undefined;
const finite = (value: unknown, fallback: number, min: number, max: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};

export function chartTheme(base: CompiledSlide["theme"], style: Record<string, any> = {}) {
  const palette = CHART_PALETTES[style.themeId as ChartPaletteId]?.colors;
  const custom = Array.isArray(style.seriesColors) ? style.seriesColors.map(hex).filter(Boolean) as string[] : [];
  return {
    ...base,
    ...(style.fontFace ? { fontFace: style.fontFace } : {}),
    seriesColors: custom.length ? custom : palette ? [...palette] : base.seriesColors,
  };
}

/** Visual controls shared by SVG preview and editable PowerPoint charts. */
export function chartVisualOptions(style: Record<string, any> = {}, options: Record<string, any> = {}) {
  return {
    ...options,
    fontFace: style.fontFace ?? options.fontFace,
    fontSize: finite(style.fontSize ?? options.fontSize, 11, 8, 24),
    labelFontSize: finite(style.labelFontSize ?? options.labelFontSize, 10, 8, 24),
    labelColor: hex(style.labelColor ?? options.labelColor) ?? "475569",
    axisColor: hex(style.axisColor ?? options.axisColor) ?? "94A3B8",
    gridColor: hex(style.gridColor ?? options.gridColor) ?? "E2E8F0",
    barThickness: finite(style.barThickness ?? options.barThickness, 0.7, 0.25, 0.95),
    plotHeight: finite(style.plotHeight ?? options.plotHeight, 1, 0.55, 1),
    lineWidth: finite(style.lineWidth ?? options.lineWidth, 2, 1, 8),
    markerSize: finite(style.markerSize ?? options.markerSize, 3, 0, 12),
    showGridlines: (style.showGridlines ?? options.showGridlines) !== false,
  };
}
