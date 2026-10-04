import { test, afterAll } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import request from "supertest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.ts";
const TEST_DATABASE_URL =
  process.env.SLIDEBI_TEST_DATABASE_URL ||
  "postgresql://slidebi_app@localhost:5432/slidebi_test";
if (!new URL(TEST_DATABASE_URL).pathname.endsWith("_test"))
  throw new Error(
    "API integration tests require a dedicated database ending in _test",
  );
const TEST_STORAGE = await mkdtemp(path.join(tmpdir(), "slidebi-api-test-"));
afterAll(async () => {
  await rm(TEST_STORAGE, { recursive: true, force: true });
});

test("atomic import, idempotency, CAS, ownership, frozen exports and personal templates", async () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  const actor = async () =>
    Number(
      (
        await pool.query(
          `INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'API test') RETURNING id`,
          [randomUUID()],
        )
      ).rows[0].id,
    );
  const app = await createApp({
    pool,
    storageDir: TEST_STORAGE,
    actorId: await actor(),
    workerEnabled: false,
  });
  const other = await createApp({
    pool,
    storageDir: TEST_STORAGE,
    actorId: await actor(),
    workerEnabled: false,
  });
  try {
    const data = (await request(app).get("/api/fixtures/monthly-operations"))
      .body;
    const key = randomUUID();
    const input = { dataSpec: data, templateId: "budget-comparison" };
    const made = await request(app)
      .post("/api/slides/from-import")
      .set("Idempotency-Key", key)
      .send(input);
    assert.equal(made.status, 201, JSON.stringify(made.body));
    let slide = made.body;
    assert.notEqual(slide.snapshotRef, data.snapshot.id);
    assert.equal(
      (
        await request(app)
          .post("/api/slides/from-import")
          .set("Idempotency-Key", key)
          .send(input)
      ).body.id,
      slide.id,
    );
    assert.equal(
      (
        await request(app)
          .post("/api/slides/from-import")
          .set("Idempotency-Key", key)
          .send({ ...input, title: "different" })
      ).status,
      409,
    );
    assert.equal(
      (await request(other).get("/api/slides/" + slide.id)).status,
      404,
    );
    assert.equal(
      (await request(other).get("/api/data-snapshots/" + slide.snapshotRef))
        .status,
      404,
    );
    const updated = { ...slide, title: "Updated" };
    const saves = await Promise.all(
      [1, 2].map(() =>
        request(app)
          .put("/api/slides/" + slide.id)
          .set("If-Match", "1")
          .send(updated),
      ),
    );
    assert.deepEqual(saves.map((s) => s.status).sort(), [200, 409]);
    slide = saves.find((s) => s.status === 200)!.body;
    const tpl = await request(app)
      .post("/api/templates")
      .send({ slideId: slide.id, name: "Reusable" });
    assert.equal(tpl.status, 201, JSON.stringify(tpl.body));
    assert.equal(JSON.stringify(tpl.body).includes(slide.snapshotRef), false);
    const badFinal = await request(app)
      .post("/api/export-jobs")
      .set("Idempotency-Key", randomUUID())
      .send({
        slideId: slide.id,
        revision: slide.revision,
        deliveryMode: "final",
      });
    assert.equal(badFinal.status, 422);
    const reviewed = await request(app)
      .post(`/api/slides/${slide.id}/review`)
      .send({ revision: slide.revision });
    assert.equal(reviewed.status, 200);
    slide = reviewed.body;
    const jobInput = {
      slideId: slide.id,
      revision: slide.revision,
      deliveryMode: "final",
    };
    const jk = randomUUID();
    const job = await request(app)
      .post("/api/export-jobs")
      .set("Idempotency-Key", jk)
      .send(jobInput);
    assert.equal(job.status, 202, JSON.stringify(job.body));
    assert.equal(
      (
        await request(app)
          .post("/api/export-jobs")
          .set("Idempotency-Key", jk)
          .send(jobInput)
      ).body.id,
      job.body.id,
    );
    assert.equal(
      (await request(other).get(`/api/export-jobs/${job.body.id}`)).status,
      404,
    );
    assert.equal(
      (await request(app).post(`/api/export-jobs/${job.body.id}/cancel`)).body
        .state,
      "cancelled",
    );
  } finally {
    await app.locals.close();
    await other.locals.close();
    await pool.end();
  }
});

