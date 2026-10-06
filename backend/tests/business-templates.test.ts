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
      "competitive-positioning": "positionMatrix",
      "decision-tree": "hierarchy",
      "org-chart": "hierarchy",
      "status-table": "statusTable",
    };
    for (const [id, type] of Object.entries(requiredTypes)) {
      const template = BUSINESS_TEMPLATES.find((item) => item.id === id)!;
      expect(template.payload.example.slide.elements.some((element) => element.type === type)).toBe(true);
    }
  });

  test("every data-driven template element resolves to a sample result set", () => {
    for (const template of BUSINESS_TEMPLATES) {
      const { slide, dataSpec } = template.payload.example;
      const resultIds = new Set(dataSpec.resultSets.map(result => result.id));
      for (const element of slide.elements.filter(element => element.bindingRef)) {
        const binding = slide.bindings[element.bindingRef!];
        expect(binding, `${template.name} / ${element.id} 缺少 bindingRef`).toBeTruthy();
        expect(resultIds.has(binding.resultSetId), `${template.name} / ${element.id} 找不到样例数据表`).toBe(true);
      }
    }
  });

  test("every template visual uses table-shaped data with an editable field schema", () => {
    for (const template of BUSINESS_TEMPLATES) {
      const { slide, dataSpec } = template.payload.example;
      for (const element of slide.elements.filter(element => element.bindingRef)) {
        const binding = slide.bindings[element.bindingRef!];
        const result = dataSpec.resultSets.find(item => item.id === binding.resultSetId)!;
        expect(result.primaryKey?.length, `${template.name} / ${element.id} 缺少表格主键`).toBeGreaterThan(0);
        expect(result.rows.length, `${template.name} / ${element.id} 缺少表格数据`).toBeGreaterThan(0);
        for (const field of result.fields) {
          expect(field.id, `${template.name} / ${element.id} 字段缺少 ID`).toBeTruthy();
          expect(field.name, `${template.name} / ${element.id} 字段缺少名称`).toBeTruthy();
          expect(field.type, `${template.name} / ${element.id} 字段缺少类型`).toBeTruthy();
          expect(field.description, `${template.name} / ${element.id} 字段缺少说明`).toBeTruthy();
        }
        const fieldIds = new Set(result.fields.map(field => field.id));
        for (const fieldId of Object.values(binding.roles).flat()) {
          expect(fieldIds.has(fieldId), `${template.name} / ${element.id} 绑定字段 ${fieldId} 不在表格 Schema 中`).toBe(true);
        }
      }
    }
  });

  test("every analytical template owns at least one data-bound visual", () => {
    const narrativeOnly = new Set(["cover-page", "section-page"]);
    for (const template of BUSINESS_TEMPLATES.filter(item => !narrativeOnly.has(item.id))) {
      expect(
        template.payload.example.slide.elements.some(element => element.bindingRef),
        `${template.name} 缺少可编辑的数据图表`,
      ).toBe(true);
    }
  });

  test("every business template uses the reference-grade presentation frame and hierarchy", () => {
    for (const template of BUSINESS_TEMPLATES) {
      const elements = template.payload.example.slide.elements;
      expect(template.payload.seedRevision).toBe(13);
      expect(template.payload.example.designVersion).toBe(14);
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

  test("every template applies readable typography to charts, tables, body copy and business visuals", () => {
    const chrome = /-(footer|page)$/;
    const businessTypes = new Set(["kpiCards", "roadmap", "riskMatrix", "processFlow", "funnel", "multiWaterfall", "gantt", "mekko", "bubble", "positionMatrix", "regionMap", "hierarchy", "statusTable", "journeyMap", "decisionScorecard", "portfolioMatrix", "proposalFlow", "swotMatrix"]);
    for (const template of BUSINESS_TEMPLATES) {
      for (const element of template.payload.example.slide.elements) {
        if (element.type === "chart") {
          expect(Number(element.style?.fontSize), `${template.name} / ${element.id}`).toBeGreaterThanOrEqual(12);
          expect(Number(element.style?.labelFontSize), `${template.name} / ${element.id}`).toBeGreaterThanOrEqual(10);
        } else if (element.type === "table") {
          const minimum = element.rect.h < 140 || element.rect.w < 360 ? 10 : 11;
          expect(Number(element.style?.fontSize), `${template.name} / ${element.id}`).toBeGreaterThanOrEqual(minimum);
          expect(Number(element.style?.headerFontSize), `${template.name} / ${element.id}`).toBeGreaterThanOrEqual(minimum);
        } else if (businessTypes.has(element.type)) {
          expect(Number(element.style?.fontSize), `${template.name} / ${element.id}`).toBeGreaterThanOrEqual(12);
          expect(Number(element.style?.minimumFontSize), `${template.name} / ${element.id}`).toBeGreaterThanOrEqual(10);
        } else if (element.type === "text" && !chrome.test(element.id) && !element.id.endsWith("-tagline")) {
          expect(Number(element.style?.fontSize), `${template.name} / ${element.id}`).toBeGreaterThanOrEqual(11);
        }
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
