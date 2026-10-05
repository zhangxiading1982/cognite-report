import type { Diagnostic, NumberFormat } from "./schema";
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Computation {
  id: string;
  rule: string;
  field?: string;
  left?: string;
  right?: string;
  numerator?: string;
  denominator?: string;
  dateField?: string;
  absoluteTolerance?: string;
}
export interface Binding {
  resultSetId: string;
  roles: Record<string, string | string[]>;
  computations?: Computation[];
}
export interface TextRun {
  text?: string;
  style?: Record<string, unknown>;
  inlineValue?: {
    bindingId: string;
    computationId: string;
    format: NumberFormat;
  };
}
export interface SlideElement {
  id: string;
  type: string;
  rect: Rect;
  z: number;
  style?: Record<string, any>;
  runs?: TextRun[];
  bindingRef?: string;
  chartType?: string;
  options?: Record<string, any>;
  exportPolicy?: string;
  fields?: string[];
  assetId?: string;
  iconId?: string;
  shape?: string;
  fill?: string;
  fillTransparency?: number;
  line?: { color: string; width: number; dash?: string; transparency?: number; cap?: string; join?: string; flipH?: boolean; flipV?: boolean; beginArrowType?: string; endArrowType?: string; beginConnection?: { elementId: string; side: string }; endConnection?: { elementId: string; side: string } };
  [key: string]: any;
}
export interface Annotation {
  id: string;
  anchor: {
    bindingId: string;
    rowKey: Record<string, unknown>;
    seriesField?: string;
    feature?: string;
  };
  manualOffset?: { x: number; y: number };
  text?: string;
  [key: string]: unknown;
}
export interface SlideSpec {
  specVersion: string;
  id: string;
  revision: number;
  title: string;
  scene: string;
  templateRef: { id: string; version: number };
  themeRef: { id: string; version: number };
  canvas: { width: number; height: number; unit: string };
  snapshotRef: string;
  bindings: Record<string, Binding>;
  elements: SlideElement[];
  annotations: Annotation[];
  layoutOverrides: Record<
    string,
    { rect?: Partial<Rect>; style?: Record<string, any> }
  >;
  reviewState: { status: string; snapshotId: string; [key: string]: unknown };
  [key: string]: unknown;
}
export interface CompiledElement {
  id: string;
  type: "text" | "nativeChart" | "shape" | "image" | "table";
  rect: Rect;
  text?: string;
  fontFace?: string;
  fontSize?: number;
  color?: string;
  margin?: number;
  chartType?: "bar" | "line" | "stackedColumn" | "percentStackedColumn" | "pie" | "donut" | "combo" | "area" | "scatter";
  options?: Record<string, any>;
  categories?: { id: string; label: string }[];
  series?: {
    id: string;
    name: string;
    sourceValues: (string | null)[];
    values: (number | null)[];
    color: string;
    format?: NumberFormat;
    axis?: string;
  }[];
  numericUnit?: { baseUnit: string; displayDivisor: string; label: string };
  valueAxis?: { min: number; max: number; step: number; title: string };
  shape?: "rect" | "square" | "roundRect" | "ellipse" | "circle" | "triangle" | "rtTriangle" | "diamond" | "parallelogram" | "trapezoid" | "pentagon" | "hexagon" | "star5" | "heart" | "plus" | "rightArrow" | "leftRightArrow" | "chevron" | "notchedRightArrow" | "line" | "elbow";
  fill?: string;
  fillTransparency?: number;
  line?: { color: string; width: number; dash?: string; transparency?: number; cap?: string; join?: string; flipH?: boolean; flipV?: boolean; beginArrowType?: string; endArrowType?: string; beginConnection?: { elementId: string; side: string }; endConnection?: { elementId: string; side: string } };
  assetId?: string;
  stepId?: string;
  [key: string]: any;
}
export interface CompiledSlide {
  assets?: { id: string; dataUri?: string }[];
  canvas: SlideSpec["canvas"];
  theme: {
    fontFace: string;
    background: string;
    textColor: string;
    seriesColors: string[];
  };
  elements: CompiledElement[];
  diagnostics: Diagnostic[];
  provenance?: Record<string, unknown>;
  computations?: Record<string, Record<string, string | null>>;
}
