// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { AssetLibrary } from "./AssetLibrary";
import { LibraryNavigationProvider } from "./LibraryNavigation";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("uses raster previews and reuses the chosen asset in editor", async () => {
  const pick = vi.fn();
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              id: "icon",
              name: "增长图标",
              kind: "icon",
              builtin: true,
              url: "/api/assets/icon/file",
              originalMime: "image/svg+xml",
              source: { license: "ISC" },
            },
          ],
        }),
      ),
  );
  render(<AssetLibrary onSelect={pick} />);
  fireEvent.click(await screen.findByRole("button", { name: "插入 增长图标" }));
  expect(pick).toHaveBeenCalledWith(expect.objectContaining({ id: "icon" }));
  expect(screen.getByAltText("增长图标").getAttribute("src")).toBe(
    "/api/assets/icon/file",
  );
  expect(screen.queryByText("归档素材")).toBeNull();
});
it("uploads pasted SVG through the file API without inserting its markup", async () => {
  const fetcher = vi.fn(
    async (_url: string, init: any = {}) =>
      new Response(
        JSON.stringify(
          init.method === "POST"
            ? {
                id: "new-svg",
                name: "趋势标记",
                kind: "icon",
                url: "/api/assets/new-svg/file",
              }
            : { items: [] },
        ),
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<AssetLibrary />);
  fireEvent.click(screen.getByRole("button", {name:"上传资源"}));
  fireEvent.change(screen.getByLabelText("SVG 名称"), {
    target: { value: "趋势标记" },
  });
  fireEvent.change(screen.getByLabelText("SVG 代码"), {
    target: {
      value:
        '<svg xmlns="http://www.w3.org/2000/svg"><path id="user-svg-marker" d="M0 0L10 10"/></svg>',
    },
  });
  fireEvent.click(screen.getByText("校验并上传 SVG"));
  await screen.findByRole("dialog", {name:"趋势标记"});
  const sent = fetcher.mock.calls.find(
    (c: any) => c[1]?.method === "POST",
  )?.[1] as any;
  expect(sent.body).toBeInstanceOf(FormData);
  expect(sent.body.get("file").type).toBe("image/svg+xml");
  expect(document.getElementById("user-svg-marker")).toBeNull();
});
it("invalidates processing previews when parameters change and saves a new copy only after preview", async () => {
  const { ImageProcessing } = await import("./ImageProcessing");
  const saved = vi.fn(),
    fetcher = vi.fn(async (url: string) =>
      url.endsWith("processing-preview")
        ? new Response("png", { headers: { "Content-Type": "image/png" } })
        : new Response(JSON.stringify({ id: "copy", name: "处理副本" })),
    );
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("URL", {
    createObjectURL: () => "blob:preview",
    revokeObjectURL: () => {},
  });
  render(
    <ImageProcessing
      asset={{ id: "original", name: "原图" }}
      onSaved={saved}
    />,
  );
  expect((screen.getByText("保存新副本") as HTMLButtonElement).disabled).toBe(
    true,
  );
  fireEvent.click(screen.getByText("预览处理效果"));
  await screen.findByAltText("底色处理预览");
  fireEvent.change(screen.getByLabelText("底色容差"), {
    target: { value: "40" },
  });
  expect(screen.queryByAltText("底色处理预览")).toBeNull();
  expect((screen.getByText("保存新副本") as HTMLButtonElement).disabled).toBe(
    true,
  );
  fireEvent.click(screen.getByText("预览处理效果"));
  await screen.findByAltText("底色处理预览");
  fireEvent.click(screen.getByText("保存新副本"));
  const { waitFor } = await import("@testing-library/react");
  await waitFor(() =>
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ id: "copy" })),
  );
  expect(
    fetcher.mock.calls.filter((c: any) => c[0].endsWith("processed-copies")),
  ).toHaveLength(1);
});

