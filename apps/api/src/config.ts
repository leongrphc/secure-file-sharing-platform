import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";
dotenv.config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
  APP_ORIGIN: z.string().url(),
  MASTER_KEY: z.string().regex(/^[a-f0-9]{64}$/),
  SIGNING_KEY: z.string().regex(/^[a-f0-9]{64}$/),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  DEMO_ENABLED: z.enum(["true", "false"]).default("false"),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default(".local-storage"),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("private-files"),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
});
const parsed = schema.safeParse(process.env);
if (!parsed.success)
  throw new Error(
    "Invalid environment configuration: " +
      parsed.error.issues.map((i) => i.path.join(".")).join(", "),
  );
export const config = parsed.data;
if (
  config.STORAGE_DRIVER === "s3" &&
  (!config.S3_ENDPOINT || !config.S3_ACCESS_KEY || !config.S3_SECRET_KEY)
)
  throw new Error("S3 configuration missing");
if (
  config.NODE_ENV === "production" &&
  config.COOKIE_SECURE !== "true" &&
  new URL(config.APP_ORIGIN).hostname !== "localhost"
)
  throw new Error("Production requires HTTPS secure cookies");
export const MAX_BYTES = 10 * 1024 * 1024;
export const FILE_QUOTA = 100;
