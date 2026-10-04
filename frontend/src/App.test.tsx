// @vitest-environment jsdom
import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { App, ExportList } from "./App";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  history.replaceState({}, "", "/contents");
});
it("shows import validation errors without discarding entered JSON", async () => {
  vi.stubGlobal(
    "fetch",
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.includes("templates")
            ? { items: [] }
            : url.includes("validate")
              ? {
                  valid: false,
                  errors: [{ path: "snapshot.id", message: "快照ID必填" }],
                }
              : { items: [] },
        ),
      ),
  );
  history.replaceState({}, "", "/slides/new");
  render(<App />);
  fireEvent.change(screen.getByLabelText("JSON 数据"), {
    target: { value: '{"specVersion":"1.0"}' },
  });
  fireEvent.click(screen.getByText("校验数据"));
  await screen.findByText(/快照ID必填/);
  expect(
    (screen.getByLabelText("JSON 数据") as HTMLTextAreaElement).value,
  ).toContain("specVersion");
});
it("loads actual persisted pages and opens their details", async () => {
  vi.stubGlobal(
    "fetch",
    async (url: string) =>
      new Response(
        JSON.stringify(
          url === "/api/contents"
            ? { items: [{ id: "p1", title: "实际保存页面", revision: 4 }] }
            : { items: [] },
        ),
      ),
  );
  render(<App />);
  await screen.findByText("实际保存页面");
  expect(screen.getByText("0 页")).toBeTruthy();
  expect(screen.getByRole("button", { name: "打开 实际保存页面 缩略图" })).toBeTruthy();
});
it("shows actual measure DAX and query provenance read-only", async () => {
  const { DataView } = await import("./ui");
  render(
    <DataView
      data={{
        measures: [
          {
            id: "revenue",
            name: "收入",
            dax: "SUM(Sales[Net])",
            description: "不含税收入",
            unit: { baseUnit: "元" },
            format: { decimals: 2 },
            dependencies: ["Sales.Net"],
          },
        ],
        queries: [{ id: "q1", text: 'EVALUATE ROW("Revenue", [收入])' }],
        context: { effectiveFilters: [{ field: "year", value: 2026 }] },
      }}
    />,
  );
  expect(screen.getByText("SUM(Sales[Net])")).toBeTruthy();
  expect(screen.getByText("不含税收入")).toBeTruthy();
});

it("downloads PowerPoint with an explicit pptx URL and suggested filename", () => {
  render(
    <ExportList
      jobs={[{ id: "export-1", state: "succeeded", revision: 1 }]}
      onError={() => {}}
    />,
  );
  const link = screen.getByRole("link", { name: "下载 PPTX" });
  expect(link.getAttribute("href")).toBe("/api/export-jobs/export-1/file.pptx");
  expect(link.getAttribute("download")).toBe("slidebi-export-1.pptx");
});
it('searches export history by document name and deletes a record after confirmation',async()=>{const deleted=vi.fn();vi.spyOn(window,'confirm').mockReturnValue(true);vi.stubGlobal('fetch',vi.fn(async(_url:string,init:any={})=>new Response(null,{status:init.method==='DELETE'?204:200})));render(<ExportList jobs={[{id:'e1',title:'经营月报',state:'succeeded',revision:2},{id:'e2',title:'销售周报',state:'succeeded',revision:1}]} onError={()=>{}} onDeleted={deleted}/>);fireEvent.change(screen.getByLabelText('文档名称'),{target:{value:'经营'}});expect(screen.getByText('经营月报')).toBeTruthy();expect(screen.queryByText('销售周报')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'删除导出记录 经营月报'}));await waitFor(()=>expect(deleted).toHaveBeenCalledWith('e1'));expect(fetch).toHaveBeenCalledWith('/api/export-jobs/e1',expect.objectContaining({method:'DELETE'}));});
it("shows resource management without a create-page action on the assets route", async () => {
  history.replaceState({}, "", "/assets");
  vi.stubGlobal(
    "fetch",
    async () => new Response(JSON.stringify({ items: [] })),
  );
  try {
    render(<App />);
    expect(screen.getAllByText("资源库").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "新建页面" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "上传资源" }));
    expect(screen.getByLabelText("上传素材文件")).toBeTruthy();
  } finally {
    history.replaceState({}, "", "/slides");
  }
});

it('uses a single content navigation instead of separate pages and reports',async()=>{
 history.replaceState({},'', '/contents');
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({items:[]})));
 render(<App/>);expect(screen.getByRole('button',{name:'我的文档'})).toBeTruthy();expect(screen.queryByRole('button',{name:'我的页面'})).toBeNull();expect(screen.queryByRole('button',{name:'我的汇报'})).toBeNull();
});

