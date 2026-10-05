import { describe, expect, it } from "vitest";
import { BUSINESS_TEMPLATES, compileSlide } from "../src/index";

const template = (id: string) => {
  const item = BUSINESS_TEMPLATES.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Missing business template: ${id}`);
  return item;
};

describe("data-driven business components", () => {
  it("renders the eight strategy templates as data-driven executive visuals", () => {
    const expectations: Record<string, { type: string; compiledId: string }> = {
      "business-process": { type: "processFlow", compiledId: "business-process-flow-box-0" },
      "customer-journey": { type: "journeyMap", compiledId: "customer-journey-view-stage-0" },
      "decision-matrix": { type: "decisionScorecard", compiledId: "decision-matrix-view-option-0" },
      "decision-tree": { type: "hierarchy", compiledId: "decision-tree-view-node-0" },
      "portfolio-prioritization": { type: "portfolioMatrix", compiledId: "portfolio-prioritization-view-point-0" },
      "regional-market-map": { type: "regionMap", compiledId: "regional-market-map-view-region-0" },
      "sales-proposal": { type: "proposalFlow", compiledId: "sales-proposal-view-step-0" },
      "swot-analysis": { type: "swotMatrix", compiledId: "swot-analysis-view-quadrant-0" },
    };
    for (const [id, expectation] of Object.entries(expectations)) {
      const item = template(id);
      expect(item.payload.seedRevision).toBe(10);
      expect(item.payload.example.designVersion).toBe(11);
      expect(item.payload.example.slide.elements).toContainEqual(expect.objectContaining({ type: expectation.type }));
      const compiled = compileSlide(item.payload.example.slide, item.payload.example.dataSpec);
      expect(compiled.diagnostics.filter(diagnostic => diagnostic.severity === "error")).toEqual([]);
      expect(compiled.elements).toContainEqual(expect.objectContaining({ id: expectation.compiledId }));
    }
  });
  it("uses a finance-grade P&L table with readable typography and variance semantics", () => {
    const item = template("pnl-overview");
    const table = item.payload.example.slide.elements.find(element => element.id === "pnl-table")!;
    const fields = item.payload.example.dataSpec.resultSets[0].fields.map(field => field.id);
    expect(fields).toEqual(expect.arrayContaining(["variance", "varianceRate"]));
    expect(table.fields).toEqual(["account", "prior", "actual", "variance", "varianceRate"]);
    expect(table.style).toMatchObject({
      fontFace: "SimHei",
      fontSize: 15,
      headerFontSize: 13,
      firstColumnBold: true,
      directionFields: ["variance", "varianceRate"],
    });
    const compiled = compileSlide(item.payload.example.slide, item.payload.example.dataSpec);
    const compiledTable = compiled.elements.find(element => element.id === "pnl-table")!;
    expect(compiledTable.cellStyles.some((row: any[]) => row.some(cell => cell.color === "16845B"))).toBe(true);
    expect(compiledTable.rows.some((row: string[]) => row.includes("+10%"))).toBe(true);
  });
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
