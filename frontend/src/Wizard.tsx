import {PHASE2_TEMPLATES} from "@slidebi/presentation";
import {initialRoles,eligibleFields} from "./bindings";
import React, { useState, useEffect } from "react";
import { createSlide } from "@slidebi/presentation";
import { api, post, Template } from "./api";
import { Modal, Mini, fieldLabel } from "./ui";
export function Wizard({
  templates,
  onClose,
  onCreated,
  initialTemplate,
}: {
  templates: Template[];
  onClose: () => void;
  onCreated: (s: any) => void;
  initialTemplate?: string;
}) {
  const [step, S] = useState(1),
    [raw, R] = useState(""),
    [data, D] = useState<any>(),
    [errors, E] = useState<any[]>([]),
    [busy, B] = useState(false),
    [tid, T] = useState(initialTemplate || "budget-comparison"),
    [binding, Bind] = useState<any>(),
    [title, Title] = useState(""),
    [file, F] = useState(""),
    [datasets, Ds] = useState<any[]>([]),
    [datasetId, Did] = useState("");
  useEffect(() => {
    api("/datasets")
      .then((r) =>
        Ds(
          r.items.filter(
            (d: any) => !d.tags || d.tags?.["用途"]?.includes("页面数据"),
          ),
        ),
      )
      .catch(() => {});
  }, []);
  async function validate(text = raw) {
    B(true);
    E([]);
    try {
      Did("");
      const parsed = JSON.parse(text);
      const v = await post("/data-specs/validate", parsed);
      if (v.valid) {
        D(v.data || parsed);
      } else {
        D(undefined);
        E(v.errors || v.diagnostics || [{ message: "数据校验未通过" }]);
      }
    } catch (e: any) {
      E([{ message: e.message }]);
      D(undefined);
    } finally {
      B(false);
    }
  }
  async function sample() {
    B(true);
    try {
      const d = await api("/fixtures/monthly-operations");
      const t = JSON.stringify(d, null, 2);
      R(t);
      F("monthly-operations.data.json");
      await validate(t);
    } catch (e: any) {
      E([{ message: e.message }]);
    } finally {
      B(false);
    }
  }
  function bindTemplate() {
    const t = templates.find((x) => x.id === tid);
    const base = t?.chartType && t.bindingSchema ? (PHASE2_TEMPLATES.find(x=>x.chartType===t.chartType)?.id ?? tid) :
      (
        {
          budgetComparison: "budget-comparison",
          monthlyTrend: "monthly-trend",
          revenueBridge: "revenue-bridge",
        } as any
      )[t?.scene || ""] || tid;
    try {
      const s = createSlide(data, base);
      Bind(s.bindings);
      Title(s.title);
      S(3);
    } catch {
      const rs = data.resultSets[0];
      const numeric = rs.fields.filter((f: any) =>
        ["decimal", "integer"].includes(f.type),
      );
      const category = rs.primaryKey?.[0] || rs.fields[0]?.id || "";
      const roles = t?.bindingSchema ? initialRoles(rs,t.bindingSchema.main.roles) :
        base === "revenue-bridge"
          ? {
              stepKey: category,
              label: category,
              role: "",
              value: numeric[0]?.id || "",
              sort: "",
            }
          : {
              categoryKey: category,
              categoryLabel: category,
              series: numeric
                .slice(0, base === "monthly-trend" ? 1 : 2)
                .map((f: any) => f.id),
            };
      Bind({ main: { resultSetId: rs.id, roles } });
      Title(t?.name || "业务页面");
      S(3);
      E([{ message: "未能唯一推荐绑定，请选择结果集并逐项确认字段映射。" }]);
    }
  }
  const roleSchema=templates.find(t=>t.id===tid)?.bindingSchema?.main.roles;
  const main = binding?.main;
  const result = data?.resultSets?.find((s: any) => s.id === main?.resultSetId);
  const fields = result?.fields || [];
  const roles = main
    ? Object.entries(main.roles).flatMap(([key, value]) =>
        Array.isArray(value)
          ? value.map((v, i) => ({ key, index: i, value: v }))
          : [{ key, index: -1, value }],
      )
    : [];
  return (
    <Modal title="新建业务页面" onClose={onClose} wide>
      <div className="steps">
        {["导入数据", "选择业务模板", "确认字段绑定"].map((x, i) => (
          <span className={step === i + 1 ? "active" : ""} key={x}>
            {i + 1}　{x}
          </span>
        ))}
      </div>
      {errors.length > 0 && (
        <div className="error" role="alert">
          {errors.map((e, i) => (
            <p key={i}>
              {e.path} {e.message}
            </p>
          ))}
        </div>
      )}
      {step === 1 ? (
        <>
          <label className="field">
            使用已有数据集
            <select
              value={datasetId}
              onChange={async (e) => {
                Did(e.target.value);
                D(undefined);
                if (e.target.value) {
                  try {
                    const d = await api(`/datasets/${e.target.value}`);
                    D(d.dataSpec);
                    R(JSON.stringify(d.dataSpec, null, 2));
                  } catch (e: any) {
                    E([{ message: e.message }]);
                  }
                }
              }}
            >
              <option value="">选择数据集，或导入新数据</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · 当前数据
                </option>
              ))}
            </select>
          </label>
          <div className="drop">
            <h3>把分析结果，变成下一页汇报</h3>
            <p>导入 DataSpec JSON，保留指标口径与数据来源</p>
            <label className="button">
              选择 JSON 文件
              <input
                type="file"
                accept=".json,application/json"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  F(f.name);
                  if (f.size > 10 * 1024 * 1024) {
                    E([{ message: "文件超过 10 MiB，请缩小数据范围" }]);
                    D(undefined);
                    return;
                  }
                  const t = await f.text();
                  R(t);
                  await validate(t);
                }}
              />
            </label>
            <button onClick={sample} disabled={busy}>
              使用示例数据
            </button>
            <p>{file}</p>
          </div>
          <label className="field">
            JSON 数据
            <textarea
              value={raw}
              onChange={(e) => {
                R(e.target.value);
                D(undefined);
              }}
              rows={5}
            />
          </label>
          <button disabled={busy || !raw} onClick={() => validate()}>
            校验数据
          </button>
          {data && (
            <div className="callout success">
              校验通过 · {data.source?.modelId} · {data.resultSets?.length}{" "}
              个结果集
              <p>数据截至 {data.snapshot?.dataAsOf || "未提供"} · 当前数据</p>
            </div>
          )}
          <footer>
            <button onClick={onClose}>取消</button>
            <button
              className="primary"
              disabled={!data || busy}
              onClick={() => S(2)}
            >
              下一步：选择模板 →
            </button>
          </footer>
        </>
      ) : step === 2 ? (
        <>
          <p className="muted">
            选择要回答的业务问题。模板保持原始指标含义，提供合适的表达方式。
          </p>
          <div className="template-grid">
            {templates.map((t, i) => (
              <button
                key={t.id}
                className={`template-card ${tid === t.id ? "chosen" : ""}`}
                onClick={() => T(t.id)}
              >
                <Mini kind={i % 3} />
                <h3>{t.name}</h3>
                <p>
                  {t.id === "revenue-bridge"
                    ? "图形与文字可编辑"
                    : "图表数据可编辑"}
                </p>
              </button>
            ))}
          </div>
          <footer>
            <button onClick={() => S(1)}>上一步</button>
            <button className="primary" onClick={bindTemplate}>
              下一步：确认绑定 →
            </button>
          </footer>
        </>
      ) : (
        <>
          <label className="field">
            页面名称
            <input value={title} onChange={(e) => Title(e.target.value)} />
          </label>
          <div className="two">
            <div>
              <h3>数据预览 · 前20行</h3>
              <label className="field">
                结果集
                <select
                  value={main?.resultSetId}
                  onChange={(e) =>
                    Bind({
                      ...binding,
                      main: { ...main, resultSetId: e.target.value, ...(roleSchema ? {roles:initialRoles(data.resultSets.find((r:any)=>r.id===e.target.value),roleSchema)} : {}) },
                    })
                  }
                >
                  {data.resultSets.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {r.name || r.id}
                    </option>
                  ))}
                </select>
              </label>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {fields.map((f: any) => (
                        <th key={f.id}>{fieldLabel(data, f)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result?.rows?.slice(0, 20).map((row: any, i: number) => (
                      <tr key={i}>
                        {fields.map((f: any) => (
                          <td key={f.id}>{String(row[f.id] ?? "—")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h3>角色映射</h3>
              {roleSchema && Object.entries(roleSchema).filter(([,rule])=>rule.multiple && (rule.max??1)>1).map(([key,rule])=><label className="field" key={key}>{rule.label}数量<select value={main?.roles[key]?.length??rule.min??1} onChange={e=>{const n=structuredClone(binding);const count=Number(e.target.value);n.main.roles[key]=Array.from({length:count},(_,i)=>n.main.roles[key]?.[i]??'');Bind(n)}}>{Array.from({length:(rule.max??4)-(rule.min??1)+1},(_,i)=>i+(rule.min??1)).map(count=><option key={count}>{count}</option>)}</select></label>)}
              {roles.map((r) => (
                <label className="field" key={r.key + r.index}>
                  {roleSchema?.[r.key]?.label || r.key}
                  {r.index >= 0 ? ` ${r.index + 1}` : ""}
                  <select
                    value={r.value as string}
                    onChange={(e) => {
                      const n = structuredClone(binding);
                      if (r.index >= 0) {
                        const previous = n.main.roles[r.key][r.index];
                        n.main.roles[r.key][r.index] = e.target.value;
                        for (const c of n.main.computations || []) {
                          if (c.field === previous) c.field = e.target.value;
                        }
                      } else {
                        const previous = n.main.roles[r.key];
                        n.main.roles[r.key] = e.target.value;
                        for (const c of n.main.computations || []) {
                          if (c.dateField === previous)
                            c.dateField = e.target.value;
                        }
                      }
                      Bind(n);
                    }}
                  >
                    <option value="">未绑定</option>
                    {eligibleFields(result,roleSchema?.[r.key]).map((f: any) => (
                      <option key={f.id} value={f.id}>
                        {fieldLabel(data, f)} · {f.type}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
          <footer>
            <button onClick={() => S(2)}>上一步</button>
            <button
              className="primary"
              disabled={
                busy ||
                !title ||
                roles.some(
                  (r) => !r.value || !fields.some((f: any) => f.id === r.value),
                )
              }
              onClick={async () => {
                B(true);
                E([]);
                try {
                  onCreated(
                    await post(datasetId ? "/slides" : "/slides/from-import", {
                      ...(datasetId ? { datasetId } : {}),
                      dataSpec: data,
                      templateId: tid,
                      title,
                      bindings: binding,
                    }),
                  );
                } catch (e: any) {
                  E(e.detail?.fieldErrors || [{ message: e.message }]);
                } finally {
                  B(false);
                }
              }}
            >
              {busy ? "创建中…" : "创建页面并进入编辑器"}
            </button>
          </footer>
        </>
      )}
    </Modal>
  );
}
