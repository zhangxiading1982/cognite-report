import {BUSINESS_TEMPLATES,PHASE2_TEMPLATES,createSlide,upgradeTemplateSlideReadability,usesTemplateReadability} from "@slidebi/presentation";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool, PoolClient } from "pg";
import { HttpError, fail } from "./errors.ts";
import {ASSET_FOLDERS,TEMPLATE_FOLDERS,templateFolderId} from './catalog-structure.ts';
import {completeDataSpecSchema,completeTemplatePayloadSchema} from './data-schema.ts';
export { HttpError, fail } from "./errors.ts";
export type DB = Pool | PoolClient;
export const id = (prefix: string) => `${prefix}-${randomUUID()}`;
export function canonical(v: any): string {
  return JSON.stringify(
    v === null || typeof v !== "object"
      ? v
      : Array.isArray(v)
        ? v.map((x) => JSON.parse(canonical(x)))
        : Object.fromEntries(
            Object.keys(v)
              .sort()
              .filter((k) => v[k] !== undefined)
              .map((k) => [k, JSON.parse(canonical(v[k]))]),
          ),
  );
}
export const hash = (v: any) =>
  createHash("sha256").update(canonical(v)).digest("hex");
export const bytesHash = (v: Buffer) =>
  createHash("sha256").update(v).digest("hex");
export const omit = (v: any, keys: string[]) =>
  Object.fromEntries(Object.entries(v).filter(([k]) => !keys.includes(k)));
