import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import example from "../fixtures/budget.export.json";
import { writePptx } from "../src/export/pptx";
const budget = { ...example, elements: example.slides[0].elements };
async function generate(input: unknown) {
  const dir = await mkdtemp(join(tmpdir(), "slidebi-pptx-"));
  try {
    await writePptx(input as never, join(dir, "report.pptx"), async () => {
      throw new Error("Missing asset");
    });
    return await JSZip.loadAsync(await readFile(join(dir, "report.pptx")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
describe("editable single-slide PowerPoint export", () => {
  it("stores display-unit numbers in a native chart and its editable workbook", async () => {
    const zip = await generate(budget);
    const xml = await zip
      .file(/ppt\/charts\/chart\d+\.xml$/)[0]
      .async("string");
    expect(xml).toContain("<c:barChart>");
    expect(xml).toContain("<c:v>1200</c:v>");
    expect(xml).not.toContain("<c:v>12000000</c:v>");
    expect(xml).toContain("万元");
    const workbook = zip.file(/ppt\/embeddings\/.*xlsx/)[0];
    expect(workbook).toBeDefined();
    const xlsx = await JSZip.loadAsync(await workbook.async("nodebuffer"));
    const sheet = await xlsx.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(sheet).toContain("<v>1200</v>");
    expect(sheet).not.toContain("<v>12000000</v>");
    const slide = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(slide).toContain("预算差异：100万元");
    expect(slide).toContain("草稿");
    expect(zip.file(/ppt\/slides\/slide\d+\.xml$/)).toHaveLength(1);
  });
  it("keeps missing line values as gaps instead of reporting zeros", async () => {
    const input = structuredClone(budget);
    const chart = input.elements.find((e) => e.type === "nativeChart")! as any;
    chart.chartType = "line";
    chart.series[0].values = [1200, null, 1100];
    const zip = await generate(input);
    const xml = await zip
      .file(/ppt\/charts\/chart\d+\.xml$/)[0]
      .async("string");
    expect(xml).toContain("<c:lineChart>");
    expect(xml).toContain('<c:dispBlanksAs val="gap"');
    const firstSeries = xml.split("<c:ser>")[1].split("</c:ser>")[0];
    expect(firstSeries).not.toMatch(/<c:pt idx="1"><c:v>0<\/c:v>/);
  });
  it("writes waterfall rectangles and connecting lines as editable shapes", async () => {
    const input = {
      ...budget,
      elements: [
        {
          id: "bar",
          type: "shape",
          shape: "rect",
          rect: { x: 24, y: 108, w: 100, h: 200 },
          fill: "2563EB",
        },
        {
          id: "connector",
          type: "shape",
          shape: "line",
          rect: { x: 124, y: 108, w: 40, h: 0 },
          line: { color: "94A3B8", width: 1 },
        },
        {
          id: "label",
          type: "text",
          rect: { x: 24, y: 80, w: 100, h: 28 },
          text: "2,800万元",
          fontSize: 14,
          color: "1F2937",
        },
      ],
    };
    const zip = await generate(input);
    const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(xml).toContain('prst="rect"');
    expect(xml).toContain('prst="line"');
    expect(xml).toContain("2,800万元");
    expect(xml).not.toContain("<p:pic>");
  });
  it("writes rounded rectangles and ellipses as editable native shapes", async () => {
    const zip = await generate({...budget,elements:[
      {id:"round",type:"shape",shape:"roundRect",rect:{x:24,y:40,w:120,h:70},fill:"DDEEFF",line:{color:"123456",width:2}},
      {id:"circle",type:"shape",shape:"ellipse",rect:{x:170,y:40,w:70,h:70},fill:"FFF7ED",line:{color:"AABBCC",width:1}},
    ]});
    const xml=await zip.file("ppt/slides/slide1.xml")!.async("string");expect(xml).toContain('prst="roundRect"');expect(xml).toContain('prst="ellipse"');expect(xml).toContain('123456');
  });
  it('exports text-box fill, transparency, dashed borders and shape text as editable PowerPoint objects',async()=>{const zip=await generate({...budget,elements:[{id:'textbox',type:'text',rect:{x:30,y:30,w:240,h:70},text:'有底色文本框',fontSize:18,fill:'#FFF4CC',fillTransparency:35,line:{color:'#B45309',width:2,dash:'dash',transparency:25}},{id:'shape',type:'shape',shape:'roundRect',rect:{x:300,y:30,w:240,h:100},fill:'#DCEAE8',line:{color:'#155E75',width:3,dash:'dash'},text:'形状内文字',fontSize:18,fontFace:'SimHei',color:'#123456',bold:true,align:'center',valign:'middle'}]});const xml=await zip.file('ppt/slides/slide1.xml')!.async('string');expect(xml).toContain('有底色文本框');expect(xml).toContain('形状内文字');expect(xml).toContain('FFF4CC');expect(xml).toContain('B45309');expect(xml).toContain('155E75');expect(xml).toContain('<a:alpha val="65000"/>');expect(xml).toContain('<a:alpha val="75000"/>');expect(xml).toContain('<a:prstDash val="dash"/>');expect(xml).not.toContain('<p:pic>');});
  it('exports triangle and diamond text as bold editable PowerPoint shapes',async()=>{const zip=await generate({...budget,elements:[{id:'triangle',type:'shape',shape:'triangle',rect:{x:30,y:30,w:160,h:100},fill:'#DCEAE8',text:'三角形',fontFace:'SimHei',fontSize:18,bold:true},{id:'diamond',type:'shape',shape:'diamond',rect:{x:220,y:30,w:160,h:100},fill:'#DDEBF7',text:'菱形',fontFace:'SimHei',fontSize:18,bold:true}]});const xml=await zip.file('ppt/slides/slide1.xml')!.async('string');expect(xml).toContain('prst="triangle"');expect(xml).toContain('prst="diamond"');expect(xml).toContain('b="1"');expect(xml).not.toContain('<p:pic>')});
  it('exports common shapes and adjusted elbow connectors as editable PowerPoint geometry',async()=>{const zip=await generate({...budget,elements:[{id:'star',type:'shape',shape:'star5',rect:{x:30,y:30,w:120,h:100},fill:'#DCEAE8',text:'重点'},{id:'arrow',type:'shape',shape:'rightArrow',rect:{x:180,y:30,w:160,h:80},fill:'#DDEBF7',text:'下一步'},{id:'elbow',type:'shape',shape:'elbow',rect:{x:380,y:30,w:180,h:100},line:{color:'#155E75',width:2,elbowOffset:36,beginArrowType:'none',endArrowType:'triangle'}}]});const xml=await zip.file('ppt/slides/slide1.xml')!.async('string');expect(xml).toContain('prst="star5"');expect(xml).toContain('prst="rightArrow"');expect(xml).toContain('tailEnd type="triangle"');expect((xml.match(/prst="line"/g)||[]).length).toBeGreaterThanOrEqual(3);expect(xml).toContain('x="6426200"');expect(xml).not.toContain('<p:pic>')});
  it("refuses error diagnostics and unsupported objects instead of silently omitting them", async () => {
    await expect(
      generate({
        ...budget,
        diagnostics: [
          { severity: "error", code: "INVALID_BINDING", message: "missing" },
        ],
      }),
    ).rejects.toThrow();
    await expect(
      generate({
        ...budget,
        elements: [{ type: "unknown", rect: { x: 0, y: 0, w: 100, h: 100 } }],
      }),
    ).rejects.toThrow();
  });
});

it("preserves selected text styling and explicit chart plot geometry", async () => {
  const input = structuredClone(budget) as any;
  input.elements[0].color = "#AABBCC";
  input.elements[0].italic = true;
  input.elements[0].bold = true;
  input.elements.find(
    (e: any) => e.type === "nativeChart",
  ).options.plotAreaLayout = { x: 0.1, y: 0.1, w: 0.8, h: 0.7 };
  const zip = await generate(input);
  const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
  expect(xml).toContain('val="AABBCC"');
  expect(xml).toContain('i="1"');
  const chart = await zip.file(/ppt\/charts\/chart\d+.xml$/)[0].async("string");
  expect(chart).toContain("<c:manualLayout>");
  expect(chart).toContain('<c:w val="0.8"');
});

it("keeps a wide image proportional in contain mode and crops cover mode", async () => {
  const sharp = (await import("sharp")).default;
  const dir = await mkdtemp(join(tmpdir(), "slidebi-image-test-"));
  try {
    const asset = join(dir, "image.png");
    await sharp({
      create: { width: 200, height: 100, channels: 3, background: "#336699" },
    })
      .png()
      .toFile(asset);
    for (const fit of ["contain", "cover"]) {
      const file = join(dir, `${fit}.pptx`);
      await writePptx(
        {
          ...budget,
          elements: [
            {
              id: "image",
              type: "image",
              assetId: "a",
              fit,
              rect: { x: 72, y: 72, w: 144, h: 144 },
            },
          ],
        } as never,
        file,
        async () => asset,
      );
      const zip = await JSZip.loadAsync(await readFile(file));
      const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
      if (fit === "contain") expect(xml).toContain('cx="1828800" cy="914400"');
      else expect(xml).toMatch(/<a:srcRect[^>]+l="25000"[^>]+r="25000"/);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("normalizes reverse icon strokes to nonnegative OOXML extents", async () => {
  const input = {
    ...budget,
    elements: [
      {
        id: "stroke",
        type: "shape",
        shape: "line",
        rect: { x: 120, y: 100, w: -30, h: 40 },
        line: { color: "2563EB", width: 2 },
      },
    ],
  };
  const zip = await generate(input);
  const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
  expect(xml).not.toMatch(/\b(?:cx|cy)="-\d/);
  expect(xml).toContain('flipH="1"');
});

it("uses top-to-bottom category order for horizontal charts like the preview", async () => {
  const input = structuredClone(budget) as any;
  input.elements.find((e: any) => e.type === "nativeChart").options.direction =
    "bar";
  const zip = await generate(input);
  const xml = await zip.file(/ppt\/charts\/chart\d+.xml$/)[0].async("string");
  const categoryAxis = xml.split("<c:catAx>")[1].split("</c:catAx>")[0];
  expect(categoryAxis).toContain('<c:orientation val="maxMin"');
  expect(xml.split("<c:valAx>")[1].split("</c:valAx>")[0]).toContain(
    '<c:tickLblPos val="low"',
  );
});
