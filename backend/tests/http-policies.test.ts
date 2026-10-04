import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  installHttpPolicies,
  requireIdempotencyKey,
} from "../src/http/policies.ts";

function testApp() {
  const app = express();
  installHttpPolicies(app, {
    jsonLimit: "10mb",
    allowedOrigins: ["http://127.0.0.1:5173"],
  });
  app.all("/probe", (req, res) =>
    res.json({ key: requireIdempotencyKey(req) }),
  );
  app.use((error: any, _req: any, res: any, _next: any) =>
    res.status(error.status ?? 500).json({ code: error.code }),
  );
  return app;
}

describe("HTTP request policies", () => {
  it("preserves read access and emits a request ID", async () => {
    const response = await request(testApp())
      .get("/probe")
      .set("Origin", "https://untrusted.example")
      .set("Idempotency-Key", "read-request");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("accepts configured mutation origins and rejects other origins", async () => {
    const accepted = await request(testApp())
      .post("/probe")
      .set("Origin", "http://127.0.0.1:5173")
      .set("Idempotency-Key", "accepted");
    const rejected = await request(testApp())
      .post("/probe")
      .set("Origin", "https://untrusted.example")
      .set("Idempotency-Key", "rejected");

    expect(accepted.body).toEqual({ key: "accepted" });
    expect(rejected.status).toBe(403);
    expect(rejected.body.code).toBe("ORIGIN_DENIED");
  });

  it("keeps the idempotency key length and presence rules", async () => {
    const missing = await request(testApp()).post("/probe");
    const oversized = await request(testApp())
      .post("/probe")
      .set("Idempotency-Key", "x".repeat(201));

    expect(missing.status).toBe(400);
    expect(oversized.status).toBe(400);
    expect(missing.body.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });
});
