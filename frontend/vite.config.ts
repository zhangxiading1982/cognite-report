import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function webPort(): number {
  const value = Number(process.env.SLIDEBI_WEB_PORT ?? 5173);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error("SLIDEBI_WEB_PORT must be an integer from 1 to 65535");
  }
  return value;
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: process.env.SLIDEBI_WEB_HOST?.trim() || "127.0.0.1",
    port: webPort(),
    proxy: {
      "/api":
        process.env.SLIDEBI_API_PROXY_TARGET?.trim() ||
        "http://127.0.0.1:4310",
    },
  },
});
