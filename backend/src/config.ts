import path from "node:path";
import { fileURLToPath } from "node:url";

type Environment = Readonly<Record<string, string | undefined>>;

export interface RuntimeConfig {
  databaseUrl: string;
  storageDir: string;
  http: {
    host: string;
    port: number;
  };
  jsonLimit: string;
  allowedOrigins: string[];
  biStudioBaseUrl?: string;
}

export interface DatabaseSetupConfig {
  databaseName: string;
  adminUrl: string;
}

const DEFAULT_DATABASE_URL =
  "postgresql://slidebi_app@localhost:5432/slidebi";
const DEFAULT_ADMIN_URL = "postgresql://localhost:5432/postgres";

function parsePostgresUrl(value: string, field: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${field} must be a valid PostgreSQL URL`);
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error(`${field} must use the postgresql protocol`);
  return value;
}

function parseHttpUrl(value: string, field: string, originOnly = false): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${field} must contain valid HTTP URLs`);
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error(`${field} must contain HTTP or HTTPS URLs`);
  if (originOnly && (url.pathname !== "/" || url.search || url.hash))
    throw new Error(`${field} entries must be origins without paths`);
  return originOnly ? url.origin : value.replace(/\/$/, "");
}

function parsePort(value: string | undefined): number {
  const port = value === undefined ? 4310 : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error("SLIDEBI_PORT must be an integer from 1 to 65535");
  return port;
}

function parseWebPort(value: string | undefined): number {
  const port = value === undefined ? 5173 : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error("SLIDEBI_WEB_PORT must be an integer from 1 to 65535");
  return port;
}

function parseJsonLimit(value: string | undefined): string {
  const limit = value?.trim().toLowerCase() || "10mb";
  if (!/^\d+(?:kb|mb)$/.test(limit))
    throw new Error("SLIDEBI_JSON_LIMIT must use a value such as 512kb or 10mb");
  return limit;
}

/**
 * Reads and validates process-level configuration in one place.
 *
 * The function accepts an explicit environment map so tests and embedded app
 * instances can validate configuration without mutating global process state.
 */
export function loadRuntimeConfig(
  environment: Environment = process.env,
): RuntimeConfig {
  const host = environment.SLIDEBI_HOST?.trim() || "127.0.0.1";
  if (!host || /\s/.test(host) || host.length > 255)
    throw new Error("SLIDEBI_HOST must be a valid host name or IP address");
  const port = parsePort(environment.SLIDEBI_PORT ?? environment.PORT);
  const webPort = parseWebPort(environment.SLIDEBI_WEB_PORT);
  const configuredOrigins = environment.SLIDEBI_ALLOWED_ORIGINS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowedOrigins = [
    ...new Set(
      (configuredOrigins?.length
        ? configuredOrigins
        : [
            `http://localhost:${webPort}`,
            `http://127.0.0.1:${webPort}`,
            `http://localhost:${port}`,
            `http://127.0.0.1:${port}`,
          ]
      ).map((value) =>
        parseHttpUrl(value, "SLIDEBI_ALLOWED_ORIGINS", true),
      ),
    ),
  ];
  const biStudioBaseUrl = environment.SLIDEBI_BI_BASE_URL?.trim();

  return {
    databaseUrl: parsePostgresUrl(
      environment.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL,
      "DATABASE_URL",
    ),
    storageDir: path.resolve(
      environment.SLIDEBI_STORAGE_DIR?.trim() ||
        fileURLToPath(new URL("../var", import.meta.url)),
    ),
    http: { host, port },
    jsonLimit: parseJsonLimit(environment.SLIDEBI_JSON_LIMIT),
    allowedOrigins,
    ...(biStudioBaseUrl
      ? {
          biStudioBaseUrl: parseHttpUrl(
            biStudioBaseUrl,
            "SLIDEBI_BI_BASE_URL",
          ),
        }
      : {}),
  };
}

/** Configuration used only by the privileged database bootstrap command. */
export function loadDatabaseSetupConfig(
  environment: Environment = process.env,
): DatabaseSetupConfig {
  const databaseName = environment.SLIDEBI_DB_NAME?.trim() || "slidebi";
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(databaseName))
    throw new Error(
      "SLIDEBI_DB_NAME must start with a letter and contain only lowercase letters, digits and underscores",
    );
  return {
    databaseName,
    adminUrl: parsePostgresUrl(
      environment.SLIDEBI_ADMIN_URL?.trim() || DEFAULT_ADMIN_URL,
      "SLIDEBI_ADMIN_URL",
    ),
  };
}
