import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";
import { config } from "./config.js";
export const db = new PrismaClient();
export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
});
redis.on("error", () => {
  /* Request paths fail closed; never log connection credentials. */
});
