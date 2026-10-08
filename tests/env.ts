import dotenv from "dotenv";
import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
dotenv.config({ path: ".env", quiet: true });
process.env.NODE_ENV = "test";
process.env.MASTER_KEY ||= randomBytes(32).toString("hex");
process.env.SIGNING_KEY ||= randomBytes(32).toString("hex");
const database = new URL(
  process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgresql://sfs:local_only_password@localhost:55473/sfs",
);
if (!process.env.TEST_DATABASE_URL) database.pathname = "/sfs_test";
if (!database.pathname.endsWith("_test"))
  throw new Error("Integration database must end with _test");
process.env.DATABASE_URL = database.toString();
const redis = new URL(process.env.REDIS_URL || "redis://localhost:56373");
redis.pathname = "/15";
process.env.REDIS_URL = redis.toString();
process.env.APP_ORIGIN ||= "http://localhost:33073";
process.env.STORAGE_DRIVER = "local";
process.env.LOCAL_STORAGE_DIR = mkdtempSync(join(tmpdir(), "sfs-test-"));
