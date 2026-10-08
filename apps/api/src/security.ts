import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import type { RequestHandler } from "express";
import { config } from "./config.js";
import { db, redis } from "./db.js";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const token = () => randomBytes(32).toString("base64url");
export const hash = (input: string) =>
  createHash("sha256").update(input).digest("hex");
function scrypt(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCallback(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key)),
    ),
  );
}
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + (await scrypt(password, salt)).toString("hex");
}
export async function passwordMatches(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const actual = await scrypt(password, salt);
  const expected = Buffer.from(key, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export const originGuard: RequestHandler = (req, _res, next) => {
  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
    req.get("origin") !== config.APP_ORIGIN
  )
    return next(new HttpError(403, "Untrusted request origin"));
  next();
};
const rateScript =
  "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n";
export function rateLimit(
  scope: string,
  limit: number,
  seconds: number,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const n = Number(
        await redis.eval(
          rateScript,
          1,
          `rate:${scope}:${hash(req.ip || "unknown")}`,
          seconds,
        ),
      );
      if (n > limit) {
        res.set("Retry-After", String(seconds));
        throw new HttpError(429, "Too many requests");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const session = req.cookies?.sfs_session;
    if (typeof session !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(session))
      throw new HttpError(401, "Sign in required");
    const userId = await redis.get("session:" + hash(session));
    if (!userId) throw new HttpError(401, "Session expired");
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { demo: true, createdAt: true },
    });
    if (
      !user ||
      (user.demo && user.createdAt.getTime() < Date.now() - 24 * 3600_000)
    )
      throw new HttpError(401, "Session expired");
    res.locals.userId = userId;
    next();
  } catch (error) {
    next(error);
  }
};

export function concurrencyLimit(max: number): RequestHandler {
  let active = 0;
  return (_req, res, next) => {
    if (active >= max)
      return next(
        new HttpError(503, "Transfer capacity reached; try again shortly"),
      );
    active++;
    let released = false;
    const release = () => {
      if (!released) {
        active--;
        released = true;
      }
    };
    res.once("finish", release);
    res.once("close", release);
    next();
  };
}
