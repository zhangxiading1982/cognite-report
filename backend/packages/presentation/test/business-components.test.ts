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
      expect(item.payload.seedRevision).toBeGreaterThanOrEqual(10);
      expect(item.payload.example.designVersion).toBeGreaterThanOrEqual(11);
      expect(item.payload.example.slide.elements).toContainEqual(expect.objectContaining({ type: expectation.type }));
      const compiled = compileSlide(item.payload.example.slide, item.payload.example.dataSpec);
      expect(compiled.diagnostics.filter(diagnostic => diagnostic.severity === "error")).toEqual([]);
      expect(compiled.elements).toContainEqual(expect.objectContaining({ id: expectation.compiledId }));
    }
  });
  it("lays out an arbitrary-depth decision tree horizontally or vertically from current data", () => {
    const item = template("decision-tree");
    expect(item.payload.seedRevision).toBe(11);
    expect(item.payload.example.designVersion).toBe(12);
    const data = structuredClone(item.payload.example.dataSpec);
    data.resultSets[0].rows.push({ nodeId: "refresh", node: "按小时刷新", parentId: "managed", outcome: "启用增量查询" });
    const slide = structuredClone(item.payload.example.slide);
    const tree: any = slide.elements.find((element: any) => element.id === "decision-tree-view");
    expect(tree.style.orientation).toBe("horizontal");
    const horizontal = compileSlide(slide, data);
    const rootH = horizontal.elements.find(element => element.id === "decision-tree-view-node-0")!;
    const leafH = horizontal.elements.find(element => element.id === "decision-tree-view-node-5")!;
    expect(leafH.rect.x).toBeGreaterThan(rootH.rect.x);
    expect(horizontal.diagnostics.filter(diagnostic => diagnostic.severity === "error")).toEqual([]);

    tree.style.orientation = "vertical";
    const vertical = compileSlide(slide, data);
    const rootV = vertical.elements.find(element => element.id === "decision-tree-view-node-0")!;
    const leafV = vertical.elements.find(element => element.id === "decision-tree-view-node-5")!;
    expect(leafV.rect.y).toBeGreaterThan(rootV.rect.y);
    expect(vertical.diagnostics.filter(diagnostic => diagnostic.severity === "error")).toEqual([]);
  });
  it("ships compilable repaired previews for sales proposal and SWOT", () => {
    for (const id of ["sales-proposal", "swot-analysis"]) {
      const item = template(id);
      expect(item.payload.seedRevision).toBe(11);
      expect(item.payload.example.designVersion).toBe(12);
      expect(compileSlide(item.payload.example.slide, item.payload.example.dataSpec).diagnostics.filter(diagnostic => diagnostic.severity === "error"), id).toEqual([]);
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
