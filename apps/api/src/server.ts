import { app, logger } from "./app.js";
import { config } from "./config.js";
import { db, redis } from "./db.js";
import { storage } from "./storage.js";
import { cleanup } from "./cleanup.js";
let initialized = false;
for (let attempt = 0; attempt < 15; attempt++) {
  try {
    await storage.init();
    initialized = true;
    break;
  } catch {
    logger.warn({ attempt: attempt + 1 }, "storage not ready");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
if (!initialized) throw new Error("Storage initialization failed");
await db.$connect();
const server = app.listen(config.PORT, () =>
  logger.info({ port: config.PORT }, "api listening"),
);
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
let cleaning: Promise<void> | undefined;
function runCleanup() {
  if (!cleaning)
    cleaning = cleanup()
      .catch(() => {
        logger.error({ kind: "cleanup" }, "cleanup failed; will retry");
      })
      .finally(() => {
        cleaning = undefined;
      });
}
runCleanup();
const interval = setInterval(runCleanup, 60_000);
interval.unref();
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  clearInterval(interval);
  const timer = setTimeout(() => process.exit(1), 10_000);
  timer.unref();
  server.close(async () => {
    await cleaning;
    await db.$disconnect();
    redis.disconnect();
    clearTimeout(timer);
    process.exit(0);
  });
  server.closeIdleConnections();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
