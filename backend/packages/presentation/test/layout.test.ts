import { describe, expect, it } from "vitest";
import { chartPoint, wrapText } from "../src/index.ts";

describe("presentation layout helpers", () => {
  it("keeps the established mixed Chinese and Latin wrapping rule", () => {
    expect(wrapText("AB中文", 11, 10)).toEqual(["AB", "中", "文"]);
    expect(wrapText("第一行\nsecond", 100, 10)).toEqual([
      "第一行",
      "second",
    ]);
  });

  it("keeps chart point geometry stable for column and horizontal bars", () => {
    const chart = {
      rect: { x: 20, y: 30, w: 400, h: 300 },
      valueAxis: { min: 0, max: 100, step: 20, title: "" },
      categories: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      series: [
        { id: "s1", name: "S1", values: [25, 50], sourceValues: [] },
        { id: "s2", name: "S2", values: [50, 75], sourceValues: [] },
      ],
      type: "nativeChart" as const,
      chartType: "bar" as const,
    };

    expect(chartPoint(chart as any, 0, 0, 50)).toEqual({ x: 110, y: 164 });
    expect(
      chartPoint(
        { ...chart, options: { direction: "bar" } } as any,
        0,
        0,
        50,
      ),
    ).toEqual({ x: 236, y: 84.5 });
  });
});
