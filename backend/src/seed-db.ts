import { createApp } from "./app.ts";

// Build the application once without a worker so all idempotent catalog seeds
// and bundled assets are materialized without starting an HTTP listener.
const app = await createApp({ workerEnabled: false });
await app.locals.close();

console.log("SlideBI 初始化数据已就绪：主题、模板、目录与内置资源");
