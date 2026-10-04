import type { Pool } from "pg";
import JSZip from "jszip";
import type { CompiledSlide } from "@slidebi/presentation";
import { writeFile, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { transaction, bytesHash } from "./db.ts";
export type Exporter = (
  compiled: CompiledSlide,
  outputPath: string,
  resolveAsset: (id: string) => Promise<string>,
) => Promise<void>;
export function startWorker(pool: Pool, storageDir: string, custom?: Exporter) {
  let stopped = false;
  let active: Promise<void> | undefined;
  const run = async () => {
    await pool.query(
      `UPDATE app.export_jobs SET status=CASE WHEN attempt_count>=max_attempts THEN 'failed' ELSE 'queued' END,finished_at=CASE WHEN attempt_count>=max_attempts THEN now() ELSE NULL END,lease_token=NULL,lease_expires_at=NULL,available_at=now()+interval '2 seconds',error_code='LEASE_EXPIRED' WHERE status='running' AND lease_expires_at<=now()`,
    );
    const token = randomUUID();
    const job = (
      await pool.query(
        `WITH candidate AS (SELECT id FROM app.export_jobs WHERE status='queued' AND available_at<=now() AND attempt_count<max_attempts ORDER BY available_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE app.export_jobs j SET status='running',attempt_count=attempt_count+1,lease_token=$1,lease_expires_at=now()+interval '90 seconds' FROM candidate c WHERE j.id=c.id RETURNING j.*`,
        [token],
      )
    ).rows[0];
    if (!job) return;
    const heartbeat = setInterval(() => {
      pool
        .query(
          `UPDATE app.export_jobs SET lease_expires_at=now()+interval '90 seconds' WHERE id=$1 AND status='running' AND lease_token=$2 AND lease_expires_at>now()`,
          [job.id, token],
        )
        .catch(() => {});
    }, 20000);
    heartbeat.unref();
    try {
      const writers = await import("./export/pptx.ts");
      const exporter = custom || writers.writePptx;
      const pptxKey = `exports/${job.id}-${token}.pptx`,
        manifestKey = `exports/${job.id}-${token}.json`;
      const tmpPath = path.join(storageDir, `tmp/${job.id}-${token}.pptx`);
      let timeout: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        (job.deck_id ? writers.writeDeckPptx : exporter)(job.deck_id ? job.export_spec.slides : job.export_spec.slides[0], tmpPath, async (aid: string) => {
          const a = job.export_spec.assets.find((x: any) => x.id === aid);
          if (!a) throw new Error("Unknown frozen asset");
          const assetPath = path.join(storageDir, a.storage_key);
          if (bytesHash(await readFile(assetPath)) !== a.sha256)
            throw new Error("Frozen asset checksum mismatch");
          return assetPath;
        }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Export timeout")),
            120000,
          );
          timeout.unref();
        }),
      ]).finally(() => {
        if (timeout) clearTimeout(timeout);
      });
      const stillOwned = await pool.query(
        `SELECT 1 FROM app.export_jobs WHERE id=$1 AND status='running' AND lease_token=$2 AND lease_expires_at>now()`,
        [job.id, token],
      );
      if (!stillOwned.rowCount) return;
      await rename(tmpPath, path.join(storageDir, pptxKey));
      const pptx = await readFile(path.join(storageDir, pptxKey));
      if (pptx.length < 4 || pptx[0] !== 0x50 || pptx[1] !== 0x4b)
        throw new Error("Invalid PPTX artifact");
      const zip = await JSZip.loadAsync(pptx, { checkCRC32: true });
      if (
        !zip.file("[Content_Types].xml") ||
        !zip.file("ppt/presentation.xml") ||
        !zip.file("ppt/slides/slide1.xml")
      )
        throw new Error("Incomplete PPTX package");
      const manifest = Buffer.from(
        JSON.stringify(
          {
            ...job.export_spec,
            jobId: job.id,
            inputHash: job.input_hash,
            deliveryMode: job.delivery_mode,
          },
          null,
          2,
        ),
      );
      await writeFile(path.join(storageDir, manifestKey), manifest, {
        flag: "wx",
      });
      await transaction(pool, async (db) => {
        const owned = await db.query(
          `SELECT id FROM app.export_jobs WHERE id=$1 AND status='running' AND lease_token=$2 AND lease_expires_at>now() FOR UPDATE`,
          [job.id, token],
        );
        if (!owned.rowCount) return;
        const ids = [];
        for (const [key, buf, mime] of [
          [
            pptxKey,
            pptx,
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          ],
          [manifestKey, manifest, "application/json"],
        ] as const)
          ids.push(
            (
              await db.query(
                "INSERT INTO app.storage_objects(storage_key,sha256,mime_type,byte_size) VALUES($1,$2,$3,$4) RETURNING id",
                [key, bytesHash(buf), mime, buf.length],
              )
            ).rows[0].id,
          );
        await db.query(
          `UPDATE app.export_jobs SET status='succeeded',finished_at=now(),pptx_object_id=$3,manifest_object_id=$4,lease_token=NULL,lease_expires_at=NULL,error_code=NULL,error_detail=NULL WHERE id=$1 AND status='running' AND lease_token=$2 AND lease_expires_at>now()`,
          [job.id, token, ids[0], ids[1]],
        );
      });
    } catch {
      await pool.query(
        `UPDATE app.export_jobs SET status=CASE WHEN attempt_count>=max_attempts THEN 'failed' ELSE 'queued' END,finished_at=CASE WHEN attempt_count>=max_attempts THEN now() ELSE NULL END,available_at=now()+(power(2,attempt_count)*interval '1 second'),lease_token=NULL,lease_expires_at=NULL,error_code='EXPORT_FAILED',error_detail='{"message":"文件生成失败"}'::jsonb WHERE id=$1 AND status='running' AND lease_token=$2 AND lease_expires_at>now()`,
        [job.id, token],
      );
    } finally {
      clearInterval(heartbeat);
    }
  };
  const tick = () => {
    if (stopped || active) return;
    active = run()
      .catch((e) =>
        console.error("Worker database failure", e.code || "unknown"),
      )
      .finally(() => {
        active = undefined;
      });
  };
  const timer = setInterval(tick, 250);
  timer.unref();
  tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await active;
  };
}
