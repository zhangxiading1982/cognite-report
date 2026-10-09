import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { loadDatabaseSetupConfig } from "./config.ts";

// Administrative setup is deliberately separate from the least-privileged application connection.
const { databaseName: database, adminUrl } = loadDatabaseSetupConfig();
const admin = new pg.Client({
  connectionString: adminUrl,
});
await admin.connect();
try {
  for (const [role, attributes] of [
    ["slidebi_owner", "NOLOGIN"],
    ["slidebi_runtime", "NOLOGIN"],
    ["slidebi_app", "LOGIN IN ROLE slidebi_runtime"],
  ]) {
    const exists = await admin.query(
      "SELECT 1 FROM pg_roles WHERE rolname=$1",
      [role],
    );
    if (!exists.rowCount)
      await admin.query(`CREATE ROLE ${role} ${attributes}`);
  }
  if (
    !(
      await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [
        database,
      ])
    ).rowCount
  )
    await admin.query(
      `CREATE DATABASE ${database} OWNER slidebi_owner ENCODING 'UTF8' TEMPLATE template0`,
    );
  await admin.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
  await admin.query(`GRANT CONNECT ON DATABASE ${database} TO slidebi_runtime`);
  await admin.query(
    `ALTER ROLE slidebi_app IN DATABASE ${database} SET search_path=app,pg_catalog`,
  );
} finally {
  await admin.end();
}
const url = new URL(
  adminUrl,
);
url.pathname = "/" + database;
const db = new pg.Client({ connectionString: url.toString() });
await db.connect();
try {
  const sql = await readFile(
    fileURLToPath(new URL("../migrations/001-phase1.sql", import.meta.url)),
    "utf8",
  );
  const hash = createHash("sha256").update(sql).digest("hex");
  await db.query("BEGIN");
  await db.query("SELECT pg_advisory_xact_lock(72638101)");
  await db.query("SET LOCAL ROLE slidebi_owner");
  const existing = await db.query(
    "SELECT to_regclass('app.users') AS installed",
  );
  if (!existing.rows[0].installed) await db.query(sql);
  await db.query(
    "CREATE TABLE IF NOT EXISTS app.schema_migrations(version integer PRIMARY KEY, content_hash text NOT NULL, installed_at timestamptz NOT NULL DEFAULT now())",
  );
  const prior = await db.query(
    "SELECT content_hash FROM app.schema_migrations WHERE version=1",
  );
  if (prior.rowCount && prior.rows[0].content_hash !== hash)
    throw new Error(
      "Migration 001 checksum mismatch: create a new migration instead of editing applied SQL",
    );
  if (!prior.rowCount)
    await db.query(
      "INSERT INTO app.schema_migrations(version,content_hash) VALUES(1,$1)",
      [hash],
    );
  const migrationDir = new URL('../migrations/', import.meta.url);
  const files = (await readdir(migrationDir)).filter(name => /^\d{3}-.+\.sql$/.test(name)).sort();
  for (const file of files) {
    const version = Number(file.slice(0, 3));
    if (version === 1) continue;
    const body = await readFile(new URL(file, migrationDir), 'utf8');
    const checksum = createHash('sha256').update(body).digest('hex');
    const applied = await db.query('SELECT content_hash FROM app.schema_migrations WHERE version=$1', [version]);
    if (applied.rowCount) {
      if (applied.rows[0].content_hash !== checksum) throw new Error('Applied migration checksum mismatch: '+file);
    } else {
      await db.query(body);
      await db.query('INSERT INTO app.schema_migrations(version,content_hash) VALUES($1,$2)', [version,checksum]);
    }
  }
  await db.query("COMMIT");
  console.log(`Slide Report 数据库已就绪：${database} / app，运行账号 slidebi_app`);
} catch (error) {
  await db.query("ROLLBACK");
  throw error;
} finally {
  await db.end();
}
