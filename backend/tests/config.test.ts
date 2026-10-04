import { describe, expect, it } from "vitest";
import {
  loadDatabaseSetupConfig,
  loadRuntimeConfig,
} from "../src/config.ts";

describe("runtime configuration", () => {
  it("provides portable local defaults without a developer-specific account", () => {
    const config = loadRuntimeConfig({});
    const database = loadDatabaseSetupConfig({});

    expect(config.http).toMatchObject({ host: "127.0.0.1", port: 4310 });
    expect(config.databaseUrl).toBe(
      "postgresql://slidebi_app@localhost:5432/slidebi",
    );
    expect(config.allowedOrigins).toContain("http://127.0.0.1:5173");
    expect(database.adminUrl).toBe("postgresql://localhost:5432/postgres");
    expect(`${config.databaseUrl} ${database.adminUrl}`).not.toContain(
      "zhangxiading",
    );
  });

  it("parses explicit network, storage and integration settings", () => {
    const config = loadRuntimeConfig({
      DATABASE_URL: "postgresql://app:secret@db.example.test:5432/reports",
      SLIDEBI_STORAGE_DIR: "./runtime-files",
      SLIDEBI_HOST: "0.0.0.0",
      SLIDEBI_PORT: "8080",
      SLIDEBI_JSON_LIMIT: "12mb",
      SLIDEBI_ALLOWED_ORIGINS:
        "https://reports.example.test, http://127.0.0.1:5173",
      SLIDEBI_BI_BASE_URL: "https://bi.example.test/api",
    });

    expect(config.http).toEqual({ host: "0.0.0.0", port: 8080 });
    expect(config.jsonLimit).toBe("12mb");
    expect(config.allowedOrigins).toEqual([
      "https://reports.example.test",
      "http://127.0.0.1:5173",
    ]);
    expect(config.storageDir).toMatch(/runtime-files$/);
    expect(config.biStudioBaseUrl).toBe("https://bi.example.test/api");
  });

  it.each([
    [{ SLIDEBI_PORT: "0" }, "SLIDEBI_PORT"],
    [{ SLIDEBI_JSON_LIMIT: "unlimited" }, "SLIDEBI_JSON_LIMIT"],
    [{ SLIDEBI_ALLOWED_ORIGINS: "file:///tmp/app" }, "SLIDEBI_ALLOWED_ORIGINS"],
    [{ SLIDEBI_DB_NAME: "bad-name" }, "SLIDEBI_DB_NAME"],
  ])("rejects invalid configuration %o", (environment, field) => {
    const read = field === "SLIDEBI_DB_NAME"
      ? () => loadDatabaseSetupConfig(environment)
      : () => loadRuntimeConfig(environment);
    expect(read).toThrow(field);
  });
});
