import { describe, expect, test } from "vitest";
import {
  BUSINESS_TEMPLATES,
  compileSlide,
  renderSlideSvg,
  validateDataSpec,
  validateSlideSpec,
} from "@slidebi/presentation";

const expected = [
  "executive-summary",
  "chart-insights",
  "kpi-dashboard",
  "pnl-overview",
  "action-plan",
  "project-status",
  "roadmap",
  "risk-matrix",
  "business-process",
  "swot-analysis",
  "sales-funnel",
  "competitive-positioning",
  "metric-scorecard",
  "multi-profit-bridge",
  "cost-variance",
  "scenario-comparison",
  "cover-page",
  "section-page",
  "closing-page",
  "project-overview",
  "milestone-plan",
  "gantt-project-plan",
  "workflow-progress",
  "dependency-map",
  "market-segmentation-mekko",
  "customer-portfolio-bubble",
  "regional-market-map",
  "decision-tree",
  "decision-matrix",
  "sales-proposal",
  "team-introduction",
  "org-chart",
  "raci-matrix",
  "status-table",
  "quarterly-business-review",
  "customer-journey",
  "portfolio-prioritization",
  "operating-model",
  "meeting-agenda",
  "root-cause-analysis",
  "market-sizing",
  "resource-capacity",
];

describe("commercial business templates", () => {
  test("publishes every P0/P1 commercial template family", () => {
    expect(BUSINESS_TEMPLATES.map((template) => template.id)).toEqual(expected);
    expect(new Set(BUSINESS_TEMPLATES.map((template) => template.name)).size).toBe(expected.length);
  });

  test.each(expected)("%s owns valid display data and a compilable page", (id) => {
    const template = BUSINESS_TEMPLATES.find((item) => item.id === id)!;
    const { dataSpec, slide, businessContext } = template.payload.example;
    expect(validateDataSpec(dataSpec).errors).toEqual([]);
    expect(validateSlideSpec(slide).errors).toEqual([]);
    expect(dataSpec.resultSets.length).toBeGreaterThan(0);
    expect(dataSpec.resultSets.every((result) => result.rows.length > 0)).toBe(true);
    expect(businessContext.background.length).toBeGreaterThan(10);
    expect(businessContext.scenarios.length).toBeGreaterThan(0);
    expect(slide.elements.some((element) => element.type === "sourceFooter")).toBe(false);

    const compiled = compileSlide(slide, dataSpec, "draft");
    expect(compiled.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
    const svg = renderSlideSvg(compiled);
    expect(svg).toContain("<svg");
    expect(svg).toContain(template.previewText);
  });

  test("advanced and upgraded templates use data-driven editable components", () => {
    const requiredTypes: Record<string, string> = {
      "kpi-dashboard": "kpiCards",
      roadmap: "roadmap",
      "risk-matrix": "riskMatrix",
      "business-process": "processFlow",
      "sales-funnel": "funnel",
      "multi-profit-bridge": "multiWaterfall",
      "gantt-project-plan": "gantt",
      "market-segmentation-mekko": "mekko",
      "customer-portfolio-bubble": "bubble",
      "regional-market-map": "regionMap",
      "decision-tree": "hierarchy",
      "org-chart": "hierarchy",
      "status-table": "statusTable",
    };
    for (const [id, type] of Object.entries(requiredTypes)) {
      const template = BUSINESS_TEMPLATES.find((item) => item.id === id)!;
      expect(template.payload.example.slide.elements.some((element) => element.type === type)).toBe(true);
    }
  });

  test("every business template uses the reference-grade presentation frame and hierarchy", () => {
    const optimized = new Set(["business-process", "customer-journey", "decision-matrix", "decision-tree", "portfolio-prioritization", "regional-market-map", "sales-proposal", "swot-analysis"]);
    for (const template of BUSINESS_TEMPLATES) {
      const elements = template.payload.example.slide.elements;
      expect(template.payload.seedRevision).toBe(optimized.has(template.id) ? 10 : 9);
      expect(template.payload.example.designVersion).toBe(optimized.has(template.id) ? 11 : 10);
      if (["cover-page", "section-page"].includes(template.id)) {
        expect(elements.some((element) => element.type === "text" && Number(element.style?.fontSize) >= 34 && element.style?.bold)).toBe(true);
      } else {
        expect(elements).toEqual(expect.arrayContaining([
          expect.objectContaining({ id: `${template.id}-frame`, type: "shape" }),
          expect.objectContaining({ id: `${template.id}-title`, type: "text", style: expect.objectContaining({ fontSize: 31, bold: true }) }),
          expect.objectContaining({ id: `${template.id}-tagline`, type: "text" }),
          expect.objectContaining({ id: `${template.id}-footer`, type: "text" }),
          expect.objectContaining({ id: `${template.id}-page`, type: "text" }),
        ]));
      }
    }
  });

  test("the four reference archetypes use distinct business layouts", () => {
    const elements = (id: string) => BUSINESS_TEMPLATES.find((template) => template.id === id)!.payload.example.slide.elements;
    expect(elements("executive-summary").filter((element) => element.id.endsWith("-card"))).toHaveLength(4);
    expect(elements("executive-summary")).toContainEqual(expect.objectContaining({ id: "executive-chart", type: "chart" }));
    expect(BUSINESS_TEMPLATES.find((template) => template.id === "executive-summary")!.payload.defaultBindings.main.roles).toMatchObject({ categoryKey: "metricId", categoryLabel: "metricName", series: ["current", "target"] });
    expect(elements("pnl-overview")).toContainEqual(expect.objectContaining({ id: "pnl-table", rect: expect.objectContaining({ w: 888 }) }));
    expect(elements("roadmap").filter((element) => element.id.startsWith("roadmap-phase-"))).toHaveLength(4);
    expect(elements("competitive-positioning").filter((element) => /^competition-q\d$/.test(element.id))).toHaveLength(4);
  });
});