it('clicking the content navigation returns from a document to the list',async()=>{
 history.replaceState({},'','/contents/c1');
 const spec={title:'当前文稿',sections:[{id:'p',title:'正文',order:0}],instances:[],structurePolicy:{cover:false,agenda:false,sectionDividers:false,agendaPageCapacity:8},numbering:{mode:'contentOnly',showTotal:true}};
 vi.stubGlobal('fetch',async(url:string)=>new Response(JSON.stringify(url==='/api/contents/c1'?{id:'c1',revision:1,spec,pages:[]}:url==='/api/contents'?{items:[{id:'c1',title:'当前文稿',revision:1,spec,pages:[]}]}:{items:[]})));
 render(<App/>);await screen.findByLabelText('文稿标题');fireEvent.click(screen.getByRole('button',{name:'我的文档'}));
 await waitFor(()=>expect(screen.queryByLabelText('文稿标题')).toBeNull());expect(screen.getByRole('button',{name:'新建文稿'})).toBeTruthy();
});
it('keeps template library for preview and favorites without creating pages', async () => {
 history.replaceState({},'', '/library');
 vi.stubGlobal('fetch',async(url:string)=>new Response(JSON.stringify(url==='/api/templates'?{items:[{id:'budget-comparison',name:'预算对比',scene:'budgetComparison'}]}:{items:[]})));
 render(<App/>);
 await screen.findByRole('button',{name:'预览 预算对比'});
 expect(screen.queryByRole('button',{name:'使用模板'})).toBeNull();
 expect(screen.getByRole('button',{name:'收藏 预算对比'})).toBeTruthy();
});

it('keeps account controls in the top toolbar and library folders inside the page',async()=>{
 const {AuthGate}=await import('./Auth');
 history.replaceState({},'','/assets');
 vi.stubGlobal('fetch',async(url:string)=>new Response(JSON.stringify(url==='/api/auth/me'?{user:{id:1,username:'marx',displayName:'Marx',role:'admin'}}:url.includes('/folders')?{items:[{id:'f',name:'品牌素材',parentId:null,canEdit:true}]}:{items:[]})));
 render(<AuthGate><App/></AuthGate>);
 const directory=await screen.findByRole('button',{name:'目录 品牌素材'});
 expect(directory.closest('.sidebar')).toBeNull();
 expect(screen.getByRole('button',{name:'用户管理'}).closest('.topbar')).toBeTruthy();
 expect(screen.getByRole('button',{name:'退出登录'}).closest('.topbar')).toBeTruthy();
 expect(document.querySelector('.topbar')?.textContent).toContain('marx');
});

it('collapses global navigation after selecting a module and can expand it again',async()=>{
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({items:[]})));
 render(<App/>);
 expect(screen.getByRole('button',{name:'收起功能导航'}).getAttribute('aria-expanded')).toBe('true');
 fireEvent.click(screen.getByRole('button',{name:'资源库'}));
 await waitFor(()=>expect(document.querySelector('.app')?.classList.contains('navigation-collapsed')).toBe(true));
 expect(screen.getByRole('button',{name:'模板库'}).getAttribute('title')).toBe('模板库');
 fireEvent.click(screen.getByRole('button',{name:'展开功能导航'}));
 expect(document.querySelector('.app')?.classList.contains('navigation-collapsed')).toBe(false);
});

it('shows the selected feature as the top toolbar title',async()=>{
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({items:[]})));
 render(<App/>);
 const title=document.querySelector('.topbar-current');
 expect(title?.textContent).toBe('我的文档');
 expect(title?.closest('.topbar')).toBeTruthy();
});

it('keeps the active data draft when clicking the current navigation item', async () => {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({items:[]})));
  history.replaceState({}, '', '/data');
  render(<App/>);
  fireEvent.click(await screen.findByRole('button',{name:'新增数据集'}));
  fireEvent.change(await screen.findByLabelText('数据集名称'),{target:{value:'未保存草稿'}});
  fireEvent.click(screen.getByRole('button',{name:'数据管理'}));
  await waitFor(()=>expect(document.querySelector('.app.navigation-collapsed')).toBeTruthy());
  expect(screen.queryByRole('dialog',{name:'保存数据修改？'})).toBeNull();
  expect((screen.getByLabelText('数据集名称') as HTMLInputElement).value).toBe('未保存草稿');
  fireEvent.click(screen.getByRole('button',{name:'资源库'}));
  expect(await screen.findByRole('dialog',{name:'保存数据修改？'})).toBeTruthy();
});
