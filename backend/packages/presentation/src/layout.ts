import type { CompiledElement } from "./types";

/** Deterministic approximation shared by validation and SVG rendering. */
export function textWidth(text: string, fontSize: number): number {
  return [...text].reduce(
    (width, character) =>
      width + fontSize * (character.codePointAt(0)! > 255 ? 1 : 0.55),
    0,
  );
}

/** Wraps text without browser font metrics so server and client agree. */
export function wrapText(
  text: string,
  width: number,
  fontSize: number,
): string[] {
  const lines: string[] = [];
  for (const line of text.split("\n")) {
    let output = "";
    let usedWidth = 0;
    for (const character of line) {
      const characterWidth =
        fontSize * (character.codePointAt(0)! > 255 ? 1 : 0.55);
      if (usedWidth + characterWidth > width && output) {
        lines.push(output);
        output = "";
        usedWidth = 0;
      }
      output += character;
      usedWidth += characterWidth;
    }
    lines.push(output);
  }
  return lines;
}

/** Resolves a compiled chart value to the shared 960×540 point coordinate space. */
export function chartPoint(
  chart: CompiledElement,
  categoryIndex: number,
  seriesIndex: number,
  value: number,
) {
  const rect = chart.rect;
  const valueAxis = chart.valueAxis!;
  const categoryCount = chart.categories!.length;
  const xOrigin = rect.x + 48;
  const yOrigin = rect.y + 28;
  const plotWidth = rect.w - 64;
  const plotHeight = rect.h - 88;
  if (chart.options?.direction === "bar" && chart.chartType === "bar")
    return {
      x:
        xOrigin +
        ((value - valueAxis.min) / (valueAxis.max - valueAxis.min)) *
          plotWidth,
      y:
        yOrigin +
        ((categoryIndex +
          (seriesIndex + 0.5) / chart.series!.length) *
          plotHeight) /
          categoryCount,
    };
  return {
    x:
      xOrigin +
      ((categoryIndex +
        (chart.chartType === "line"
          ? 0.5
          : (seriesIndex + 0.5) / chart.series!.length)) *
        plotWidth) /
        categoryCount,
    y:
      yOrigin +
      plotHeight -
      ((value - valueAxis.min) / (valueAxis.max - valueAxis.min)) * plotHeight,
  };
}
