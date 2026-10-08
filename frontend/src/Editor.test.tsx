// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { Editor } from "./Editor";
import { createSlide } from "@slidebi/presentation";
import data from "../../backend/fixtures/monthly-operations.data.json";
async function click(element:HTMLElement,options?:any){await act(async()=>{fireEvent.click(element,options)})}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("removes the duplicate page title and save row when embedded in a document", async () => {
  const s = createSlide(data as any, "budget-comparison");
  vi.stubGlobal(
    "fetch",
    async (url: string) =>
      new Response(JSON.stringify(url.includes("snapshots") ? data : { items: [] })),
  );
  render(
    <Editor
      initial={s}
      templates={[]}
      embedded
      onClose={() => {}}
      onOpen={() => {}}
      onExports={() => {}}
    />,
  );
  expect(screen.queryByLabelText("页面名称")).toBeNull();
  expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
  expect(screen.getByRole("button", { name: "撤销" })).toBeTruthy();
});
it("auto-saves page edits after a short idle period", async () => {
  vi.useFakeTimers();
  try {
    const s:any=createSlide(data as any,"budget-comparison");let saved:any;
    vi.stubGlobal("fetch",async(url:string,init:any={})=>{if(init.method==="PUT"){saved=JSON.parse(init.body);return new Response(JSON.stringify({...saved,revision:2}))}return new Response(JSON.stringify(url.includes("snapshots")?data:{items:[]}))});
    render(<Editor initial={s} templates={[]} onClose={()=>{}} onOpen={()=>{}} onExports={()=>{}}/>);
    fireEvent.change(screen.getByLabelText("页面名称"),{target:{value:"自动保存标题"}});
    await act(async()=>{await vi.advanceTimersByTimeAsync(1100)});
    expect(saved?.title).toBe("自动保存标题");expect(screen.getByText("已保存 · r2")).toBeTruthy();
  } finally {vi.useRealTimers()}
});
it("keeps bound numeric runs when editing surrounding text", async () => {
  const s = createSlide(data as any, "budget-comparison");
  const text = s.elements.find((e: any) =>
    e.runs?.some((r: any) => r.inlineValue),
  )!;
  text.runs = [
    { text: "差异：" },
    {
      inlineValue: {
        bindingId: "main",
        computationId: "delta",
        format: {
          displayDivisor: "10000",
          decimals: 0,
          suffix: "万元",
          percent: false,
        },
      },
    },
  ];
  vi.stubGlobal(
    "fetch",
    async (url: string) =>
      new Response(
        JSON.stringify(url.includes("snapshots") ? data : { items: [] }),
      ),
  );
  render(
    <Editor
      initial={s}
      templates={[]}
      onClose={() => {}}
      onOpen={() => {}}
      onExports={() => {}}
    />,
  );
  await click(screen.getByRole("button", { name: `选择${text.id}` }));
  fireEvent.change(screen.getByLabelText("文字内容"), {
    target: { value: "预算差异：" },
  });
  expect(
    screen.getByText("含绑定数值：仅修改静态文字，数值保持绑定。"),
  ).toBeTruthy();
});
it("marks reviewed conclusions stale immediately after an edit", async () => {
 const s:any=createSlide(data as any,"budget-comparison");s.reviewState.status="reviewed";let saved:any;
 vi.stubGlobal("fetch",async(url:string,init:any={})=>{if(init.method==="PUT"){saved=JSON.parse(init.body);return new Response(JSON.stringify({...saved,revision:saved.revision+1}))}return new Response(JSON.stringify(url.includes("snapshots")?data:{items:[]}))});
 render(<Editor initial={s} templates={[]} onClose={()=>{}} onOpen={()=>{}} onExports={()=>{}}/>);
 fireEvent.change(screen.getByLabelText("页面名称"),{target:{value:"改后的页面"}});await click(screen.getByRole("button",{name:"保存"}));expect(saved.reviewState.status).toBe("needsReview");
});
it("keeps the local draft when a focus check detects newer linked data", async () => {
  const s: any = createSlide(data as any, "budget-comparison");
  s.extensions = {
    dataset: {
      id: "dataset-live",
      name: "持续更新数据",
      version: 1,
      origin: { kind: "manual" },
    },
  };
  let remote = s;
  let reads = 0;
  vi.stubGlobal("fetch", async (url: string) => {
    if (url === `/api/slides/${s.id}`) reads++;
    return new Response(
      JSON.stringify(
        url.includes("snapshots")
          ? data
          : url.endsWith("/lineage")
            ? { dataset: remote.extensions.dataset, dataSpec: data }
            : url === `/api/slides/${s.id}`
              ? remote
              : { items: [] },
      ),
    );
  });
  render(
    <Editor
      initial={s}
      templates={[]}
      onClose={() => {}}
      onOpen={() => {}}
      onExports={() => {}}
    />,
  );
  const { waitFor } = await import("@testing-library/react");
  await waitFor(() => expect(reads).toBeGreaterThan(0));
  fireEvent.change(screen.getByLabelText("页面名称"), {
    target: { value: "本地未保存标题" },
  });
  remote = { ...s, revision: s.revision + 1 };
  fireEvent(window, new Event("focus"));
  await screen.findByText("保存冲突");
  expect((screen.getByLabelText("页面名称") as HTMLInputElement).value).toBe(
    "本地未保存标题",
  );
  expect(screen.getByText("备份本地并加载最新")).toBeTruthy();
});
it("applies one text style edit to text and source footer and undoes the whole batch", async () => {
  const s: any = createSlide(data as any, "budget-comparison");
  const text = s.elements.find((e: any) => e.type === "text");
  const footer = s.elements.find((e: any) => e.type === "sourceFooter");
  text.runs = [{ text: "批量文字对象" }];
  text.style = { ...text.style, fontSize: 12 };
  footer.style = { ...footer.style, fontSize: 20 };
  vi.stubGlobal(
    "fetch",
    async (url: string) =>
      new Response(
        JSON.stringify(url.includes("snapshots") ? data : { items: [] }),
      ),
  );
  render(
    <Editor
      initial={s}
      templates={[]}
      onClose={() => {}}
      onOpen={() => {}}
      onExports={() => {}}
    />,
  );
  await click(screen.getByRole("button", { name: `选择${text.id}` }));
  await click(screen.getByRole("button", { name: `选择${footer.id}` }), {
    shiftKey: true,
  });
  await click(screen.getByText("样式"));
  expect(
    (screen.getByLabelText("字号（pt）") as HTMLInputElement).placeholder,
  ).toBe("混合值");
  fireEvent.change(screen.getByLabelText("字号（pt）"), {
    target: { value: "24" },
  });
  expect((screen.getByLabelText("字号（pt）") as HTMLInputElement).value).toBe(
    "24",
  );
  await click(screen.getByLabelText("撤销"));
  expect(
    (screen.getByLabelText("字号（pt）") as HTMLInputElement).placeholder,
  ).toBe("混合值");
  await click(screen.getByRole("button", { name: `选择${footer.id}` }));
  expect((screen.getByLabelText("字号（pt）") as HTMLInputElement).value).toBe(
    "20",
  );
});
it("edits font, color, size and both text alignments from the text toolbar", async () => {
  const s: any = createSlide(data as any, "budget-comparison");
  const text = s.elements.find((e: any) => e.type === "text");
  text.runs = [{ text: "字体属性对象" }];
  vi.stubGlobal(
    "fetch",
    async (url: string) =>
      new Response(
        JSON.stringify(url.includes("snapshots") ? data : { items: [] }),
      ),
  );
  render(
    <Editor
      initial={s}
      templates={[]}
      onClose={() => {}}
      onOpen={() => {}}
      onExports={() => {}}
    />,
  );
  await click(screen.getByRole("button", { name: `选择${text.id}` }));
  await click(screen.getByText("样式"));
  fireEvent.change(screen.getByLabelText("字体"), {
    target: { value: "Arial" },
  });
  expect((screen.getByLabelText("字体") as HTMLSelectElement).value).toBe(
    "Arial",
  );
  expect(screen.queryByRole("button", { name: "斜体" })).toBeNull();
  expect(document.querySelector('.svg-content')?.innerHTML).toContain('font-family="Arial');
  await click(screen.getByRole("button", { name: "粗体" }));
  expect(screen.getByRole("button", { name: "粗体" }).getAttribute("aria-pressed")).toBe("true");
  expect(document.querySelector('.svg-content')?.innerHTML).toContain('font-weight="bold"');
  fireEvent.change(screen.getByLabelText("水平对齐"), {
    target: { value: "center" },
  });
  fireEvent.change(screen.getByLabelText("垂直对齐"), {
    target: { value: "bottom" },
  });
  expect((screen.getByLabelText("垂直对齐") as HTMLSelectElement).value).toBe(
    "bottom",
  );
  expect(screen.getByText(/目标设备安装/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("工具栏字号"), {target:{value:"26"}});
  fireEvent.change(screen.getByLabelText("工具栏文字颜色"), {target:{value:"#123456"}});
  await click(screen.getByLabelText('打开文字颜色'));
  await click(screen.getByRole('button',{name:'文字颜色 #B91C1C'}));
  await click(screen.getByRole("button", { name: "文字居中" }));
  await click(screen.getByRole("button", { name: "文字底部对齐" }));
  expect((screen.getByLabelText("字号（pt）") as HTMLInputElement).value).toBe("26");
  expect((screen.getByLabelText("文字颜色") as HTMLInputElement).value).toBe("#b91c1c");
});
it("persists batch font changes only on selected text-like elements", async () => {
  const s: any = createSlide(data as any, "budget-comparison");
  const text = s.elements.find((e: any) => e.type === "text"),
    footer = s.elements.find((e: any) => e.type === "sourceFooter"),
    chart = s.elements.find((e: any) => e.type === "chart");
  text.runs = [{ text: "批量保存对象" }];
  const originalChart = structuredClone(chart);
  let saved: any;
  vi.stubGlobal("fetch", async (url: string, init: any = {}) => {
    if (init.method === "PUT") {
      saved = JSON.parse(init.body);
      return new Response(
        JSON.stringify({ ...saved, revision: saved.revision + 1 }),
      );
    }
    return new Response(
      JSON.stringify(url.includes("snapshots") ? data : { items: [] }),
    );
  });
  render(
    <Editor
      initial={s}
      templates={[]}
      onClose={() => {}}
      onOpen={() => {}}
      onExports={() => {}}
    />,
  );
  await click(screen.getByRole("button", { name: `选择${text.id}` }));
  await click(screen.getByRole("button", { name: `选择${footer.id}` }), {
    shiftKey: true,
  });
  await click(screen.getByRole("button", { name: "选择图表" }), {
    shiftKey: true,
  });
  await click(screen.getByText("样式"));
  fireEvent.change(screen.getByLabelText("字体"), {
    target: { value: "Calibri" },
  });
  await click(screen.getByRole("button", { name: "保存" }));
  const { waitFor } = await import("@testing-library/react");
  await waitFor(() => expect(saved).toBeTruthy());
  for (const id of [text.id, footer.id])
    expect(saved.elements.find((el: any) => el.id === id).style).toEqual(
      expect.objectContaining({ fontFace: "Calibri" }),
    );
  expect(saved.elements.find((el: any) => el.id === chart.id)).toEqual(
    originalChart,
  );
});

it("ignores an older data check that completes after a successful local save", async () => {
  const {waitFor, act} = await import("@testing-library/react");
  const s:any=createSlide(data as any,"budget-comparison");
  s.extensions={dataset:{id:"live",name:"数据",version:1,origin:{kind:"manual"}}};
  let release:any, checking=false;
  const pending=new Promise(resolve=>{release=resolve});
  vi.stubGlobal("fetch",async(url:string,init:any={})=>{
    if(init.method==="PUT") return new Response(JSON.stringify({...JSON.parse(init.body),revision:s.revision+1}));
    if(url===`/api/slides/${s.id}`){checking=true;await pending;return new Response(JSON.stringify(s));}
    return new Response(JSON.stringify(url.includes("snapshots")?data:url===`/api/slides/${s.id}`?s:{items:[]}));
  });
  render(<Editor initial={s} templates={[]} onClose={()=>{}} onOpen={()=>{}} onExports={()=>{}}/>);
  await waitFor(()=>expect(checking).toBe(true));
  fireEvent.change(screen.getByLabelText("页面名称"),{target:{value:"已保存的新标题"}});
  await click(screen.getByRole("button",{name:"保存"}));
  await waitFor(()=>expect(screen.getByText(`已保存 · r${s.revision+1}`)).toBeTruthy());
  await act(async()=>{release();await pending});
  expect((screen.getByLabelText("页面名称") as HTMLInputElement).value).toBe("已保存的新标题");
  expect(screen.queryByText("关联数据已更新，页面已采用当前数据，请重新复核。")).toBeNull();
});
it('uses current refresh configuration instead of historical import origin', async () => {
 const {waitFor}=await import('@testing-library/react');
 const s:any=createSlide(data as any,'budget-comparison');
 s.extensions={dataset:{id:'manual-now',version:1,origin:{kind:'biStudio'},refreshMode:'manual'}};
 const calls:string[]=[];
 vi.stubGlobal('fetch',async(url:string)=>{calls.push(url);return new Response(JSON.stringify(url.endsWith('/lineage')?{dataSpec:data}:url.includes('snapshots')?data:s))});
 render(<Editor initial={s} templates={[]} onClose={()=>{}} onOpen={()=>{}} onExports={()=>{}}/>);
 await waitFor(()=>expect(calls.some(url=>url===`/api/slides/${s.id}`)).toBe(true));
 expect(calls.filter(url=>url.endsWith('/refresh'))).toEqual([]);
});
