import {addPhase2Chart} from "./charts-phase2";
import {PHASE2_CHARTS} from "@slidebi/presentation";
import pptxgen from "pptxgenjs";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { normalizePptxFonts } from "./ppt-fonts.ts";

import type { CompiledSlide, Rect } from "@slidebi/presentation";

const color = (value: string | undefined, fallback = "1F2937") =>
  /^#?[0-9a-f]{6}$/i.test(value ?? "")
    ? value!.replace("#", "")
    : fallback.replace("#", "");
const position = ({ x, y, w, h }: Rect) => ({
  x: x / 72,
  y: y / 72,
  w: w / 72,
  h: h / 72,
});
/** Consumes an immutable, already calculated page. No DAX or business calculations occur here. */
export async function writePptx(
  compiled: CompiledSlide,
  outputPath: string,
  resolveAsset: (id: string) => Promise<string>,
): Promise<void> {
  return writeDeckPptx([compiled], outputPath, resolveAsset);
}

export async function writeDeckPptx(
  compiledSlides: CompiledSlide[],
  outputPath: string,
  resolveAsset: (id: string) => Promise<string>,
): Promise<void> {
  if (!compiledSlides.length) throw new Error("EMPTY_DECK");
  for (const page of compiledSlides) {
    if (page.diagnostics.some(d => d.severity === "error")) throw new Error("PREFLIGHT_FAILED");
    if (page.canvas.unit !== "pt" || page.canvas.width !== 960 || page.canvas.height !== 540) throw new Error("INVALID_CANVAS");
    for (const element of page.elements) {
      if (element.hyperlinkSlide !== undefined && (!Number.isInteger(element.hyperlinkSlide) || element.hyperlinkSlide < 1 || element.hyperlinkSlide > compiledSlides.length)) throw new Error("INVALID_NAVIGATION");
    }
  }
  const first = compiledSlides[0];
  const deck = new pptxgen();
  deck.defineLayout({
    name: "SlideBI",
    width: first.canvas.width / 72,
    height: first.canvas.height / 72,
  });
  deck.layout = "SlideBI";
  deck.author = "SlideBI";
  deck.subject = "Editable business report";
  deck.title = "SlideBI 报告";
  deck.theme = {
    headFontFace: first.theme.fontFace,
    bodyFontFace: first.theme.fontFace,
  };
  const chartFonts: string[] = [];
  for (const compiled of compiledSlides) {
    const slide = deck.addSlide();
    slide.background = { color: color(compiled.theme.background, "FFFFFF") };
    for (const e of compiled.elements) {
      if (!e.rect || !Object.values(e.rect).every(Number.isFinite))
        throw new Error("INVALID_GEOMETRY");
      const bounds = position(e.rect);
      if (e.type === "text") {
        slide.addText(e.text ?? "", {
          ...bounds,
          fontFace: e.fontFace ?? compiled.theme.fontFace,
          fontSize: e.fontSize ?? 16,
          color: color(e.color, compiled.theme.textColor),
          bold: e.bold ?? false,
          italic: e.italic ?? false,
          lang: "zh-CN",
          align: e.align ?? "left",
          valign: e.valign ?? "top",
          lineSpacing: (e.fontSize ?? 16) * 1.25,
          wrap: false,
          margin: 0,
          breakLine: false,
          paraSpaceAfter: 0,
          ...(e.fill ? {fill:{color:color(e.fill)}} : {}),
          ...(Number(e.line?.width)>0 ? {line:{color:color(e.line?.color,'94A3B8'),width:e.line!.width,...(e.line?.dash==='dash'?{dashType:'dash' as const}:{})}} : {}),
          ...(e.hyperlinkSlide ? { hyperlink: { slide: e.hyperlinkSlide }, underline: { style: "none" as const } } : {}),
        });
      } else if (e.type === "table") {
        const rows = e.rows as string[][];
        if (!rows?.length || !rows[0]?.length) throw new Error("EMPTY_TABLE");
        slide.addTable(rows.map((row, i) => row.map(text => ({text, options: {fill: { color: i === 0 ? color(e.fill, "EFF6FF") : color(e.bodyFill,"FFFFFF") }}}))), {
          ...bounds, autoPage: false, rowH: bounds.h / rows.length,
          colW: Array(rows[0].length).fill(bounds.w / rows[0].length),
          fontFace: e.fontFace ?? compiled.theme.fontFace, fontSize: e.fontSize ?? 16,
          color: color(e.color), bold:e.bold===true, margin: [4, 6, 4, 6], valign: "top",
          border: {type: "solid", color: color(e.line?.color,"CBD5E1"), pt: e.line?.width??0.5},

        });
      } else if (e.type === "nativeChart") {
        chartFonts.push(compiled.theme.fontFace);
        if((PHASE2_CHARTS as readonly string[]).includes(e.chartType??"")){addPhase2Chart(deck,slide,e,compiled.theme);continue;}
        if (e.chartType !== "bar" && e.chartType !== "line")
          throw new Error("UNSUPPORTED_CHART");
        const series = e.series ?? [];
        const labels = e.categories?.map((c) => c.label) ?? [];
        if (!series.length || !labels.length) throw new Error("EMPTY_CHART");
        // PptxGenJS supports null at runtime, but its public TS declaration only admits number[].
        const data = series.map((s) => ({
          name: s.name,
          labels,
          values: s.values as number[],
        }));
        const options: pptxgen.IChartOpts = {
          ...bounds,
          layout: e.options?.plotAreaLayout,
          lang: "zh-CN",
          chartColors: series.map((s, i) =>
            color(
              s.color,
              compiled.theme.seriesColors[i % compiled.theme.seriesColors.length],
            ),
          ),
          showLegend: e.options?.showLegend ?? true,
          legendPos: "b",
          legendFontFace: compiled.theme.fontFace,
          legendFontSize: 12,
          showValue: e.options?.showLabels ?? true,
          showTitle: false,
          // OOXML supports maxMin; PptxGenJS 4's declaration incorrectly only lists minMax.
          catAxisOrientation: (e.options?.direction === "bar"
            ? "maxMin"
            : "minMax") as pptxgen.IChartOpts["catAxisOrientation"],
          catAxisCrossesAt:
            e.options?.direction === "bar" ? labels.length + 0.5 : undefined,
          catAxisLabelFontFace: compiled.theme.fontFace,
          catAxisLabelFontSize: 12,
          valAxisLabelFontFace: compiled.theme.fontFace,
          valAxisLabelFontSize: 11,
          dataLabelFormatCode: e.options?.labelNumberFormat ?? "0",
          dataLabelFontFace: compiled.theme.fontFace,
          dataLabelFontSize: 11,
          valAxisLabelFormatCode: e.options?.labelNumberFormat ?? "0",
          showValAxisTitle: true,
          valAxisTitle: e.valueAxis?.title ?? e.numericUnit?.label ?? "",
          valAxisTitleFontFace: compiled.theme.fontFace,
          valAxisTitleFontSize: 11,
          valAxisMinVal: e.valueAxis?.min,
          valAxisMaxVal: e.valueAxis?.max,
          valAxisMajorUnit: e.valueAxis?.step,
          displayBlanksAs: "gap",
          lineDataSymbol: "circle",
          lineDataSymbolSize: 5,
          lineSize: 2,
          catAxisLineColor: "CBD5E1",
          valAxisLineColor: "CBD5E1",
          valGridLine: { color: "E2E8F0", size: 0.5 },
          ...(e.chartType === "bar"
            ? {
                barDir: e.options?.direction === "bar" ? "bar" : "col",
                barGrouping: "clustered",
                gapSizePct: 80,
                dataLabelPosition: "outEnd",
              }
            : { dataLabelPosition: "t" }),
        };
        slide.addChart(
          e.chartType === "bar" ? deck.ChartType.bar : deck.ChartType.line,
          data,
          options,
        );
      } else if (e.type === "shape") {
        if (!['rect','square','roundRect','ellipse','circle','triangle','diamond','line'].includes(e.shape??''))
          throw new Error("UNSUPPORTED_SHAPE");
        const shapeBounds =
          e.shape === "line"
            ? {
                x: Math.min(bounds.x, bounds.x + bounds.w),
                y: Math.min(bounds.y, bounds.y + bounds.h),
                w: Math.abs(bounds.w),
                h: Math.abs(bounds.h),
                flipH: bounds.w < 0,
                flipV: bounds.h < 0,
              }
            : bounds;
        const shapeType=e.shape === "line" ? deck.ShapeType.line : e.shape==='roundRect'?deck.ShapeType.roundRect:(e.shape==='ellipse'||e.shape==='circle')?deck.ShapeType.ellipse:e.shape==='triangle'?deck.ShapeType.triangle:e.shape==='diamond'?deck.ShapeType.diamond:deck.ShapeType.rect;
        const shapeOptions={
            ...shapeBounds,
            fill:
              e.shape === "line" ? undefined : { color: color(e.fill, "2563EB") },
            line: {
              color: color(e.line?.color, e.fill ?? "94A3B8"),
              width: e.line?.width ?? (e.shape === "line" ? 1 : 0),
              ...(e.line?.dash === "dash" ? { dashType: "dash" as const } : {}),
            },
          };
        if(e.shape!=="line"&&e.text)slide.addText(e.text,{...shapeOptions,shape:shapeType,fontFace:e.fontFace??compiled.theme.fontFace,fontSize:e.fontSize??16,color:color(e.color,compiled.theme.textColor),bold:e.bold===true,italic:e.italic===true,align:e.align??'center',valign:e.valign??'middle',margin:4,breakLine:false,paraSpaceAfter:0});
        else slide.addShape(shapeType,shapeOptions);
      } else if (e.type === "image") {
        if (!e.assetId) throw new Error("MISSING_ASSET");
        const bytes = await readFile(await resolveAsset(e.assetId));
        // Only raster assets normalized by the asset service reach the image parser.
        const png = bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
        if (!png && !jpeg) throw new Error("UNSUPPORTED_IMAGE");
        const data = `image/${png ? "png" : "jpeg"};base64,${bytes.toString("base64")}`;
        const metadata = await sharp(bytes).metadata();
        const iw = metadata.width!,
          ih = metadata.height!;
        if (e.fit === "cover")
          slide.addImage({
            data,
            x: bounds.x,
            y: bounds.y,
            w: iw / 72,
            h: ih / 72,
            sizing: { type: "cover", w: bounds.w, h: bounds.h },
          });
        else {
          const scale = Math.min(bounds.w / iw, bounds.h / ih),
            w = iw * scale,
            h = ih * scale;
          slide.addImage({
            data,
            x: bounds.x + (bounds.w - w) / 2,
            y: bounds.y + (bounds.h - h) / 2,
            w,
            h,
          });
        }
      } else throw new Error(`UNSUPPORTED_ELEMENT: ${e.type}`);
    }
  }
  await deck.writeFile({ fileName: outputPath, compression: true });
  await normalizePptxFonts(outputPath, first.theme.fontFace, chartFonts);
}
