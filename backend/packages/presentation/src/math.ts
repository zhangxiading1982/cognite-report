import Decimal from "decimal.js";
import type { Diagnostic, NumberFormat } from "./schema";
export const D = Decimal.clone({
  precision: 160,
  rounding: Decimal.ROUND_HALF_UP,
});
export function formatValue(
  v: string | null | undefined,
  f: NumberFormat,
): string {
  if (v == null) return "—";
  if (!new D(f.displayDivisor).gt(0)) throw new Error("INVALID_DIVISOR");
  return (
    new D(v)
      .div(f.displayDivisor)
      .mul(f.percent ? 100 : 1)
      .toFixed(f.decimals) + f.suffix
  );
}
export function chartNumber(v: string, f: NumberFormat): number {
  const d = new D(v).div(f.displayDivisor).mul(f.percent ? 100 : 1);
  const n = d.toNumber();
  if (
    !Number.isFinite(n) ||
    !new D(n.toString()).eq(d) ||
    d.abs().gt(Number.MAX_SAFE_INTEGER)
  )
    throw new Error("UNSAFE_NUMERIC_PRECISION");
  return n;
}
export interface WaterfallInput {
  id: string;
  label: string;
  role: string;
  amount: string;
  order: number;
}
export function deriveWaterfall(
  input: WaterfallInput[],
  tolerance = "0.01",
): {
  steps: (WaterfallInput & { from: string; to: string; cumulative: string })[];
  diagnostics: Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  const error = (code: string, message: string, id?: string) =>
    diagnostics.push({ code, message, severity: "error", path: id });
  const sorted = [...input].sort(
    (a, b) => a.order - b.order || a.id.localeCompare(b.id),
  );
  if (
    sorted.length < 2 ||
    sorted[0]?.role !== "start" ||
    sorted.at(-1)?.role !== "end" ||
    sorted.filter((s) => s.role === "start").length !== 1 ||
    sorted.filter((s) => s.role === "end").length !== 1
  )
    error(
      "INVALID_WATERFALL_ROLES",
      "Bridge must have exactly one initial start and final end",
    );
  if (new Set(sorted.map((s) => s.order)).size !== sorted.length)
    error("DUPLICATE_ORDER", "Bridge sort orders must be unique");
  let running = new D(0);
  const steps = sorted.map((s) => {
    let from = new D(0),
      to = new D(s.amount);
    if (s.role === "start") running = to;
    else if (s.role === "delta") {
      from = running;
      to = running.add(s.amount);
      running = to;
    } else if (s.role === "subtotal" || s.role === "end") {
      if (running.sub(to).abs().gt(tolerance))
        error(
          "WATERFALL_UNBALANCED",
          `Step ${s.id}: difference ${to.sub(running).toFixed()} exceeds ${tolerance}`,
          s.id,
        );
    } else error("INVALID_WATERFALL_ROLES", s.role, s.id);
    return {
      ...s,
      from: from.toFixed(),
      to: to.toFixed(),
      cumulative: running.toFixed(),
    };
  });
  return { steps, diagnostics };
}
export function monthlyRows(
  rows: Record<string, unknown>[],
  dateField: string,
  from?: string,
  to?: string,
): Record<string, unknown>[] {
  if (!rows.length && !from) return [];
  const sorted = [...rows].sort((a, b) =>
    String(a[dateField]).localeCompare(String(b[dateField])),
  );
  const month = (s: string) => s.slice(0, 7) + "-01";
  const first = month(from ?? String(sorted[0][dateField]));
  const last = month(to ?? String(sorted.at(-1)?.[dateField]));
  const byMonth = new Map(sorted.map((r) => [month(String(r[dateField])), r]));
  if (byMonth.size !== sorted.length) throw new Error("DUPLICATE_MONTH");
  const out: Record<string, unknown>[] = [];
  let cursor = first;
  while (cursor <= last) {
    out.push(byMonth.get(cursor) ?? { [dateField]: cursor });
    const dt = new Date(cursor + "T00:00:00Z");
    dt.setUTCMonth(dt.getUTCMonth() + 1);
    cursor = dt.toISOString().slice(0, 10);
    if (out.length > 1200) throw new Error("TIME_DOMAIN_TOO_LARGE");
  }
  return out;
}
export function axis(values: number[], includeZero = true) {
  let min = Math.min(...values, includeZero ? 0 : Infinity),
    max = Math.max(...values, includeZero ? 0 : -Infinity);
  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = 1;
  if (min === max) {
    if (min === 0) max = 1;
    else {
      min -= Math.abs(min) * 0.1;
      max += Math.abs(max) * 0.1;
    }
  }
  const raw = (max - min) / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].find((n) => n * pow >= raw)! * pow;
  return {
    min: Math.floor(min / step) * step,
    max: Math.ceil(max / step) * step,
    step,
  };
}
