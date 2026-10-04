import React, { useState } from "react";
import { fieldLabel, fieldUnit } from "./ui";
export type Tags = Record<string, string[]>;
export const tagText = (tags: any) =>
  Array.isArray(tags)
    ? tags.join(" · ")
    : Object.entries(tags || {})
        .map(([key, values]) => `${key}：${(values as string[]).join(" / ")}`)
        .join(" · ");
export function TagEditor({
  value,
  onChange,
}: {
  value: Tags;
  onChange: (value: Tags) => void;
}) {
  const [type, T] = useState(""),
    [tag, V] = useState("");
  function add() {
    const key = type.trim(),
      val = tag.trim();
    if (!key || !val) return;
    onChange({ ...value, [key]: [...new Set([...(value[key] || []), val])] });
    V("");
  }
  return (
    <section className="tag-editor">
      <h3>用途与标签</h3>
      <p className="muted">
        用业务域、用途等标签组织图表数据。
      </p>
      <div className="row">
        {["页面数据"].map((use) => (
          <label key={use}>
            <input
              type="checkbox"
              checked={value["用途"]?.includes(use) || false}
              onChange={(e) =>
                onChange({
                  ...value,
                  用途: e.target.checked
                    ? [...new Set([...(value["用途"] || []), use])]
                    : (value["用途"] || []).filter((v) => v !== use),
                })
              }
            />
            {use}
          </label>
        ))}
      </div>
      <div className="tag-values">
        {Object.entries(value).map(([key, values]) =>
          values.map((v) => (
            <span className="tag" key={key + v}>
              {key}：{v}
              <button
                aria-label={`移除 ${key} ${v}`}
                onClick={() => {
                  const next = {
                    ...value,
                    [key]: values.filter((x) => x !== v),
                  };
                  if (!next[key].length) delete next[key];
                  onChange(next);
                }}
              >
                ×
              </button>
            </span>
          )),
        )}
      </div>
      <div className="row">
        <label className="field">
          新标签类型
          <input
            maxLength={30}
            placeholder="例如：业务域"
            value={type}
            onChange={(e) => T(e.target.value)}
          />
        </label>
        <label className="field">
          新标签值
          <input
            maxLength={50}
            placeholder="例如：经营分析"
            value={tag}
            onChange={(e) => V(e.target.value)}
          />
        </label>
        <button disabled={!type.trim() || !tag.trim()} onClick={add}>
          添加标签
        </button>
      </div>
    </section>
  );
}
export function DataFields({
  raw,
  onChange,
}: {
  raw: string;
  onChange: (raw: string) => void;
}) {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return raw ? (
      <p className="callout">请先修正高级JSON语法，再使用表格编辑。</p>
    ) : null;
  }
  if (!data || !Array.isArray(data.resultSets)) return null;
  function edit(fn: (d: any) => void) {
    const d = structuredClone(data);
    fn(d);
    onChange(JSON.stringify(d, null, 2));
  }
  return (
    <section className="data-fields">
      <h3>当前结果 · 可直接编辑</h3>
      <p className="muted">
        数字保持原始精度；留空表示空值。字段名称与图表结果可直接订正。
      </p>
      {data.resultSets.map((rs: any, ri: number) => (
        <details key={rs.id} open={ri === 0}>
          <summary>
            {rs.name || rs.id} · {rs.rows.length} 行
          </summary>
          <label className="field">
            结果集 {rs.id} 名称
            <input
              value={rs.name || ""}
              onChange={(e) =>
                edit((d) => (d.resultSets[ri].name = e.target.value))
              }
            />
          </label>
          <div className="table-scroll editable-table">
            <table>
              <thead>
                <tr>
                  {rs.fields.map((f: any, fi: number) => (
                    <th key={f.id}>
                      <input
                        aria-label={`结果字段 ${f.id} 名称`}
                        value={f.name || ""}
                        placeholder={fieldLabel(data, f)}
                        onChange={(e) =>
                          edit(
                            (d) =>
                              (d.resultSets[ri].fields[fi].name =
                                e.target.value),
                          )
                        }
                      />
                      <small>{f.id}</small><select aria-label={`结果字段 ${f.id} 类型`} value={f.type} onChange={e=>edit(d=>{d.resultSets[ri].fields[fi].type=e.target.value})}>{['string','integer','decimal','boolean','date','datetime'].map(type=><option key={type}>{type}</option>)}</select><input aria-label={`结果字段 ${f.id} 描述`} placeholder="字段说明" value={f.extensions?.description||''} onChange={e=>edit(d=>{d.resultSets[ri].fields[fi].extensions={...d.resultSets[ri].fields[fi].extensions,description:e.target.value}})}/>

                      {['decimal','integer'].includes(f.type)&&<input aria-label={`结果字段 ${f.id} 单位`} placeholder="单位" value={fieldUnit(data,f)} onChange={e=>edit(d=>{const m=d.measures?.find((x:any)=>x.id===f.semanticRef);if(m){m.unit={...m.unit,[m.unit?.currency?'currency':'baseUnit']:e.target.value}}else{d.resultSets[ri].fields[fi].extensions={...d.resultSets[ri].fields[fi].extensions,unit:e.target.value}}})}/>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rs.rows.slice(0, 100).map((row: any, rowIndex: number) => (
                  <tr key={rowIndex}>
                    {rs.fields.map((f: any) => (
                      <td key={f.id}>
                        <input
                          aria-label={`${rs.id} 第${rowIndex + 1}行 ${fieldLabel(data, f)}`}
                          value={
                            row[f.id] === null || row[f.id] === undefined
                              ? ""
                              : String(row[f.id])
                          }
                          onChange={(e) => {
                            const text = e.target.value;
                            edit((d) => {
                              d.resultSets[ri].rows[rowIndex][f.id] =
                                text === ""
                                  ? null
                                  : f.type === "integer" &&
                                      /^-?\d+$/.test(text) &&
                                      Number.isSafeInteger(Number(text))
                                    ? Number(text)
                                    : f.type === "boolean" &&
                                        ["true", "false"].includes(text)
                                      ? text === "true"
                                      : text;
                            });
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rs.rows.length > 100 && (
            <p>表格显示前100行，其余行请在高级JSON中编辑。</p>
          )}
        </details>
      ))}
    </section>
  );
}
