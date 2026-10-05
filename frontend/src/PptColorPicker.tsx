import type { MouseEvent } from "react";
import { ChevronDown } from "lucide-react";

const THEME_COLORS = [
  "#FFFFFF", "#000000", "#E7E6E6", "#44546A", "#4472C4", "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5", "#70AD47",
  "#F2F2F2", "#7F7F7F", "#D0CECE", "#D6DCE4", "#D9E2F3", "#FCE4D6", "#EDEDED", "#FFF2CC", "#DDEBF7", "#E2F0D9",
  "#D9D9D9", "#595959", "#AEAAAA", "#ADB9CA", "#B4C6E7", "#F8CBAD", "#DBDBDB", "#FFE699", "#BDD7EE", "#C6E0B4",
  "#BFBFBF", "#3F3F3F", "#757171", "#8497B0", "#8EA9DB", "#F4B183", "#C9C9C9", "#FFD966", "#9BC2E6", "#A9D18E",
  "#A6A6A6", "#262626", "#3A3838", "#323F4F", "#2F5597", "#C65911", "#7B7B7B", "#BF9000", "#2E75B6", "#548235",
];
const STANDARD_COLORS = ["#C00000", "#FF0000", "#FFC000", "#FFFF00", "#92D050", "#00B050", "#00B0F0", "#0070C0", "#002060", "#7030A0", "#1D4ED8", "#0F766E", "#B91C1C"];

function close(event: MouseEvent<HTMLElement>) {
  event.currentTarget.closest("details")?.removeAttribute("open");
}

export function TextColorPicker({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const choose = (value: string, event: MouseEvent<HTMLElement>) => { onChange(value); close(event); };
  return <details className="text-color-picker">
    <summary aria-label="打开文字颜色" title="文字颜色"><b>A</b><i style={{ background: color }} /></summary>
    <div className="text-color-popover">
      <strong>主题颜色</strong>
      <div className="text-color-grid text-theme-grid">{THEME_COLORS.map((value, index) => <button type="button" key={`${value}-${index}`} aria-label={`文字颜色 ${value}`} aria-pressed={color.toLowerCase() === value.toLowerCase()} title={value} style={{ background: value }} onClick={event => choose(value, event)} />)}</div>
      <strong>标准颜色</strong>
      <div className="text-color-grid text-standard-grid">{STANDARD_COLORS.map(value => <button type="button" key={value} aria-label={`文字颜色 ${value}`} aria-pressed={color.toLowerCase() === value.toLowerCase()} title={value} style={{ background: value }} onClick={event => choose(value, event)} />)}</div>
      <label>更多颜色…<input aria-label="工具栏文字颜色" type="color" value={color} onChange={event => onChange(event.target.value)} /></label>
    </div>
  </details>;
}

export function PptColorPicker({ label, ariaLabel = label, customAriaLabel, color, onChange, allowNone = false, kind = "fill" }: { label: string; ariaLabel?: string; customAriaLabel?: string; color?: string; onChange: (color: string | undefined) => void; allowNone?: boolean; kind?: "fill" | "outline" }) {
  const selected = color?.toUpperCase();
  const choose = (value: string | undefined, event: MouseEvent<HTMLElement>) => { onChange(value); close(event); };
  return <details className="ppt-color-picker">
    <summary aria-label={ariaLabel} title={label}><span className={`ppt-color-icon ${kind}`} style={kind === "fill" ? { background: color || "transparent", borderColor: color || "#94A3B8" } : { borderColor: color || "#94A3B8" }} /><span>{label}</span><ChevronDown size={14} /></summary>
    <div className="ppt-color-popover">
      <strong>主题颜色</strong>
      {allowNone && <button type="button" className="ppt-no-color" aria-label={`${ariaLabel} 无填充`} aria-pressed={!color} onClick={event => choose(undefined, event)}>无填充</button>}
      <div className="ppt-color-grid ppt-theme-grid">{THEME_COLORS.map((value, index) => <button type="button" key={`${value}-${index}`} aria-label={`${ariaLabel} ${value}`} aria-pressed={selected === value} title={value} style={{ background: value }} onClick={event => choose(value, event)} />)}</div>
      <strong>标准颜色</strong>
      <div className="ppt-color-grid ppt-standard-grid">{STANDARD_COLORS.map(value => <button type="button" key={value} aria-label={`${ariaLabel} ${value}`} aria-pressed={selected === value} title={value} style={{ background: value }} onClick={event => choose(value, event)} />)}</div>
      <label>更多颜色…<input aria-label={customAriaLabel || `${ariaLabel}自定义颜色`} type="color" value={color || "#FFFFFF"} onChange={event => onChange(event.target.value)} /></label>
    </div>
  </details>;
}
