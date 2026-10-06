import { describe, expect, it } from "vitest";
import { upgradeTemplateSlideReadability } from "../src/readability";
import type { SlideSpec } from "../src/types";

const slide = (): SlideSpec => ({
  specVersion: "1.0",
  id: "copied-template-page",
  revision: 7,
  title: "历史文稿页面",
  scene: "budgetComparison",
  templateRef: { id: "metric-scorecard", version: 2 },
  themeRef: { id: "corporate-blue", version: 1 },
  canvas: { width: 960, height: 540, unit: "pt" },
  snapshotRef: "snapshot",
  bindings: { main: { resultSetId: "result", roles: { categoryLabel: "name", series: ["value"] } } },
  elements: [
    { id: "body", type: "text", rect: { x: 20, y: 20, w: 200, h: 60 }, z: 1, style: { fontSize: 9 }, runs: [{ text: "保留文稿自己的文字" }] },
    { id: "footer", type: "text", rect: { x: 20, y: 510, w: 200, h: 10 }, z: 1, style: { fontSize: 7 }, runs: [{ text: "页脚" }] },
    { id: "chart", type: "chart", rect: { x: 20, y: 100, w: 500, h: 260 }, z: 2, style: { fontSize: 11, labelFontSize: 9 }, bindingRef: "main", chartType: "comparison" },
    { id: "compact-table", type: "table", rect: { x: 20, y: 380, w: 888, h: 100 }, z: 2, style: { fontSize: 8, headerFontSize: 8 }, bindingRef: "main", fields: ["name", "value"] },
    { id: "wide-table", type: "table", rect: { x: 20, y: 100, w: 600, h: 240 }, z: 2, style: { fontSize: 10, headerFontSize: 9 }, bindingRef: "main", fields: ["name", "value"] },
    { id: "cards", type: "kpiCards", rect: { x: 530, y: 100, w: 380, h: 260 }, z: 2, style: { fontSize: 11 }, bindingRef: "main" },
    { id: "large", type: "text", rect: { x: 20, y: 20, w: 200, h: 60 }, z: 1, style: { fontSize: 24 }, runs: [{ text: "用户放大的文字" }] },
  ],
  annotations: [],
  layoutOverrides: {},
  reviewState: { status: "reviewed", snapshotId: "snapshot" },
  extensions: { chartData: { chart: { mode: "private", marker: "keep" } } },
});

describe("template readability upgrade", () => {
  it("raises only presentation readability floors and preserves page content and data", () => {
    const before = slide();
    const upgraded = upgradeTemplateSlideReadability(before);

    expect(upgraded).not.toBe(before);
    expect(upgraded.elements.find(element => element.id === "body")?.style?.fontSize).toBe(11);
    expect(upgraded.elements.find(element => element.id === "footer")?.style?.fontSize).toBe(7);
    expect(upgraded.elements.find(element => element.id === "chart")?.style).toMatchObject({ fontSize: 12, labelFontSize: 10 });
    expect(upgraded.elements.find(element => element.id === "compact-table")?.style).toMatchObject({ fontSize: 10, headerFontSize: 10 });
    expect(upgraded.elements.find(element => element.id === "wide-table")?.style).toMatchObject({ fontSize: 11, headerFontSize: 11 });
    expect(upgraded.elements.find(element => element.id === "cards")?.style).toMatchObject({ fontSize: 12, minimumFontSize: 10 });
    expect(upgraded.elements.find(element => element.id === "large")?.style?.fontSize).toBe(24);
    expect(upgraded.elements.find(element => element.id === "body")?.runs).toEqual([{ text: "保留文稿自己的文字" }]);
    expect(upgraded.bindings).toEqual(before.bindings);
    expect(upgraded.extensions).toEqual(before.extensions);
    expect(before.elements.find(element => element.id === "body")?.style?.fontSize).toBe(9);
  });

  it("is idempotent", () => {
    const once = upgradeTemplateSlideReadability(slide());
    expect(upgradeTemplateSlideReadability(once)).toEqual(once);
  });
});
