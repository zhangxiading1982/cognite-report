import { describe, expect, it } from "vitest";
import { BUSINESS_TEMPLATES, compileSlide } from "../src/index";

const template = (id: string) => {
  const item = BUSINESS_TEMPLATES.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Missing business template: ${id}`);
  return item;
};

describe("data-driven business components", () => {
  it("recompiles KPI cards from the current DataSpec without mutating the template", () => {
    const item = template("kpi-dashboard");
    const slide = structuredClone(item.payload.example.slide);
    const data = structuredClone(item.payload.example.dataSpec);

    data.resultSets[0].rows[0].actual = "16666";
    const compiled = compileSlide(slide, data);

    expect(
      compiled.elements.find((element) => element.id === "kpi-cards-value-0")
        ?.text,
    ).toBe("16,666万元");
    expect(item.payload.example.dataSpec.resultSets[0].rows[0].actual).toBe(
      "12800",
    );
  });

  it("reports an actionable component error when a Gantt task ends before it starts", () => {
    const item = template("gantt-project-plan");
    const slide = structuredClone(item.payload.example.slide);
    const data = structuredClone(item.payload.example.dataSpec);

    data.resultSets[0].rows[0].endDate = "2026-08-31";
    const compiled = compileSlide(slide, data);

    expect(compiled.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "INVALID_COMPONENT",
        elementId: "gantt-project-plan-view",
        message: expect.stringContaining("甘特图日期范围无效"),
      }),
    );
  });

  it("uses the selected size field to recompute bubble geometry", () => {
    const item = template("customer-portfolio-bubble");
    const slide = structuredClone(item.payload.example.slide);
    const data = structuredClone(item.payload.example.dataSpec);

    const before = compileSlide(slide, data);
    const originalLast = before.elements.find(
      (element) => element.id === "customer-portfolio-bubble-view-bubble-3",
    )!;

    data.resultSets[0].rows[3].revenue = "9200";
    const after = compileSlide(slide, data);
    const updatedLast = after.elements.find(
      (element) => element.id === "customer-portfolio-bubble-view-bubble-3",
    )!;
    const updatedFirst = after.elements.find(
      (element) => element.id === "customer-portfolio-bubble-view-bubble-0",
    )!;

    expect(updatedLast.rect.w).toBeGreaterThan(originalLast.rect.w);
    expect(updatedLast.rect.w).toBeGreaterThan(updatedFirst.rect.w);
  });
});
