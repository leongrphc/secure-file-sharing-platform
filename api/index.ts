import { app, logger } from "../apps/api/src/app.js";
import { db } from "../apps/api/src/db.js";
import { storage } from "../apps/api/src/storage.js";
import type { Request, Response } from "express";

export const config = { api: { bodyParser: false } };

let initialization: Promise<void> | undefined;
function initialize() {
  if (!initialization) {
    initialization = Promise.all([storage.init(), db.$connect()])
      .then(() => undefined)
      .catch((error) => {
        initialization = undefined;
        throw error;
      });
  }
  return initialization;
}

export default async function handler(req: Request, res: Response) {
  try {
    await initialize();
    return app(req, res);
  } catch (error) {
    logger.error(
      { kind: error instanceof Error ? error.name : "initialization" },
      "api initialization failed",
    );
    return res.status(503).json({ error: "Service unavailable" });
  }
}
