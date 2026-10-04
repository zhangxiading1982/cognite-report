import { describe, it, expect } from "vitest";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import {
  validateDataSpec,
  createSlide,
  compileSlide,
} from "@slidebi/presentation";
import { writePptx } from "../src/export/pptx";

describe("DataSpec → native PPTX integration", () => {
  it.each(["budget-comparison", "monthly-trend", "revenue-bridge"])(
    "exports %s without semantic errors",
    async (template) => {
      const data = validateDataSpec(
        JSON.parse(
          await readFile(
            new URL(
              "../fixtures/monthly-operations.data.json",
              import.meta.url,
            ),
            "utf8",
          ),
        ),
      );
      expect(data.valid).toBe(true);
      const slide = createSlide(data.data!, template);
      const compiled = compileSlide(slide, data.data!, "draft");
      expect(
        compiled.diagnostics.filter((d) => d.severity === "error"),
      ).toEqual([]);
      const dir = await mkdtemp(path.join(tmpdir(), "slidebi-export-"));
      try {
        const file = path.join(dir, "report.pptx");
        await writePptx(compiled, file, async () => {
          throw Error("Unexpected asset");
        });
        const zip = await JSZip.loadAsync(await readFile(file));
        const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
        expect(xml).toContain("草稿");
        expect(xml).toContain("2026");
        if (template === "revenue-bridge") {
          expect(xml).toContain('prst="rect"');
          expect(xml).not.toContain("<c:chart");
        } else expect(zip.file(/ppt\/charts\/chart\d+.xml$/)).toHaveLength(1);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
});
