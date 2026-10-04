// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { it, expect, afterEach } from "vitest";
import { TagEditor, DataFields } from "./DataFields";
afterEach(cleanup);
it("supports custom tags without offering template sample association", () => {
  let tags: any = { 用途: ["页面数据"] };
  render(<TagEditor value={tags} onChange={(v) => (tags = v)} />);
  expect(screen.queryByLabelText("模板样本")).toBeNull();
  fireEvent.change(screen.getByLabelText("新标签类型"), {
    target: { value: "部门" },
  });
  fireEvent.change(screen.getByLabelText("新标签值"), {
    target: { value: "财务" },
  });
  fireEvent.click(screen.getByText("添加标签"));
  expect(tags["部门"]).toEqual(["财务"]);
});
it("edits schema names and precise decimal cells without changing source or field ids", () => {
  const d = {
    source: { modelId: "m" },
    semanticSchema: {
      tables: [{ id: "t", name: "表", columns: [{ id: "f", name: "旧字段" }] }],
    },
    resultSets: [
      {
        id: "r",
        name: "结果",
        fields: [{ id: "n", name: "金额", type: "decimal" }],
        rows: [{ n: "12.01" }],
      },
    ],
  };
  let raw = JSON.stringify(d);
  render(<DataFields raw={raw} onChange={(v) => (raw = v)} />);
  fireEvent.change(screen.getByLabelText("结果字段 n 名称"), {
    target: { value: "经营表" },
  });
  expect(JSON.parse(raw).resultSets[0].fields[0].name).toBe("经营表");
  expect(JSON.parse(raw).semanticSchema).toEqual(d.semanticSchema);
  fireEvent.change(screen.getByLabelText("结果字段 n 类型"),{target:{value:"integer"}});
  expect(JSON.parse(raw).resultSets[0].fields[0].type).toBe("integer");
  fireEvent.change(screen.getByLabelText("r 第1行 金额"), {
    target: { value: "9007199254740993.01" },
  });
  expect(JSON.parse(raw).resultSets[0].rows[0].n).toBe("9007199254740993.01");
  expect(JSON.parse(raw).source).toEqual(d.source);
});
it("shows updated schema and measure names through result field references", async () => {
  const { DataView } = await import("./ui");
  render(
    <DataView
      data={{
        semanticSchema: {
          tables: [{ id: "t", columns: [{ id: "column", name: "业务地区" }] }],
        },
        measures: [{ id: "m", name: "本期收入" }],
        resultSets: [
          {
            id: "r",
            fields: [
              { id: "key", semanticRef: "column" },
              { id: "amount", semanticRef: "m" },
            ],
            rows: [],
          },
        ],
      }}
    />,
  );
  expect(screen.getByRole("columnheader", { name: /业务地区/ })).toBeTruthy();
  expect(screen.getByRole("columnheader", { name: /本期收入/ })).toBeTruthy();
});

it('edits display units through result fields while retaining hidden measure calculation',()=>{
 let next:any;render(<DataFields raw={JSON.stringify({measures:[{id:'m',dax:'SUM(T[A])',unit:{baseUnit:'currency',currency:'CNY'}}],resultSets:[{id:'r',fields:[{id:'v',type:'decimal',semanticRef:'m'}],rows:[]}]})} onChange={raw=>next=JSON.parse(raw)}/>);
 fireEvent.change(screen.getByLabelText('结果字段 v 单位'),{target:{value:'USD'}});
 expect(next.measures[0].unit.currency).toBe('USD');expect(next.measures[0].dax).toBe('SUM(T[A])');expect(screen.queryByText('SUM(T[A])')).toBeNull();
});
