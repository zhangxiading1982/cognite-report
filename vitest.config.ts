import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    // PostgreSQL integration files mutate the same slidebi_test database and must run serially.
    maxWorkers: 1,
  },
});
