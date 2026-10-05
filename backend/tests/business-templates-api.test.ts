import { afterAll, beforeAll, expect, test } from "vitest";
import { Pool } from "pg";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BUSINESS_TEMPLATES } from "@slidebi/presentation";
import { createApp } from "../src/app.ts";

const pool = new Pool({
  connectionString: "postgresql://slidebi_app@localhost:5432/slidebi_test",
});
let storageDir = "";

beforeAll(async () => {
  storageDir = await mkdtemp(path.join(os.tmpdir(), "slidebi-business-templates-"));
});
afterAll(async () => {
  await pool.end();
  await rm(storageDir, { recursive: true, force: true });
});

test("seeds, previews and imports every P0/P1 commercial template with owned sample data", async () => {
  const actor = Number(
    (
      await pool.query(
        "INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'business template reviewer') RETURNING id",
        [randomUUID()],
      )
    ).rows[0].id,
  );
  const app = await createApp({ pool, actorId: actor, storageDir, workerEnabled: false });

  const list = await request(app).get("/api/templates");
  expect(list.status).toBe(200);
  for (const definition of BUSINESS_TEMPLATES) {
    const item = list.body.items.find((candidate: any) => candidate.id === definition.id);
    expect(item).toMatchObject({ name: definition.name, visibility: "public" });
    expect(item.folderId).toBe(definition.folderId);
    expect(item.seedRevision).toBe(definition.payload.seedRevision);
    expect(item.example.designVersion).toBe(definition.payload.example.designVersion);

    const preview = await request(app).post(`/api/templates/${definition.id}/preview`).send({});
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect(preview.body.compatible).toBe(true);
    expect(preview.body.dataSpec.resultSets.every((result: any) => result.rows.length > 0)).toBe(true);
    expect(preview.body.compiled.diagnostics.filter((entry: any) => entry.severity === "error")).toEqual([]);

    const created = await request(app)
      .post("/api/slides/from-template")
      .set("Idempotency-Key", randomUUID())
      .send({ templateId: definition.id });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.templateRef.id).toBe(definition.id);
    expect(created.body.elements.length).toBeGreaterThan(0);
  }

  await app.locals.close();
});
