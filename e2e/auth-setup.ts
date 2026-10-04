import { mkdir } from "node:fs/promises";
import { request, type FullConfig } from "@playwright/test";

export default async function setup(config: FullConfig) {
  const api = await request.newContext({
    baseURL: String(config.projects[0].use.baseURL),
  });
  const response = await api.post("/api/auth/login", {
    data: {
      username: process.env.SLIDEBI_E2E_USERNAME ?? "marx",
      password: process.env.SLIDEBI_E2E_PASSWORD ?? "admin",
    },
  });
  if (!response.ok()) {
    throw new Error(`E2E login failed: ${response.status()}`);
  }
  await mkdir("backend/var/verification", { recursive: true });
  await api.storageState({
    path: "backend/var/verification/e2e-auth.json",
  });
  await api.dispose();
}
