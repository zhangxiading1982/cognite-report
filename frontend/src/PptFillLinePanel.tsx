import { PptColorPicker } from "./PptColorPicker";

type Props = {
  prefix: "文本框" | "形状" | "线条";
  fill?: string;
  fillTransparency?: number;
  line?: Record<string, any>;
  connector?: boolean;
  onChange: (patch: Record<string, any>) => void;
};

const clampPercent = (value: string) => Math.max(0, Math.min(100, Number(value)));

export function PptFillLinePanel({ prefix, fill, fillTransparency = 0, line = {}, connector = false, onChange }: Props) {
  const fillLabel = `${prefix}填充`;
  const outlineLabel = prefix === "文本框" ? "文本框边框" : prefix === "形状" ? "形状线条" : "线条";
  const lineTypeLabel = prefix === "文本框" ? "文本框线条类型" : `${outlineLabel}类型`;
  const lineTransparencyLabel = prefix === "文本框" ? "文本框线条透明度" : `${outlineLabel}透明度`;
  const setLine = (patch: Record<string, any>) => onChange({ line: { ...line, ...patch } });
  const lineEnabled = Number(line.width ?? (connector ? 2 : 0)) > 0;
  return <section className="ppt-format-options" aria-label={`${prefix}格式`}>
    {!connector && <details open className="ppt-format-section" aria-label={fillLabel}>
      <summary>填充</summary>
      <fieldset className="ppt-format-radio" aria-label={`${prefix}填充类型`}>
        <label><input type="radio" name={`${prefix}-fill`} checked={!fill} onChange={() => onChange({ fill: undefined })} />无填充</label>
        <label><input type="radio" name={`${prefix}-fill`} checked={!!fill} onChange={() => onChange({ fill: fill || "#DCEAE8" })} />纯色填充</label>
      </fieldset>
      <>
        <PptColorPicker label="颜色" ariaLabel={prefix === "文本框" ? "文本框底色" : "形状底色"} color={fill} onChange={value => onChange({ fill: value || "#DCEAE8" })} />
        <label className="ppt-range-field"><span>透明度</span><input aria-label={`${prefix}填充透明度`} type="range" min="0" max="100" value={fillTransparency} onChange={event => onChange({ fillTransparency: clampPercent(event.target.value) })} /><output>{fillTransparency}%</output></label>
      </>
    </details>}
    <details open className="ppt-format-section" aria-label={outlineLabel}>
      <summary>线条</summary>
      <fieldset className="ppt-format-radio" aria-label={lineTypeLabel}>
        <label><input type="radio" name={`${prefix}-line`} checked={!lineEnabled} onChange={() => setLine({ width: 0 })} />无线条</label>
        <label><input type="radio" name={`${prefix}-line`} checked={lineEnabled} onChange={() => setLine({ color: line.color || "#52768B", width: line.width > 0 ? line.width : 1, dash: line.dash || "solid" })} />实线</label>
      </fieldset>
      <>
        <PptColorPicker label="颜色" ariaLabel={prefix === "文本框" ? "文本框边框颜色" : connector ? "线条颜色" : "形状线条颜色"} color={line.color || "#52768B"} kind="outline" onChange={value => value && setLine({ color: value })} />
        <label className="ppt-range-field"><span>透明度</span><input aria-label={lineTransparencyLabel} type="range" min="0" max="100" value={line.transparency ?? 0} onChange={event => setLine({ transparency: clampPercent(event.target.value) })} /><output>{line.transparency ?? 0}%</output></label>
        <div className="ppt-line-grid">
          <label className="field">宽度（磅）<input aria-label={prefix === "文本框" ? "文本框边框粗细" : connector ? "线条粗细" : "形状线条粗细"} type="number" min="0.5" max="12" step="0.25" value={line.width ?? (connector ? 2 : 1)} onChange={event => setLine({ width: Math.max(.5, Math.min(12, Number(event.target.value))) })} /></label>
          <label className="field">短划线类型<select aria-label={prefix === "文本框" ? "文本框边框样式" : connector ? "线条样式" : "形状线条样式"} value={line.dash || "solid"} onChange={event => setLine({ dash: event.target.value })}><option value="solid">实线</option><option value="dash">短划线</option><option value="dot">点线</option><option value="dashDot">点划线</option></select></label>
          <label className="field">线端类型<select aria-label={prefix === "文本框" ? "文本框线端类型" : "线端类型"} value={line.cap || "flat"} onChange={event => setLine({ cap: event.target.value })}><option value="flat">平</option><option value="round">圆</option><option value="square">方</option></select></label>
          <label className="field">连接类型<select aria-label={prefix === "文本框" ? "文本框连接类型" : "连接类型"} value={line.join || "round"} onChange={event => setLine({ join: event.target.value })}><option value="round">圆角</option><option value="bevel">斜角</option><option value="miter">直角</option></select></label>
        </div>
        {connector && <div className="ppt-arrow-grid">
          <label className="field">开始箭头类型<select aria-label="线条起点" value={line.beginArrowType || "none"} onChange={event => setLine({ beginArrowType: event.target.value })}><ArrowOptions /></select></label>
          <label className="field">结尾箭头类型<select aria-label="线条终点" value={line.endArrowType || "none"} onChange={event => setLine({ endArrowType: event.target.value })}><ArrowOptions /></select></label>
        </div>}
      </>
    </details>
  </section>;
}

function ArrowOptions() {
  return <><option value="none">无</option><option value="triangle">三角箭头</option><option value="arrow">普通箭头</option><option value="stealth">燕尾箭头</option><option value="diamond">菱形</option><option value="oval">圆形</option></>;
}
