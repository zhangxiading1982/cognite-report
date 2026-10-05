export * from "./deck";
export { BUSINESS_TEMPLATES, BUSINESS_TEMPLATE_FOLDERS } from "./business-templates";
export type { BusinessTemplateDefinition } from "./business-templates";
import {PHASE2_TEMPLATES,createPhase2Slide} from "./chart-templates-phase2";
export {PHASE2_TEMPLATES} from "./chart-templates-phase2";
export { makeFragment, insertFragment } from "./fragments";
import {PHASE2_CHARTS,compilePhase2Chart} from "./charts-phase2";
export {PHASE2_CHARTS} from "./charts-phase2";
import { compileComponent } from "./components-phase2";
import { compileBusinessComponent } from "./business-components";
import { FONT_OPTIONS } from "./fonts";
import { buildOrthogonalRoute } from "./connector-route";
import { CHART_PALETTES, chartTheme, chartVisualOptions } from "./chart-style";
export { FONT_OPTIONS } from "./fonts";
import { z } from "zod";
export * from "./schema";
export * from "./types";
export * from "./math";
export * from "./render";
export * from "./layout";
export * from "./connector-route";
export * from "./chart-style";
import {
  validateDataSpec,
  formatSchema,
  type DataSpec,
  type ResultSet,
  type Diagnostic,
  type NumberFormat,
} from "./schema";
import type {
  SlideSpec,
  Binding,
  CompiledSlide,
  CompiledElement,
  Rect,
} from "./types";
import {
  D,
  formatValue,
  chartNumber,
  deriveWaterfall,
  monthlyRows,
  axis,
} from "./math";
import { chartPoint, textWidth, wrapText } from "./layout";
const defaultFormat: NumberFormat = {
  displayDivisor: "1",
  decimals: 0,
  suffix: "",
  percent: false,
};
const stringRole = (b: Binding, k: string) => String(b.roles[k] ?? "");
const measure = (data: DataSpec, r: ResultSet, f: string) =>
  data.measures.find(
    (m) => m.id === r.fields.find((x) => x.id === f)?.semanticRef,
  );
export function createSlide(
  data: DataSpec,
  templateId: string,
  options: { id?: string; title?: string } = {},
): SlideSpec {
  if(PHASE2_TEMPLATES.some(t=>t.id===templateId))return createPhase2Slide(data,templateId,options);
  const kinds: Record<string, string> = {
    "budget-comparison": "comparison",
    "monthly-trend": "line",
    "revenue-bridge": "waterfall",
  };
  const kind = kinds[templateId];
  if (!kind) throw new Error("UNKNOWN_TEMPLATE");
  const hint = data.chartHints?.find((h) => h.chartType === kind);
  const candidates = data.resultSets.filter((r) =>
    kind === "waterfall"
      ? r.fields.some((f) => f.id === "role") &&
        r.fields.some((f) => f.id === "order")
      : kind === "line"
        ? r.fields.some((f) => f.type === "date")
        : r.fields.filter((f) => f.type === "decimal").length >= 2 &&
          !r.fields.some((f) => f.id === "role"),
  );
  const r =
    data.resultSets.find((r) => r.id === hint?.resultSetId) ??
    (candidates.length === 1 ? candidates[0] : undefined);
  if (!r) throw new Error("AMBIGUOUS_BINDING: provide chartHints with roles");
  const nums = r.fields.filter(
    (f) => ["decimal", "integer"].includes(f.type) && measure(data, r, f.id),
  );
  const cat = r.fields.find((f) =>
    kind === "line" ? f.type === "date" : r.primaryKey.includes(f.id),
  );
  if (!cat) throw new Error("MISSING_CATEGORY");
  const roles: Binding["roles"] =
    hint?.roles ??
    (kind === "waterfall"
      ? {
          stepKey: r.primaryKey[0],
          label: r.fields.find((f) => f.id === "label")?.id ?? r.primaryKey[0],
          role: "role",
          value: nums[0]?.id ?? "amount",
          sort: "order",
        }
      : {
          categoryKey: cat.id,
          categoryLabel:
            r.fields.find(
              (f) => f.type === "string" && !r.primaryKey.includes(f.id),
            )?.id ?? cat.id,
          series: nums.slice(0, kind === "comparison" ? 2 : 4).map((f) => f.id),
        });
  const series = roles.series as string[];
  const computations: NonNullable<Binding["computations"]> =
    kind === "comparison"
      ? [
          { id: "actualTotal", rule: "sumAdditive", field: series[0] },
          { id: "budgetTotal", rule: "sumAdditive", field: series[1] },
          {
            id: "delta",
            rule: "difference",
            left: "actualTotal",
            right: "budgetTotal",
          },
          {
            id: "deltaRate",
            rule: "positiveBaseRate",
            numerator: "delta",
            denominator: "budgetTotal",
          },
        ]
      : kind === "line"
        ? [
            {
              id: "lastMoM",
              rule: "lastAdjacentMonthGrowth",
              field: series[0],
              dateField: stringRole(
                { roles, resultSetId: r.id },
                "categoryKey",
              ),
            },
          ]
        : [{ id: "bridgeBalance", rule: "validateWaterfallBalance" }];
  const fmt =
    measure(data, r, kind === "waterfall" ? String(roles.value) : series[0])
      ?.format ?? defaultFormat;
  const id = options.id ?? `slide-${templateId}`;
  const title =
    options.title ??
    {
      "budget-comparison": "收入预算对比",
      "monthly-trend": "月度收入趋势",
      "revenue-bridge": "收入变动归因",
    }[templateId]!;
  const s: SlideSpec = {
    specVersion: "1.0",
    id,
    revision: 1,
    title,
    scene: {
      comparison: "budgetComparison",
      line: "monthlyTrend",
      waterfall: "revenueBridge",
    }[kind]!,
    templateRef: { id: templateId, version: 1 },
    themeRef: { id: "corporate-blue", version: 1 },
    canvas: { width: 960, height: 540, unit: "pt" },
    snapshotRef: data.snapshot.id,
    bindings: { main: { resultSetId: r.id, roles, computations } },
    elements: [
      {
        id: id + "-title",
        type: "text",
        rect: { x: 24, y: 24, w: 912, h: 68 },
        z: 1,
        style: { fontSize: 28 },
        runs: [{ text: title }],
      },
      {
        id: id + "-chart",
        type: "chart",
        rect: { x: 24, y: 108, w: 632, h: 352 },
        z: 2,
        bindingRef: "main",
        chartType: kind,
        options: { showLegend: true, showLabels: true, numberFormat: fmt },
        exportPolicy: kind === "waterfall" ? "nativeShapes" : "nativeChart",
      },
      {
        id: id + "-note",
        type: "text",
        rect: { x: 680, y: 108, w: 256, h: 260 },
        z: 3,
        style: { fontSize: 16 },
        runs: [{ text: "请结合业务证据补充说明，并在核对数据后确认结论。" }],
      },
      {
        id: id + "-source",
        type: "sourceFooter",
        rect: { x: 24, y: 486, w: 912, h: 30 },
        z: 4,
        style: { fontSize: 10 },
      },
    ],
    annotations: [],
    layoutOverrides: {},
    reviewState: { status: "needsReview", snapshotId: data.snapshot.id },
  };
  if (kind !== "waterfall")
    s.elements.push({
      id: id + "-kpi",
      type: "text",
      rect: { x: 680, y: 390, w: 256, h: 70 },
      z: 4,
      style: { fontSize: 20 },
      runs:
        kind === "comparison"
          ? [
              { text: "预算差异：" },
              {
                inlineValue: {
                  bindingId: "main",
                  computationId: "delta",
                  format: fmt,
                },
              },
              { text: "\n差异率：" },
              {
                inlineValue: {
                  bindingId: "main",
                  computationId: "deltaRate",
                  format: {
                    ...defaultFormat,
                    decimals: 1,
                    percent: true,
                    suffix: "%",
                  },
                },
              },
            ]
          : [
              { text: "最近月环比：" },
              {
                inlineValue: {
                  bindingId: "main",
                  computationId: "lastMoM",
                  format: {
                    ...defaultFormat,
                    decimals: 1,
                    percent: true,
                    suffix: "%",
                  },
                },
              },
            ],
    });
  return s;
}

