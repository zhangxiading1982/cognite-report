import { describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { BUSINESS_TEMPLATES, compileSlide } from "@slidebi/presentation";
import { writeDeckPptx } from "../src/export/pptx";

describe("commercial business template PPTX delivery", () => {
  test("exports every P0/P1 sample as an editable PowerPoint page", async () => {
    const slides = BUSINESS_TEMPLATES.map((template) =>
      compileSlide(template.payload.example.slide, template.payload.example.dataSpec, "final"),
    );
    const dir = await mkdtemp(path.join(tmpdir(), "slidebi-business-templates-"));
    try {
      const output = path.join(dir, "commercial-templates.pptx");
      await writeDeckPptx(slides, output, async () => {
        throw new Error("Business template samples do not require raster assets");
      });

      const zip = await JSZip.loadAsync(await readFile(output));
      const pageFiles = zip.file(/^ppt\/slides\/slide\d+\.xml$/);
      expect(pageFiles).toHaveLength(BUSINESS_TEMPLATES.length);
      const pageXml = await Promise.all(pageFiles.map((file) => file.async("string")));
      BUSINESS_TEMPLATES.forEach((template, index) => {
        expect(pageXml[index]).toContain(template.previewText);
      });
      expect(zip.file(/^ppt\/charts\/chart\d+\.xml$/).length).toBeGreaterThanOrEqual(7);
      expect(pageXml.join("\n")).not.toContain("data:image/");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
