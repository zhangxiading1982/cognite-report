import { createSlide, PHASE2_TEMPLATES } from "@slidebi/presentation";
import { fail, id } from "./db.ts";

/** Apply the same resolved template and explicit mapping for either snapshot source. */
export function applyTemplate(data: any, template: any, input: any) {
  const source = structuredClone(data);
  const chartType=template.payload?.chartType??template.payload?.defaultElements?.find((e:any)=>e.type==='chart')?.chartType;
  const advanced=PHASE2_TEMPLATES.find(t=>t.chartType===chartType);
  const sceneTemplates: Record<string, string> = {
    budgetComparison: "budget-comparison",
    monthlyTrend: "monthly-trend",
    revenueBridge: "revenue-bridge",
  };
  const sceneCharts: Record<string, string> = {
    budgetComparison: "comparison",
    monthlyTrend: "line",
    revenueBridge: "waterfall",
  };
  if (input.bindings?.main)
    source.chartHints = [
      {
        resultSetId: input.bindings.main.resultSetId,
        chartType: advanced?.chartType??sceneCharts[template.scene],
        roles: input.bindings.main.roles,
      },
    ];
  let slide;
  try {
    slide = createSlide(source, advanced?.id??sceneTemplates[template.scene], {
      id: id("slide"),
      title: input.title,
    });
  } catch {
    fail(422, "INVALID_BINDING", "请提供有效字段绑定");
  }
  if (template.payload?.defaultBindings && template.payload?.defaultElements?.length && template.payload?.canvas) {
    slide.elements = structuredClone(template.payload.defaultElements);
    if (template.payload.defaultBindings) slide.bindings = {...slide.bindings, ...structuredClone(template.payload.defaultBindings)};
    slide.canvas = structuredClone(template.payload.canvas);
    // Data-anchored annotations are deliberately omitted by the stored template policy.
    slide.annotations = [];
    slide.layoutOverrides = {};
  }
  slide.themeRef = { id: template.theme_id, version: template.theme_version };
  slide.scene = template.scene;
  slide.templateRef = { id: template.template_id, version: template.version };
  if (input.bindings) {
    const supplied=structuredClone(input.bindings);
    slide.bindings=Object.fromEntries(Object.keys({...slide.bindings,...supplied}).map(key=>[key,{
      ...slide.bindings[key],
      ...supplied[key],
      computations:supplied[key]?.computations??slide.bindings[key]?.computations??[],
    }]));
  }
  return slide;
}
