import { createApp } from "./app.ts";
import { loadRuntimeConfig } from "./config.ts";

const runtimeConfig = loadRuntimeConfig();
const app = await createApp({ runtimeConfig });
const server = app.listen(
  runtimeConfig.http.port,
  runtimeConfig.http.host,
  () =>
    console.log(
      `SlideBI API http://${runtimeConfig.http.host}:${runtimeConfig.http.port}`,
    ),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.close(async () => {
      await app.locals.close();
      process.exit(0);
    });
  });
