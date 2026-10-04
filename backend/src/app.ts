import {assertPrivateChartDataImmutable,lockChartDatasets,normalizeChartData,registerChartDataRoutes} from './chart-data.ts';
import {registerTemplateManagement} from './template-management.ts';
import {registerFolderRoutes} from './folders.ts';
import {registerAuth,requestActor} from './auth.ts';
import {registerAccess} from './access.ts';
import {registerContentRoutes} from './contents.ts';
import {captureTemplateExample} from './template-examples.ts';
import {PHASE2_TEMPLATES} from "@slidebi/presentation";
import express from "express";
import {getDataset,lockDataset,attachDataset,createDataset,storeData,registerDatasetRoutes,refreshDataset} from './datasets.ts';
import {registerCatalogRoutes} from './catalog.ts';
import {registerAssetRoutes} from "./assets.ts";
import {registerFragmentRoutes} from "./fragments.ts";
import {registerDeckRoutes,insertDeckJob} from "./decks.ts";
import { Pool } from "pg";
import { mkdir, readFile, access, rm } from "node:fs/promises";
import path from "node:path";
import { compileSlide, validateDataSpec } from "@slidebi/presentation";
import { loadRuntimeConfig, type RuntimeConfig } from "./config.ts";
import {
  installHttpPolicies,
  requireIdempotencyKey,
} from "./http/policies.ts";
import {
  id,
  hash,
  bytesHash,
  omit,
  HttpError,
  fail,
  transaction,
  fixture,
  seed,
  getSlide,
  getData,
  slideRow,
  template,
  insertRevision,
  authorizeAssets,
  assetIds,
} from "./db.ts";
import { applyTemplate } from "./template-application.ts";
import { startWorker, type Exporter } from "./worker.ts";
export interface AppOptions {
  pool?: Pool;
  actorId?: number;
  storageDir?: string;
  exporter?: Exporter;
  workerEnabled?: boolean;
  runtimeConfig?: RuntimeConfig;
}
export async function createApp(options: AppOptions = {}) {
  const runtimeConfig = options.runtimeConfig ?? loadRuntimeConfig();
  const pool =
    options.pool ||
    new Pool({
      connectionString: runtimeConfig.databaseUrl,
    });
  await seed(pool);
  const actor = options.actorId ?? requestActor;
  const storageDir = path.resolve(
    options.storageDir || runtimeConfig.storageDir,
  );
  await Promise.all(
    ["assets", "exports", "tmp"].map((s) =>
      mkdir(path.join(storageDir, s), { recursive: true }),
    ),
  );
  const app = express();
  installHttpPolicies(app, runtimeConfig);
  registerAuth(app,pool,{actorId:options.actorId});
  registerAccess(app,pool,actor);
  registerTemplateManagement(app,pool,actor);
  registerFolderRoutes(app,pool,actor);
  const key = requireIdempotencyKey;
  const verify = (s: any, d: any) => {
    if (
      !s ||
      Object.keys(s).some(
        (k) =>
          ![
            "specVersion",
            "id",
            "revision",
            "title",
            "scene",
            "templateRef",
            "themeRef",
            "canvas",
            "snapshotRef",
            "bindings",
            "elements",
            "annotations",
            "layoutOverrides",
            "reviewState",
            "extensions",
            "archivedAt",
          ].includes(k),
      ) ||
      !["budgetComparison", "monthlyTrend", "revenueBridge"].includes(
        s.scene,
      ) ||
      !Array.isArray(s.elements) ||
      !s.bindings ||
      !s.templateRef ||
      !s.themeRef ||
      typeof s.title !== "string" ||
      !s.title.trim() ||
      s.title.length > 300
    )
      fail(422, "INVALID_SLIDE", "页面结构无效");
    let c;
    try {
      c = compileSlide(s, d, "draft");
    } catch {
      fail(422, "INVALID_SLIDE", "页面结构或绑定无效");
    }
    const errors = c.diagnostics.filter((x: any) => x.severity === "error");
    if (errors.length)
      throw new HttpError(422, "INVALID_SLIDE", "页面校验失败", errors);
    return c;
  };
  const save = async (
    slideId: string,
    expected: number,
    input: any,
    review = false,
  ) =>
    transaction(pool, async (db) => {
      await lockChartDatasets(db,Number(actor),input);
      const link=(await db.query('SELECT dataset_id FROM app.slides WHERE id=$1 AND owner_id=$2',[slideId,Number(actor)])).rows[0];
      const dataset=link?.dataset_id?await lockDataset(db,Number(actor),link.dataset_id):null;
      await db.query('SELECT id FROM app.slides WHERE id=$1 AND owner_id=$2 FOR UPDATE',[slideId,Number(actor)]);
      const old = await getSlide(db, Number(actor), slideId);
      if(old.extensions)delete old.extensions.dataset;
      if(old.revision!==expected || (dataset && !old.extensions?.chartData && input?.snapshotRef!==dataset.current_snapshot_id))fail(409,'REVISION_CONFLICT','页面数据已更新，请保留草稿并重新加载');
      input=structuredClone(input);if(input?.extensions)delete input.extensions.dataset;
      assertPrivateChartDataImmutable(old,input);
      if (!input || typeof input.snapshotRef !== "string")
        fail(422, "INVALID_SLIDE", "页面结构无效");
      let d = await getData(db, Number(actor), input.snapshotRef);
      if(input.extensions?.chartData){const normalized=await normalizeChartData(db,Number(actor),input,d);input=normalized.slide;d=normalized.data;}
      const s = {
        ...input,
        id: slideId,
        specVersion: "1.0",
        revision: expected + 1,
        reviewState: {
          status: review
            ? "reviewed"
            : input.snapshotRef === old.snapshotRef &&
                hash(omit(input, ["revision", "reviewState"])) ===
                  hash(omit(old, ["revision", "reviewState"]))
              ? old.reviewState.status
              : "needsReview",
          snapshotId: input.snapshotRef,
        },
      };
      verify(s, d);
      const changed = await db.query(
        `UPDATE app.slides SET current_revision=current_revision+1,updated_at=now() WHERE id=$1 AND owner_id=$2 AND current_revision=$3 AND archived_at IS NULL RETURNING current_revision`,
        [slideId, Number(actor), expected],
      );
      if (!changed.rowCount)
        fail(409, "REVISION_CONFLICT", "页面已更新，请保留草稿并重新加载");
      await insertRevision(db, Number(actor), s);
      return getSlide(db,Number(actor),s.id);
    });
  registerChartDataRoutes(app,pool,actor,key);
  registerDatasetRoutes(app,pool,actor);
  registerFragmentRoutes(app,pool,actor);
  await registerCatalogRoutes(app,pool,actor);
  app.get("/api/health", async (_req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  });
  app.get("/api/fixtures/monthly-operations", async (_req, res) =>
    res.json(await fixture()),
  );
  app.post("/api/data-specs/validate", (req, res) =>
    res.json(validateDataSpec(req.body)),
  );
  app.get("/api/data-snapshots", async (_req, res) =>
    res.json({
      items: await Promise.all(
        (
          await pool.query(
            "SELECT id FROM app.data_snapshots WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",
            [Number(actor)],
          )
        ).rows.map((r) => getData(pool, Number(actor), r.id)),
      ),
    }),
  );
  app.get("/api/data-snapshots/:id", async (req, res) =>
    res.json(await getData(pool, Number(actor), req.params.id)),
  );
  app.get("/api/slides", async (req, res) => {
    const rows = await pool.query(
      `SELECT r.*,s.updated_at FROM app.slides s JOIN app.slide_revisions r ON r.slide_id=s.id AND r.revision=s.current_revision WHERE s.owner_id=$1 AND s.archived_at IS NULL AND r.title ILIKE $2 ORDER BY s.updated_at DESC,s.id LIMIT $3`,
      [
        Number(actor),
        `%${String(req.query.q || "")}%`,
        Math.max(1, Math.min(Number(req.query.limit) || 100, 200)),
      ],
    );
    res.json({
      items: await Promise.all(rows.rows.map(async (r) => ({...await getSlide(pool,Number(actor),r.slide_id),updatedAt:r.updated_at}))),
    });
  });
  app.post("/api/slides/from-import", async (req, res) => {
    const k = key(req),
      input = req.body;
    const validated = validateDataSpec(input.dataSpec);
    if (!validated.valid)
      throw new HttpError(
        422,
        "INVALID_DATA_SPEC",
        "数据校验失败",
        validated.errors,
      );
    const tid = input.templateId || input.templateRef?.id;
    const t = await template(pool, Number(actor), tid, input.templateRef?.version);
    const fingerprint = hash(input);
    const existing = async () => {
      const r = (
        await pool.query(
          "SELECT * FROM app.slides WHERE owner_id=$1 AND creation_key=$2",
          [Number(actor), k],
        )
      ).rows[0];
      if (r) {
        if (r.creation_hash !== fingerprint)
          fail(409, "IDEMPOTENCY_CONFLICT", "幂等键对应的输入不同");
        return getSlide(pool, Number(actor), r.id);
      }
    };
    const prior = await existing();
    if (prior) {
      res.json(prior);
      return;
    }
    try {
      const result = await transaction(pool, async (db) => {
        const d = structuredClone(validated.data || input.dataSpec);
        d.snapshot.capturedAt = new Date(d.snapshot.capturedAt).toISOString();
        d.snapshot.dataAsOf = d.snapshot.dataAsOf
          ? new Date(d.snapshot.dataAsOf).toISOString()
          : null;
        const imported = d.snapshot.id;
        d.snapshot.id = id("snapshot");
        d.extensions = { ...d.extensions, importedSnapshotId: imported };
        d.snapshot.contentHash = hash({
          ...d,
          snapshot: omit(d.snapshot, ["hash", "contentHash"]),
        });
        const s = applyTemplate(d, t, input);
        verify(s, d);
        await db.query(
          `INSERT INTO app.data_snapshots(id,owner_id,data_spec_id,spec_version,content_hash,captured_at,data_as_of,consistency,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            d.snapshot.id,
            Number(actor),
            d.id,
            d.specVersion,
            d.snapshot.contentHash,
            d.snapshot.capturedAt,
            d.snapshot.dataAsOf || null,
            d.snapshot.consistency,
            omit(d, ["id", "specVersion", "snapshot"]),
          ],
        );
        await db.query(
          "INSERT INTO app.slides(id,owner_id,current_revision,creation_key,creation_hash) VALUES($1,$2,1,$3,$4)",
          [s.id, Number(actor), k, fingerprint],
        );
        const did=await attachDataset(db,Number(actor),s.snapshotRef,s.title);
        await db.query('UPDATE app.slides SET dataset_id=$2 WHERE id=$1',[s.id,did]);
        await insertRevision(db, Number(actor), s);
        return getSlide(db,Number(actor),s.id);
      });
      res.status(201).json(result);
    } catch (e: any) {
      if (e.code === "23505") {
        const prior = await existing();
        if (prior) {
          res.json(prior);
          return;
        }
      }
      throw e;
    }
  });
  app.post("/api/slides", async (req, res) => {
    const k = key(req);
    const input = req.body;
    const initialDataset = input.datasetId?await getDataset(pool,Number(actor),input.datasetId):null;
    const d = await getData(pool, Number(actor), initialDataset?.currentSnapshotId||input.snapshotRef);
    const tid = input.templateId || input.templateRef?.id;
    const t = await template(pool, Number(actor), tid, input.templateRef?.version);
    const fp = hash(input);
    const result = await transaction(pool, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${Number(actor)}:${k}`,
      ]);
      const prior = (
        await db.query(
          "SELECT * FROM app.slides WHERE owner_id=$1 AND creation_key=$2",
          [Number(actor), k],
        )
      ).rows[0];
      if (prior) {
        if (prior.creation_hash !== fp)
          fail(409, "IDEMPOTENCY_CONFLICT", "幂等键输入不同");
        return getSlide(db, Number(actor), prior.id);
      }
      let did=input.datasetId;
      if(initialDataset&&Number(initialDataset.ownerId)!==Number(Number(actor))){
        if(input.datasetVersion!==undefined&&input.datasetVersion!==initialDataset.version)fail(409,'VERSION_CONFLICT','预览数据已更新，请重新加载');
        const copy=await createDataset(db,Number(actor),{name:initialDataset.name,dataSpec:initialDataset.dataSpec});did=copy.id;
      }else if(!did){const owned=(await db.query('SELECT 1 FROM app.data_snapshots WHERE id=$1 AND owner_id=$2',[d.snapshot.id,Number(actor)])).rowCount;const data=owned?d:await storeData(db,Number(actor),d);did=await attachDataset(db,Number(actor),data.snapshot.id);}

      const dataset=await lockDataset(db,Number(actor),did);
      const currentData=await getData(db,Number(actor),dataset.current_snapshot_id);
      if(initialDataset?.canEdit!==false&&input.datasetVersion!==undefined && input.datasetVersion!==dataset.version)fail(409,'VERSION_CONFLICT','预览数据已更新，请重新加载');
      const s = applyTemplate(currentData, t, input);
      verify(s, currentData);
      await db.query(
        "INSERT INTO app.slides(id,owner_id,current_revision,creation_key,creation_hash) VALUES($1,$2,1,$3,$4)",
        [s.id, Number(actor), k, fp],
      );
      await db.query('UPDATE app.slides SET dataset_id=$2 WHERE id=$1',[s.id,did]);
      await insertRevision(db, Number(actor), s);
      return getSlide(db,Number(actor),s.id);
    });
    res.status(201).json(result);
  });
  app.get("/api/slides/:id", async (req, res) =>
    res.json(
      await getSlide(
        pool,
        Number(actor),
        req.params.id,
        req.query.revision ? Number(req.query.revision) : undefined,
      ),
    ),
  );
  app.put("/api/slides/:id", async (req, res) => {
    const raw = req.get("If-Match")?.replaceAll('"', "");
    if (!raw || !/^\d+$/.test(raw))
      fail(428, "REVISION_REQUIRED", "请提供 If-Match 修订号");
    res.json(await save(req.params.id, Number(raw), req.body));
  });
  app.post("/api/slides/:id/review", async (req, res) => {
    const s = await getSlide(pool, Number(actor), req.params.id);
    if (!Number.isInteger(req.body.revision))
      fail(400, "REVISION_REQUIRED", "请提供修订号");
    res.json(await save(s.id, req.body.revision, s, true));
  });
  app.post("/api/slides/:id/archive", async (req, res) => {
    await getSlide(pool, Number(actor), req.params.id);
    await pool.query(
      "UPDATE app.slides SET archived_at=now() WHERE id=$1 AND owner_id=$2",
      [req.params.id, Number(actor)],
    );
    res.json({ id: req.params.id, archived: true });
  });
  app.post("/api/slides/:id/copy", async (req, res) => {
    const k = key(req);
    const original = await getSlide(
      pool,
      Number(actor),
      req.params.id,
      req.body.revision,
    );
    const fp = hash({
      copy: original.id,
      revision: original.revision,
      title: req.body.title,
      slide: req.body.slide,
    });
    const prior = (
      await pool.query(
        "SELECT * FROM app.slides WHERE owner_id=$1 AND creation_key=$2",
        [Number(actor), k],
      )
    ).rows[0];
    if (prior) {
      if (prior.creation_hash !== fp)
        fail(409, "IDEMPOTENCY_CONFLICT", "幂等键输入不同");
      res.json(await getSlide(pool, Number(actor), prior.id));
      return;
    }
    const draft = req.body.slide || original;
    let s = {
      ...draft,
      id: id("slide"),
      revision: 1,
      title: req.body.title || `${draft.title} 副本`,
      reviewState: { status: "needsReview", snapshotId: draft.snapshotRef },
    };
    verify(s, await getData(pool, Number(actor), s.snapshotRef));
    const copied = await transaction(pool, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${Number(actor)}:${k}`,
      ]);
      const prior = (
        await db.query(
          "SELECT * FROM app.slides WHERE owner_id=$1 AND creation_key=$2",
          [Number(actor), k],
        )
      ).rows[0];
      if (prior) {
        if (prior.creation_hash !== fp)
          fail(409, "IDEMPOTENCY_CONFLICT", "幂等键输入不同");
        return getSlide(db, Number(actor), prior.id);
      }
      await db.query(
        "INSERT INTO app.slides(id,owner_id,current_revision,creation_key,creation_hash) VALUES($1,$2,1,$3,$4)",
        [s.id, Number(actor), k, fp],
      );
      if(s.extensions?.chartData){await lockChartDatasets(db,Number(actor),s);const result=await normalizeChartData(db,Number(actor),s,await getData(db,Number(actor),s.snapshotRef));s=result.slide;verify(s,result.data);}else {
      const did=await attachDataset(db,Number(actor),s.snapshotRef,s.title);
      const dataset=await lockDataset(db,Number(actor),did);
      s.snapshotRef=dataset.current_snapshot_id;s.reviewState.snapshotId=s.snapshotRef;
      await db.query('UPDATE app.slides SET dataset_id=$2 WHERE id=$1',[s.id,did]);
      }
      await insertRevision(db, Number(actor), s);
      return getSlide(db,Number(actor),s.id);
    });
    res.status(201).json(copied);
  });
  app.get("/api/themes", async (_req, res) =>
    res.json({
      items: (
        await pool.query("SELECT * FROM app.themes ORDER BY id")
      ).rows.map((r) => ({
        id: r.id,
        version: r.version,
        name: r.name,
        fontFace: "SimHei",
        background: "FFFFFF",
        textColor: "1F2937",
        seriesColors:
          r.id === "neutral"
            ? ["475569", "94A3B8", "64748B", "CBD5E1"]
            : ["2563EB", "94A3B8", "0891B2", "7C3AED"],
      })),
    }),
  );
  app.get("/api/templates", async (_req, res) =>
    res.json({
      items: (
        await pool.query(
          `SELECT DISTINCT ON(t.id) t.id,t.owner_id,t.visibility,t.folder_id,v.*,f.owner_id IS NOT NULL AS favorite FROM app.templates t JOIN app.template_versions v ON v.template_id=t.id LEFT JOIN app.template_favorites f ON f.template_id=t.id AND f.owner_id=$1 WHERE (t.owner_id=$1 OR t.visibility='public') AND t.archived_at IS NULL ORDER BY t.id,v.version DESC`,
          [Number(actor)],
        )
      ).rows.map((r) => ({
        ...r.payload,
        id: r.id,
        version: r.version,
        name: r.name,
        scene: r.scene,
        favorite: r.favorite,
        ownerId:Number(r.owner_id),visibility:r.visibility,folderId:r.folder_id,canEdit:Number(r.owner_id)===Number(Number(actor)),canDelete:Number(r.owner_id)===Number(Number(actor)),
        themeRef: { id: r.theme_id, version: r.theme_version },
      })),
    }),
  );
  app.put("/api/templates/:id/favorite", async (req, res) => {
    await template(pool, Number(actor), req.params.id);
    await pool.query(
      "INSERT INTO app.template_favorites(owner_id,template_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [Number(actor), req.params.id],
    );
    res.json({ favorite: true });
  });
  app.delete("/api/templates/:id/favorite", async (req, res) => {
    await template(pool, Number(actor), req.params.id);
    await pool.query(
      "DELETE FROM app.template_favorites WHERE owner_id=$1 AND template_id=$2",
      [Number(actor), req.params.id],
    );
    res.json({ favorite: false });
  });
  app.post("/api/templates", async (req, res) => {
    const s = await getSlide(pool, Number(actor), req.body.slideId);
    const tid = id("template");
    const elements = structuredClone(s.elements).map((e: any) => {
      const override = s.layoutOverrides?.[e.id];
      e.rect = { ...e.rect, ...override?.rect };
      e.style = { ...e.style, ...override?.style };

      return e;
    });
    const chartType = elements.find((e:any)=>e.type === "chart")?.chartType;
    const chartDefinition = PHASE2_TEMPLATES.find(t=>t.chartType === chartType);
    const payload = {
      example: captureTemplateExample(await getData(pool, Number(actor), s.snapshotRef), s),
      chartType,
      ...(chartDefinition ? {bindingSchema:{main:{roles:chartDefinition.roles}}} : {}),
      defaultBindings: structuredClone(s.bindings),
      requiredBindings: Object.fromEntries(
        Object.entries(s.bindings).map(([name, b]: any) => [
          name,
          {
            roles: Object.keys(b.roles),
            computations: (b.computations || []).map((c: any) => ({
              id: c.id,
              rule: c.rule,
            })),
          },
        ]),
      ),
      canvas: s.canvas,
      slots: [],
      annotationPolicy: "clearDataAnchorsOnReuse",
      annotationPolicyMessage:
        "复用模板时清除与原数据行关联的标注，请在新数据上重新添加。",
      defaultElements: elements,
      allowedControls: ["text", "layout", "theme", "chartOptions"],
      exportCapabilities: ["nativeChart", "editableShapes"],
    };
    const name = String(req.body.name || s.title).slice(0, 200);
    await transaction(pool, async (db) => {
      const refs = await authorizeAssets(db, Number(actor), payload);
      await db.query(
        "INSERT INTO app.templates(id,owner_id,visibility) VALUES($1,$2,'private')",
        [tid, Number(actor)],
      );
      await db.query(
        "INSERT INTO app.template_versions(template_id,version,name,scene,theme_id,theme_version,payload) VALUES($1,1,$2,$3,$4,$5,$6)",
        [tid, name, s.scene, s.themeRef.id, s.themeRef.version, payload],
      );
      for (const a of refs)
        await db.query("INSERT INTO app.template_asset_refs VALUES($1,1,$2)", [
          tid,
          a,
        ]);
    });
    res
      .status(201)
      .json({ id: tid, version: 1, name, scene: s.scene, ...payload });
  });
  app.post("/api/slides/:id/preview", async (req, res) => {
    const original = await getSlide(pool, Number(actor), req.params.id);
    const s = req.body.slide || original;
    const d = await getData(pool, Number(actor), s.snapshotRef);
    await authorizeAssets(pool, Number(actor), s);
    res.json(compileSlide(s, d, "draft"));
  });
  const compiledRevision = async (
    slideId: string,
    revision: number,
    mode: any,
  ) => {
    if (!Number.isInteger(revision) || revision < 1)
      fail(400, "REVISION_REQUIRED", "请提供修订号");
    if (!["draft", "final"].includes(mode))
      fail(400, "INVALID_MODE", "请选择草稿或最终版");
    const s = await getSlide(pool, Number(actor), slideId, revision);
    const d = await getData(pool, Number(actor), s.snapshotRef);
    await authorizeAssets(pool, Number(actor), s);
    const c = compileSlide(s, d, mode);
    return { s, d, c };
  };
  app.post("/api/slides/:id/preflight", async (req, res) => {
    const { c } = await compiledRevision(
      req.params.id,
      req.body.revision,
      req.body.deliveryMode,
    );
    res.json({ diagnostics: c.diagnostics });
  });
  const jobView = (r: any) => ({
    id: r.id,
    state: r.status,
    status: r.status,
    slideId: r.slide_id,
    deckId: r.deck_id ?? null,
    previewId: r.preview_id ?? null,
    title: r.export_spec?.provenance?.title ?? null,
    revision: r.deck_revision ?? r.slide_revision,
    deliveryMode: r.delivery_mode,
    inputHash: r.input_hash,
    attemptCount: r.attempt_count,
    createdAt: r.created_at,
    finishedAt: r.finished_at,
    errorCode: r.error_code,
    errorDetail: r.error_detail,
    fileUrl: r.status === "succeeded" ? `/api/export-jobs/${r.id}/file.pptx` : null,
    manifestUrl:
      r.status === "succeeded" ? `/api/export-jobs/${r.id}/manifest` : null,
  });
  registerDeckRoutes(app,pool,actor,storageDir,jobView,key);
  registerContentRoutes(app,pool,actor,key);
  const getJob = async (jid: string) => {
    const r = (
      await pool.query(
        "SELECT * FROM app.export_jobs WHERE id=$1 AND owner_id=$2",
        [jid, Number(actor)],
      )
    ).rows[0];
    if (!r) fail(404, "NOT_FOUND", "导出任务不存在");
    return r;
  };
  const insertJob = async (
    k: string,
    sid: string,
    rev: number,
    mode: string,
    exp: any,
    fingerprint: string,
    historical=false,
  ) => {
    const prior = (
      await pool.query(
        "SELECT * FROM app.export_jobs WHERE owner_id=$1 AND idempotency_key=$2",
        [Number(actor), k],
      )
    ).rows[0];
    if (prior) {
      if (prior.input_hash !== fingerprint || prior.slide_id !== sid || prior.slide_revision !== rev || prior.delivery_mode !== mode)
        fail(409, "IDEMPOTENCY_CONFLICT", "幂等键输入不同");
      return prior;
    }
    try {
      return (
        await transaction(pool,async db=>{
          if(!historical){
            const link=(await db.query('SELECT dataset_id FROM app.slides WHERE id=$1 AND owner_id=$2',[sid,Number(actor)])).rows[0];
            if(link?.dataset_id)await lockDataset(db,Number(actor),link.dataset_id);
            await db.query('SELECT id FROM app.slides WHERE id=$1 AND owner_id=$2 FOR UPDATE',[sid,Number(actor)]);
            const current=await getSlide(db,Number(actor),sid);if(current.revision!==rev)fail(409,'REVISION_CONFLICT','页面数据已更新，请重新加载并复核');
          }
          return db.query(
          `INSERT INTO app.export_jobs(id,owner_id,slide_id,slide_revision,idempotency_key,input_hash,delivery_mode,export_spec) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [id("job"), Number(actor), sid, rev, k, fingerprint, mode, exp],
        )})
      ).rows[0];
    } catch (e: any) {
      if (e.code === "23505")
        return insertJob(k, sid, rev, mode, exp, fingerprint,historical);
      throw e;
    }
  };
  app.post("/api/export-jobs", async (req, res) => {
    if(!(await pool.query('SELECT 1 FROM app.slides WHERE id=$1 AND owner_id=$2',[req.body.slideId,Number(actor)])).rowCount)fail(403,'OWNER_REQUIRED','公共文稿请从文稿入口导出');
    const k = key(req);
    const prior=(await pool.query('SELECT * FROM app.export_jobs WHERE owner_id=$1 AND idempotency_key=$2',[Number(actor),k])).rows[0];
    if(prior){if(prior.slide_id!==req.body.slideId||prior.slide_revision!==req.body.revision||prior.delivery_mode!==req.body.deliveryMode)fail(409,'IDEMPOTENCY_CONFLICT','幂等键输入不同');res.status(202).json(jobView(prior));return;}
    if(req.body.deliveryMode==='final'){const page=await getSlide(pool,Number(actor),req.body.slideId);if(page.extensions?.dataset?.refreshMode==='biStudioMock')await refreshDataset(pool,Number(actor),page.extensions.dataset.id);}
    const latest=await getSlide(pool,Number(actor),req.body.slideId);
    if(latest.revision!==req.body.revision)fail(409,'REVISION_CONFLICT','页面数据已更新，请重新加载并复核');
    const { s, d, c } = await compiledRevision(
      req.body.slideId,
      req.body.revision,
      req.body.deliveryMode,
    );
    const errors = c.diagnostics.filter((x: any) => x.severity === "error");
    if (
      req.body.deliveryMode === "final" &&
      s.reviewState.status === "needsReview"
    )
      errors.push({
        code: "REVIEW_REQUIRED",
        message: "请先复核业务结论",
        severity: "error",
      });
    if (errors.length)
      throw new HttpError(422, "PREFLIGHT_FAILED", "导出预检失败", errors);
    const refs = assetIds(c);
    const assets = refs.length
      ? (
          await pool.query(
            "SELECT a.id,o.storage_key,o.sha256 FROM app.assets a JOIN app.storage_objects o ON o.id=a.original_object_id WHERE a.id=ANY($1::text[]) AND (a.owner_id=$2 OR a.visibility='public')",
            [refs, Number(actor)],
          )
        ).rows
      : [];
    const exp = {
      exportSpecVersion: "1.0",
      provenance: {
        slideId: s.id,
        revision: s.revision,
        snapshotId: d.snapshot.id,
        snapshotHash: d.snapshot.contentHash,
        generatorVersion: "slidebi-1",
        dataset: s.extensions?.dataset,
      },
      canvas: c.canvas,
      theme: c.theme,
      assets,
      slides: [c],
      navigation: [],
      diagnostics: c.diagnostics,
    };
    const fp = hash({ exp, mode: req.body.deliveryMode });
    res
      .status(202)
      .json(
        jobView(
          await insertJob(k, s.id, s.revision, req.body.deliveryMode, exp, fp),
        ),
      );
  });
  app.get("/api/export-jobs", async (_req, res) =>
    res.json({
      items: (
        await pool.query(
          "SELECT * FROM app.export_jobs WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",
          [Number(actor)],
        )
      ).rows.map(jobView),
    }),
  );
  app.get("/api/export-jobs/:id", async (req, res) =>
    res.json(jobView(await getJob(req.params.id))),
  );
  app.delete('/api/export-jobs/:id',async(req,res)=>{
    const objects=await transaction(pool,async db=>{
      const job=(await db.query('SELECT * FROM app.export_jobs WHERE id=$1 AND owner_id=$2 FOR UPDATE',[req.params.id,Number(actor)])).rows[0];
      if(!job)fail(404,'NOT_FOUND','导出任务不存在');
      if(['queued','running'].includes(job.status))fail(409,'EXPORT_IN_PROGRESS','正在生成的导出任务不能删除');
      const ids=[job.pptx_object_id,job.manifest_object_id].filter(Boolean);
      const rows=ids.length?(await db.query('SELECT id,storage_key FROM app.storage_objects WHERE id=ANY($1::bigint[])',[ids])).rows:[];
      await db.query('DELETE FROM app.export_jobs WHERE id=$1 AND owner_id=$2',[job.id,Number(actor)]);
      if(ids.length)await db.query('DELETE FROM app.storage_objects WHERE id=ANY($1::bigint[])',[ids]);
      return rows;
    });
    await Promise.all(objects.map((object:any)=>rm(path.join(storageDir,object.storage_key),{force:true})));
    res.status(204).end();
  });
  app.post("/api/export-jobs/:id/cancel", async (req, res) => {
    await getJob(req.params.id);
    await pool.query(
      `UPDATE app.export_jobs SET status='cancelled',finished_at=now(),lease_token=NULL,lease_expires_at=NULL WHERE id=$1 AND owner_id=$2 AND status IN('queued','running')`,
      [req.params.id, Number(actor)],
    );
    res.json(jobView(await getJob(req.params.id)));
  });
  app.post("/api/export-jobs/:id/retry", async (req, res) => {
    const old = await getJob(req.params.id);
    if (!["failed", "cancelled"].includes(old.status))
      fail(409, "JOB_NOT_RETRYABLE", "仅失败或取消任务可以重试");
    res
      .status(202)
      .json(
        jobView(
          await (old.deck_id ? insertDeckJob(pool,Number(actor),key(req),old.deck_id,old.deck_revision,old.preview_id,old.delivery_mode,old.export_spec,old.input_hash) : insertJob(
            key(req),
            old.slide_id,
            old.slide_revision,
            old.delivery_mode,
            old.export_spec,
            old.input_hash,
            true,
          )),
        ),
      );
  });
  for (const kind of ["file", "file.pptx", "manifest"])
    app.get(`/api/export-jobs/:id/${kind}`, async (req, res) => {
      const j = await getJob(req.params.id);
      if (j.status !== "succeeded")
        fail(409, "ARTIFACT_NOT_READY", "文件尚未生成");
      const obj = (
        await pool.query("SELECT * FROM app.storage_objects WHERE id=$1", [
          kind !== "manifest" ? j.pptx_object_id : j.manifest_object_id,
        ])
      ).rows[0];
      const p = path.join(storageDir, obj.storage_key);
      try {
        const bytes = await readFile(p);
        if (bytesHash(bytes) !== obj.sha256)
          fail(410, "ARTIFACT_UNAVAILABLE", "文件校验失败，请重新导出");
      } catch {
        fail(410, "ARTIFACT_UNAVAILABLE", "文件不可用，请重新导出");
      }
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (kind !== "manifest")
        res.type("application/vnd.openxmlformats-officedocument.presentationml.presentation");
      res.download(p, `slidebi-${j.id}.${kind !== "manifest" ? "pptx" : "json"}`);
    });
  await registerAssetRoutes(app, pool, actor, storageDir);
  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status =
        err instanceof HttpError
          ? err.status
          : err.type === "entity.too.large" || err.code === "LIMIT_FILE_SIZE"
            ? 413
            : err instanceof SyntaxError
              ? 400
              : 500;
      if (status === 500)
        console.error(
          "API failure",
          res.locals.requestId,
          err.code || err.message,
          err.constraint,
        );
      res
        .status(status)
        .json({
          code:
            err instanceof HttpError
              ? err.code
              : status === 413
                ? "PAYLOAD_TOO_LARGE"
                : status === 400
                  ? "INVALID_JSON"
                  : "INTERNAL_ERROR",
          message:
            err instanceof HttpError
              ? err.message
              : status === 500
                ? "操作失败，请稍后重试"
                : "请求格式或大小不符合要求",
          fieldErrors: err.fieldErrors,
          requestId: res.locals.requestId,
        });
    },
  );
  const stop =
    options.workerEnabled === false
      ? async () => {}
      : startWorker(pool, storageDir, options.exporter);
  app.locals.close = async () => {
    await stop();
    if (!options.pool) await pool.end();
  };
  return app;
}
