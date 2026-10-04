import React, { useEffect, useState } from "react";
import { fieldLabel } from "./ui";
export function ComponentForm({
  type,
  data,
  initial,
  binding,
  onApply,
}: {
  type: string;
  data: any;
  initial?: any;
  binding?: any;
  onApply: (element: any, binding?: any) => void;
}) {
  const sets = data?.resultSets || [];
  const first = sets.find((r: any) => r.id === binding?.resultSetId) || sets[0];
  const [rsid, RS] = useState(first?.id || ""),
    [fields, F] = useState<string[]>(
      initial?.fields || first?.fields.slice(0, 8).map((f: any) => f.id) || [],
    ),
    [steps, Steps] = useState<string>(
      (initial?.steps || ["准备", "执行", "复核"]).join("\n"),
    ),
    [label, L] = useState(initial?.label || "完成进度"),
    [mode, M] = useState(initial?.bindingRef ? "bound" : "manual"),
    [percent, P] = useState(String((initial?.value ?? 0.5) * 100)),
    [valueField, VF] = useState(
      binding?.roles?.value ||
        first?.fields.find((f: any) => ["integer", "decimal"].includes(f.type))
          ?.id ||
        "",
    ),
    [keyFields, KF] = useState<string[]>(
      initial?.rowKey ? Object.keys(initial.rowKey) : first?.primaryKey || [],
    ),
    [rowIndex, RI] = useState(
      Math.max(
        0,
        first?.rows.findIndex(
          (r: any) =>
            initial?.rowKey &&
            Object.entries(initial.rowKey).every(([k, v]) => r[k] === v),
        ) || 0,
      ),
    ),
    [fontSize, FS] = useState(
      initial?.style?.fontSize ||
        ({ table: 12, process: 14, status: 16 } as any)[type],
    ),
    [error, E] = useState("");
  const rs = sets.find((r: any) => r.id === rsid);
  useEffect(()=>{if(rsid||!sets.length)return;const next=sets[0];RS(next.id);F(next.fields.slice(0,8).map((field:any)=>field.id));VF(next.fields.find((field:any)=>["integer","decimal"].includes(field.type))?.id||"");KF(next.primaryKey||[]);RI(0)},[rsid,sets]);
  function choose(id: string) {
    const next = sets.find((r: any) => r.id === id);
    RS(id);
    F(next?.fields.slice(0, 8).map((f: any) => f.id) || []);
    VF(
      next?.fields.find((f: any) => ["integer", "decimal"].includes(f.type))
        ?.id || "",
    );
    KF(next?.primaryKey || []);
    RI(0);
  }
  function apply() {
    E("");
    try {
      const id = initial?.id || crypto.randomUUID(),
        frame = (
          {
            table: { x: 48, y: 120, w: 600, h: 240 },
            process: { x: 48, y: 120, w: 600, h: 60 },
            status: { x: 48, y: 120, w: 260, h: 70 },
          } as any
        )[type];
      const el = {
        ...initial,
        id,
        type,
        rect: initial?.rect || frame,
        z: initial?.z || 20,
        style: { ...initial?.style, fontSize: Number(fontSize) },
      };
      if (
        !Number.isFinite(Number(fontSize)) ||
        Number(fontSize) < 8 ||
        Number(fontSize) > 80
      )
        throw new Error("组件字号应为8–80");
      let nextBinding: any;
      if (type === "table") {
        if (!rs || rs.rows.length < 1 || rs.rows.length > 12)
          throw new Error("表格需要1–12行，请在数据管理调整结果集");
        if (!fields.length || fields.length > 8)
          throw new Error("请选择1–8个字段");
        el.fields = fields;
        el.bindingRef = initial?.bindingRef || `component-${id}`;
        nextBinding = { resultSetId: rsid, roles: { columns: [...fields] } };
      }
      if (type === "process") {
        const lines = steps
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean);
        if (
          lines.length < 2 ||
          lines.length > 8 ||
          lines.some((x) => x.length > 100)
        )
          throw new Error("流程需2–8个步骤，每步不超过100字");
        el.steps = lines;
      }
      if (type === "status") {
        if (!label.trim() || label.length > 100)
          throw new Error("请填写100字以内的状态名称");
        el.label = label.trim();
        if (mode === "manual") {
          if (
            percent.trim() === "" ||
            !Number.isFinite(Number(percent)) ||
            Number(percent) < 0 ||
            Number(percent) > 100
          )
            throw new Error("人工完成度应为0–100%");
          el.value = Number(percent) / 100;
          delete el.bindingRef;
          delete el.rowKey;
        } else {
          const row = rs?.rows[rowIndex];
          if (!row || !keyFields.length || !valueField)
            throw new Error("请选择数值字段、稳定行键和数据行");
          const rowKey = Object.fromEntries(
            keyFields.map((key) => [key, row[key]]),
          );
          if (
            rs.rows.filter((r: any) =>
              Object.entries(rowKey).every(([k, v]) => r[k] === v),
            ).length !== 1
          )
            throw new Error("所选行键不能唯一定位，请增加行键字段");
          const value = Number(row[valueField]);
          if (
            row[valueField] === null ||
            !Number.isFinite(value) ||
            value < 0 ||
            value > 1
          )
            throw new Error("绑定值须为0–1，百分比请先在数据管理转换");
          el.bindingRef = initial?.bindingRef || `component-${id}`;
          el.rowKey = rowKey;
          delete el.value;
          nextBinding = { resultSetId: rsid, roles: { value: valueField } };
        }
      }
      onApply(el, nextBinding);
    } catch (e: any) {
      E(e.message);
    }
  }
  return (
    <section className="component-form">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {type === "status" && (
        <>
          <label className="field">
            状态名称
            <input value={label} onChange={(e) => L(e.target.value)} />
          </label>
          <label className="field">
            状态数据来源
            <select value={mode} onChange={(e) => M(e.target.value)}>
              <option value="manual">人工设置（显式标记）</option>
              <option value="bound">绑定当前数据</option>
            </select>
          </label>
          {mode === "manual" && (
            <label className="field">
              完成度（%）
              <input
                type="number"
                min="0"
                max="100"
                value={percent}
                onChange={(e) => P(e.target.value)}
              />
            </label>
          )}
        </>
      )}
      {(type === "table" || (type === "status" && mode === "bound")) && (
        <>
          <label className="field">
            组件结果集
            <select value={rsid} onChange={(e) => choose(e.target.value)}>
              {sets.map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.name || r.id} · {r.rows.length}行
                </option>
              ))}
            </select>
          </label>
          {type === "table" ? (
            <fieldset>
              <legend>表格字段（1–8个）</legend>
              {rs?.fields.map((f: any) => (
                <label className="check" key={f.id}>
                  <input
                    type="checkbox"
                    checked={fields.includes(f.id)}
                    onChange={(e) =>
                      F(
                        e.target.checked
                          ? [...fields, f.id]
                          : fields.filter((id) => id !== f.id),
                      )
                    }
                  />
                  {fieldLabel(data, f)}
                </label>
              ))}
            </fieldset>
          ) : (
            <>
              <label className="field">
                进度数值字段
                <select value={valueField} onChange={(e) => VF(e.target.value)}>
                  {rs?.fields
                    .filter((f: any) => ["integer", "decimal"].includes(f.type))
                    .map((f: any) => (
                      <option key={f.id} value={f.id}>
                        {fieldLabel(data, f)}
                      </option>
                    ))}
                </select>
              </label>
              <fieldset>
                <legend>稳定行键</legend>
                {rs?.fields.map((f: any) => (
                  <label className="check" key={f.id}>
                    <input
                      type="checkbox"
                      checked={keyFields.includes(f.id)}
                      onChange={(e) =>
                        KF(
                          e.target.checked
                            ? [...keyFields, f.id]
                            : keyFields.filter((id) => id !== f.id),
                        )
                      }
                    />
                    {fieldLabel(data, f)}
                  </label>
                ))}
              </fieldset>
              <label className="field">
                绑定数据行
                <select
                  value={rowIndex}
                  onChange={(e) => RI(Number(e.target.value))}
                >
                  {rs?.rows.map((row: any, i: number) => (
                    <option key={i} value={i}>
                      {keyFields
                        .map((k) => String(row[k] ?? "空"))
                        .join(" / ") || `第${i + 1}行`}{" "}
                      · {String(row[valueField] ?? "空")}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted">
                按稳定行键追踪，不按行序号绑定。数值须为0–1。
              </p>
            </>
          )}
        </>
      )}
      {type === "process" && (
        <label className="field">
          流程步骤（每行一个）
          <textarea
            rows={6}
            value={steps}
            onChange={(e) => Steps(e.target.value)}
          />
        </label>
      )}
      <label className="field">
        组件字号
        <input
          type="number"
          min="8"
          max="80"
          value={fontSize}
          onChange={(e) => FS(e.target.value)}
        />
      </label>
      <button className="primary" onClick={apply}>
        {initial ? "应用组件修改" : "插入组件"}
      </button>
    </section>
  );
}
