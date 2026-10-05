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
