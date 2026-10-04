import React, { useEffect, useRef, useState } from "react";
import { post } from "./api";
export function ImageProcessing({
  asset,
  onSaved,
}: {
  asset: any;
  onSaved: (asset: any) => void;
}) {
  const [operation, O] = useState("removeBackground"),
    [targetColor, T] = useState("#ffffff"),
    [backgroundColor, Bg] = useState("#ffffff"),
    [color, Color] = useState("#2563eb"),
    [active, Active] = useState(false),
    [tolerance, Tol] = useState("30"),
    [name, N] = useState(asset.name + " · 去底副本"),
    [preview, P] = useState(""),
    [busy, B] = useState(false),
    [saving, Saving] = useState(false),
    [error, E] = useState("");
  const request = useRef(0),
    live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      request.current++;
    };
  }, []);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  function invalidate() {
    Active(true);
    request.current++;
    P("");
    B(false);
    E("");
  }
  const valid =
    tolerance.trim() !== "" &&
    Number.isFinite(Number(tolerance)) &&
    Number(tolerance) >= 0 &&
    Number(tolerance) <= 150;
  const parameters = operation === "recolor" ? {operation,color} : {
    operation,
    targetColor,
    tolerance: Number(tolerance),
    ...(operation === "replaceBackground" ? { backgroundColor } : {}),
  };
  useEffect(() => {
    if (!active || !valid || saving) return;
    const timer = setTimeout(() => { makePreview(); }, 350);
    return () => clearTimeout(timer);
  }, [active, operation, targetColor, backgroundColor, tolerance, color]);
  async function makePreview() {
    const sequence = ++request.current;
    P("");
    B(true);
    E("");
    try {
      const response = await fetch(
        `/api/assets/${asset.id}/processing-preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parameters),
        },
      );
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.message || `处理失败 (${response.status})`);
      }
      if (!response.headers.get("content-type")?.includes("image/png"))
        throw new Error("预览返回格式不是PNG，请重试");
      const blob = await response.blob();
      if (live.current && sequence === request.current)
        P(URL.createObjectURL(blob));
    } catch (e: any) {
      if (live.current && sequence === request.current) E(e.message);
    } finally {
      if (live.current && sequence === request.current) B(false);
    }
  }
  return (
    <section className="image-processing">
      <div className="media-large"><img src={preview || asset.url || `/api/assets/${asset.id}/file`} alt={preview ? "底色处理预览" : `${asset.name} 预览`} /></div>
      <h3>素材微调</h3>
      <p className="muted">
        调整参数自动预览，下载或另存为新资源。原素材保持不变。
      </p>
      <fieldset className="processing-controls" disabled={saving}>
        <label className="field">
          处理方式
          <select
            value={operation}
            onChange={(e) => {
              invalidate();
              O(e.target.value);
              N(
                asset.name +
                  (e.target.value === "removeBackground"
                    ? " · 去底副本"
                    : e.target.value === "recolor" ? " · 调色副本" : " · 换底副本"),
              );
            }}
          >
            <option value="removeBackground">移除纯色底</option>
            <option value="replaceBackground">替换背景色</option>
            {(asset.kind === "vector" || asset.kind === "icon") && <option value="recolor">统一图形颜色</option>}
          </select>
        </label>
        {operation !== "recolor" && <><label className="field">
          目标底色
          <input
            type="color"
            value={targetColor}
            onChange={(e) => {
              invalidate();
              T(e.target.value);
            }}
          />
        </label>
        <label className="field">
          底色容差
          <input
            type="number"
            min="0"
            max="150"
            value={tolerance}
            onChange={(e) => {
              invalidate();
              Tol(e.target.value);
            }}
          />
        </label>
        </>}
        {operation === "recolor" && <label className="field">图形颜色<input type="color" value={color} onChange={e=>{invalidate();Color(e.target.value)}} /></label>}
        {operation === "replaceBackground" && (
          <label className="field">
            新背景色
            <input
              type="color"
              value={backgroundColor}
              onChange={(e) => {
                invalidate();
                Bg(e.target.value);
              }}
            />
          </label>
        )}
      </fieldset>
      <p className="muted">{operation === 'recolor' ? '统一非透明部分的颜色，保留透明度；下载为 PNG。' : '去底适合纯色背景；容差越大，移除的近似颜色越多。'}</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button disabled={busy || saving || !valid} onClick={makePreview}>
        {busy ? "处理中…" : "预览处理效果"}
      </button>
      {preview && <a className="button" href={preview} download={`${name.trim() || asset.name}.png`}>下载 PNG</a>}
      <label className="field">
        副本名称
        <input
          disabled={saving}
          value={name}
          onChange={(e) => N(e.target.value)}
        />
      </label>
      <button
        className="primary"
        disabled={!preview || busy || saving || !valid || !name.trim()}
        onClick={async () => {
          if (saving) return;
          Saving(true);
          E("");
          try {
            const copy = await post(`/assets/${asset.id}/processed-copies`, {
              ...parameters,
              name: name.trim(),
            });
            if (live.current) onSaved(copy);
          } catch (e: any) {
            if (live.current) E(e.message);
          } finally {
            if (live.current) Saving(false);
          }
        }}
      >
        {saving ? "保存中…" : "保存新副本"}
      </button>
    </section>
  );
}