export async function transaction<T>(
  pool: Pool,
  fn: (db: PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const v = await fn(db);
    await db.query("COMMIT");
    return v;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export async function fixture(name = "monthly-operations.data") {
  return completeDataSpecSchema(JSON.parse(
    await readFile(
      new URL(`../fixtures/${name}.json`, import.meta.url),
      "utf8",
    ),
  ));
}
export async function seed(pool: Pool) {
  for(const folder of [...TEMPLATE_FOLDERS,...ASSET_FOLDERS]){
    await pool.query(
      `INSERT INTO app.folders(id,kind,owner_id,name,parent_id)
       VALUES($1,$2,(SELECT id FROM app.users WHERE username='marx'),$3,$4)
       ON CONFLICT(id) DO NOTHING`,
      [folder.id,folder.kind,folder.name,folder.parentId??null],
    );
  }
  for (const [theme, name] of [
    ["corporate-blue", "商务蓝"],
    ["neutral", "中性灰"],
  ])
    await pool.query(
      `INSERT INTO app.themes(id,version,name,payload) VALUES($1,1,$2,$3) ON CONFLICT DO NOTHING`,
      [
        theme,
        name,
        {
          fontFamily: "Arial",
          colors: {
            primary: theme === "neutral" ? "#475569" : "#2563EB",
            text: "#172033",
            background: "#FFFFFF",
          },
        },
      ],
    );
  for (const [slug, file, name] of [
    ["budget-comparison", "budget.slide", "预算对比"],
    ["monthly-trend", "trend.slide", "月度趋势"],
    ["revenue-bridge", "bridge.slide", "收入桥"],
  ]) {
    const s = await fixture(file);
    await transaction(pool, async (db) => {
      await db.query(
        `INSERT INTO app.templates(id,visibility,owner_id,folder_id) VALUES($1,'public',(SELECT id FROM app.users WHERE username='marx'),$2) ON CONFLICT DO NOTHING`,
        [slug,templateFolderId(slug)],
      );
      await db.query(
        `INSERT INTO app.template_versions(template_id,version,name,scene,theme_id,theme_version,payload) VALUES($1,1,$2,$3,'corporate-blue',1,$4) ON CONFLICT DO NOTHING`,
        [
          slug,
          name,
          s.scene,
          {
            requiredBindings: s.bindings,
            canvas: s.canvas,
            slots: [],
            defaultElements: s.elements,
            allowedControls: ["text", "layout", "theme", "chartOptions"],
            exportCapabilities: ["nativeChart", "editableShapes"],
          },
        ],
      );
    });
  }
  const phase2Data=await fixture('phase2-charts.data');
  for(const t of PHASE2_TEMPLATES){
    const slide=createSlide(phase2Data,t.id);
    await transaction(pool,async db=>{
      await db.query("INSERT INTO app.templates(id,visibility,owner_id,folder_id) VALUES($1,'public',(SELECT id FROM app.users WHERE username='marx'),$2) ON CONFLICT DO NOTHING",[t.id,templateFolderId(t.id)]);
      await db.query("INSERT INTO app.template_versions(template_id,version,name,scene,theme_id,theme_version,payload) VALUES($1,1,$2,$3,'corporate-blue',1,$4) ON CONFLICT DO NOTHING",[t.id,t.name,t.scene,{requiredBindings:{main:{roles:Object.keys(t.roles),roleConstraints:t.roles}},bindingSchema:{main:{roles:t.roles}},chartType:t.chartType,canvas:slide.canvas,slots:[],defaultElements:slide.elements,allowedControls:['text','layout','theme','chartOptions'],exportCapabilities:['nativeChart']}]);
    });
  }
  const businessTemplateIds=BUSINESS_TEMPLATES.map(template=>template.id);
  const existingBusinessTemplates=new Set((await pool.query(
    "SELECT id FROM app.templates WHERE id=ANY($1::text[])",
    [businessTemplateIds],
  )).rows.map(row=>row.id));
  const currentBusinessVersions=new Map((await pool.query(
    "SELECT DISTINCT ON(template_id) template_id,version,payload FROM app.template_versions WHERE template_id=ANY($1::text[]) ORDER BY template_id,version DESC",
    [businessTemplateIds],
  )).rows.map(row=>[row.template_id,row]));
  const businessSeedsToWrite=BUSINESS_TEMPLATES.filter(t=>{
    const current:any=currentBusinessVersions.get(t.id);
    const currentSeedRevision=Number(current?.payload?.seedRevision??0);
    const currentDesignVersion=Number(current?.payload?.example?.designVersion??0);
    return !existingBusinessTemplates.has(t.id)||!current||
      (currentDesignVersion>0&&currentSeedRevision>0&&
        currentDesignVersion<Number(t.payload.example.designVersion)&&
        currentSeedRevision<Number(t.payload.seedRevision));
  });
  if(businessSeedsToWrite.length)await transaction(pool,async db=>{
    for(const t of businessSeedsToWrite){
      await db.query(
        "INSERT INTO app.templates(id,visibility,owner_id,folder_id) VALUES($1,'public',(SELECT id FROM app.users WHERE username='marx'),$2) ON CONFLICT DO NOTHING",
        [t.id,t.folderId],
      );
      const current:any=currentBusinessVersions.get(t.id);
      if(!current){
        await db.query(
          "INSERT INTO app.template_versions(template_id,version,name,scene,theme_id,theme_version,payload) VALUES($1,1,$2,$3,'corporate-blue',1,$4) ON CONFLICT DO NOTHING",
          [t.id,t.name,t.scene,t.payload],
        );
      }else{
        // Generated examples retain designVersion; owner edits are captured without it and remain immutable.
        await db.query(
          "INSERT INTO app.template_versions(template_id,version,name,scene,theme_id,theme_version,payload) VALUES($1,$2,$3,$4,'corporate-blue',1,$5) ON CONFLICT DO NOTHING",
          [t.id,Number(current.version)+1,t.name,t.scene,t.payload],
        );
      }
    }
  });

}
export function slideRow(r: any) {
  const slide = {
    ...r.payload,
    id: r.slide_id,
    revision: r.revision,
    specVersion: r.spec_version,
    title: r.title,
    scene: r.scene,
    snapshotRef: r.snapshot_id,
    templateRef: { id: r.template_id, version: r.template_version },
    themeRef: { id: r.theme_id, version: r.theme_version },
    reviewState: { status: r.review_state, snapshotId: r.snapshot_id },
    ...(r.archived_at ? { archivedAt: r.archived_at } : {}),
  };
  return usesTemplateReadability(slide.templateRef.id)
    ? upgradeTemplateSlideReadability(slide as any)
    : slide;
}
export async function getSlide(
  db: DB,
  actor: number,
  slideId: string,
  revision?: number,
) {
  const r = (
    await db.query(
      `SELECT r.*,s.archived_at,s.owner_id AS slide_owner_id FROM app.slides s JOIN app.slide_revisions r ON r.slide_id=s.id AND r.revision=COALESCE($3,s.current_revision) WHERE s.id=$1 AND (s.owner_id=$2 OR EXISTS(SELECT 1 FROM app.decks d WHERE d.id=s.content_deck_id AND d.visibility='public' AND d.archived_at IS NULL AND r.revision=s.current_revision))`,
      [slideId, actor, revision ?? null],
    )
  ).rows[0];
  if (!r) fail(404, "NOT_FOUND", "页面不存在");
  const slide = slideRow(r);
  const dataset = (await db.query(`SELECT d.id,v.name,d.origin,v.version,v.operation,v.refresh_config FROM app.dataset_versions v JOIN app.datasets d ON d.id=v.dataset_id WHERE v.snapshot_id=$1 AND d.owner_id=$2`,[r.snapshot_id,actor])).rows[0];
  if(dataset){dataset.refreshMode=dataset.refresh_config?.mode??(dataset.origin.kind==='biStudio'?'biStudioMock':'manual');delete dataset.refresh_config;dataset.syncStatus=dataset.operation==='edit'&&dataset.refreshMode==='biStudioMock'?'edited':dataset.operation==='rollback'?'rolledBack':dataset.refreshMode==='biStudioMock'?'synced':'current';slide.extensions={...slide.extensions,dataset};}
  if(slide.extensions?.chartData)for(const source of Object.values(slide.extensions.chartData) as any[]){
    source.canEdit=Number(r.slide_owner_id)===Number(actor);
    if(source.mode==='dataset'){const owner=(await db.query('SELECT owner_id FROM app.datasets WHERE id=$1 AND archived_at IS NULL',[source.datasetId])).rows[0];source.canEdit=source.canEdit&&Number(owner?.owner_id)===Number(actor);}
  }
  return slide;
}
export async function getData(db: DB, actor: number, snapshot: string) {
  const r = (
    await db.query(
      `SELECT ds.* FROM app.data_snapshots ds WHERE ds.id=$1 AND (ds.owner_id=$2 OR EXISTS(SELECT 1 FROM app.datasets d JOIN app.dataset_versions v ON v.dataset_id=d.id WHERE v.snapshot_id=ds.id AND d.visibility='public' AND d.archived_at IS NULL) OR EXISTS(SELECT 1 FROM app.slide_revisions r JOIN app.slides s ON s.id=r.slide_id JOIN app.decks d ON d.id=s.content_deck_id WHERE r.snapshot_id=ds.id AND r.revision=s.current_revision AND d.visibility='public' AND d.archived_at IS NULL AND s.archived_at IS NULL))`,
      [snapshot, actor],
    )
  ).rows[0];
  if (!r) fail(404, "NOT_FOUND", "快照不存在");
  return completeDataSpecSchema({
    ...r.payload,
    id: r.data_spec_id,
    specVersion: r.spec_version,
    snapshot: {
      id: r.id,
      contentHash: r.content_hash,
      capturedAt: r.captured_at.toISOString(),
      dataAsOf: r.data_as_of?.toISOString() ?? null,
      consistency: r.consistency,
    },
  });
}
export function assetIds(v: any): string[] {
  const out = new Set<string>();
  function walk(x: any) {
    if (!x || typeof x !== "object") return;
    for (const [k, val] of Object.entries(x)) {
      if (k === "assetId" && typeof val === "string") out.add(val);
      else walk(val);
    }
  }
  walk(v);
  return [...out].sort();
}
export const assetReadCondition = `(a.owner_id=$2 OR a.visibility='public'
 OR EXISTS(SELECT 1 FROM app.slide_asset_refs ar JOIN app.slides s ON s.id=ar.slide_id LEFT JOIN app.decks d ON d.id=s.content_deck_id WHERE ar.asset_id=a.id AND s.archived_at IS NULL AND (s.owner_id=$2 OR (d.visibility='public' AND d.archived_at IS NULL AND ar.revision=s.current_revision)))
 OR EXISTS(SELECT 1 FROM app.template_asset_refs ar JOIN app.templates t ON t.id=ar.template_id WHERE ar.asset_id=a.id AND t.archived_at IS NULL AND (t.owner_id=$2 OR (t.visibility='public' AND ar.template_version=(SELECT max(v.version) FROM app.template_versions v WHERE v.template_id=t.id)))))`;
export async function authorizeAssets(db: DB, actor: number, s: any) {
  const ids = assetIds(s);
  if (ids.length) {
    const rows = (
      await db.query(
        `SELECT a.id FROM app.assets a WHERE a.id=ANY($1::text[]) AND ${assetReadCondition}`,
        [ids, actor],
      )
    ).rows;
    if (rows.length !== ids.length)
      fail(404, "ASSET_NOT_FOUND", "引用的素材不可用");
  }
  return ids;
}
export async function template(
  db: DB,
  actor: number,
  tid: string,
  version?: number,
) {
  const r = (
    await db.query(
      `SELECT v.*,t.visibility,t.owner_id FROM app.templates t JOIN app.template_versions v ON t.id=v.template_id WHERE t.id=$1 AND (t.owner_id=$2 OR t.visibility='public' OR ($3::integer IS NOT NULL AND EXISTS(SELECT 1 FROM app.slide_revisions sr WHERE sr.template_id=t.id AND sr.template_version=$3 AND sr.owner_id=$2))) AND (t.archived_at IS NULL OR $3::integer IS NOT NULL) AND ($3::integer IS NULL OR v.version=$3) ORDER BY v.version DESC LIMIT 1`,
      [tid, actor, version ?? null],
    )
  ).rows[0];
  if (!r) fail(404, "TEMPLATE_NOT_FOUND", "模板不存在");
  r.payload=completeTemplatePayloadSchema(r.payload);
  return r;
}
export async function insertRevision(db: DB, actor: number, s: any) {
  s = structuredClone(s);
  if (s.extensions) delete s.extensions.dataset;
  const refs = await authorizeAssets(db, actor, s);
  await template(db, actor, s.templateRef.id, s.templateRef.version);
  if (
    !(
      await db.query("SELECT 1 FROM app.themes WHERE id=$1 AND version=$2", [
        s.themeRef.id,
        s.themeRef.version,
      ])
    ).rowCount
  )
    fail(422, "THEME_NOT_FOUND", "主题不存在");
  await db.query(
    `INSERT INTO app.slide_revisions(slide_id,revision,owner_id,spec_version,title,scene,snapshot_id,template_id,template_version,theme_id,theme_version,review_state,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      s.id,
      s.revision,
      actor,
      s.specVersion,
      s.title,
      s.scene,
      s.snapshotRef,
      s.templateRef.id,
      s.templateRef.version,
      s.themeRef.id,
      s.themeRef.version,
      s.reviewState.status,
      omit(s, [
        "id",
        "revision",
        "specVersion",
        "title",
        "scene",
        "snapshotRef",
        "templateRef",
        "themeRef",
        "reviewState",
        "archivedAt",
      ]),
    ],
  );
  for (const aid of refs)
    await db.query("INSERT INTO app.slide_asset_refs VALUES($1,$2,$3)", [
      s.id,
      s.revision,
      aid,
    ]);
}