const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
const slideSchema = z.object({
  specVersion: z.string(),
  id: z.string(),
  revision: z.number().int().positive(),
  title: z.string(),
  scene: z.string(),
  templateRef: z.object({ id: z.string(), version: z.number() }),
  themeRef: z.object({ id: z.string(), version: z.number() }),
  canvas: z.object({ width: z.number(), height: z.number(), unit: z.string() }),
  snapshotRef: z.string(),
  bindings: z.record(
    z.string(),
    z.object({
      resultSetId: z.string(),
      roles: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
      computations: z
        .array(z.object({ id: z.string(), rule: z.string() }).passthrough())
        .optional(),
    }),
  ),
  elements: z.array(
    z
      .object({
        id: z.string(),
        type: z.string(),
        rect: rectSchema,
        z: z.number(),
        style: z.record(z.string(), z.unknown()).optional(),
        runs: z
          .array(
            z
              .object({
                text: z.string().optional(),
                inlineValue: z
                  .object({
                    bindingId: z.string(),
                    computationId: z.string(),
                    format: z.unknown(),
                  })
                  .optional(),
              })
              .passthrough(),
          )
          .optional(),
      })
      .passthrough(),
  ),
  annotations: z.array(
    z
      .object({
        id: z.string(),
        anchor: z.object({
          bindingId: z.string(),
          rowKey: z.record(z.string(), z.unknown()),
          seriesField: z.string().optional(),
          feature: z.string().optional(),
        }),
        manualOffset: z.object({ x: z.number(), y: z.number() }).optional(),
      })
      .passthrough(),
  ),
  layoutOverrides: z.record(
    z.string(),
    z.object({
      rect: rectSchema.partial().optional(),
      style: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
  reviewState: z
    .object({ status: z.string(), snapshotId: z.string() })
    .passthrough(),
});
export function validateSlideSpec(input: unknown): {
  valid: boolean;
  errors: Diagnostic[];
  slide?: SlideSpec;
} {
  const parsed = slideSchema.safeParse(input);
  return parsed.success
    ? { valid: true, errors: [], slide: input as SlideSpec }
    : {
        valid: false,
        errors: parsed.error.issues.map((e) => ({
          code: "INVALID_SLIDE_SCHEMA",
          message: e.message,
          path: "/" + e.path.join("/"),
          severity: "error",
        })),
      };
}

export function compileSlide(
  slide: SlideSpec,
  data: DataSpec,
  mode: "draft" | "final" = "draft",
): CompiledSlide {
  const structure = validateSlideSpec(slide);
  if (!structure.valid)
    return {
      canvas: { width: 960, height: 540, unit: "pt" },
      theme: {
        fontFace: "SimHei",
        background: "FFFFFF",
        textColor: "1F2937",
        seriesColors: ["2563EB"],
      },
      elements: [],
      diagnostics: structure.errors,
    };
  const theme = {
    fontFace: "SimHei",
    background: "FFFFFF",
    textColor: "1F2937",
    seriesColors:
      slide.themeRef?.id === "neutral"
        ? ["475569", "94A3B8", "64748B", "CBD5E1"]
        : ["2563EB", "94A3B8", "0891B2", "7C3AED"],
  };
  const result: CompiledSlide = {
    canvas: slide.canvas,
    theme,
    elements: [],
    diagnostics: [],
    computations: {},
    provenance: {
      slideRef: { id: slide.id, revision: slide.revision },
      snapshotId: data.snapshot?.id,
      consistency: data.snapshot?.consistency,
      dataAsOf: data.snapshot?.dataAsOf,
      layoutEngineVersion: "1.0.0",
    },
  };
  const diagnostics = result.diagnostics;
  const diag = (
    code: string,
    message: string,
    elementId?: string,
    severity: Diagnostic["severity"] = "error",
  ) =>
    diagnostics.push({
      code,
      message: diagnosticMessage(code, message),
      elementId,
      severity,
    });
  const validation = validateDataSpec(data);
  if (!validation.valid) {
    diagnostics.push(...validation.errors);
    return result;
  }
  if (slide.snapshotRef !== data.snapshot.id)
    diag("SNAPSHOT_MISMATCH", "Slide and data must use same snapshot");
  if (
    !["reviewed", "notRequired"].includes(slide.reviewState?.status ?? "") ||
    slide.reviewState?.snapshotId !== data.snapshot.id
  )
    diag(
      "NEEDS_REVIEW",
      "Conclusions require review on current snapshot",
      undefined,
      mode === "final" ? "error" : "warning",
    );
  if (
    !["budgetComparison", "monthlyTrend", "revenueBridge"].includes(slide.scene)
  )
    diag("INVALID_SCENE", "Unsupported scene");
  if (
    slide.canvas?.width !== 960 ||
    slide.canvas?.height !== 540 ||
    slide.canvas?.unit !== "pt"
  )
    diag("INVALID_CANVAS", "Canvas must be 960 × 540 pt");
  if (slide.elements.length > 50) diag("ELEMENT_LIMIT", "At most 50 elements");
  if (slide.specVersion !== "1.0")
    diag("UNSUPPORTED_SLIDE_VERSION", "Only SlideSpec 1.0 supported");
  if (new Set(slide.elements.map((e) => e.id)).size !== slide.elements.length)
    diag("DUPLICATE_ELEMENT_ID", "Element IDs must be unique");
  const bound = new Map<string, { r: ResultSet; b: Binding }>();
  for (const [id, b] of Object.entries(slide.bindings ?? {})) {
    const r = data.resultSets.find((r) => r.id === b.resultSetId);
    if (!r) {
      diag("MISSING_BINDING", `Missing result set ${b.resultSetId}`);
      continue;
    }
    const fields = Object.values(b.roles).flat();
    if (fields.some((f) => !r.fields.some((x) => x.id === f))) {
      diag("MISSING_BINDING", `Missing fields in binding ${id}`);
      continue;
    }
    bound.set(id, { r, b });
    const vals: Record<string, string | null> = {};
    result.computations![id] = vals;
    for (const c of b.computations ?? []) {
      try {
        if (c.rule === "sumAdditive") {
          const m = measure(data, r, c.field!);
          if (m?.aggregationBehavior !== "additive") {
            diag("NON_ADDITIVE", `Cannot sum ${c.field}`, undefined, "warning");
            vals[c.id] = null;
          } else if (
            !r.rows.length ||
            r.rows.some((row) => row[c.field!] == null)
          ) {
            vals[c.id] = null;
            diag(
              "MISSING_VALUES",
              `Incomplete total ${c.field}`,
              undefined,
              "warning",
            );
          } else
            vals[c.id] = r.rows
              .reduce((sum, row) => sum.add(String(row[c.field!])), new D(0))
              .toFixed();
        } else if (c.rule === "difference") {
          vals[c.id] =
            vals[c.left!] == null || vals[c.right!] == null
              ? null
              : new D(vals[c.left!]!).sub(vals[c.right!]!).toFixed();
        } else if (c.rule === "positiveBaseRate") {
          const den = vals[c.denominator!];
          vals[c.id] =
            den != null && new D(den).gt(0) && vals[c.numerator!] != null
              ? new D(vals[c.numerator!]!).div(den).toFixed()
              : null;
          if (vals[c.id] === null)
            diag(
              "NONPOSITIVE_BASE",
              "Rate is unavailable without a positive base",
              undefined,
              "warning",
            );
        } else if (c.rule === "lastAdjacentMonthGrowth") {
          const range = slide.elements.find(
            (e) => e.type === "chart" && e.bindingRef === id,
          )?.options?.timeRange;
          const rows = monthlyRows(
            r.rows,
            c.dateField!,
            range?.start,
            range?.end,
          );
          const a = rows.at(-2)?.[c.field!],
            z = rows.at(-1)?.[c.field!];
          vals[c.id] =
            a != null && z != null && new D(String(a)).gt(0)
              ? new D(String(z)).sub(String(a)).div(String(a)).toFixed()
              : null;
        } else if (c.rule !== "validateWaterfallBalance")
          diag("UNKNOWN_COMPUTATION", c.rule);
      } catch (e) {
        diag("INVALID_COMPUTATION", String(e));
        vals[c.id] = null;
      }
    }
  }
  const textNode = (
    id: string,
    rect: Rect,
    text: string,
    size = 12,
    color = theme.textColor,
  ): CompiledElement => ({
    id,
    type: "text",
    rect,
    text,
    fontFace: theme.fontFace,
    fontSize: size,
    color,
    margin: 0,
  });
  const anchors = new Map<string, { x: number; y: number }>();
  const sourceRect = (element: any) => ({ ...element.rect, ...slide.layoutOverrides?.[element.id]?.rect });
  const connectionPoint = (connection: any) => {
    const target = slide.elements.find(item => item.id === connection?.elementId);
    if (!target || target.shape === "line" || target.shape === "elbow") return undefined;
    const targetRect = sourceRect(target);
    if (connection.side === "top") return { x: targetRect.x + targetRect.w / 2, y: targetRect.y };
    if (connection.side === "right") return { x: targetRect.x + targetRect.w, y: targetRect.y + targetRect.h / 2 };
    if (connection.side === "bottom") return { x: targetRect.x + targetRect.w / 2, y: targetRect.y + targetRect.h };
    if (connection.side === "left") return { x: targetRect.x, y: targetRect.y + targetRect.h / 2 };
    return undefined;
  };
  for (const e of [...(slide.elements ?? [])].sort((a, b) => a.z - b.z)) {
    const ov = slide.layoutOverrides?.[e.id];
    let rect = { ...e.rect, ...ov?.rect };
    let resolvedLine: any = e.line;
    if (e.type === "shape" && (e.shape === "line" || e.shape === "elbow")) {
      const line: any = e.line ?? {};
      const begin = connectionPoint(line.beginConnection) ?? { x: rect.x + (line.flipH ? rect.w : 0), y: rect.y + (line.flipV ? rect.h : 0) };
      const end = connectionPoint(line.endConnection) ?? { x: rect.x + (line.flipH ? 0 : rect.w), y: rect.y + (line.flipV ? 0 : rect.h) };
      rect = { x: Math.min(begin.x, end.x), y: Math.min(begin.y, end.y), w: Math.max(1, Math.abs(end.x - begin.x)), h: Math.max(1, Math.abs(end.y - begin.y)) };
      resolvedLine = { ...line, flipH: begin.x > end.x, flipV: begin.y > end.y };
      if (e.shape === "elbow") {
        const excluded = new Set([line.beginConnection?.elementId, line.endConnection?.elementId]);
        const endpointRects = slide.elements
          .filter(item => excluded.has(item.id) && item.type === "shape" && item.shape !== "line" && item.shape !== "elbow")
          .map(sourceRect);
        const obstacles = slide.elements
          .filter(item => item.id !== e.id && item.type === "shape" && item.shape !== "line" && item.shape !== "elbow" && !excluded.has(item.id))
          .map(sourceRect);
        resolvedLine.elbowPoints = buildOrthogonalRoute({
          begin,
          end,
          beginSide: line.beginConnection?.side,
          endSide: line.endConnection?.side,
          obstacles,
          endpointRects,
          canvas: { width: slide.canvas.width, height: slide.canvas.height },
          elbowOffset: line.elbowOffset,
          elbowStartOffset: line.elbowStartOffset,
          elbowCorridorOffset: line.elbowCorridorOffset,
          elbowEndOffset: line.elbowEndOffset,
        }).points;
      }
    }
    const style = { ...e.style, ...ov?.style };
    // Legacy default is resolved at render time; immutable saved revisions stay unchanged.
    if (style.fontFace === "Noto Sans CJK SC") style.fontFace = "SimHei";
    if (style.themeId !== undefined && !(style.themeId in CHART_PALETTES)) {
      diag("INVALID_STYLE", "不支持的片段主题", e.id); continue;
    }
    const theme = chartTheme(result.theme, style);

    if (
      style.fontSize !== undefined &&
      (!Number.isFinite(style.fontSize) ||
        style.fontSize <= 0 ||
        style.fontSize > 200)
    ) {
      diag("INVALID_STYLE", "Invalid font size", e.id);
      continue;
    }
    if (
      Object.values(rect).some((v) => !Number.isFinite(v)) ||
      rect.w <= 0 ||
      rect.h <= 0
    ) {
      diag("INVALID_RECT", "Invalid geometry", e.id);
      continue;
    }
    if (
      rect.x < 0 ||
      rect.y < 0 ||
      rect.x + rect.w > slide.canvas.width ||
      rect.y + rect.h > slide.canvas.height
    )
      diag("ELEMENT_OUT_OF_BOUNDS", "Element exceeds canvas", e.id);
    if (e.type === "text" || e.type === "sourceFooter") {
      if ((style.fontFace !== undefined && !FONT_OPTIONS.some(f => f.id === style.fontFace)) ||
          (style.align !== undefined && !["left", "center", "right"].includes(style.align)) ||
          (style.valign !== undefined && !["top", "middle", "bottom"].includes(style.valign)) ||
          ["bold", "italic"].some(k => style[k] !== undefined && typeof style[k] !== "boolean")) {
        diag("INVALID_STYLE", "不支持的字体或文本样式", e.id);
        continue;
      }
      const text =
        e.type === "sourceFooter"
          ? `来源：${data.source.system}｜${data.snapshot.dataAsOf ? `截至 ${sourceTime(data.snapshot.dataAsOf, data.context.timezone)}（${data.context.timezone}）` : "源数据截至时间未知"}｜${data.snapshot.consistency}`
          : (e.runs ?? [])
              .map((run) => {
                if (run.inlineValue) {
                  const v = run.inlineValue;
                  if (
                    !result.computations?.[v.bindingId] ||
                    !(v.computationId in result.computations[v.bindingId])
                  )
                    diag(
                      "MISSING_BINDING",
                      `Missing computation ${v.computationId}`,
                      e.id,
                    );
                  const f = formatSchema.safeParse(v.format);
                  if (!f.success) {
                    diag("INVALID_FORMAT", "Invalid inline value format", e.id);
                    return "—";
                  }
                  return formatValue(
                    result.computations?.[v.bindingId]?.[v.computationId],
                    f.data,
                  );
                }
                return run.text ?? "";
              })
              .join("");
      const fs = Number(style.fontSize ?? 16);
      const lines = wrapText(text, rect.w, fs);
      if (lines.length * fs * 1.25 > rect.h)
        diag("TEXT_OVERFLOW", "Text exceeds its rectangle", e.id);
      result.elements.push({
        ...textNode(
          e.id,
          rect,
          lines.join("\n"),
          fs,
          style.color ?? theme.textColor,
        ),
        fontFace: style.fontFace ?? theme.fontFace,
        valign: style.valign ?? "top",
        bold: style.bold === true,
        italic: style.italic === true,
        align: style.align ?? "left",
        fill: style.fill,
        fillTransparency: style.fillTransparency,
        line: style.line,
      });
      continue;
    }
    if (e.type === "image") {
      if (!e.assetId) diag("MISSING_ASSET", "Image requires assetId", e.id);
      else
        result.elements.push({
          id: e.id,
          type: "image",
          rect,
          assetId: e.assetId,
          fit: e.fit === "cover" ? "cover" : "contain",
        });
      continue;
    }
    if (e.type === "icon") {
      const points =
        e.iconId === "check"
          ? [
              [0, 0.5, 0.35, 0.85],
              [0.35, 0.85, 1, 0.1],
            ]
          : e.iconId === "arrow-up"
            ? [
                [0.5, 1, 0.5, 0],
                [0.5, 0, 0.1, 0.4],
                [0.5, 0, 0.9, 0.4],
              ]
            : [
                [0, 0.5, 1, 0.5],
                [0.5, 0, 0.5, 1],
              ];
      points.forEach((p, i) =>
        result.elements.push({
          id: e.id + "-" + i,
          type: "shape",
          shape: "line",
          rect: {
            x: rect.x + p[0] * rect.w,
            y: rect.y + p[1] * rect.h,
            w: (p[2] - p[0]) * rect.w,
            h: (p[3] - p[1]) * rect.h,
          },
          line: { color: style.color ?? theme.textColor, width: 2 },
        }),
      );
      continue;
    }
    if (e.type === "shape") {
      const supported=["rect","square","roundRect","ellipse","circle","triangle","rtTriangle","diamond","parallelogram","trapezoid","pentagon","hexagon","star5","heart","plus","rightArrow","leftRightArrow","chevron","notchedRightArrow","line","elbow"] as const;
      const shape:CompiledElement["shape"]=supported.includes(e.shape as any)?e.shape as CompiledElement["shape"]:"rect";
      const shapeText=shape==='line'||shape==='elbow'?'':(e.runs??[]).map((run:any)=>run.text??'').join('');
      const shapeFontSize=Number(style.fontSize??16);
      const shapeLines=shapeText?wrapText(shapeText,Math.max(1,rect.w-16),shapeFontSize):[];
      if(shapeLines.length*shapeFontSize*1.25>rect.h)diag('TEXT_OVERFLOW','Text exceeds its rectangle',e.id);
      result.elements.push({
        id: e.id,
        type: "shape",
        rect,
        shape,
        fill: e.fill ?? style.fill ?? theme.seriesColors[0],
        fillTransparency: e.fillTransparency ?? style.fillTransparency,
        line: resolvedLine,
        ...(shapeText?{text:shapeLines.join('\n'),fontFace:style.fontFace??theme.fontFace,fontSize:shapeFontSize,color:style.color??theme.textColor,bold:style.bold===true,italic:style.italic===true,align:style.align??'center',valign:style.valign??'middle'}:{}),
      });
      continue;
    }
    const businessComponent = compileBusinessComponent(e, rect, style, data, slide.bindings[e.bindingRef ?? ""], style.fontFace ?? theme.fontFace);
    if (businessComponent.handled) {
      if (businessComponent.error) diag("INVALID_COMPONENT", businessComponent.error, e.id);
      result.elements.push(...businessComponent.elements);
      continue;
    }
    if (["table", "process", "status"].includes(e.type)) {
      const component = compileComponent(e, rect, style, data, slide.bindings[e.bindingRef ?? ""], style.fontFace ?? theme.fontFace);
      if (component.error) diag("INVALID_COMPONENT", component.error, e.id);
      result.elements.push(...component.elements);
      continue;
    }
    if (e.type !== "chart") {
      diag("UNSUPPORTED_ELEMENT", e.type, e.id);
      continue;
    }
    if ((PHASE2_CHARTS as readonly string[]).includes(e.chartType??'')) {
      const entry=bound.get(e.bindingRef??'');
      const advanced=compilePhase2Chart(e,rect,entry?.b,entry?.r,data,theme,mode);
      result.diagnostics.push(...advanced.diagnostics);if(advanced.node)result.elements.push(advanced.node);
      continue;
    }
    if (!["comparison", "line", "waterfall"].includes(e.chartType ?? "")) {
      diag("UNSUPPORTED_CHART", "Unsupported chart type", e.id);
      continue;
    }
    const entry = bound.get(e.bindingRef ?? "");
    if (!entry) {
      diag("MISSING_BINDING", `Missing binding ${e.bindingRef}`, e.id);
      continue;
    }
    const { r, b } = entry;
    if (!r.rows.length) {
      diag(
        "EMPTY_RESULT",
        "No rows to display",
        e.id,
        mode === "final" ? "error" : "warning",
      );
      result.elements.push(textNode(e.id, rect, "无数据", 16));
      continue;
    }
    if (r.rows.length > 200) {
      diag(
        "CHART_ROW_LIMIT",
        "Maximum 200 chart rows; choose a coarser grain",
        e.id,
      );
      continue;
    }
    if (rect.w < 280 || rect.h < 180)
      diag("CHART_TOO_SMALL", "Chart requires at least 280 × 180 pt", e.id);
    const valueFields =
      e.chartType === "waterfall"
        ? [stringRole(b, "value")]
        : (b.roles.series as string[]);
    if (
      !Array.isArray(valueFields) ||
      !valueFields.length ||
      valueFields.length > 4
    ) {
      diag("INVALID_SERIES", "Requires one to four numeric series", e.id);
      continue;
    }
    if (
      valueFields.some(
        (f) =>
          !["decimal", "integer"].includes(
            r.fields.find((x) => x.id === f)?.type ?? "",
          ),
      )
    ) {
      diag("INVALID_ROLE_TYPE", "Series must be numeric", e.id);
      continue;
    }
    const ms = valueFields.map((f) => measure(data, r, f));
    if (ms.some((m) => !m)) {
      diag("MISSING_MEASURE", "Numeric series requires measure metadata", e.id);
      continue;
    }
    if (
      new Set(
        ms.map((m) =>
          JSON.stringify([m!.unit.baseUnit, m!.unit.currency ?? null]),
        ),
      ).size > 1
    ) {
      diag(
        "UNIT_MISMATCH",
        "Series must use the same base unit and currency",
        e.id,
      );
      continue;
    }
    const parsedFormat = formatSchema.safeParse(
      e.options?.numberFormat ?? ms[0]!.format,
    );
    if (!parsedFormat.success) {
      diag("INVALID_FORMAT", "Invalid display format", e.id);
      continue;
    }
    const fmt = parsedFormat.data;
    try {
      if (e.chartType === "waterfall") {
        const derived = deriveWaterfall(
          r.rows.map((row) => ({
            id: String(row[stringRole(b, "stepKey")]),
            label: String(row[stringRole(b, "label")]),
            role: String(row[stringRole(b, "role")]),
            amount: String(row[stringRole(b, "value")]),
            order: Number(row[stringRole(b, "sort")]),
          })),
          ms[0]!.validation?.absoluteTolerance ??
            (ms[0]!.unit.currency === "CNY" ? "0.01" : "0"),
        );
        diagnostics.push(
          ...derived.diagnostics.map((d) => ({ ...d, elementId: e.id })),
        );
        const ax = axis(
          derived.steps.flatMap((s) => [
            chartNumber(s.from, fmt),
            chartNumber(s.to, fmt),
          ]),
        );
        const plot = {
          x: rect.x + 48,
          y: rect.y + 28,
          w: rect.w - 64,
          h: rect.h - 88,
        };
        const y = (n: number) =>
          plot.y + plot.h - ((n - ax.min) / (ax.max - ax.min)) * plot.h;
        const dx = plot.w / derived.steps.length;
        derived.steps.forEach((s, i) => {
          const x = plot.x + dx * (i + 0.2),
            a = y(chartNumber(s.from, fmt)),
            z = y(chartNumber(s.to, fmt));
          const favorable =
            ms[0]!.favorableDirection === "lower"
              ? new D(s.amount).lt(0)
              : new D(s.amount).gte(0);
          const fill =
            s.role === "delta"
              ? ms[0]!.favorableDirection === "neutral"
                ? "64748B"
                : favorable
                  ? "15803D"
                  : "B91C1C"
              : theme.seriesColors[0];
          result.elements.push({
            id: e.id + "-" + s.id,
            type: "shape",
            shape: "rect",
            rect: {
              x,
              y: Math.min(a, z),
              w: dx * 0.6,
              h: Math.max(0.5, Math.abs(a - z)),
            },
            fill,
            stepId: s.id,
          });
          result.elements.push(
            textNode(
              e.id + "-" + s.id + "-label",
              { x: plot.x + i * dx, y: plot.y + plot.h + 10, w: dx, h: 42 },
              wrapText(s.label, dx, 10).join("\n"),
              10,
            ),
          );
          if (e.options?.showLabels !== false)
            result.elements.push(
              textNode(
                e.id + "-" + s.id + "-value",
                { x: plot.x + i * dx, y: Math.min(a, z) - 18, w: dx, h: 18 },
                formatValue(s.amount, fmt),
                10,
              ),
            );
          if (i < derived.steps.length - 1)
            result.elements.push({
              id: e.id + "-" + s.id + "-connector",
              type: "shape",
              shape: "line",
              rect: {
                x: x + dx * 0.6,
                y: y(chartNumber(s.cumulative, fmt)),
                w: dx * 0.4,
                h: 0,
              },
              line: { color: "94A3B8", width: 1 },
              stepId: s.id,
            });
          const source = r.rows.find(
            (row) => String(row[stringRole(b, "stepKey")]) === s.id,
          )!;
          anchors.set(
            anchorKey(
              e.bindingRef!,
              source,
              r.primaryKey,
              stringRole(b, "value"),
            ),
            { x: x + dx * 0.3, y: z },
          );
        });
        for (
          let tick = ax.min;
          tick <= ax.max + ax.step * 0.001;
          tick += ax.step
        )
          result.elements.push(
            textNode(
              e.id + "-axis-" + tick,
              { x: rect.x, y: y(tick) - 6, w: 44, h: 14 },
              String(Number(tick.toPrecision(8))),
              10,
            ),
          );
        result.elements.push(
          textNode(
            e.id + "-unit",
            { x: rect.x + 48, y: rect.y, w: rect.w - 60, h: 20 },
            fmt.suffix,
            10,
          ),
        );
        continue;
      }
      const cat = stringRole(b, "categoryKey"),
        label = stringRole(b, "categoryLabel");
      if (
        e.chartType === "line" &&
        !["date", "datetime"].includes(
          r.fields.find((f) => f.id === cat)?.type ?? "",
        )
      ) {
        diag("INVALID_DATE_ROLE", "Line requires a real date field", e.id);
        continue;
      }
      let rows = r.rows;
      if (
        new Set(rows.map((row) => JSON.stringify(row[cat]))).size !==
        rows.length
      ) {
        diag("DUPLICATE_CATEGORY", "Chart category keys must be unique", e.id);
        continue;
      }
      if (e.chartType === "line") {
        rows = monthlyRows(
          rows,
          cat,
          e.options?.timeRange?.start,
          e.options?.timeRange?.end,
        );
        if (rows.some((row) => valueFields.some((f) => row[f] == null)))
          diag(
            "MISSING_MONTH_VALUE",
            "Missing months/values remain gaps",
            e.id,
            "warning",
          );
      }
      const series = valueFields.map((f, i) => ({
        id: f,
        name: ms[i]!.name,
        sourceValues: rows.map((row) =>
          row[f] == null ? null : String(row[f]),
        ),
        values: rows.map((row) =>
          row[f] == null ? null : chartNumber(String(row[f]), fmt),
        ),
        color:
          theme.seriesColors[
            data.measures.findIndex((m) => m.id === ms[i]!.id) %
              theme.seriesColors.length
          ],
      }));
      const target = e.options?.targetLine;
      let targetValue: number | undefined;
      if (target) {
        if (!target.source || typeof target.value !== "string") {
          diag(
            "INVALID_TARGET",
            "Target requires raw decimal value and source",
            e.id,
          );
        } else targetValue = chartNumber(target.value, fmt);
      }
      const ax = axis(
        [
          ...series.flatMap((s) =>
            s.values.filter((n): n is number => n !== null),
          ),
          ...(targetValue !== undefined ? [targetValue] : []),
        ],
        e.chartType !== "line" || e.options?.includeZero !== false,
      );
      const node: CompiledElement = {
        id: e.id,
        type: "nativeChart",
        rect,
        chartType: e.chartType === "line" ? "line" : "bar",
        categories: rows.map((row) => ({
          id: String(row[cat]),
          label: String(row[label] ?? row[cat]),
        })),
        series,
        numericUnit: {
          baseUnit: ms[0]!.unit.baseUnit,
          displayDivisor: fmt.displayDivisor,
          label: fmt.suffix,
        },
        valueAxis: { ...ax, title: fmt.suffix },
        options: {
          ...chartVisualOptions(style, e.options),
          direction: e.options?.direction ?? "column",
          grouping: "clustered",
          showLegend: e.options?.showLegend !== false,
          showLabels: e.options?.showLabels !== false,
          fontFace: style.fontFace ?? theme.fontFace,
          labelNumberFormat: fmt.decimals
            ? "0." + "0".repeat(fmt.decimals)
            : "0",
          decimals: fmt.decimals,
          plotAreaLayout: {
            x: 48 / rect.w,
            y: (rect.h - 60 - (rect.h - 88) * chartVisualOptions(style, e.options).plotHeight) / rect.h,
            w: (rect.w - 64) / rect.w,
            h: ((rect.h - 88) * chartVisualOptions(style, e.options).plotHeight) / rect.h,
          },
          nullPolicy: "gap",
        },
      };
      const plotWidth = rect.w - 64,
        plotHeight = rect.h - 88;
      const horizontal =
        node.options?.direction === "bar" && node.chartType === "bar";
      const categorySpace = horizontal ? 44 : (plotWidth / rows.length) * 0.8;
      if (
        node.categories!.some((c) => textWidth(c.label, 10) > categorySpace) ||
        (horizontal && plotHeight / rows.length < 13)
      ) {
        diag(
          "LABEL_OVERFLOW",
          "分类标签空间不足，请缩短名称、减少分类或扩大图表。",
          e.id,
        );
      }
      if (
        node.options?.showLegend &&
        series.some(
          (s, j) =>
            textWidth(s.name, 10) > Math.min(135, plotWidth - j * 150 - 15),
        )
      ) {
        diag(
          "LABEL_OVERFLOW",
          "图例文字空间不足，请缩短系列名称或关闭图例。",
          e.id,
        );
      }
      const tickSpace = horizontal
        ? plotWidth / ((ax.max - ax.min) / ax.step + 1)
        : 44;
      if (
        [ax.min, ax.max, ax.step].some(
          (v) => textWidth(String(Number(v.toPrecision(8))), 10) > tickSpace,
        )
      ) {
        diag(
          "LABEL_OVERFLOW",
          "数值轴刻度文字空间不足，请调整显示单位或扩大图表。",
          e.id,
        );
      }
      if (node.options?.showLabels) {
        const labelSpace = horizontal
          ? plotWidth
          : (plotWidth /
              rows.length /
              (node.chartType === "bar" ? series.length : 1)) *
            0.9;
        if (
          series.some((s) =>
            s.values.some(
              (v) =>
                v !== null &&
                textWidth(v.toFixed(fmt.decimals), 10) > labelSpace,
            ),
          ) ||
          (horizontal && plotHeight / rows.length / series.length < 13)
        ) {
          diag(
            "LABEL_OVERFLOW",
            "数据标签空间不足，请调整单位、减少分类或关闭数字标签。",
            e.id,
          );
        }
      }
      result.elements.push(node);
      if (e.options?.showDifferences && series.length === 2) {
        rows.forEach((row, i) => {
          const a = series[0].sourceValues[i],
            b = series[1].sourceValues[i];
          if (a === null || b === null) return;
          const diff = new D(a).sub(b).toFixed();
          const at = chartPoint(
            node,
            i,
            0,
            Math.max(series[0].values[i]!, series[1].values[i]!),
          );
          result.elements.push(
            textNode(
              e.id + "-difference-" + String(row[cat]),
              { x: at.x - 12, y: at.y - 34, w: 120, h: 18 },
              "差异：" + formatValue(diff, fmt),
              10,
            ),
          );
        });
      }
      if (targetValue !== undefined) {
        const a = chartPoint(node, 0, 0, targetValue);
        const horizontal =
          node.options?.direction === "bar" && node.chartType === "bar";
        result.elements.push({
          id: e.id + "-target-line",
          type: "shape",
          shape: "line",
          rect: horizontal
            ? { x: a.x, y: rect.y + 28, w: 0, h: rect.h - 88 }
            : { x: rect.x + 48, y: a.y, w: rect.w - 64, h: 0 },
          line: { color: "D97706", width: 1, dash: "dash" },
        });
        result.elements.push(
          textNode(
            e.id + "-target-label",
            { x: rect.x + 48, y: rect.y + 14, w: rect.w - 64, h: 16 },
            `${target.label ?? "目标"} ${formatValue(target.value, fmt)} · ${target.source}`,
            10,
            "D97706",
          ),
        );
      }
      rows.forEach((row, i) =>
        valueFields.forEach((f, j) => {
          const n = series[j].values[i];
          if (n !== null)
            anchors.set(
              anchorKey(e.bindingRef!, row, r.primaryKey, f),
              chartPoint(node, i, j, n),
            );
        }),
      );
    } catch (error) {
      diag(
        error instanceof Error ? error.message : "CHART_ERROR",
        String(error),
        e.id,
      );
    }
  }
  for (const a of slide.annotations ?? []) {
    const entry = bound.get(a.anchor.bindingId);
    const point = entry
      ? anchors.get(
          anchorKey(
            a.anchor.bindingId,
            a.anchor.rowKey,
            entry.r.primaryKey,
            a.anchor.seriesField ?? "",
          ),
        )
      : undefined;
    if (!point) {
      diag(
        "ORPHAN_ANNOTATION",
        "Annotation anchor no longer exists",
        a.id,
        mode === "final" ? "error" : "warning",
      );
      continue;
    }
    result.elements.push(
      textNode(
        a.id,
        {
          x: point.x + (a.manualOffset?.x ?? 0),
          y: point.y + (a.manualOffset?.y ?? -24),
          w: 160,
          h: 28,
        },
        a.text ?? "",
        12,
      ),
    );
  }
  for (const el of result.elements) {
    if (el.type === "text" && el.text) {
      const fs = el.fontSize ?? 16;
      const lines = el.text.split("\n");
      if (
        lines.some((line) => textWidth(line, fs) > el.rect.w + 0.01) ||
        lines.length * fs * 1.25 > el.rect.h + 0.01
      ) {
        if (
          !diagnostics.some(
            (d) => d.code === "TEXT_OVERFLOW" && d.elementId === el.id,
          )
        )
          diag(
            "TEXT_OVERFLOW",
            "文字超出文本框，请缩短内容或扩大文本框。",
            el.id,
          );
      }
    }

    if (
      el.rect.x < 0 ||
      el.rect.y < 0 ||
      el.rect.x + el.rect.w > slide.canvas.width ||
      el.rect.y + el.rect.h > slide.canvas.height
    ) {
      if (
        !diagnostics.some(
          (d) => d.code === "ELEMENT_OUT_OF_BOUNDS" && d.elementId === el.id,
        )
      )
        diag("ELEMENT_OUT_OF_BOUNDS", "Element exceeds canvas", el.id);
    }
  }
  if (mode === "draft")
    result.elements.push(
      textNode(
        "draft-watermark",
        { x: 856, y: 468, w: 80, h: 16 },
        "草稿",
        10,
        "B91C1C",
      ),
    );
  return result;
}
function anchorKey(
  binding: string,
  row: Record<string, unknown>,
  keys: string[],
  field: string,
) {
  return JSON.stringify([binding, keys.map((k) => row[k]), field]);
}
function sourceTime(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}
function diagnosticMessage(code: string, detail: string): string {
  const labels: Record<string, string> = {
    NEEDS_REVIEW: "请在当前数据快照上复核业务结论，再导出正式版本。",
    SNAPSHOT_MISMATCH: "页面绑定的快照与当前数据不一致，请重新绑定。",
    INVALID_SCENE: "不支持的业务场景。",
    INVALID_CANVAS: "页面必须为960×540 pt。",
    ELEMENT_LIMIT: "单页最多允许50个元素。",
    UNSUPPORTED_SLIDE_VERSION: "不支持的页面版本。",
    DUPLICATE_ELEMENT_ID: "页面元素ID重复，请复制为新元素。",
    MISSING_BINDING: "数据绑定失效，请检查结果集、字段和计算引用。",
    NON_ADDITIVE: "指标不可跨行相加，已隐藏汇总；请提供上游总计。",
    MISSING_VALUES: "数据不完整，无法提供汇总。",
    NONPOSITIVE_BASE: "基数为空、零或负数，差异率暂不适用。",
    UNKNOWN_COMPUTATION: "不支持的计算规则。",
    INVALID_COMPUTATION: "计算失败，请检查数据绑定。",
    INVALID_STYLE: "字号设置无效，请使用1–200 pt。",
    INVALID_RECT: "元素尺寸或位置无效。",
    ELEMENT_OUT_OF_BOUNDS: "元素超出页面边界，请调整位置或尺寸。",
    INVALID_FORMAT: "数字格式无效，请检查显示除数和精度。",
    TEXT_OVERFLOW: "文字超出文本框，请缩短内容或扩大文本框。",
    MISSING_ASSET: "图片资源缺失，请重新选择图片。",
    UNSUPPORTED_ELEMENT: "不支持的元素类型。",
    UNSUPPORTED_CHART: "一期暂不支持该图表类型。",
    EMPTY_RESULT: "没有可展示的数据，请检查筛选条件。",
    CHART_ROW_LIMIT: "图表最多支持200行，请选择更粗的业务粒度。",
    CHART_TOO_SMALL: "图表尺寸至少需要280×180 pt。",
    INVALID_SERIES: "图表需要1–4个数值系列。",
    INVALID_ROLE_TYPE: "数值角色只能绑定整数或十进制字段。",
    MISSING_MEASURE: "数值字段缺少度量定义。",
    UNIT_MISMATCH: "系列单位或币种不一致，不能共用数值轴。",
    INVALID_DATE_ROLE: "趋势日期角色必须绑定真实日期。",
    DUPLICATE_CATEGORY: "分类键重复，请确认图表粒度。",
    MISSING_MONTH_VALUE: "缺失月份或数值保留为断点，不按零计算。",
    INVALID_TARGET: "目标线需要原始单位的数字及来源说明。",
    ORPHAN_ANNOTATION: "标注对应的数据已不存在，请删除或重新绑定。",
    UNSAFE_NUMERIC_PRECISION: "数值超出图表安全精度，已阻止失真导出。",
    DUPLICATE_MONTH: "同一月份存在多行，请由上游明确月度粒度。",
  };
  return labels[code] ?? detail;
}

export {composeChartData} from "./chart-data.ts";
