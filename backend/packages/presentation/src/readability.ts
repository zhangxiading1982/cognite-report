import type { Rect, SlideElement, SlideSpec } from "./types";

/**
 * Data-driven visuals expand into many labels at compile time. Keeping the
 * list here lets template seeds and existing copied pages share one policy.
 */
export const BUSINESS_VISUAL_TYPES = new Set([
  "kpiCards",
  "roadmap",
  "riskMatrix",
  "processFlow",
  "funnel",
  "multiWaterfall",
  "gantt",
  "mekko",
  "bubble",
  "positionMatrix",
  "regionMap",
  "hierarchy",
  "statusTable",
  "journeyMap",
  "decisionScorecard",
  "portfolioMatrix",
  "proposalFlow",
  "swotMatrix",
]);

const finiteSize = (value: unknown, fallback: number) => {
  const size = Number(value);
  return Number.isFinite(size) && size > 0 ? size : fallback;
};
const atLeast = (value: unknown, minimum: number, fallback = minimum) =>
  Math.max(minimum, finiteSize(value, fallback));
const isChromeText = (element: SlideElement) =>
  element.type === "sourceFooter" ||
  /(^|-)(footer|page|tagline)$/.test(element.id) ||
  // Imported template pages receive new element IDs, so recognize the slim
  // reference-frame footer by geometry as well as by its seed identifier.
  (element.rect.y >= 500 && element.rect.h <= 16);

const legacyLayoutUpgrades: Record<string, { from: Rect; to: Rect }> = {
  // The earlier 100 pt scorecard table only fit 8 pt type. Moving its top edge
  // into the available chart gap provides five readable rows without overlap.
  "metric-scorecard-table": {
    from: { x: 36, y: 408, w: 888, h: 100 },
    to: { x: 36, y: 400, w: 888, h: 108 },
  },
};

export function readableTemplateElementRect(element: SlideElement, input: Rect = element.rect): Rect {
  const upgrade = legacyLayoutUpgrades[element.id] ??
    (element.type === "table" ? Object.values(legacyLayoutUpgrades).find(candidate =>
      (Object.keys(candidate.from) as (keyof Rect)[]).every(key => input[key] === candidate.from[key])) : undefined);
  if (!upgrade) return { ...input };
  const stillUsesLegacyLayout = (Object.keys(upgrade.from) as (keyof Rect)[])
    .every(key => input[key] === upgrade.from[key]);
  return stillUsesLegacyLayout ? { ...upgrade.to } : { ...input };
}

/** Resolve the minimum readable style without mutating the saved element. */
export function readableTemplateElementStyle(
  element: SlideElement,
  input: Record<string, any> = element.style ?? {},
) {
  const style = { ...input };
  if (element.type === "chart") {
    style.fontSize = atLeast(style.fontSize, 12);
    style.labelFontSize = atLeast(style.labelFontSize, 10);
  } else if (element.type === "table") {
    // Dense scorecards need a smaller floor than full-width analytical tables.
    const minimum = element.rect.h < 140 || element.rect.w < 360 ? 10 : 11;
    style.fontSize = atLeast(style.fontSize, minimum);
    style.headerFontSize = atLeast(style.headerFontSize, minimum);
  } else if (BUSINESS_VISUAL_TYPES.has(element.type)) {
    style.fontSize = atLeast(style.fontSize, 12);
    style.minimumFontSize = atLeast(style.minimumFontSize, 10);
  } else if (element.type === "text" && !isChromeText(element)) {
    style.fontSize = atLeast(style.fontSize, 11);
  } else if (element.type === "shape" && element.runs?.some(run => run.text?.trim())) {
    style.fontSize = atLeast(style.fontSize, 12);
  }
  return style;
}

/**
 * Upgrade template-derived pages in place conceptually, while returning a
 * detached value. Text, bindings, data references, geometry and added objects
 * are preserved; only typography below the template readability floor changes.
 */
export function upgradeTemplateSlideReadability(slide: SlideSpec): SlideSpec {
  return {
    ...structuredClone(slide),
    elements: upgradeTemplateElementsReadability(slide.elements ?? []),
  };
}

export function upgradeTemplateElementsReadability(elements: SlideElement[]): SlideElement[] {
  return elements.map(element => ({
    ...structuredClone(element),
    rect: readableTemplateElementRect(element),
    style: readableTemplateElementStyle(element),
  }));
}
