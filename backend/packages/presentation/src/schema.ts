import { z } from "zod";
import Decimal from "decimal.js";
export interface Diagnostic {
  code: string;
  message: string;
  path?: string;
  severity: "error" | "warning" | "info";
  elementId?: string;
}
const str = z.string().min(1);
const ext = { extensions: z.record(z.string(), z.unknown()).optional() };
const obj = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ ...shape, ...ext }).strict();
const decimal = z
  .string()
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/)
  .max(120);
const type = z.enum([
  "string",
  "decimal",
  "integer",
  "boolean",
  "date",
  "datetime",
]);
const datetime = z.string().datetime({ offset: true });
export const formatSchema = obj({
  displayDivisor: decimal.refine((v) => new Decimal(v).gt(0)),
  decimals: z.number().int().min(0).max(12),
  suffix: z.string(),
  percent: z.boolean(),
});
export type NumberFormat = z.infer<typeof formatSchema>;
const typed = obj({ type, value: z.unknown() });
const filter = obj({
  fieldId: str,
  operator: z.enum(["eq", "in", "between"]),
  type,
  value: z.unknown().optional(),
  values: z.array(z.unknown()).optional(),
});
const schema = obj({
  specVersion: z.literal("1.0"),
  id: str,
  mode: z.literal("snapshot"),
  source: obj({ system: str, modelId: str, modelRevision: str }),
  snapshot: obj({
    id: str,
    capturedAt: datetime,
    dataAsOf: datetime.nullable(),
    consistency: z.enum([
      "fixture",
      "importedSnapshot",
      "bestEffortBatch",
      "sourceSnapshot",
    ]),
    contentHash: str.optional(),
    window: obj({ startedAt: datetime, completedAt: datetime }).optional(),
    sourceVersion: str.optional(),
  }),
  context: obj({
    locale: str,
    timezone: str,
    parameters: z.record(z.string(), typed),
    filters: z.array(filter),
    effectiveFilters: z.array(filter),
  }),
  semanticSchema: obj({
    coverage: z.literal("referencedSubset"),
    tables: z.array(
      obj({
        id: str,
        name: str,
        columns: z.array(obj({ id: str, name: str, type })),
      }),
    ),
    relationships: z.array(
      obj({
        id: str,
        oneColumnId: str,
        manyColumnId: str,
        filterDirection: z.enum(["oneToMany", "both", "bidirectional"]),
      }),
    ),
  }),
  measures: z.array(
    obj({
      id: str,
      name: str,
      dax: str,
      description: str,
      unit: obj({ baseUnit: str, currency: str.optional() }),
      format: formatSchema,
      aggregationBehavior: z.enum(["additive", "semiAdditive", "nonAdditive"]),
      favorableDirection: z.enum(["higher", "lower", "neutral"]),
      dependencies: z.array(str),
      validation: obj({
        absoluteTolerance: decimal.refine((v) => new Decimal(v).gte(0)),
      }).optional(),
    }),
  ),
  queries: z.array(
    obj({
      id: str,
      provider: str,
      definition: obj({
        kind: str,
        fixtureId: str.optional(),
        queryRef: str.optional(),
        parameterBindings: z.record(z.string(), str).optional(),
      }),
      effectiveFilters: z.array(filter),
    }),
  ),
  resultSets: z
    .array(
      obj({
        id: str,
        queryId: str,
        name: z.string().max(200).optional(),
        grain: z.array(str).min(1),
        primaryKey: z.array(str).min(1),
        fields: z
          .array(
            obj({
              id: str,
              name: z.string().max(200).optional(),
              description: z.string().max(1000).optional(),
              unit: z.string().max(50).optional(),
              displayFormat: obj({
                useGrouping: z.boolean().optional(),
                decimalPlaces: z.number().int().min(0).max(12).optional(),
              }).optional(),
              type,
              nullable: z.boolean(),
              semanticRef: str.optional(),
            }),
          )
          .min(1),
        rows: z.array(z.record(z.string(), z.unknown())).max(10000),
        truncated: z.literal(false),
      }),
    )
    .min(1),
  chartHints: z
    .array(
      obj({
        resultSetId: str,
        chartType: z.enum(["comparison", "line", "waterfall", "stackedColumn", "percentStackedColumn", "pie", "donut", "combo", "area", "scatter"]),
        roles: z.record(z.string(), z.union([str, z.array(str)])).optional(),
      }),
    )
    .optional(),
});
export type DataSpec = z.infer<typeof schema>;
export type ResultSet = DataSpec["resultSets"][number];
export type Measure = DataSpec["measures"][number];
function matches(value: unknown, t: string): boolean {
  if (t === "decimal") return decimal.safeParse(value).success;
  if (t === "integer")
    return typeof value === "number" && Number.isSafeInteger(value);
  if (t === "datetime") return datetime.safeParse(value).success;
  if (t === "date")
    return (
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value
    );
  return typeof value === t;
}
export function validateDataSpec(input: unknown): {
  valid: boolean;
  errors: Diagnostic[];
  data?: DataSpec;
} {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return {
      valid: false,
      errors: parsed.error.issues.map((e) => ({
        code: "INVALID_SCHEMA",
        message: e.message,
        path: "/" + e.path.join("/"),
        severity: "error",
      })),
    };
  const d = parsed.data;
  const errors: Diagnostic[] = [];
  const err = (code: string, message: string, path: string) =>
    errors.push({ code, message, path, severity: "error" });
  const unique = (xs: string[], path: string) => {
    if (new Set(xs).size !== xs.length)
      err("DUPLICATE_ID", "ID must be unique", path);
  };
  if (!["fixture", "importedSnapshot"].includes(d.snapshot.consistency))
    err(
      "UNSUPPORTED_CONSISTENCY",
      "Phase one accepts fixture/importedSnapshot only",
      "/snapshot/consistency",
    );
  if (d.resultSets.reduce((n, r) => n + r.rows.length, 0) > 20000)
    err("ROW_LIMIT", "At most 20000 rows per data package", "/resultSets");
  unique(
    d.resultSets.map((r) => r.id),
    "/resultSets",
  );
  unique(
    d.queries.map((q) => q.id),
    "/queries",
  );
  unique(
    d.measures.map((m) => m.id),
    "/measures",
  );
  unique(
    d.semanticSchema.tables.map((t) => t.id),
    "/semanticSchema/tables",
  );
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) {
      err("CYCLIC_DEPENDENCY", id, "/measures");
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    d.measures.find((m) => m.id === id)?.dependencies.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };
  d.measures.forEach((m) => visit(m.id));
  const columns = d.semanticSchema.tables.flatMap((t) => t.columns);
  unique(
    [...columns, ...d.measures].map((c) => c.id),
    "/semanticSchema",
  );
  const refs = new Set([...columns, ...d.measures].map((c) => c.id));
  d.measures.forEach((m, i) =>
    m.dependencies.forEach((id) => {
      if (!refs.has(id))
        err("MISSING_REFERENCE", id, `/measures/${i}/dependencies`);
    }),
  );
  d.semanticSchema.relationships.forEach((r, i) => {
    for (const id of [r.oneColumnId, r.manyColumnId])
      if (!columns.some((c) => c.id === id))
        err("MISSING_REFERENCE", id, `/semanticSchema/relationships/${i}`);
  });
  for (const [key, v] of Object.entries(d.context.parameters))
    if (!matches(v.value, v.type))
      err(
        "INVALID_VALUE",
        "Parameter type mismatch",
        `/context/parameters/${key}`,
      );
  const filters = [
    ...d.context.filters.map((f, i) => ({ f, path: `/context/filters/${i}` })),
    ...d.context.effectiveFilters.map((f, i) => ({
      f,
      path: `/context/effectiveFilters/${i}`,
    })),
    ...d.queries.flatMap((q, j) =>
      q.effectiveFilters.map((f, i) => ({
        f,
        path: `/queries/${j}/effectiveFilters/${i}`,
      })),
    ),
  ];
  filters.forEach(({ f, path }) => {
    if (!refs.has(f.fieldId))
      err("MISSING_REFERENCE", f.fieldId, path + "/fieldId");
    const vals = f.operator === "eq" ? [f.value] : f.values;
    if (
      !vals ||
      !vals.length ||
      (f.operator === "between" && vals.length !== 2) ||
      vals.some((v) => !matches(v, f.type))
    )
      err(
        "INVALID_FILTER",
        "Filter type or arity mismatch",
        path + (f.operator === "eq" ? "/value" : "/values"),
      );
  });
  try {
    Intl.DateTimeFormat(d.context.locale, { timeZone: d.context.timezone });
  } catch {
    err("INVALID_TIMEZONE", "Invalid locale/timezone", "/context");
  }
  if (d.snapshot.consistency === "sourceSnapshot" && !d.snapshot.sourceVersion)
    err(
      "MISSING_SOURCE_VERSION",
      "sourceSnapshot requires sourceVersion",
      "/snapshot",
    );
  if (
    ["sourceSnapshot", "bestEffortBatch"].includes(d.snapshot.consistency) &&
    !d.snapshot.window
  )
    err("MISSING_WINDOW", "Batch requires acquisition window", "/snapshot");
  d.resultSets.forEach((r, i) => {
    const path = `/resultSets/${i}`;
    unique(
      r.fields.map((f) => f.id),
      path + "/fields",
    );
    if (!d.queries.some((q) => q.id === r.queryId))
      err("MISSING_REFERENCE", r.queryId, path + "/queryId");
    for (const key of [...r.primaryKey, ...r.grain])
      if (!r.fields.some((f) => f.id === key))
        err("MISSING_REFERENCE", key, path + "/primaryKey");
    r.fields.forEach((f, j) => {
      if (f.semanticRef && !refs.has(f.semanticRef))
        err("MISSING_REFERENCE", f.semanticRef, `${path}/fields/${j}`);
      if (
        d.measures.some((m) => m.id === f.semanticRef) &&
        !["decimal", "integer"].includes(f.type)
      )
        err(
          "TYPE_MISMATCH",
          "Measure field must be numeric",
          `${path}/fields/${j}`,
        );
      const col = columns.find((c) => c.id === f.semanticRef);
      if (col && col.type !== f.type)
        err(
          "TYPE_MISMATCH",
          "Semantic field type differs",
          `${path}/fields/${j}`,
        );
    });
    const keys = new Set<string>();
    const grains = new Set<string>();
    r.rows.forEach((row, j) => {
      const p = `${path}/rows/${j}`;
      for (const k of Object.keys(row))
        if (!r.fields.some((f) => f.id === k))
          err("UNKNOWN_FIELD", k, p + "/" + k);
      for (const f of r.fields) {
        const v = row[f.id];
        if (!(v === null && f.nullable) && !matches(v, f.type))
          err("INVALID_VALUE", `Expected ${f.type}`, p + "/" + f.id);
      }
      if (r.primaryKey.some((k) => row[k] === null || row[k] === undefined))
        err("NULL_KEY", "Primary key cannot be null", p);
      const grain = JSON.stringify(r.grain.map((k) => row[k]));
      if (grains.has(grain)) err("DUPLICATE_GRAIN", "Duplicate grain", p);
      grains.add(grain);
      const key = JSON.stringify(r.primaryKey.map((k) => row[k]));
      if (keys.has(key)) err("DUPLICATE_KEY", "Duplicate primary key", p);
      keys.add(key);
    });
  });
  return {
    valid: !errors.length,
    errors,
    ...(!errors.length ? { data: d } : {}),
  };
}