test("safe image persistence, unauthorized references, worker retries and immutable revisions", async () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  const actor = Number(
    (
      await pool.query(
        `INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'Worker test') RETURNING id`,
        [randomUUID()],
      )
    ).rows[0].id,
  );
  const app = await createApp({
    pool,
    storageDir: TEST_STORAGE,
    actorId: actor,
    workerEnabled: false,
  });
  try {
    const svg = await request(app)
      .post("/api/assets")
      .attach(
        "file",
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        "unsafe.svg",
      );
    assert.equal(svg.status, 422);
    const sharp = (await import("sharp")).default;
    const png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "#ff0000" },
    })
      .png()
      .toBuffer();
    const asset = await request(app)
      .post("/api/assets")
      .attach("file", png, "red.png");
    assert.equal(asset.status, 201, JSON.stringify(asset.body));
    assert.equal((await request(app).get(asset.body.url)).status, 200);
    const data = (await request(app).get("/api/fixtures/monthly-operations"))
      .body;
    let slide = (
      await request(app)
        .post("/api/slides/from-import")
        .set("Idempotency-Key", randomUUID())
        .send({ dataSpec: data, templateId: "budget-comparison" })
    ).body;
    slide.elements.push({
      id: "uploaded-image",
      type: "image",
      assetId: asset.body.id,
      rect: { x: 800, y: 460, w: 24, h: 24 },
      z: 10,
    });
    let saved = await request(app)
      .put(`/api/slides/${slide.id}`)
      .set("If-Match", "1")
      .send(slide);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    slide = saved.body;
    await assert.rejects(
      pool.query("UPDATE app.slide_revisions SET title=$1 WHERE slide_id=$2", [
        "mutation",
        slide.id,
      ]),
    );
    const bad = structuredClone(slide);
    bad.elements.find((x: any) => x.id === "uploaded-image").assetId =
      "asset-unknown";
    assert.equal(
      (
        await request(app)
          .put(`/api/slides/${slide.id}`)
          .set("If-Match", "2")
          .send(bad)
      ).status,
      404,
    );
    const job = await request(app)
      .post("/api/export-jobs")
      .set("Idempotency-Key", randomUUID())
      .send({ slideId: slide.id, revision: 2, deliveryMode: "draft" });
    assert.equal(job.status, 202, JSON.stringify(job.body));
    const workerApp = await createApp({
      pool,
      storageDir: TEST_STORAGE,
      actorId: actor,
    });
    try {
      let result: any;
      for (let i = 0; i < 80; i++) {
        result = (await request(app).get(`/api/export-jobs/${job.body.id}`))
          .body;
        if (["succeeded", "failed"].includes(result.state)) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.equal(result.state, "succeeded", JSON.stringify(result));
      assert.equal(result.fileUrl, `/api/export-jobs/${job.body.id}/file.pptx`);
      const download = await request(app).get(result.fileUrl);
      assert.equal(download.status, 200);
      assert.equal(download.headers["content-type"], "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      assert.match(download.headers["content-disposition"], /attachment; filename="slidebi-.*\.pptx"/);
      assert.equal((await request(app).get(`/api/export-jobs/${job.body.id}/file`)).status, 200);
      const manifest = await request(app).get(result.manifestUrl);
      assert.equal(manifest.body.provenance.revision, 2);
      const artifacts=(await pool.query('SELECT j.pptx_object_id,j.manifest_object_id,p.storage_key AS pptx_key,m.storage_key AS manifest_key FROM app.export_jobs j JOIN app.storage_objects p ON p.id=j.pptx_object_id JOIN app.storage_objects m ON m.id=j.manifest_object_id WHERE j.id=$1',[job.body.id])).rows[0];
      const deleted=await request(app).delete(`/api/export-jobs/${job.body.id}`);assert.equal(deleted.status,204,JSON.stringify(deleted.body));assert.equal((await request(app).get(`/api/export-jobs/${job.body.id}`)).status,404);assert.equal((await pool.query('SELECT count(*) FROM app.storage_objects WHERE id=ANY($1::bigint[])',[[artifacts.pptx_object_id,artifacts.manifest_object_id]])).rows[0].count,'0');await assert.rejects(readFile(path.join(TEST_STORAGE,artifacts.pptx_key)));await assert.rejects(readFile(path.join(TEST_STORAGE,artifacts.manifest_key)));
    } finally {
      await workerApp.locals.close();
    }
  } finally {
    await app.locals.close();
    await pool.end();
  }
});

