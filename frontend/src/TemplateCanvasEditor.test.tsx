// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { BUSINESS_TEMPLATES, createSlide } from "@slidebi/presentation";
import data from "../../../prompt/sd/examples/monthly-operations.data.json";
import { TemplateCanvasEditor } from "./TemplateCanvasEditor";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("template page editing reuses the full document workspace and saves back to the draft", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [] }))));
  const change = vi.fn(), close = vi.fn();
  const slide: any = createSlide(data as any, "budget-comparison");
  render(<TemplateCanvasEditor slide={slide} dataSpec={data} onChange={change} onClose={close} />);

  expect(document.querySelector(".editor-fullscreen")).toBeTruthy();
  expect(screen.getByRole("button", { name: "文本框" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "形状" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "图表" })).toBeTruthy();
  expect(screen.getByRole("complementary", { name: "页面属性" })).toBeTruthy();

  const title = slide.elements.find((element: any) => element.type === "text");
  fireEvent.click(screen.getByRole("button", { name: `选择${title.id}` }));
  fireEvent.change(await screen.findByLabelText("文字内容"), { target: { value: "模板页面新标题" } });
  fireEvent.click(screen.getByRole("button", { name: "完成模板页面编辑" }));

  await waitFor(() => expect(change).toHaveBeenCalled());
  expect(change.mock.calls.at(-1)![0].elements.find((element: any) => element.id === title.id).runs[0].text).toBe("模板页面新标题");
  expect(close).toHaveBeenCalledOnce();
});

test("decision trees expose horizontal and vertical data-driven expansion in the shared property panel", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [] }))));
  const template = BUSINESS_TEMPLATES.find(item => item.id === "decision-tree")!;
  const slide = structuredClone(template.payload.example.slide), change = vi.fn();
  render(<TemplateCanvasEditor slide={slide} dataSpec={template.payload.example.dataSpec} onChange={change} onClose={() => {}} />);

  fireEvent.click(screen.getByRole("button", { name: "选择decision-tree-view" }));
  const direction = await screen.findByLabelText("决策树展开方向");
  expect((direction as HTMLSelectElement).value).toBe("horizontal");
  fireEvent.change(direction, { target: { value: "vertical" } });
  fireEvent.click(screen.getByRole("button", { name: "完成模板页面编辑" }));

  await waitFor(() => expect(change).toHaveBeenCalled());
  expect(change.mock.calls.at(-1)![0].elements.find((element: any) => element.id === "decision-tree-view").style.orientation).toBe("vertical");
});

test("a template chart opens its bound sample table and edits the template Data Spec", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [] }))));
  const template = BUSINESS_TEMPLATES.find(item => item.id === "chart-insights")!;
  const slide = structuredClone(template.payload.example.slide);
  const dataSpec = structuredClone(template.payload.example.dataSpec);
  const chart = slide.elements.find((element: any) => element.type === "chart")!;
  const dataChange = vi.fn();
  render(<TemplateCanvasEditor slide={slide} dataSpec={dataSpec} onChange={() => {}} onDataChange={dataChange} onClose={() => {}} />);

  fireEvent.click(screen.getByRole("button", { name: "选择图表" }));
  expect(await screen.findByRole("heading", { name: "模板数据" })).toBeTruthy();
  const result = dataSpec.resultSets.find((item: any) => item.id === slide.bindings[chart.bindingRef!].resultSetId)!;
  const field = result.fields[1];
  const input = screen.getByLabelText(`${result.id} 第1行 ${field.name}`);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "321" } });

  await waitFor(() => expect(dataChange).toHaveBeenCalled());
  expect(dataChange.mock.calls.at(-1)![0].resultSets.find((item: any) => item.id === result.id).rows[0][field.id]).toBe("321");
});

test("the organization chart edits and expands from its bound template data", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [] }))));
  const template = BUSINESS_TEMPLATES.find(item => item.id === "org-chart")!;
  const slide = structuredClone(template.payload.example.slide);
  const dataSpec = structuredClone(template.payload.example.dataSpec);
  const dataChange = vi.fn();
  render(<TemplateCanvasEditor slide={slide} dataSpec={dataSpec} onChange={() => {}} onDataChange={dataChange} onClose={() => {}} />);

  fireEvent.click(screen.getByRole("button", { name: "选择org-chart-view" }));
  const dataTab=screen.getByRole("button", { name: "数据" }) as HTMLButtonElement;
  await waitFor(()=>expect(dataTab.disabled).toBe(false));
  fireEvent.click(dataTab);
  expect(await screen.findByRole("heading", { name: "模板数据" })).toBeTruthy();
  expect((screen.getByRole("textbox", { name: "数据表名称" }) as HTMLInputElement).value).toBe("组织结构");
  fireEvent.click(screen.getByRole("button", { name: "新增数据行" }));

  await waitFor(() => expect(dataChange).toHaveBeenCalled());
  const rows = dataChange.mock.calls.at(-1)![0].resultSets[0].rows;
  expect(rows).toHaveLength(dataSpec.resultSets[0].rows.length + 1);
  expect(rows.at(-1)).toMatchObject({ name: "新节点", parentId: "committee", title: "待补充" });
  await waitFor(() => expect(document.querySelector(".canvas")?.textContent).toContain("新节点"));
});
