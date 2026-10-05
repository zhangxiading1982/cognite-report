import type { ReactNode } from "react";

export type ShapePreset = {
  id: string;
  shape: string;
  label: string;
  w: number;
  h: number;
  line?: Record<string, any>;
};

/** Common PowerPoint shapes, grouped in the same order as its insert gallery. */
export const INSERT_SHAPE_GROUPS: { label: string; items: ShapePreset[] }[] = [
  { label: "线条", items: [
    { id: "line", shape: "line", label: "直线", w: 180, h: 16 },
    { id: "elbow", shape: "elbow", label: "折线", w: 180, h: 90 },
    { id: "arrow-line", shape: "line", label: "单向箭头线", w: 180, h: 16, line: { endArrowType: "triangle" } },
    { id: "double-arrow-line", shape: "line", label: "双向箭头线", w: 180, h: 16, line: { beginArrowType: "triangle", endArrowType: "triangle" } },
  ] },
  { label: "矩形", items: [
    { id: "rect", shape: "rect", label: "长方形", w: 160, h: 90 },
    { id: "square", shape: "square", label: "正方形", w: 90, h: 90 },
    { id: "roundRect", shape: "roundRect", label: "圆角矩形", w: 160, h: 90 },
  ] },
  { label: "基本形状", items: [
    { id: "ellipse", shape: "ellipse", label: "椭圆形", w: 160, h: 90 },
    { id: "circle", shape: "circle", label: "圆形", w: 90, h: 90 },
    { id: "triangle", shape: "triangle", label: "三角形", w: 130, h: 110 },
    { id: "rtTriangle", shape: "rtTriangle", label: "右三角形", w: 130, h: 110 },
    { id: "diamond", shape: "diamond", label: "菱形", w: 130, h: 100 },
    { id: "parallelogram", shape: "parallelogram", label: "平行四边形", w: 160, h: 90 },
    { id: "trapezoid", shape: "trapezoid", label: "梯形", w: 150, h: 90 },
    { id: "pentagon", shape: "pentagon", label: "五边形", w: 110, h: 105 },
    { id: "hexagon", shape: "hexagon", label: "六边形", w: 140, h: 100 },
    { id: "star5", shape: "star5", label: "五角星", w: 110, h: 105 },
    { id: "heart", shape: "heart", label: "爱心", w: 120, h: 105 },
    { id: "plus", shape: "plus", label: "加号", w: 110, h: 105 },
  ] },
  { label: "箭头", items: [
    { id: "rightArrow", shape: "rightArrow", label: "右箭头", w: 170, h: 80 },
    { id: "leftRightArrow", shape: "leftRightArrow", label: "双向箭头", w: 180, h: 80 },
    { id: "chevron", shape: "chevron", label: "V 型箭头", w: 150, h: 90 },
    { id: "notchedRightArrow", shape: "notchedRightArrow", label: "燕尾箭头", w: 170, h: 80 },
  ] },
];

export function ShapeGlyph({ shape, line }: Pick<ShapePreset, "shape" | "line">) {
  const fill = ["line", "elbow"].includes(shape) ? "none" : "#dceae8";
  const stroke = "#315c65";
  const common = { fill, stroke, strokeWidth: 1.6, strokeLinejoin: "round" as const };
  const arrows = <>
    {line?.beginArrowType && <polygon points="2,12 7,9 7,15" fill={stroke} />}
    {line?.endArrowType && <polygon points="22,12 17,9 17,15" fill={stroke} />}
  </>;
  let body: ReactNode;
  if (shape === "line") body = <><line x1="3" y1="12" x2="21" y2="12" {...common} />{arrows}</>;
  else if (shape === "elbow") body = <polyline points="3,5 12,5 12,19 21,19" {...common} />;
  else if (shape === "ellipse" || shape === "circle") body = <ellipse cx="12" cy="12" rx={shape === "circle" ? 8 : 10} ry="8" {...common} />;
  else if (shape === "roundRect") body = <rect x="2" y="4" width="20" height="16" rx="4" {...common} />;
  else if (shape === "triangle") body = <polygon points="12,2 22,21 2,21" {...common} />;
  else if (shape === "rtTriangle") body = <polygon points="3,3 21,21 3,21" {...common} />;
  else if (shape === "diamond") body = <polygon points="12,2 22,12 12,22 2,12" {...common} />;
  else if (shape === "parallelogram") body = <polygon points="7,3 22,3 17,21 2,21" {...common} />;
  else if (shape === "trapezoid") body = <polygon points="7,3 17,3 22,21 2,21" {...common} />;
  else if (shape === "pentagon") body = <polygon points="12,2 22,9 18,21 6,21 2,9" {...common} />;
  else if (shape === "hexagon") body = <polygon points="7,2 17,2 22,12 17,22 7,22 2,12" {...common} />;
  else if (shape === "star5") body = <polygon points="12,2 14.5,9 22,9 16,13.5 18.5,21 12,16.5 5.5,21 8,13.5 2,9 9.5,9" {...common} />;
  else if (shape === "heart") body = <path d="M12 21C10 18 3 15 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-7 9-9 12Z" {...common} />;
  else if (shape === "plus") body = <polygon points="9,2 15,2 15,9 22,9 22,15 15,15 15,22 9,22 9,15 2,15 2,9 9,9" {...common} />;
  else if (shape === "rightArrow" || shape === "notchedRightArrow") body = <polygon points={shape === "rightArrow" ? "2,7 14,7 14,3 22,12 14,21 14,17 2,17" : "2,7 14,7 14,3 22,12 14,21 14,17 2,17 6,12"} {...common} />;
  else if (shape === "leftRightArrow") body = <polygon points="2,12 7,3 7,7 17,7 17,3 22,12 17,21 17,17 7,17 7,21" {...common} />;
  else if (shape === "chevron") body = <polygon points="2,3 15,3 22,12 15,21 2,21 9,12" {...common} />;
  else body = <rect x="2" y="4" width="20" height="16" {...common} />;
  return <svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true">{body}</svg>;
}
