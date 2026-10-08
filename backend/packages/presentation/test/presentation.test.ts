import { describe, it, expect } from "vitest";
import fixture from "../../../fixtures/monthly-operations.data.json";
import budget from "../../../fixtures/budget.slide.json";
import * as p from "../src/index";
const data = () => structuredClone(fixture) as any;
describe("DataSpec validation", () => {
  it("accepts complete fixture", () =>
    expect(p.validateDataSpec(data()).valid).toBe(true));
  it.each([
    "typo",
    "decimal",
    "duplicate",
    "reference",
    "truncated",
    "date",
    "divisor",
    "filter",
    "major",
  ])("rejects %s", (kind) => {
    const d = data();
    if (kind === "typo") d.resultSets[0].typo = true;
    if (kind === "decimal") d.resultSets[0].rows[0].actual = "1,000";
    if (kind === "duplicate")
      d.resultSets[0].rows.push(d.resultSets[0].rows[0]);
    if (kind === "reference") d.resultSets[0].fields[2].semanticRef = "missing";
    if (kind === "truncated") d.resultSets[0].truncated = true;
    if (kind === "date") d.resultSets[1].rows[0].month = "2026-02-30";
    if (kind === "divisor") d.measures[0].format.displayDivisor = "0";
    if (kind === "filter") d.queries[0].effectiveFilters[0].value = 12;
    if (kind === "major") d.specVersion = "2.0";
    expect(p.validateDataSpec(d).valid).toBe(false);
  });
});
describe("calculations and compilation", () => {
  it("carries editable presentation chart styling into preview rendering", () => {
    const s = structuredClone(budget) as any;
    const chart = s.elements.find((element: any) => element.type === "chart");
    chart.style = {
      themeId: "executive",
      seriesColors: ["0F766E", "F59E0B"],
      fontSize: 13,
      labelFontSize: 11,
      labelColor: "334155",
      axisColor: "64748B",
      gridColor: "CBD5E1",
      barThickness: 0.86,
      plotHeight: 0.84,
      lineWidth: 3,
      markerSize: 5,
    };
    const compiled = p.compileSlide(s, data());
    const node = compiled.elements.find((element: any) => element.type === "nativeChart")!;
    expect(node.series?.map((series: any) => series.color)).toEqual(["0F766E", "F59E0B"]);
    expect(node.options).toMatchObject({
      fontSize: 13,
      labelFontSize: 11,
      labelColor: "334155",
      axisColor: "64748B",
      gridColor: "CBD5E1",
      barThickness: 0.86,
      plotHeight: 0.84,
      lineWidth: 3,
      markerSize: 5,
    });
    const svg = p.renderSlideSvg(compiled);
    expect(svg).toContain('font-size="13"');
    expect(svg).toContain('fill="#334155"');
    expect(svg).toContain('stroke="#CBD5E1"');
    expect(svg).toContain('fill="#0F766E"');
  });
  it("calculates fixture budget and applies divisor exactly once", () => {
    const c = p.compileSlide(budget as any, data());
    expect(c.elements.find((x: any) => x.id.endsWith("-kpi"))?.text).toBe(
      "预算差异：100万元\n差异率：3.3%",
    );
    expect(
      c.elements.find((x: any) => x.type === "nativeChart")?.series?.[0].values,
    ).toEqual([1200, 800, 1100]);
  });
  it("hides nonadditive total and nonpositive budget rate", () => {
    const d = data();
    d.measures[0].aggregationBehavior = "nonAdditive";
    expect(
      p
        .compileSlide(budget as any, d)
        .diagnostics.some((x) => x.code === "NON_ADDITIVE"),
    ).toBe(true);
    const e = data();
    e.resultSets[0].rows.forEach((r: any) => (r.budget = "0"));
    expect(
      p
        .compileSlide(budget as any, e)
        .elements.find((x: any) => x.id.endsWith("-kpi"))?.text,
    ).toContain("差异率：—");
  });
  it("fills missing months with null without stale MoM", () => {
    const d = data();
    d.resultSets[1].rows.splice(1, 1);
    const c = p.compileSlide(p.createSlide(d, "monthly-trend"), d);
    expect(
      c.elements.find((x: any) => x.type === "nativeChart")?.series?.[0].values,
    ).toEqual([2500, null, 3100]);
    expect(c.computations?.main.lastMoM).toBe(null);
  });
  it("validates bridge using original unit tolerance", () => {
    const d = data();
    d.resultSets[2].rows[4].amount = "31000000.02";
    expect(
      p
        .compileSlide(p.createSlide(d, "revenue-bridge"), d, "final")
        .diagnostics.some(
          (x) => x.code === "WATERFALL_UNBALANCED" && x.severity === "error",
        ),
    ).toBe(true);
  });
  it("handles crossing zero and subtotals without addition", () => {
    const steps = p.deriveWaterfall([
      { id: "s", label: "s", role: "start", amount: "10", order: 0 },
      { id: "d", label: "d", role: "delta", amount: "-15", order: 1 },
      { id: "sub", label: "sub", role: "subtotal", amount: "-5", order: 2 },
      { id: "e", label: "e", role: "end", amount: "-5", order: 3 },
    ]);
    expect(steps.steps.map((s) => [s.from, s.to])).toEqual([
      ["0", "10"],
      ["10", "-5"],
      ["0", "-5"],
      ["0", "-5"],
    ]);
    expect(steps.diagnostics).toEqual([]);
  });
  it("preflights overrides, missing bindings and review", () => {
    const s = structuredClone(budget) as any;
    s.layoutOverrides[s.elements[0].id] = { rect: { x: 950 } };
    s.elements[1].bindingRef = "gone";
    const c = p.compileSlide(s, data(), "final");
    expect(c.diagnostics.map((x) => x.code)).toEqual(
      expect.arrayContaining([
        "ELEMENT_OUT_OF_BOUNDS",
        "MISSING_BINDING",
        "NEEDS_REVIEW",
      ]),
    );
  });
  it("renders safe SVG and editable waterfall shapes", () => {
    const d = data();
    const s = p.createSlide(d, "revenue-bridge", {
      title: "<script>alert(1)</script>",
    });
    const c = p.compileSlide(s, d);
    expect(c.elements.some((x) => x.type === "shape")).toBe(true);
    const svg = p.renderSlideSvg(c);
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("<rect");
  });
  it("creates templates by roles with renamed result set", () => {
    const d = data();
    d.resultSets[0].id = "custom";
    d.chartHints[0].resultSetId = "custom";
    expect(
      p.createSlide(d, "budget-comparison").bindings.main.resultSetId,
    ).toBe("custom");
  });
});
describe("boundary regressions", () => {
  it("keeps decimal 0.1 plus 0.2 exact and rejects unsafe chart precision", () => {
    expect(
      p.formatValue("0.3", {
        displayDivisor: "1",
        decimals: 2,
        suffix: "",
        percent: false,
      }),
    ).toBe("0.30");
    expect(() =>
      p.chartNumber("9007199254740993", {
        displayDivisor: "1",
        decimals: 0,
        suffix: "",
        percent: false,
      }),
    ).toThrow("UNSAFE_NUMERIC_PRECISION");
  });
  it("requires binding types and unique chart category keys", () => {
    const d = data();
    const s = structuredClone(budget) as any;
    s.bindings.main.roles.series = ["regionId"];
    expect(
      p
        .compileSlide(s, d)
        .diagnostics.some((x) => x.code === "INVALID_ROLE_TYPE"),
    ).toBe(true);
  });
  it("rejects cyclic dependencies and duplicate query IDs", () => {
    const d = data();
    d.measures[0].dependencies = ["revenue-actual"];
    expect(p.validateDataSpec(d).valid).toBe(false);
  });
  it("rejects semantic measure attached to string values", () => {
    const d = data();
    d.resultSets[0].fields[0].semanticRef = "revenue-actual";
    expect(p.validateDataSpec(d).valid).toBe(false);
  });
  it("rejects invented annotation row identity and flags annotation outside canvas", () => {
    const d = data();
    const s = structuredClone(budget) as any;
    s.reviewState.status = "reviewed";
    s.annotations = [
      {
        id: "anno",
        text: "Beyond",
        anchor: {
          bindingId: "main",
          rowKey: { regionId: "east" },
          seriesField: "actual",
        },
        manualOffset: { x: 2000, y: 0 },
      },
    ];
    expect(
      p
        .compileSlide(s, d, "final")
        .diagnostics.some(
          (x) => x.code === "ELEMENT_OUT_OF_BOUNDS" && x.elementId === "anno",
        ),
    ).toBe(true);
  });
  it("records duplicate element IDs and unsupported slide versions", () => {
    const d = data();
    const s = structuredClone(budget) as any;
    s.specVersion = "2.0";
    s.elements.push(s.elements[0]);
    expect(p.compileSlide(s, d).diagnostics.map((x) => x.code)).toEqual(
      expect.arrayContaining([
        "UNSUPPORTED_SLIDE_VERSION",
        "DUPLICATE_ELEMENT_ID",
      ]),
    );
  });
  it("uses the same explicit monthly domain for chart and growth", () => {
    const d = data();
    const s = p.createSlide(d, "monthly-trend");
    s.elements.find((e) => e.type === "chart")!.options!.timeRange = {
      start: "2026-01-01",
      end: "2026-04-01",
    };
    const c = p.compileSlide(s, d);
    expect(c.computations?.main.lastMoM).toBe(null);
    expect(
      c.elements.find((e) => e.type === "nativeChart")?.series?.[0].values,
    ).toEqual([2500, 2800, 3100, null]);
  });
  it("renders embedded assets without allowing unsafe or external image URLs", () => {
    const c = p.compileSlide(
      p.createSlide(data(), "budget-comparison"),
      data(),
    );
    c.elements.push({
      id: "img",
      type: "image",
      rect: { x: 1, y: 1, w: 30, h: 30 },
      assetId: "asset",
    });
    c.assets = [{ id: "asset", dataUri: "data:image/png;base64,AA==" }];
    expect(p.renderSlideSvg(c)).toContain('href="data:image/png;base64,AA=="');
    c.assets[0].dataUri = "https://example.com/track";
    expect(p.renderSlideSvg(c)).not.toContain("https://");
  });
});
describe("phase one import limits and locations", () => {
  it("rejects refresh batch consistency in phase one", () => {
    const d = data();
    d.snapshot.consistency = "bestEffortBatch";
    d.snapshot.window = {
      startedAt: d.snapshot.capturedAt,
      completedAt: d.snapshot.capturedAt,
    };
    expect(p.validateDataSpec(d).valid).toBe(false);
  });
  it("locates query filter errors with actual JSON pointer", () => {
    const d = data();
    d.queries[0].effectiveFilters[0].value = 42;
    expect(
      p
        .validateDataSpec(d)
        .errors.some((e) => e.path === "/queries/0/effectiveFilters/0/value"),
    ).toBe(true);
  });
  it("rejects duplicate grain even if primary keys differ", () => {
    const d = data();
    d.resultSets[0].grain = ["regionName"];
    d.resultSets[0].rows[1].regionName = "华东";
    expect(
      p.validateDataSpec(d).errors.some((e) => e.code === "DUPLICATE_GRAIN"),
    ).toBe(true);
  });
  it("rejects over 200 chart rows without dropping categories", () => {
    const d = data();
    d.resultSets[0].rows = Array.from({ length: 201 }, (_, i) => ({
      regionId: "r" + i,
      regionName: "R" + i,
      actual: "1",
      budget: "1",
    }));
    const c = p.compileSlide(p.createSlide(d, "budget-comparison"), d);
    expect(c.diagnostics.some((e) => e.code === "CHART_ROW_LIMIT")).toBe(true);
  });
});
describe("slide preflight and editable decorations", () => {
  it("rejects unsupported chart kinds and invalid geometry/style", () => {
    const d = data();
    const s = p.createSlide(d, "budget-comparison");
    s.elements[1].chartType = "bubble";
    s.elements[0].style!.fontSize = 0;
    const c = p.compileSlide(s, d);
    expect(c.diagnostics.map((e) => e.code)).toEqual(
      expect.arrayContaining(["UNSUPPORTED_CHART", "INVALID_STYLE"]),
    );
  });
  it("allows explicitly notRequired review state on same snapshot", () => {
    const d = data();
    const s = p.createSlide(d, "budget-comparison");
    s.reviewState.status = "notRequired";
    expect(
      p
        .compileSlide(s, d, "final")
        .diagnostics.some((e) => e.code === "NEEDS_REVIEW"),
    ).toBe(false);
  });
  it("compiles explicit target line as editable shape and labels its source", () => {
    const d = data();
    const s = p.createSlide(d, "monthly-trend");
    s.elements[1].options!.targetLine = {
      value: "29000000",
      label: "目标",
      source: "已批准预算",
    };
    const c = p.compileSlide(s, d);
    expect(
      c.elements.some(
        (e) => e.type === "shape" && e.id.endsWith("-target-line"),
      ),
    ).toBe(true);
    expect(c.elements.some((e) => e.text?.includes("已批准预算"))).toBe(true);
    expect(
      c.elements.find((e) => e.type === "nativeChart")?.valueAxis?.max,
    ).toBeGreaterThanOrEqual(2900);
  });
  it("compiles icon into native rect or line shapes", () => {
    const d = data();
    const s = p.createSlide(d, "budget-comparison");
    s.elements.push({
      id: "icon",
      type: "icon",
      iconId: "check",
      rect: { x: 900, y: 450, w: 24, h: 24 },
      z: 5,
    });
    expect(
      p
        .compileSlide(s, d)
        .elements.filter((e) => e.id.startsWith("icon"))
        .every((e) => e.type === "shape"),
    ).toBe(true);
  });
  it("retains text bold and alignment in compiled and SVG nodes", () => {
    const d = data();
    const s = p.createSlide(d, "budget-comparison");
    s.elements[0].style = { fontSize: 28, bold: true, align: "center" };
    const c = p.compileSlide(s, d);
    expect(c.elements[0].bold).toBe(true);
    expect(p.renderSlideSvg(c)).toContain('text-anchor="middle"');
  });
});
describe("malformed specs and differences", () => {
  it("returns a diagnostic for malformed slide payload instead of throwing", () => {
    expect(
      p
        .compileSlide({ elements: null } as any, data())
        .diagnostics.some((e) => e.code === "INVALID_SLIDE_SCHEMA"),
    ).toBe(true);
  });
  it("renders differences from source decimals as editable labels", () => {
    const d = data();
    const s = p.createSlide(d, "budget-comparison");
    s.elements[1].options!.showDifferences = true;
    expect(
      p
        .compileSlide(s, d)
        .elements.find((e) => e.id.endsWith("-difference-east"))?.text,
    ).toBe("差异：200万元");
  });
  it("rejects duplicate categories even with finer primary keys", () => {
    const d = data();
    const s = p.createSlide(d, "budget-comparison");
    s.bindings.main.roles.categoryKey = "regionName";
    d.resultSets[0].rows[1].regionName = "华东";
    expect(
      p
        .compileSlide(s, d)
        .diagnostics.some((e) => e.code === "DUPLICATE_CATEGORY"),
    ).toBe(true);
  });
});
describe("stable series semantics", () => {
  it("does not mistake unit object property order for mixed currencies", () => {
    const d = data();
    d.measures[1].unit = { currency: "CNY", baseUnit: "CNY" };
    expect(
      p
        .compileSlide(p.createSlide(d, "budget-comparison"), d)
        .diagnostics.some((e) => e.code === "UNIT_MISMATCH"),
    ).toBe(false);
  });
  it("keeps a series color when bindings reorder fields", () => {
    const d = data();
    const s = p.createSlide(d, "budget-comparison");
    const before = p
      .compileSlide(s, d)
      .elements.find((e) => e.type === "nativeChart")!
      .series!.find((e) => e.id === "actual")!.color;
    s.bindings.main.roles.series = ["budget", "actual"];
    const after = p
      .compileSlide(s, d)
      .elements.find((e) => e.type === "nativeChart")!
      .series!.find((e) => e.id === "actual")!.color;
    expect(after).toBe(before);
  });
});
it("preserves cover image fit and exposes the shared plot-area fractions", () => {
  const d = data();
  const s = p.createSlide(d, "budget-comparison");
  s.elements.push({
    id: "img",
    type: "image",
    assetId: "a",
    fit: "cover",
    rect: { x: 0, y: 0, w: 30, h: 30 },
    z: 6,
  });
  const c = p.compileSlide(s, d);
  c.assets = [{ id: "a", dataUri: "data:image/png;base64,AA==" }];
  expect(c.elements.find((e) => e.id === "img")?.fit).toBe("cover");
  expect(p.renderSlideSvg(c)).toContain('preserveAspectRatio="xMidYMid slice"');
  expect(
    c.elements.find((e) => e.type === "nativeChart")?.options?.plotAreaLayout,
  ).toEqual({ x: 48 / 632, y: 28 / 352, w: 568 / 632, h: 264 / 352 });
});
it("renders source timestamp in declared timezone and localizes review guidance", () => {
  const d = data();
  d.snapshot.dataAsOf = "2026-03-31T15:59:59.000Z";
  const c = p.compileSlide(p.createSlide(d, "budget-comparison"), d);
  expect(c.elements.find((e) => e.id.endsWith("-source"))?.text).toContain(
    "2026/03/31 23:59:59",
  );
  expect(
    c.diagnostics.find((e) => e.code === "NEEDS_REVIEW")?.message,
  ).toContain("复核");
});
describe("chart label space preflight", () => {
  it("blocks long category labels before final export", () => {
    const d = data();
    d.resultSets[0].rows[0].regionName = "超长业务区域名称".repeat(20);
    const s = p.createSlide(d, "budget-comparison");
    s.reviewState.status = "reviewed";
    expect(
      p
        .compileSlide(s, d, "final")
        .diagnostics.some(
          (e) =>
            e.code === "LABEL_OVERFLOW" &&
            e.severity === "error" &&
            e.message.includes("分类"),
        ),
    ).toBe(true);
  });
  it("checks horizontal category label space", () => {
    const d = data();
    d.resultSets[0].rows[0].regionName = "需要换行的地区名称";
    const s = p.createSlide(d, "budget-comparison");
    s.elements[1].options!.direction = "bar";
    expect(
      p
        .compileSlide(s, d, "final")
        .diagnostics.some((e) => e.code === "LABEL_OVERFLOW"),
    ).toBe(true);
  });
  it("blocks long legends and target labels", () => {
    const d = data();
    d.measures[0].name = "营业收入实际口径说明".repeat(10);
    const s = p.createSlide(d, "monthly-trend");
    s.elements[1].options!.targetLine = {
      value: "29000000",
      label: "目标".repeat(100),
      source: "预算",
    };
    const c = p.compileSlide(s, d, "final");
    expect(
      c.diagnostics.some(
        (e) => e.code === "LABEL_OVERFLOW" && e.message.includes("图例"),
      ),
    ).toBe(true);
    expect(
      c.diagnostics.some(
        (e) =>
          e.code === "TEXT_OVERFLOW" && e.elementId?.endsWith("-target-label"),
      ),
    ).toBe(true);
  });
  it("blocks dense classifications and large axis labels", () => {
    const d = data();
    d.resultSets[0].rows = Array.from({ length: 200 }, (_, i) => ({
      regionId: String(i),
      regionName: "分类" + i,
      actual: "100000000000000",
      budget: "90000000000000",
    }));
    const s = p.createSlide(d, "budget-comparison");
    const c = p.compileSlide(s, d, "final");
    expect(
      c.diagnostics.some(
        (e) => e.code === "LABEL_OVERFLOW" && e.message.includes("分类"),
      ),
    ).toBe(true);
    expect(
      c.diagnostics.some(
        (e) => e.code === "LABEL_OVERFLOW" && e.message.includes("刻度"),
      ),
    ).toBe(true);
  });
  it("keeps all three fixture scene labels within their space", () => {
    const d = data();
    for (const id of ["budget-comparison", "monthly-trend", "revenue-bridge"]) {
      const s = p.createSlide(d, id);
      s.reviewState.status = "reviewed";
      expect(
        p
          .compileSlide(s, d, "final")
          .diagnostics.filter((e) => e.severity === "error"),
      ).toEqual([]);
    }
  });
});
it("identifies data label crowding and permits hiding optional labels", () => {
  const d = data();
  d.resultSets[0].rows = Array.from({ length: 10 }, (_, i) => ({
    regionId: String(i),
    regionName: String(i),
    actual: "1234567",
    budget: "1000000",
  }));
  const s = p.createSlide(d, "budget-comparison");
  s.elements[1].options!.numberFormat = {
    displayDivisor: "10000",
    decimals: 6,
    suffix: "万元",
    percent: false,
  };
  const c = p.compileSlide(s, d);
  expect(
    c.diagnostics.some(
      (e) => e.code === "LABEL_OVERFLOW" && e.message.includes("数据标签"),
    ),
  ).toBe(true);
  s.elements[1].options!.showLabels = false;
  expect(
    p
      .compileSlide(s, d)
      .diagnostics.some(
        (e) => e.code === "LABEL_OVERFLOW" && e.message.includes("数据标签"),
      ),
  ).toBe(false);
});
it("blocks waterfall labels that exceed allocated rows", () => {
  const d = data();
  d.resultSets[2].rows[1].label = "贡献说明".repeat(30);
  const c = p.compileSlide(p.createSlide(d, "revenue-bridge"), d, "final");
  expect(
    c.diagnostics.some(
      (e) => e.code === "TEXT_OVERFLOW" && e.elementId?.endsWith("-new-label"),
    ),
  ).toBe(true);
});
