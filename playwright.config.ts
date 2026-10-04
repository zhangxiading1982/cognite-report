import { defineConfig } from "@playwright/test";

const chromePath =
  process.env.SLIDEBI_CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export default defineConfig({
  globalSetup: "./e2e/auth-setup.ts",
  testDir: "./e2e/current",
  workers: 1,
  timeout: 45000,
  use: {
    actionTimeout: 8000,
    storageState: "backend/var/verification/e2e-auth.json",
    baseURL:
      process.env.SLIDEBI_E2E_BASE_URL ?? "http://127.0.0.1:5173",
    viewport: { width: 1512, height: 982 },
    launchOptions: { executablePath: chromePath },
  },
  reporter: "list",
});
