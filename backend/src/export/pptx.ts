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
          ...(e.fill ? {fill:{color:color(e.fill),transparency:e.fillTransparency??0}} : {}),
          ...(Number(e.line?.width)>0 ? {line:{color:color(e.line?.color,'94A3B8'),width:e.line!.width,transparency:e.line?.transparency??0,...(e.line?.dash==='dash'?{dashType:'dash' as const}:e.line?.dash==='dot'?{dashType:'sysDot' as const}:e.line?.dash==='dashDot'?{dashType:'dashDot' as const}:{})}} : {}),
          ...(e.hyperlinkSlide ? { hyperlink: { slide: e.hyperlinkSlide }, underline: { style: "none" as const } } : {}),
        });
      } else if (e.type === "table") {
        const rows = e.rows as string[][];
        if (!rows?.length || !rows[0]?.length) throw new Error("EMPTY_TABLE");
        const weights=(Array.isArray(e.columnWidths)&&e.columnWidths.length===rows[0].length?e.columnWidths:rows[0].map(()=>1)).map((value:any)=>Math.max(.01,Number(value)||1));
        const weightTotal=weights.reduce((sum:number,value:number)=>sum+value,0);
        const columnWidths=weights.map((value:number)=>bounds.w*value/weightTotal);
        const dashType=(value?:string)=>value==='dash'?{dashType:'dash' as const}:value==='dot'?{dashType:'sysDot' as const}:value==='dashDot'?{dashType:'dashDot' as const}:{};
        const lineOptions=(rule:any=e.line)=>({color:color(rule?.color,e.line?.color??'CBD5E1'),width:rule?.width??e.line?.width??0.5,...dashType(rule?.dash??e.line?.dash)});
        const solidGrid=e.borderMode==='grid'&&(!e.line?.dash||e.line.dash==='solid');
        const tableRows=rows.map((row,i)=>row.map((text,j)=>{
          const cell=e.cellStyles?.[i]?.[j]??{};
          return {text,options:{
            fill:{color:color(cell.fill,i===0?color(e.fill,"EFF6FF"):i%2===0&&e.bodyStripeFill?color(e.bodyStripeFill):color(e.bodyFill,"FFFFFF"))},
            color:color(cell.color??(i===0?e.headerColor:e.color)),
            bold:cell.bold??(i===0?e.headerBold!==false:e.bold===true),
            fontFace:cell.fontFace??(i===0?e.headerFontFace:e.fontFace)??compiled.theme.fontFace,
            fontSize:cell.fontSize??(i===0?e.headerFontSize:e.fontSize)??16,
            align:cell.align??(j===0?'left':'right'),
          }};
        }));
        slide.addTable(tableRows, {
          ...bounds, autoPage: false, rowH: bounds.h / rows.length,
          colW: columnWidths,
          fontFace: e.fontFace ?? compiled.theme.fontFace, fontSize: e.fontSize ?? 16,
          color: color(e.color), bold:e.bold===true, margin: [4, Number(e.cellPaddingX??6), 4, Number(e.cellPaddingX??6)], valign: "middle",
          border: solidGrid?{type: "solid",color:color(e.line?.color,"CBD5E1"),pt:e.line?.width??0.5}:{type:"none",color:"FFFFFF",pt:0},

        });
        if(e.borderMode==='horizontal')for(let row=1;row<rows.length;row++){const rule=row===1&&e.headerLine?e.headerLine:e.line;slide.addShape(deck.ShapeType.line,{x:bounds.x,y:bounds.y+bounds.h*row/rows.length,w:bounds.w,h:0,line:lineOptions(rule)})}
        if(e.borderMode==='outline')slide.addShape(deck.ShapeType.rect,{...bounds,fill:{color:'FFFFFF',transparency:100},line:lineOptions()});
        if(e.borderMode==='grid'&&!solidGrid){
          slide.addShape(deck.ShapeType.rect,{...bounds,fill:{color:'FFFFFF',transparency:100},line:lineOptions()});
          for(let row=1;row<rows.length;row++){const rule=row===1&&e.headerLine?e.headerLine:e.line;slide.addShape(deck.ShapeType.line,{x:bounds.x,y:bounds.y+bounds.h*row/rows.length,w:bounds.w,h:0,line:lineOptions(rule)})}
          let x=bounds.x;for(const width of columnWidths.slice(0,-1)){x+=width;slide.addShape(deck.ShapeType.line,{x,y:bounds.y,w:0,h:bounds.h,line:lineOptions()})}
        }
      } else if (e.type === "nativeChart") {
        const chartFont = e.options?.fontFace ?? compiled.theme.fontFace;
        const chartFontSize = Number(e.options?.fontSize ?? 11);
        const labelFontSize = Number(e.options?.labelFontSize ?? 10);
        const labelColor = color(e.options?.labelColor, "475569");
        const axisColor = color(e.options?.axisColor, "94A3B8");
        const gridColor = color(e.options?.gridColor, "E2E8F0");
        const barThickness = Math.max(.25, Math.min(.95, Number(e.options?.barThickness ?? .7)));
        chartFonts.push(chartFont);
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
          legendFontFace: chartFont,
          legendFontSize: chartFontSize,
          legendColor: labelColor,
          showValue: e.options?.showLabels ?? true,
          showTitle: false,
          // OOXML supports maxMin; PptxGenJS 4's declaration incorrectly only lists minMax.
          catAxisOrientation: (e.options?.direction === "bar"
            ? "maxMin"
            : "minMax") as pptxgen.IChartOpts["catAxisOrientation"],
          catAxisCrossesAt:
            e.options?.direction === "bar" ? labels.length + 0.5 : undefined,
          catAxisLabelFontFace: chartFont,
          catAxisLabelFontSize: chartFontSize,
          catAxisLabelColor: axisColor,
          valAxisLabelFontFace: chartFont,
          valAxisLabelFontSize: chartFontSize,
          valAxisLabelColor: axisColor,
          dataLabelFormatCode: e.options?.labelNumberFormat ?? "0",
          dataLabelFontFace: chartFont,
          dataLabelFontSize: labelFontSize,
          dataLabelColor: labelColor,
          valAxisLabelFormatCode: e.options?.labelNumberFormat ?? "0",
          showValAxisTitle: true,
          valAxisTitle: e.valueAxis?.title ?? e.numericUnit?.label ?? "",
          valAxisTitleFontFace: chartFont,
          valAxisTitleFontSize: chartFontSize,
          valAxisMinVal: e.valueAxis?.min,
          valAxisMaxVal: e.valueAxis?.max,
          valAxisMajorUnit: e.valueAxis?.step,
          displayBlanksAs: "gap",
          lineDataSymbol: "circle",
          lineDataSymbolSize: Number(e.options?.markerSize ?? 3),
          lineSize: Number(e.options?.lineWidth ?? 2),
          catAxisLineColor: axisColor,
          valAxisLineColor: axisColor,
          valGridLine: { color: gridColor, size: e.options?.showGridlines === false ? 0 : 0.5 },
          ...(e.chartType === "bar"
            ? {
                barDir: e.options?.direction === "bar" ? "bar" : "col",
                barGrouping: "clustered",
                gapSizePct: Math.max(50, Math.round((1 - barThickness) * 400)),
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
        const shapeTypes:Record<string,any>={rect:deck.ShapeType.rect,square:deck.ShapeType.rect,roundRect:deck.ShapeType.roundRect,ellipse:deck.ShapeType.ellipse,circle:deck.ShapeType.ellipse,triangle:deck.ShapeType.triangle,rtTriangle:deck.ShapeType.rtTriangle,diamond:deck.ShapeType.diamond,parallelogram:deck.ShapeType.parallelogram,trapezoid:deck.ShapeType.trapezoid,pentagon:deck.ShapeType.pentagon,hexagon:deck.ShapeType.hexagon,star5:deck.ShapeType.star5,heart:deck.ShapeType.heart,plus:deck.ShapeType.plus,rightArrow:deck.ShapeType.rightArrow,leftRightArrow:deck.ShapeType.leftRightArrow,chevron:deck.ShapeType.chevron,notchedRightArrow:deck.ShapeType.notchedRightArrow,line:deck.ShapeType.line};
        if (!shapeTypes[e.shape??''] && e.shape!=="elbow")
          throw new Error("UNSUPPORTED_SHAPE");
        const exportedLine:any={
          color: color(e.line?.color, e.fill ?? "94A3B8"),
          width: e.line?.width ?? ((e.shape === "line"||e.shape === "elbow") ? 1 : 0),
          transparency:e.line?.transparency??0,
          ...(e.line?.dash === "dash" ? { dashType: "dash" as const } : e.line?.dash === "dot" ? { dashType: "sysDot" as const } : e.line?.dash === "dashDot" ? {dashType:"dashDot" as const}:{}),
          ...(e.line?.beginArrowType&&e.line.beginArrowType!=="none"?{beginArrowType:e.line.beginArrowType as any}:{}),
          ...(e.line?.endArrowType&&e.line.endArrowType!=="none"?{endArrowType:e.line.endArrowType as any}:{}),
        };
        if(e.shape==="elbow"){
          const segment=(a:{x:number;y:number},b:{x:number;y:number},line:any)=>slide.addShape(deck.ShapeType.line,{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y),flipH:a.x>b.x,flipV:a.y>b.y,line});
          const resolvedElbowPoints=e.line?.elbowPoints;
          const begin={x:e.rect.x+(e.line?.flipH?e.rect.w:0),y:e.rect.y+(e.line?.flipV?e.rect.h:0)};
          const end={x:e.rect.x+(e.line?.flipH?0:e.rect.w),y:e.rect.y+(e.line?.flipV?0:e.rect.h)};
          const middleX=(begin.x+end.x)/2+Number(e.line?.elbowOffset??0);
          const points=(resolvedElbowPoints&&resolvedElbowPoints.length>=2?resolvedElbowPoints:[begin,{x:middleX,y:begin.y},{x:middleX,y:end.y},end]).map((point:any)=>({x:point.x/72,y:point.y/72}));
          for(let index=1;index<points.length;index++)segment(points[index-1],points[index],{...exportedLine,...(index>1?{beginArrowType:undefined}:{}),...(index<points.length-1?{endArrowType:undefined}:{})});
          continue;
        }
        const shapeBounds =
          e.shape === "line"
            ? {
                x: Math.min(bounds.x, bounds.x + bounds.w),
                y: Math.min(bounds.y, bounds.y + bounds.h),
                w: Math.abs(bounds.w),
                h: Math.abs(bounds.h),
                flipH: e.line?.flipH ?? bounds.w < 0,
                flipV: e.line?.flipV ?? bounds.h < 0,
              }
            : bounds;
        const shapeType=shapeTypes[e.shape??'rect'];
        const shapeOptions={
            ...shapeBounds,
            fill:
              e.shape === "line" ? undefined : { color: color(e.fill, "2563EB"), transparency:e.fillTransparency??0 },
            line: exportedLine,
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
