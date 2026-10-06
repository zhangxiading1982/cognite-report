import { describe, expect, it } from "vitest";
import { applyTableStylePreset, inferTableStylePreset, resolveTableStyle } from "../src/table-style";

describe("presentation table styles", () => {
  it.each([
    ["pnl-table", ["account", "actual", "variance"], "variance"],
    ["raci-matrix-table", ["task", "product", "engineering"], "matrix"],
    ["project-overview-table", ["category", "detail", "owner"], "editorial"],
    ["milestone-plan-table", ["milestone", "owner", "status"], "scorecard"],
    ["metric-scorecard-table", ["metric", "actual", "target", "status"], "trend"],
  ])("maps %s to the appropriate visual language", (id, fields, expected) => {
    expect(inferTableStylePreset(id, fields)).toBe(expected);
  });

  it("upgrades legacy template and copied-document tables while retaining semantic overrides", () => {
    const style = resolveTableStyle("pnl-table", ["account", "actual", "variance"], {
      fill: "DCEAF7",
      bodyFill: "FFFFFF",
      bodyStripeFill: "F8FAFC",
      borderMode: "horizontal",
      line: { color: "D8E1EC", width: 0.6 },
      directionFields: ["variance"],
      negativeColor: "9F1239",
    });
    expect(style.tablePreset).toBe("variance");
    expect(style.fill).toBe("EEF2F6");
    expect(style.lastRowFill).toBe("E9EEF5");
    expect(style.directionFields).toEqual(["variance"]);
    expect(style.negativeColor).toBe("9F1239");
  });

  it("lets an explicit preset replace visual defaults", () => {
    expect(applyTableStylePreset("heatmap")).toMatchObject({
      tablePreset: "heatmap",
      borderMode: "grid",
      categoricalCellStyles: expect.any(Object),
    });
  });
});
