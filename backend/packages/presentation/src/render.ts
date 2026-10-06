import {PHASE2_CHARTS} from "./charts-phase2";
import {renderPhase2Chart} from "./render-charts-phase2";
import { fontCss } from "./fonts";
import type { CompiledSlide, CompiledElement } from "./types";
import { chartPoint, wrapText } from "./layout";
const esc = (x: unknown) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
const color = (x: unknown, fallback = "1F2937") =>
  typeof x === "string" && /^#?[0-9a-f]{6}$/i.test(x)
    ? "#" + x.replace("#", "")
    : "#" + fallback;
const num = (v: number) => (Number.isFinite(v) ? v : 0);
const polygon = (points: [number, number][]) =>
  points.map(([x, y]) => `${num(x)},${num(y)}`).join(" ");
const dash = (value?: string) =>
  value === "dash"
    ? ' stroke-dasharray="8 5"'
    : value === "dot"
      ? ' stroke-dasharray="2 4"'
      : value === "dashDot"
        ? ' stroke-dasharray="8 4 2 4"'
      : "";
const opacity = (value?: number) => Math.max(0, Math.min(1, 1 - Number(value ?? 0) / 100));
const lineCap = (value?: string) => value === "round" || value === "square" ? value : "butt";
function starPoints(r: CompiledElement["rect"]) {
  const points: [number, number][] = [];
  for (let index = 0; index < 10; index++) {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const radius = index % 2 === 0 ? 1 : 0.42;
    points.push([
      r.x + r.w / 2 + Math.cos(angle) * (r.w / 2) * radius,
      r.y + r.h / 2 + Math.sin(angle) * (r.h / 2) * radius,
    ]);
  }
  return points;
}
function lineGeometry(n: CompiledElement) {
  const r = n.rect;
  const stroke = color(n.line?.color);
  const safeId = String(n.id).replace(/[^a-z0-9_-]/gi, "-");
  const beginType = n.line?.beginArrowType;
  const endType = n.line?.endArrowType;
  const hasStart = !!beginType && beginType !== "none";
  const hasEnd = !!endType && endType !== "none";
  const markerShape = (type?: string) => type === "oval"
    ? `<circle cx="4" cy="4" r="3" fill="${stroke}"/>`
    : type === "diamond"
      ? `<path d="M0 4 4 0 8 4 4 8Z" fill="${stroke}"/>`
      : type === "arrow"
        ? `<path d="M0 1 8 4 0 7 3 4Z" fill="${stroke}"/>`
        : type === "stealth"
          ? `<path d="M0 0 8 4 0 8 2.5 4Z" fill="${stroke}"/>`
          : `<path d="M0 0 8 4 0 8Z" fill="${stroke}"/>`;
  const startId = `line-arrow-${safeId}-start`, endId = `line-arrow-${safeId}-end`;
  const marker = hasStart || hasEnd ? `<defs>${hasStart?`<marker id="${startId}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse" markerUnits="strokeWidth">${markerShape(beginType)}</marker>`:""}${hasEnd?`<marker id="${endId}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse" markerUnits="strokeWidth">${markerShape(endType)}</marker>`:""}</defs>` : "";
  const arrows = `${hasStart ? ` marker-start="url(#${startId})"` : ""}${hasEnd ? ` marker-end="url(#${endId})"` : ""}`;
  const start = { x: r.x + (n.line?.flipH ? r.w : 0), y: r.y + (n.line?.flipV ? r.h : 0) };
  const end = { x: r.x + (n.line?.flipH ? 0 : r.w), y: r.y + (n.line?.flipV ? 0 : r.h) };
  const common = `fill="none" stroke="${stroke}" stroke-width="${num(n.line?.width ?? 1)}" stroke-opacity="${opacity(n.line?.transparency)}" stroke-linecap="${lineCap(n.line?.cap)}" stroke-linejoin="${n.line?.join ?? "round"}"${dash(n.line?.dash)}${arrows}`;
  const resolvedElbowPoints = n.line?.elbowPoints;
  const elbowPoints = resolvedElbowPoints && resolvedElbowPoints.length >= 2 ? resolvedElbowPoints : [start, { x: (start.x+end.x)/2+Number(n.line?.elbowOffset??0), y: start.y }, { x: (start.x+end.x)/2+Number(n.line?.elbowOffset??0), y: end.y }, end];
  return n.shape === "elbow"
    ? `${marker}<polyline points="${polygon(elbowPoints.map((point:any)=>[point.x,point.y]))}" ${common}/>`
    : `${marker}<line x1="${num(start.x)}" y1="${num(start.y)}" x2="${num(end.x)}" y2="${num(end.y)}" ${common}/>`;
}
function shapeGeometry(n: CompiledElement) {
  const r = n.rect;
  const outline=`stroke="${color(n.line?.color,n.fill??'94A3B8')}" stroke-width="${num(n.line?.width??0)}" stroke-opacity="${opacity(n.line?.transparency)}" stroke-linecap="${lineCap(n.line?.cap)}" stroke-linejoin="${n.line?.join ?? "round"}"${dash(n.line?.dash)}`;
  const attrs=`fill="${color(n.fill)}" fill-opacity="${opacity(n.fillTransparency)}" ${outline}`;
  if (n.shape === "ellipse" || n.shape === "circle")
    return `<ellipse cx="${num(r.x+r.w/2)}" cy="${num(r.y+r.h/2)}" rx="${num(r.w/2)}" ry="${num(r.h/2)}" ${attrs}/>`;
  if (n.shape === "roundRect")
    return `<rect x="${num(r.x)}" y="${num(r.y)}" width="${num(r.w)}" height="${num(r.h)}" rx="${num(Math.min(r.w,r.h)*0.14)}" ry="${num(Math.min(r.w,r.h)*0.14)}" ${attrs}/>`;
  const shapes: Record<string, [number, number][]> = {
    triangle:[[r.x+r.w/2,r.y],[r.x+r.w,r.y+r.h],[r.x,r.y+r.h]],
    rtTriangle:[[r.x,r.y],[r.x+r.w,r.y+r.h],[r.x,r.y+r.h]],
    diamond:[[r.x+r.w/2,r.y],[r.x+r.w,r.y+r.h/2],[r.x+r.w/2,r.y+r.h],[r.x,r.y+r.h/2]],
    parallelogram:[[r.x+r.w*.18,r.y],[r.x+r.w,r.y],[r.x+r.w*.82,r.y+r.h],[r.x,r.y+r.h]],
    trapezoid:[[r.x+r.w*.18,r.y],[r.x+r.w*.82,r.y],[r.x+r.w,r.y+r.h],[r.x,r.y+r.h]],
    pentagon:[[r.x+r.w*.5,r.y],[r.x+r.w,r.y+r.h*.38],[r.x+r.w*.81,r.y+r.h],[r.x+r.w*.19,r.y+r.h],[r.x,r.y+r.h*.38]],
    hexagon:[[r.x+r.w*.25,r.y],[r.x+r.w*.75,r.y],[r.x+r.w,r.y+r.h*.5],[r.x+r.w*.75,r.y+r.h],[r.x+r.w*.25,r.y+r.h],[r.x,r.y+r.h*.5]],
    plus:[[r.x+r.w*.35,r.y],[r.x+r.w*.65,r.y],[r.x+r.w*.65,r.y+r.h*.35],[r.x+r.w,r.y+r.h*.35],[r.x+r.w,r.y+r.h*.65],[r.x+r.w*.65,r.y+r.h*.65],[r.x+r.w*.65,r.y+r.h],[r.x+r.w*.35,r.y+r.h],[r.x+r.w*.35,r.y+r.h*.65],[r.x,r.y+r.h*.65],[r.x,r.y+r.h*.35],[r.x+r.w*.35,r.y+r.h*.35]],
    rightArrow:[[r.x,r.y+r.h*.25],[r.x+r.w*.62,r.y+r.h*.25],[r.x+r.w*.62,r.y],[r.x+r.w,r.y+r.h*.5],[r.x+r.w*.62,r.y+r.h],[r.x+r.w*.62,r.y+r.h*.75],[r.x,r.y+r.h*.75]],
    leftRightArrow:[[r.x,r.y+r.h*.5],[r.x+r.w*.2,r.y],[r.x+r.w*.2,r.y+r.h*.25],[r.x+r.w*.8,r.y+r.h*.25],[r.x+r.w*.8,r.y],[r.x+r.w,r.y+r.h*.5],[r.x+r.w*.8,r.y+r.h],[r.x+r.w*.8,r.y+r.h*.75],[r.x+r.w*.2,r.y+r.h*.75],[r.x+r.w*.2,r.y+r.h]],
    chevron:[[r.x,r.y],[r.x+r.w*.68,r.y],[r.x+r.w,r.y+r.h*.5],[r.x+r.w*.68,r.y+r.h],[r.x,r.y+r.h],[r.x+r.w*.32,r.y+r.h*.5]],
    notchedRightArrow:[[r.x,r.y+r.h*.25],[r.x+r.w*.62,r.y+r.h*.25],[r.x+r.w*.62,r.y],[r.x+r.w,r.y+r.h*.5],[r.x+r.w*.62,r.y+r.h],[r.x+r.w*.62,r.y+r.h*.75],[r.x,r.y+r.h*.75],[r.x+r.w*.18,r.y+r.h*.5]],
  };
  if (n.shape === "star5") return `<polygon points="${polygon(starPoints(r))}" ${attrs}/>`;
  if (n.shape === "heart")
    return `<path d="M ${num(r.x+r.w/2)} ${num(r.y+r.h)} C ${num(r.x+r.w*.42)} ${num(r.y+r.h*.86)}, ${num(r.x)} ${num(r.y+r.h*.6)}, ${num(r.x)} ${num(r.y+r.h*.3)} C ${num(r.x)} ${num(r.y)}, ${num(r.x+r.w*.38)} ${num(r.y-r.h*.05)}, ${num(r.x+r.w/2)} ${num(r.y+r.h*.22)} C ${num(r.x+r.w*.62)} ${num(r.y-r.h*.05)}, ${num(r.x+r.w)} ${num(r.y)}, ${num(r.x+r.w)} ${num(r.y+r.h*.3)} C ${num(r.x+r.w)} ${num(r.y+r.h*.6)}, ${num(r.x+r.w*.58)} ${num(r.y+r.h*.86)}, ${num(r.x+r.w/2)} ${num(r.y+r.h)} Z" ${attrs}/>`;
  if (shapes[n.shape ?? ""]) return `<polygon points="${polygon(shapes[n.shape ?? ""])}" ${attrs}/>`;
  return `<rect x="${num(r.x)}" y="${num(r.y)}" width="${num(r.w)}" height="${num(r.h)}" ${attrs}/>`;
}
export function renderSlideSvg(c: CompiledSlide): string {
  const body = c.elements
    .map((n) => {
      const r = n.rect;
      if (n.type === "text") {
        const tx =
          r.x +
          (n.align === "center" ? r.w / 2 : n.align === "right" ? r.w : 0);
        const height = (n.text ?? "").split("\n").length * (n.fontSize ?? 16) * 1.25;
        const offset = n.valign === "bottom" ? Math.max(0, r.h - height) : n.valign === "middle" ? Math.max(0, (r.h - height) / 2) : 0;
        const box=n.fill||Number(n.line?.width)>0?`<rect x="${num(r.x)}" y="${num(r.y)}" width="${num(r.w)}" height="${num(r.h)}" fill="${n.fill?color(n.fill):'none'}" fill-opacity="${opacity(n.fillTransparency)}" stroke="${Number(n.line?.width)>0?color(n.line?.color):'none'}" stroke-opacity="${opacity(n.line?.transparency)}" stroke-width="${num(n.line?.width??0)}" stroke-linecap="${lineCap(n.line?.cap)}" stroke-linejoin="${n.line?.join ?? "round"}"${dash(n.line?.dash)}/>`:'';
        return `${box}<text text-anchor="${n.align === "center" ? "middle" : n.align === "right" ? "end" : "start"}" font-weight="${n.bold ? "bold" : "normal"}" font-style="${n.italic ? "italic" : "normal"}" x="${num(tx)}" y="${num(r.y + offset)}" font-family="${esc(fontCss(n.fontFace ?? c.theme.fontFace))}" font-size="${num(n.fontSize ?? 16)}" fill="${color(n.color)}">${(
          n.text ?? ""
        )
          .split("\n")
          .map(
            (line, i) =>
              `<tspan x="${num(tx)}" dy="${i === 0 ? (n.fontSize ?? 16) : (n.fontSize ?? 16) * 1.25}">${esc(line)}</tspan>`,
          )
          .join("")}</text>`;
      }
      if (n.type === "table") {
        const rows = n.rows as string[][], rh = r.h / rows.length;
        const weights=(Array.isArray(n.columnWidths)&&n.columnWidths.length===rows[0].length?n.columnWidths:rows[0].map(()=>1)).map((value:any)=>Math.max(.01,Number(value)||1));
        const widthTotal=weights.reduce((sum:number,value:number)=>sum+value,0),widths=weights.map((value:number)=>r.w*value/widthTotal),offsets=widths.map((_:number,index:number)=>widths.slice(0,index).reduce((sum:number,value:number)=>sum+value,0));
        const cells=rows.map((row, i) => row.map((cell, j) => {
          const cw=widths[j],x = r.x + offsets[j], y = r.y + rh * i,cellStyle=n.cellStyles?.[i]?.[j]??{};
          const fs=Number(cellStyle.fontSize??(i===0?n.headerFontSize:n.fontSize)??16),align=cellStyle.align??(j===0?'left':'right'),padding=Number(n.cellPaddingX??8);
          const lines = wrapText(cell, cw-padding*2, fs),lineHeight=fs*1.2,totalHeight=lines.length*lineHeight;
          const fill=color(cellStyle.fill,i===0?n.fill:(i%2===0&&n.bodyStripeFill?n.bodyStripeFill:n.bodyFill??'FFFFFF'));
          const stroke=n.borderMode==='horizontal'?'none':color(n.line?.color,'CBD5E1');
          const tx=align==='center'?x+cw/2:align==='right'?x+cw-padding:x+padding,anchor=align==='center'?'middle':align==='right'?'end':'start',firstBaseline=y+(rh-totalHeight)/2+fs*.88;
          return `<rect x="${num(x)}" y="${num(y)}" width="${num(cw)}" height="${num(rh)}" fill="${fill}" stroke="${stroke}" stroke-width="${num(n.line?.width??0.5)}"/><text text-anchor="${anchor}" x="${num(tx)}" y="${num(firstBaseline)}" font-family="${esc(fontCss(cellStyle.fontFace??(i===0?n.headerFontFace:n.fontFace)??c.theme.fontFace))}" font-size="${num(fs)}" font-weight="${cellStyle.bold??(i===0?n.headerBold!==false:n.bold)?'bold':'normal'}" fill="${color(cellStyle.color??(i===0?n.headerColor:n.color))}">${lines.map((line,k)=>`<tspan x="${num(tx)}" dy="${k===0?0:lineHeight}">${esc(line)}</tspan>`).join('')}</text>`;
        }).join('')).join('');
        const rules=n.borderMode==='horizontal'?rows.slice(1).map((_,i)=>{const rule=i===0&&n.headerLine?n.headerLine:n.line;return `<line x1="${r.x}" x2="${r.x+r.w}" y1="${r.y+rh*(i+1)}" y2="${r.y+rh*(i+1)}" stroke="${color(rule?.color,'E2E8F0')}" stroke-width="${num(rule?.width??0.5)}"/>`}).join(''):'';
        return `<g>${cells}${rules}</g>`;
      }
      if (n.type === "shape") {
        if (n.shape === "line" || n.shape === "elbow") return lineGeometry(n);
        const body=shapeGeometry(n);
        if(!n.text)return body;
        const tx=r.x+(n.align==='left'?8:n.align==='right'?r.w-8:r.w/2),anchor=n.align==='left'?'start':n.align==='right'?'end':'middle',fs=n.fontSize??16,lines=String(n.text).split('\n'),height=lines.length*fs*1.25,top=n.valign==='top'?r.y+8:n.valign==='bottom'?r.y+r.h-height-8:r.y+(r.h-height)/2;
        return `<g>${body}<text text-anchor="${anchor}" font-weight="${n.bold?'bold':'normal'}" font-style="${n.italic?'italic':'normal'}" x="${num(tx)}" y="${num(top)}" font-family="${esc(fontCss(n.fontFace??c.theme.fontFace))}" font-size="${num(fs)}" fill="${color(n.color)}">${lines.map((line,i)=>`<tspan x="${num(tx)}" dy="${i===0?fs:fs*1.25}">${esc(line)}</tspan>`).join('')}</text></g>`;
      }
      if (n.type === "image") {
        const embedded = c.assets?.find(
          (a: any) => a.id === n.assetId,
        )?.dataUri;
        return typeof embedded === "string" &&
          /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(embedded)
          ? `<image x="${num(r.x)}" y="${num(r.y)}" width="${num(r.w)}" height="${num(r.h)}" href="${embedded}" preserveAspectRatio="xMidYMid ${n.fit === "cover" ? "slice" : "meet"}"/>`
          : `<g><rect x="${num(r.x)}" y="${num(r.y)}" width="${num(r.w)}" height="${num(r.h)}" fill="#F1F5F9"/><text x="${num(r.x + 8)}" y="${num(r.y + 20)}" font-size="12">图片：${esc(n.assetId)}</text></g>`;
      }
      return chart(n);
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${num(c.canvas.width)}" height="${num(c.canvas.height)}" viewBox="0 0 ${num(c.canvas.width)} ${num(c.canvas.height)}" role="img"><rect width="100%" height="100%" fill="${color(c.theme.background, "FFFFFF")}"/>${body}</svg>`;
}
function chart(n: CompiledElement): string {
  if((PHASE2_CHARTS as readonly string[]).includes(n.chartType??""))return renderPhase2Chart(n);
  const r = n.rect,
    ax = n.valueAxis!,
    cats = n.categories!,
    series = n.series!;
  const plotHeight = Math.max(0.55, Math.min(1, Number(n.options?.plotHeight ?? 1)));
  const plotBottom = r.y + r.h - 60;
  const plot = { x: r.x + 48, y: plotBottom - (r.h - 88) * plotHeight, w: r.w - 64, h: (r.h - 88) * plotHeight };
  const horizontal = n.options?.direction === "bar" && n.chartType === "bar";
  const fontSize = Number(n.options?.fontSize ?? 11);
  const labelFontSize = Number(n.options?.labelFontSize ?? 10);
  const labelColor = color(n.options?.labelColor, "475569");
  const gridColor = color(n.options?.gridColor, "E2E8F0");
  const axisColor = color(n.options?.axisColor, "94A3B8");
  const barThickness = Math.max(0.25, Math.min(0.95, Number(n.options?.barThickness ?? 0.7)));
  const lineWidth = Math.max(1, Math.min(8, Number(n.options?.lineWidth ?? 2)));
  const markerSize = Math.max(0, Math.min(12, Number(n.options?.markerSize ?? 3)));
  const y = (v: number) =>
    plot.y + plot.h - ((v - ax.min) / (ax.max - ax.min)) * plot.h;
  const x = (v: number) => plot.x + ((v - ax.min) / (ax.max - ax.min)) * plot.w;
  const text = (tx: number, ty: number, s: string, size = fontSize, fill = labelColor, anchor = "start") =>
    `<text x="${num(tx)}" y="${num(ty)}" font-size="${num(size)}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;
  let out = `<g font-family="${esc(n.options?.fontFace ?? "sans-serif")}">${text(plot.x, r.y + 13, n.numericUnit?.label ?? "", fontSize, axisColor)}`;
  let ticks = 0;
  for (
    let t = ax.min;
    t <= ax.max + ax.step * 0.001 && ticks < 100;
    t += ax.step, ticks++
  ) {
    const grid = n.options?.showGridlines === false ? "" : horizontal
      ? `<line x1="${x(t)}" x2="${x(t)}" y1="${plot.y}" y2="${plot.y + plot.h}" stroke="${gridColor}"/>`
      : `<line x1="${plot.x}" x2="${plot.x + plot.w}" y1="${y(t)}" y2="${y(t)}" stroke="${gridColor}"/>`;
    out += horizontal
      ? `${grid}${text(x(t), plot.y + plot.h + 16, String(Number(t.toPrecision(8))), fontSize, axisColor, "middle")}`
      : `${grid}${text(plot.x - 7, y(t) + 4, String(Number(t.toPrecision(8))), fontSize, axisColor, "end")}`;
  }
  cats.forEach((cat, i) => {
    out += horizontal
      ? text(plot.x - 7, plot.y + ((i + 0.5) * plot.h) / cats.length + 4, cat.label, fontSize, axisColor, "end")
      : text(
          plot.x + ((i + 0.5) * plot.w) / cats.length,
          plot.y + plot.h + 18,
          cat.label,
          fontSize,
          axisColor,
          "middle",
        );
  });
  series.forEach((s, j) => {
    let path = "";
    let connected = false;
    s.values.forEach((v, i) => {
      if (v === null) {
        connected = false;
        return;
      }
      const p = chartPoint(n, i, j, v);
      if (n.chartType === "line") {
        path += `${connected ? "L" : "M"}${p.x},${p.y} `;
        connected = true;
        if (markerSize > 0) out += `<circle cx="${p.x}" cy="${p.y}" r="${num(markerSize)}" fill="${color(s.color)}"/>`;
      } else {
        const thickness =
          ((horizontal ? plot.h : plot.w) / cats.length / series.length) * barThickness;
        out += horizontal
          ? `<rect x="${Math.min(x(0), p.x)}" y="${p.y - thickness / 2}" width="${Math.abs(p.x - x(0))}" height="${thickness}" fill="${color(s.color)}"/>`
          : `<rect x="${p.x - thickness / 2}" y="${Math.min(y(0), p.y)}" width="${thickness}" height="${Math.abs(y(0) - p.y)}" fill="${color(s.color)}"/>`;
      }
      if (n.options?.showLabels !== false)
        out += text(p.x + 3, p.y - 7, v.toFixed(n.options?.decimals ?? 0), labelFontSize, labelColor);
    });
    if (path)
      out += `<path d="${path}" fill="none" stroke="${color(s.color)}" stroke-width="${num(lineWidth)}"/>`;
    if (n.options?.showLegend !== false)
      out += `<rect x="${plot.x + j * 150}" y="${r.y + r.h - 14}" width="10" height="10" fill="${color(s.color)}"/>${text(plot.x + j * 150 + 15, r.y + r.h - 5, s.name, fontSize, labelColor)}`;
  });
  return out + "</g>";
}
