import { describe, expect, it } from "vitest";
import { slideRow } from "../src/db";
import { completeTemplatePayloadSchema } from "../src/data-schema";

const row = (templateId: string) => ({
  payload: {
    canvas: { width: 960, height: 540, unit: "pt" },
    bindings: {},
    elements: [
      { id: "body", type: "text", rect: { x: 20, y: 20, w: 200, h: 50 }, z: 1, style: { fontSize: 9 }, runs: [{ text: "文稿内容" }] },
      { id: "chart", type: "chart", rect: { x: 20, y: 100, w: 700, h: 300 }, z: 2, style: { fontSize: 11, labelFontSize: 9 } },
      { id: "copied-scorecard-table", type: "table", rect: { x: 36, y: 408, w: 888, h: 100 }, z: 2, style: { fontSize: 8, headerFontSize: 8 }, fields: ["name", "value"] },
    ],
    annotations: [],
    layoutOverrides: {},
  },
  slide_id: "slide",
  revision: 3,
  spec_version: "1.0",
  title: "页面",
  scene: "budgetComparison",
  snapshot_id: "snapshot",
  template_id: templateId,
  template_version: 1,
  theme_id: "corporate-blue",
  theme_version: 1,
  review_state: "reviewed",
});

describe("slideRow template readability compatibility", () => {
  it("upgrades an existing document page copied from a managed template", () => {
    const result = slideRow(row("metric-scorecard"));
    expect(result.elements.find((element: any) => element.id === "body").style.fontSize).toBe(11);
    expect(result.elements.find((element: any) => element.id === "chart").style).toMatchObject({ fontSize: 12, labelFontSize: 10 });
    expect(result.elements.find((element: any) => element.id === "copied-scorecard-table").rect).toEqual({ x: 36, y: 400, w: 888, h: 108 });
    expect(result.elements.find((element: any) => element.id === "body").runs[0].text).toBe("文稿内容");
  });

  it("does not rewrite a custom blank page", () => {
    const result = slideRow(row("blank"));
    expect(result.elements.find((element: any) => element.id === "body").style.fontSize).toBe(9);
  });

  it("returns the same readable styles in the template library and template editor", () => {
    const source = row("metric-scorecard");
    const payload = completeTemplatePayloadSchema({
      defaultElements: source.payload.elements,
      example: {
        slide: slideRow(source),
        dataSpec: { resultSets: [], semanticSchema: { tables: [] }, measures: [] },
      },
    });
    expect(payload.defaultElements.find((element: any) => element.id === "body").style.fontSize).toBe(11);
    expect(payload.example.slide.elements.find((element: any) => element.id === "chart").style.labelFontSize).toBe(10);
  });
});
