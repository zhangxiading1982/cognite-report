import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
export function Modal({
  title,
  header,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  header?: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    ref.current?.focus();
    return () => old?.focus();
  }, []);
  return (
    <div
      className="veil"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.stopPropagation(); onClose(); }
          if (e.key === "Tab") {
            const all = ref.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input,textarea,select,a[href]",
            );
            if (!all?.length) return;
            const first = all[0],
              last = all[all.length - 1];
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === ref.current)
            ) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <header>
          {header || <h2>{title}</h2>}
          <button aria-label="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
export function Mini({ kind = 0 }: { kind?: number }) {
  return (
    <svg viewBox="0 0 320 180" aria-hidden="true">
      <rect width="320" height="180" fill="white" />
      <rect x="15" y="17" width="150" height="6" fill="#334d66" />
      <rect x="15" y="29" width="87" height="3" fill="#ced7df" />
      {kind === 1 ? (
        <>
          <polyline
            points="24,124 64,107 104,115 144,73 184,64 218,48"
            fill="none"
            stroke="#526f92"
            strokeWidth="4"
          />
          <path
            d="M24 124L64 107L104 115L144 73L184 64L218 48V142H24Z"
            fill="#526f92"
            opacity=".1"
          />
        </>
      ) : (
        Array.from({ length: kind === 2 ? 5 : 4 }, (_, i) => (
          <g key={i}>
            <rect
              x={24 + i * 41}
              y={kind === 2 ? 70 + (i % 3) * 14 : 68 + (i % 3) * 16}
              width={kind === 2 ? 26 : 15}
              height={kind === 2 ? 65 - (i % 3) * 14 : 74 - (i % 3) * 16}
              fill={i === 2 ? "#94b5a8" : "#526f92"}
            />
            {kind === 0 && (
              <rect
                x={41 + i * 41}
                y={85 + (i % 2) * 12}
                width="13"
                height={57 - (i % 2) * 12}
                fill="#ccd7e3"
              />
            )}
          </g>
        ))
      )}
      <path d="M20 144H221" stroke="#d9dfe5" />
      <rect x="242" y="52" width="57" height="4" fill="#738395" />
      {[65, 74, 83, 104, 113].map((y) => (
        <rect
          key={y}
          x="242"
          y={y}
          width={y === 83 ? 33 : 57}
          height="3"
          fill="#d3dbe1"
        />
      ))}
      <rect x="15" y="164" width="180" height="2" fill="#dce1e4" />
    </svg>
  );
}
export function fieldLabel(data: any, field: any) {
  const semantic = [
    ...(data?.semanticSchema?.tables || []).flatMap(
      (table: any) => table.columns || [],
    ),
    ...(data?.measures || []),
  ].find((item: any) => item.id === field.semanticRef);
  return field.name || semantic?.name || field.id;
}
export function fieldUnit(data:any,field:any){const u=field.unit||field.extensions?.unit||data?.measures?.find((m:any)=>m.id===field.semanticRef)?.unit;return typeof u==='object'?u?.currency||u?.baseUnit||'':u||'';}
export function DataView({ data, hideModelDetails=false, hideSourceSummary=false }: { data: any; hideModelDetails?: boolean; hideSourceSummary?: boolean }) {
  const sets = data?.resultSets || [];
  return (
    <>
      {!hideSourceSummary&&<div className="callout">
        <b>{data?.source?.modelId || "当前数据"}</b>
        <p>
          截至 {data?.snapshot?.dataAsOf || "未提供"} ·{" "}
          {data?.snapshot?.consistency} · {data?.mode}
        </p>
      </div>}
      {sets.map((s: any) => (
        <section key={s.id}>
          <h3>
            {s.name || s.id} <small>{s.rows?.length || 0} 行</small>
          </h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {s.fields?.map((f: any) => (
                    <th key={f.id}>
                      {fieldLabel(data, f)}
                      <small>
                        {f.type}{" "}
                        {fieldUnit(data,f)}
                      </small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.rows?.slice(0, 20).map((r: any, i: number) => (
                  <tr key={i}>
                    {s.fields?.map((f: any) => (
                      <td key={f.id}>{String(r[f.id] ?? "—")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {!hideModelDetails&&<details className="model-summary"><summary>语义 Schema 与计算口径 · {data?.semanticSchema?.tables?.length||0} 张表 · {data?.measures?.length||0} 个指标</summary>{data?.semanticSchema?.tables?.map((table:any)=><details key={table.id}><summary>{table.name||table.id}</summary><pre>{JSON.stringify(table,null,2)}</pre></details>)}{data?.measures?.map((m:any)=><details key={m.id}><summary>{m.name||m.id} · DAX</summary><pre>{m.dax}</pre><p>{m.description}</p></details>)}</details>}
      <details className="schema-summary"><summary>图表结果字段 Schema</summary>{sets.map((set:any)=><section key={set.id}><h4>{set.name||set.id}</h4><div className="table-scroll"><table><thead><tr><th>字段名称</th><th>字段 ID</th><th>类型</th><th>主键</th><th>单位</th></tr></thead><tbody>{set.fields?.map((f:any)=><tr key={f.id}><td>{fieldLabel(data,f)}</td><td>{f.id}</td><td>{f.type}</td><td>{set.primaryKey?.includes(f.id)?'是':'—'}</td><td>{fieldUnit(data,f)||'—'}</td></tr>)}</tbody></table></div></section>)}</details>
    </>
  );
}