it("ignores a processing response that arrives after parameter changes", async () => {
  const { ImageProcessing } = await import("./ImageProcessing");
  const { act } = await import("@testing-library/react");
  let resolve: any;
  vi.stubGlobal("fetch", () => new Promise((r) => (resolve = r)));
  vi.stubGlobal("URL", {
    createObjectURL: () => "blob:stale",
    revokeObjectURL: () => {},
  });
  render(
    <ImageProcessing
      asset={{ id: "original", name: "原图" }}
      onSaved={() => {}}
    />,
  );
  fireEvent.click(screen.getByText("预览处理效果"));
  fireEvent.change(screen.getByLabelText("目标底色"), {
    target: { value: "#000000" },
  });
  await act(async () =>
    resolve(new Response("png", { headers: { "Content-Type": "image/png" } })),
  );
  expect(screen.queryByAltText("底色处理预览")).toBeNull();
  expect((screen.getByText("保存新副本") as HTMLButtonElement).disabled).toBe(
    true,
  );
});
it("locks processing parameters while saving a copy", async () => {
  const { ImageProcessing } = await import("./ImageProcessing");
  let resolve: any;
  vi.stubGlobal("fetch", async (url: string) =>
    url.endsWith("processing-preview")
      ? new Response("png", { headers: { "Content-Type": "image/png" } })
      : new Promise((r) => (resolve = r)),
  );
  vi.stubGlobal("URL", {
    createObjectURL: () => "blob:preview",
    revokeObjectURL: () => {},
  });
  render(
    <ImageProcessing
      asset={{ id: "original", name: "原图" }}
      onSaved={() => {}}
    />,
  );
  fireEvent.click(screen.getByText("预览处理效果"));
  await screen.findByAltText("底色处理预览");
  fireEvent.click(screen.getByText("保存新副本"));
  expect(screen.getByLabelText("底色容差").closest("fieldset")?.disabled).toBe(
    true,
  );
  expect((screen.getByLabelText("副本名称") as HTMLInputElement).disabled).toBe(
    true,
  );
  const { act } = await import("@testing-library/react");
  await act(async () => resolve(new Response(JSON.stringify({ id: "copy" }))));
});
it('public non-owner resources have preview but no mutation controls and search only matches names',async()=>{vi.stubGlobal('fetch',async(url:string)=>new Response(JSON.stringify({items:url.includes('/folders')?[]:[{id:'shared',name:'业务增长',tags:['财务'],canEdit:false,visibility:'public',kind:'icon'}]})));render(<AssetLibrary/>);await screen.findByRole('button',{name:'预览 业务增长'});expect(screen.queryByRole('button',{name:'编辑 业务增长'})).toBeNull();expect(screen.queryByRole('button',{name:'删除 业务增长'})).toBeNull();fireEvent.change(screen.getByLabelText('搜索图片'),{target:{value:'财务'}});expect(screen.queryByRole('button',{name:'预览 业务增长'})).toBeNull()});

it('keeps asset cards minimal and viewer preview free of owner processing controls',async()=>{vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({items:[{id:'v',name:'矢量素材',kind:'vector',canEdit:false,visibility:'public',source:{license:'test'}}]})));render(<AssetLibrary/>);fireEvent.click(await screen.findByRole('button',{name:'预览 矢量素材'}));expect(screen.getByRole('dialog',{name:'矢量素材'})).toBeTruthy();expect(screen.queryByText('来源与授权')).toBeNull();expect(screen.queryByText('保存新副本')).toBeNull();expect(screen.queryByText('共享资源')).toBeNull();});
it('automatically previews recolor and offers a PNG download without changing original',async()=>{const {ImageProcessing}=await import('./ImageProcessing');const fetcher=vi.fn(async(_url:string,_init:any)=>new Response('png',{headers:{'Content-Type':'image/png'}}));vi.stubGlobal('fetch',fetcher);vi.stubGlobal('URL',{createObjectURL:()=> 'blob:color',revokeObjectURL:()=>{}});render(<ImageProcessing asset={{id:'v',name:'矢量',kind:'vector'}} onSaved={()=>{}}/>);fireEvent.change(screen.getByLabelText('处理方式'),{target:{value:'recolor'}});await screen.findByRole('link',{name:'下载 PNG'});expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body)).toEqual({operation:'recolor',color:'#2563eb'});expect(fetcher.mock.calls.every(c=>c[0].endsWith('processing-preview'))).toBe(true);});
it('owner can toggle visibility and deletion requires confirmation',async()=>{const asset={id:'mine',name:'我的素材',kind:'image',canEdit:true,visibility:'private'};const fetcher=vi.fn(async(url:string,init:any={})=>new Response(JSON.stringify(init.method==='PATCH'?{...asset,...JSON.parse(init.body)}:{items:url.includes('/folders')?[]:[asset]})));vi.stubGlobal('fetch',fetcher);render(<AssetLibrary/>);fireEvent.click(await screen.findByRole('button',{name:'预览 我的素材'}));fireEvent.click(screen.getByRole('button',{name:'可见性：私有'}));await screen.findByRole('button',{name:'可见性：公开'});expect(fetcher.mock.calls.find(c=>c[1]?.method==='PATCH')?.[1].body).toBe(JSON.stringify({visibility:'public'}));fireEvent.click(screen.getByRole('button',{name:'删除 我的素材'}));expect(fetcher.mock.calls.some(c=>c[0].endsWith('/archive'))).toBe(false);fireEvent.click(screen.getByRole('button',{name:'确认删除'}));const{waitFor}=await import('@testing-library/react');await waitFor(()=>expect(fetcher.mock.calls.some(c=>c[0].endsWith('/archive'))).toBe(true));});

it('puts resource type, search, upload and directory management in one feature toolbar',async()=>{
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({items:[]})));
 render(<LibraryNavigationProvider kind="assets"><AssetLibrary/></LibraryNavigationProvider>);
 const toolbar=document.querySelector('.library-toolbar')!;
 expect(screen.getByRole('button',{name:'全部'}).closest('.library-toolbar')).toBe(toolbar);
 expect(screen.getByLabelText('搜索图片').closest('.library-toolbar')).toBe(toolbar);
 expect(screen.getByRole('button',{name:'上传资源'}).closest('.library-toolbar')).toBe(toolbar);
 expect(screen.getByRole('button',{name:'管理目录'}).closest('.library-toolbar')).toBe(toolbar);
 expect(document.querySelector('.asset-filterbar')).toBeNull();
});
