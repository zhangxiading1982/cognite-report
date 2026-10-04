import { randomUUID } from "node:crypto";
import express, { type Express, type Request } from "express";
import { fail, HttpError } from "../errors.ts";

export interface HttpPolicyConfig {
  jsonLimit: string;
  allowedOrigins: readonly string[];
}

/** Installs transport-level policies shared by every API route. */
export function installHttpPolicies(
  app: Express,
  config: HttpPolicyConfig,
): void {
  const allowedOrigins = new Set(config.allowedOrigins);
  app.disable("x-powered-by");
  app.use(express.json({ limit: config.jsonLimit }));
  app.use((req, res, next) => {
    res.locals.requestId = randomUUID();
    const origin = req.get("Origin");
    const isRead = ["GET", "HEAD", "OPTIONS"].includes(req.method);
    if (!isRead && origin && !allowedOrigins.has(origin)) {
      next(new HttpError(403, "ORIGIN_DENIED", "请求来源未获允许"));
      return;
    }
    res.setHeader("X-Request-ID", res.locals.requestId);
    next();
  });
}

export function requireIdempotencyKey(req: Request): string {
  const key = req.get("Idempotency-Key");
  if (!key || key.length > 200)
    fail(400, "IDEMPOTENCY_KEY_REQUIRED", "请提供 Idempotency-Key");
  return key;
}