test("explicit mapping, concurrent copies, untrusted origin and malformed revisions", async () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  const actor = Number(
    (
      await pool.query(
        `INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'Mapping test') RETURNING id`,
        [randomUUID()],
      )
    ).rows[0].id,
  );
  const app = await createApp({
    pool,
    storageDir: TEST_STORAGE,
    actorId: actor,
    workerEnabled: false,
  });
  try {
    const data = (await request(app).get("/api/fixtures/monthly-operations"))
      .body;
    const original = (
      await request(app)
        .post("/api/slides/from-import")
        .set("Idempotency-Key", randomUUID())
        .send({ dataSpec: data, templateId: "budget-comparison" })
    ).body;
    const renamed = structuredClone(data);
    renamed.resultSets.find((x: any) => x.id === "budget").id = "custom-budget";
    renamed.chartHints = [];
    const bindings = structuredClone(original.bindings);
    bindings.main.resultSetId = "custom-budget";
    const mapped = await request(app)
      .post("/api/slides/from-import")
      .set("Idempotency-Key", randomUUID())
      .send({ dataSpec: renamed, templateId: "budget-comparison", bindings });
    assert.equal(mapped.status, 201, JSON.stringify(mapped.body));
    const ck = randomUUID();
    const copies = await Promise.all(
      [1, 2].map(() =>
        request(app)
          .post(`/api/slides/${original.id}/copy`)
          .set("Idempotency-Key", ck)
          .send({ slide: { ...original, title: "Local draft copy" } }),
      ),
    );
    assert.ok([200, 201].includes(copies[0].status));
    assert.ok([200, 201].includes(copies[1].status));
    assert.equal(copies[0].body.id, copies[1].body.id);
    assert.equal(
      (
        await request(app)
          .put(`/api/slides/${original.id}`)
          .set("If-Match", "1")
          .send({ ...original, elements: null })
      ).status,
      422,
    );
    assert.equal(
      (await request(app).put(`/api/slides/${original.id}`).send(original))
        .status,
      428,
    );
    assert.equal(
      (
        await request(app)
          .post("/api/assets")
          .set("Origin", "https://attacker.invalid")
      ).status,
      403,
    );
  } finally {
    await app.locals.close();
    await pool.end();
  }
});

test("expired lease recovery, transient generation retry and running cancellation fence", async () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  const actor = Number(
    (
      await pool.query(
        `INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'Lease test') RETURNING id`,
        [randomUUID()],
      )
    ).rows[0].id,
  );
  const app = await createApp({
    pool,
    storageDir: TEST_STORAGE,
    actorId: actor,
    workerEnabled: false,
  });
  let worker: any;
  const poll = async (jid: string, target: string) => {
    for (let i = 0; i < 100; i++) {
      const result = (await request(app).get(`/api/export-jobs/${jid}`)).body;
      if (result.state === target) return result;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Job failed to reach " + target);
  };
  try {
    const data = (await request(app).get("/api/fixtures/monthly-operations"))
      .body;
    const slide = (
      await request(app)
        .post("/api/slides/from-import")
        .set("Idempotency-Key", randomUUID())
        .send({ dataSpec: data, templateId: "budget-comparison" })
    ).body;
    const create = async () => {
      // Startup may migrate the linked legacy input and publish a new page revision.
      const current = (await request(app).get(`/api/slides/${slide.id}`)).body;
      const response = await request(app)
        .post("/api/export-jobs")
        .set("Idempotency-Key", randomUUID())
        .send({ slideId: slide.id, revision: current.revision, deliveryMode: "draft" });
      assert.equal(response.status, 202, JSON.stringify(response.body));
      return response.body;
    };
    const expired = await create();
    await pool.query(
      `UPDATE app.export_jobs SET status='running',attempt_count=1,lease_token='stale-token',lease_expires_at=now()-interval '1 minute' WHERE id=$1`,
      [expired.id],
    );
    worker = await createApp({
      pool,
      storageDir: TEST_STORAGE,
      actorId: actor,
    });
    const recovered = await poll(expired.id, "succeeded");
    assert.equal(recovered.attemptCount, 2);
    await worker.locals.close();
    worker = null;
    const retried = await create();
    let attempts = 0;
    const real = (await import("../src/export/pptx.ts")).writePptx;
    worker = await createApp({
      pool,
      storageDir: TEST_STORAGE,
      actorId: actor,
      exporter: async (...args) => {
        if (args[1].includes(`/${retried.id}-`) && ++attempts === 1)
          throw new Error("Transient test fault");
        await real(...args);
      },
    });
    const result = await poll(retried.id, "succeeded");
    assert.equal(result.attemptCount, 2);
    await worker.locals.close();
    worker = null;
    const cancelled = await create();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    worker = await createApp({
      pool,
      storageDir: TEST_STORAGE,
      actorId: actor,
      exporter: async (...args) => {
        if (args[1].includes(`/${cancelled.id}-`)) await gate;
        await real(...args);
      },
    });
    await poll(cancelled.id, "running");
    await request(app).post(`/api/export-jobs/${cancelled.id}/cancel`);
    release();
    await worker.locals.close();
    worker = null;
    assert.equal(
      (await request(app).get(`/api/export-jobs/${cancelled.id}`)).body.state,
      "cancelled",
    );
    assert.equal(
      (await request(app).get(`/api/export-jobs/${cancelled.id}/file`)).status,
      409,
    );
    const retry = await request(app)
      .post(`/api/export-jobs/${cancelled.id}/retry`)
      .set("Idempotency-Key", randomUUID());
    assert.equal(retry.status, 202);
    assert.equal(retry.body.inputHash, cancelled.inputHash);
    await request(app).post(`/api/export-jobs/${retry.body.id}/cancel`);
  } finally {
    if (worker) await worker.locals.close();
    await app.locals.close();
    await pool.end();
  }
}, 20000);

