// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { it, expect, vi, afterEach } from "vitest";
import { ComponentForm } from "./ComponentForm";
afterEach(cleanup);
const data = {
  resultSets: [
    {
      id: "r",
      name: "完成情况",
      primaryKey: ["id"],
      fields: [
        { id: "id", name: "项目", type: "string" },
        { id: "rate", name: "完成率", type: "decimal" },
      ],
      rows: [{ id: "A", rate: "0.5" }],
    },
  ],
};
it("creates a table with a dedicated binding and chosen fields", () => {
  const apply = vi.fn();
  render(<ComponentForm type="table" data={data} onApply={apply} />);
  fireEvent.click(screen.getByText("插入组件"));
  expect(apply).toHaveBeenCalledWith(
    expect.objectContaining({ type: "table", fields: ["id", "rate"] }),
    expect.objectContaining({ resultSetId: "r" }),
  );
  expect(apply.mock.calls[0][0].bindingRef).not.toBe("main");
});
it("builds data-linked status from an explicit stable row key", () => {
  const apply = vi.fn();
  render(<ComponentForm type="status" data={data} onApply={apply} />);
  fireEvent.change(screen.getByLabelText("状态数据来源"), {
    target: { value: "bound" },
  });
  fireEvent.click(screen.getByText("插入组件"));
  expect(apply).toHaveBeenCalledWith(
    expect.objectContaining({
      rowKey: { id: "A" },
      bindingRef: expect.any(String),
    }),
    expect.objectContaining({ roles: { value: "rate" } }),
  );
});