test("personal templates bake layout overrides and reuse on existing snapshots with explicit mappings", async () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  const actor = Number(
    (
      await pool.query(
        `INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'Template regression') RETURNING id`,
        [randomUUID()],
      )
    ).rows[0].id,
  );
  const app = await createApp({
    pool,
    storageDir: TEST_STORAGE,
    actorId: actor,
    workerEnabled: false,
  });
  try {
    const data = (await request(app).get("/api/fixtures/monthly-operations"))
      .body;
    data.chartHints = [];
    const duplicate = structuredClone(
      data.resultSets.find((r: any) => r.id === "budget"),
    );
    duplicate.id = "other-budget";
    data.resultSets.push(duplicate);
    const normal = (await request(app).get("/api/fixtures/monthly-operations"))
      .body;
    const base = (
      await request(app)
        .post("/api/slides/from-import")
        .set("Idempotency-Key", randomUUID())
        .send({ dataSpec: normal, templateId: "budget-comparison" })
    ).body;
    const slide = (
      await request(app)
        .post("/api/slides/from-import")
        .set("Idempotency-Key", randomUUID())
        .send({
          dataSpec: data,
          templateId: "budget-comparison",
          bindings: base.bindings,
        })
    ).body;
    assert.ok(slide.id);
    const title = slide.elements.find((e: any) => e.type === "text");
    const rect = { x: 80, y: 48, w: 760, h: 60 };
    slide.layoutOverrides[title.id] = {
      rect,
      style: { fontSize: 24, color: "884422" },
    };
    const saved = await request(app)
      .put(`/api/slides/${slide.id}`)
      .set("If-Match", "1")
      .send(slide);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const template = await request(app)
      .post("/api/templates")
      .send({ slideId: slide.id, name: "Layout regression" });
    assert.equal(template.status, 201);
    const baked = template.body.defaultElements.find(
      (e: any) => e.id === title.id,
    );
    assert.deepEqual(baked.rect, rect);
    assert.equal(baked.style.fontSize, 24);
    assert.equal(baked.style.color, "884422");
    assert.equal(template.body.annotationPolicy, "clearDataAnchorsOnReuse");
    const reused = await request(app)
      .post("/api/slides")
      .set("Idempotency-Key", randomUUID())
      .send({
        snapshotRef: slide.snapshotRef,
        templateId: template.body.id,
        bindings: slide.bindings,
      });
    assert.equal(reused.status, 201, JSON.stringify(reused.body));
    assert.deepEqual(
      reused.body.elements.find((e: any) => e.id === title.id).rect,
      rect,
    );
    assert.equal(reused.body.templateRef.id, template.body.id);
    const builtin = await request(app)
      .post("/api/slides")
      .set("Idempotency-Key", randomUUID())
      .send({
        snapshotRef: slide.snapshotRef,
        templateId: "budget-comparison",
        bindings: slide.bindings,
      });
    assert.equal(builtin.status, 201, JSON.stringify(builtin.body));
  } finally {
    await app.locals.close();
    await pool.end();
  }
});
