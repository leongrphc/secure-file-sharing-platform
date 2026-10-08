import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { app } from "../../apps/api/src/app.js";
import { db, redis } from "../../apps/api/src/db.js";
import { storage } from "../../apps/api/src/storage.js";
import { config } from "../../apps/api/src/config.js";
import { cleanup } from "../../apps/api/src/cleanup.js";
import { hash } from "../../apps/api/src/security.js";
const origin = config.APP_ORIGIN;
const owner = request.agent(app),
  other = request.agent(app),
  guest = request.agent(app);
const users: string[] = [];
let fileId: string;
const sample = Buffer.from("sample private content");
async function share(options: Record<string, unknown> = {}) {
  const r = await owner
    .post(`/api/files/${fileId}/shares`)
    .set("Origin", origin)
    .send({ expiresInHours: 1, maxDownloads: 1, ...options });
  expect(r.status).toBe(201);
  return { ...r.body, token: r.body.path.split("#")[1] };
}
async function redeem(token: string, password = "") {
  return guest
    .post("/api/shares/redeem")
    .set("Origin", origin)
    .send({ token, password });
}
beforeAll(async () => {
  await storage.init();
  await redis.ping();
  const keys = await redis.keys("rate:*");
  if (keys.length) await redis.del(...keys);
  for (const agent of [owner, other]) {
    const r = await agent
      .post("/api/auth/register")
      .set("Origin", origin)
      .send({
        email: `test-${randomUUID()}@example.invalid`,
        password: "integration-password-123",
      });
    expect(r.status).toBe(201);
    users.push(r.body.user.id);
  }
  const upload = await owner
    .post("/api/files")
    .set("Origin", origin)
    .attach("file", sample, {
      filename: "private.txt",
      contentType: "text/plain",
    });
  expect(upload.status).toBe(201);
  fileId = upload.body.file.id;
});
afterAll(async () => {
  const files = await db.file.findMany({ where: { ownerId: { in: users } } });
  for (const file of files) await storage.delete(file.objectKey);
  await db.$transaction(async (tx) => {
    await tx.ticket.deleteMany({ where: { file: { ownerId: { in: users } } } });
    await tx.share.deleteMany({ where: { file: { ownerId: { in: users } } } });
    await tx.file.deleteMany({ where: { ownerId: { in: users } } });
    await tx.audit.deleteMany({ where: { ownerId: { in: users } } });
    await tx.user.deleteMany({ where: { id: { in: users } } });
  });
  await rm(config.LOCAL_STORAGE_DIR, { recursive: true, force: true });
  await db.$disconnect();
  redis.disconnect();
});
describe("real database security integration", () => {
  it("provides readiness and requires authenticated ownership", async () => {
    expect((await guest.get("/api/ready")).status).toBe(200);
    expect((await guest.get("/api/files")).status).toBe(401);
    expect(
      (
        await other
          .post(`/api/files/${fileId}/download`)
          .set("Origin", origin)
          .send({})
      ).status,
    ).toBe(404);
    expect(
      (
        await other
          .post(`/api/files/${fileId}/shares`)
          .set("Origin", origin)
          .send({ expiresInHours: 1, maxDownloads: 1 })
      ).status,
    ).toBe(404);
    expect(
      (await other.delete(`/api/files/${fileId}`).set("Origin", origin)).status,
    ).toBe(404);
    expect((await other.get("/api/files")).body.total).toBe(0);
  });
  it("rejects missing/foreign origins and oversized/unsupported uploads", async () => {
    expect(
      (await owner.post(`/api/files/${fileId}/download`).send({})).status,
    ).toBe(403);
    expect(
      (
        await owner
          .post("/api/auth/logout")
          .set("Origin", "http://evil.invalid")
      ).status,
    ).toBe(403);
    expect(
      (
        await owner
          .post("/api/files")
          .set("Origin", origin)
          .attach("file", sample, {
            filename: "malware.exe",
            contentType: "application/octet-stream",
          })
      ).status,
    ).toBe(400);
    expect(
      (
        await owner
          .post("/api/files")
          .set("Origin", origin)
          .attach("file", Buffer.alloc(10 * 1024 * 1024 + 1, 65), {
            filename: "large.txt",
            contentType: "text/plain",
          })
      ).status,
    ).toBe(400);
  });
  it("stores ciphertext and only exposes owner audit records", async () => {
    const file = await db.file.findUniqueOrThrow({ where: { id: fileId } });
    expect(file.metadata).not.toContain("private.txt");
    expect((await storage.get(file.objectKey)).includes(sample)).toBe(false);
    const audit = await owner.get("/api/audit");
    expect(
      audit.body.events.some(
        (e: { action: string }) => e.action === "file.upload",
      ),
    ).toBe(true);
    const otherAudit = await other.get("/api/audit");
    expect(
      otherAudit.body.events.every(
        (e: { ownerId: string }) => e.ownerId === users[1],
      ),
    ).toBe(true);
  });
  it("requires a password without consuming the share on failure", async () => {
    const s = await share({ password: "secret-link-password" });
    expect((await redeem(s.token, "wrong")).status).toBe(404);
    const good = await redeem(s.token, "secret-link-password");
    expect(good.status).toBe(200);
    expect((await guest.head(good.body.url)).status).toBe(405);
    const downloaded = await guest.get(good.body.url);
    expect(downloaded.status).toBe(200);
    expect(downloaded.body).toEqual(sample);
    expect(downloaded.headers["content-disposition"]).toMatch(/^attachment;/);
    expect(downloaded.headers["content-type"]).toContain(
      "application/octet-stream",
    );
    expect((await guest.get(good.body.url)).status).toBe(404);
    expect((await redeem(s.token, "secret-link-password")).status).toBe(404);
  });
  it("serializes simultaneous one-time redemptions and download replays", async () => {
    const s = await share();
    const results = await Promise.all([redeem(s.token), redeem(s.token)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 404]);
    const url = results.find((r) => r.status === 200)!.body.url;
    const downloads = await Promise.all([guest.get(url), guest.get(url)]);
    expect(downloads.map((r) => r.status).sort()).toEqual([200, 404]);
  });
  it("enforces multi-use limits and revokes already issued tickets", async () => {
    const s = await share({ maxDownloads: 2 });
    const first = await redeem(s.token);
    expect(first.status).toBe(200);
    expect((await redeem(s.token)).status).toBe(200);
    expect((await redeem(s.token)).status).toBe(404);
    expect(
      (
        await other
          .delete(`/api/files/${fileId}/shares/${s.share.id}`)
          .set("Origin", origin)
      ).status,
    ).toBe(404);
    expect(
      (
        await owner
          .delete(`/api/files/${fileId}/shares/${s.share.id}`)
          .set("Origin", origin)
      ).status,
    ).toBe(204);
    expect((await guest.get(first.body.url)).status).toBe(404);
  });
  it("rejects expired shares and expired tickets", async () => {
    const s = await share();
    await db.share.update({
      where: { id: s.share.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await redeem(s.token)).status).toBe(404);
    const t = await owner
      .post(`/api/files/${fileId}/download`)
      .set("Origin", origin)
      .send({});
    expect(t.status).toBe(200);
    await db.ticket.update({
      where: { tokenHash: hash(t.body.url.split("/").at(-1)) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await guest.get(t.body.url)).status).toBe(404);
  });
  it("searches encrypted filenames and paginates without exposing other files", async () => {
    for (let n = 0; n < 10; n++) {
      const r = await owner
        .post("/api/files")
        .set("Origin", origin)
        .attach("file", sample, {
          filename: `page-${n}.txt`,
          contentType: "text/plain",
        });
      expect(r.status).toBe(201);
    }
    const first = await owner.get("/api/files?page=1");
    const second = await owner.get("/api/files?page=2");
    expect(first.body.files).toHaveLength(10);
    expect(second.body.files).toHaveLength(1);
    expect((await owner.get("/api/files?q=private")).body.files[0].id).toBe(
      fileId,
    );
    expect((await owner.get("/api/files?page=-1")).status).toBe(400);
  });
  it("deletion revokes tickets immediately and cleanup removes the object", async () => {
    const record = await db.file.findUniqueOrThrow({ where: { id: fileId } });
    const ticket = await owner
      .post(`/api/files/${fileId}/download`)
      .set("Origin", origin)
      .send({});
    expect(
      (await owner.delete(`/api/files/${fileId}`).set("Origin", origin)).status,
    ).toBe(204);
    expect((await guest.get(ticket.body.url)).status).toBe(404);
    await cleanup();
    expect(await db.file.findUnique({ where: { id: fileId } })).toBeNull();
    await expect(storage.get(record.objectKey)).rejects.toThrow();
  });
  it("rate limits with retry headers and sets secure session attributes", async () => {
    const express = (await import("express")).default;
    const { rateLimit } = await import("../../apps/api/src/security.js");
    const tiny = express();
    tiny.use(rateLimit("test-" + randomUUID(), 2, 60));
    tiny.get("/", (_req, res) => res.json({ ok: true }));
    tiny.use(
      (
        error: Error & { status?: number },
        _req: import("express").Request,
        res: import("express").Response,
        _next: import("express").NextFunction,
      ) => res.status(error.status || 500).end(),
    );
    expect((await request(tiny).get("/")).status).toBe(200);
    expect((await request(tiny).get("/")).status).toBe(200);
    const denied = await request(tiny).get("/");
    expect(denied.status).toBe(429);
    expect(denied.headers["retry-after"]).toBe("60");
    const login = await request(app)
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({
        email: (await db.user.findUniqueOrThrow({ where: { id: users[0] } }))
          .email,
        password: "integration-password-123",
      });
    expect(login.status).toBe(200);
    expect(String(login.headers["set-cookie"])).toContain("HttpOnly");
    expect(String(login.headers["set-cookie"])).toContain("SameSite=Strict");
    const session = request.agent(app);
    await session
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({
        email: (await db.user.findUniqueOrThrow({ where: { id: users[0] } }))
          .email,
        password: "integration-password-123",
      });
    await session.post("/api/auth/logout").set("Origin", origin);
    expect((await session.get("/api/auth/me")).status).toBe(401);
  });
  it("enforces owner quota atomically under simultaneous uploads", async () => {
    const { encryptFile } = await import("../../apps/api/src/crypto.js");
    const ownerId = users[1]!;
    await db.file.createMany({
      data: Array.from({ length: 99 }, () => {
        const id = randomUUID();
        const e = encryptFile(id, ownerId, sample, {
          name: "quota.txt",
          type: "text/plain",
        });
        return {
          id,
          ownerId,
          objectKey: randomUUID(),
          metadata: e.metadata,
          wrappedKey: e.wrappedKey,
          size: sample.length,
        };
      }),
    });
    const results = await Promise.all(
      [0, 1].map((n) =>
        other
          .post("/api/files")
          .set("Origin", origin)
          .attach("file", sample, {
            filename: `quota-${n}.txt`,
            contentType: "text/plain",
          }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.file.count({ where: { ownerId, deletedAt: null } })).toBe(
      100,
    );
  });
  it("fails closed when Redis rate enforcement is unavailable", async () => {
    // Separate process suite ends here; no shared Redis data is flushed.
    redis.disconnect();
    expect((await guest.get("/api/files")).status).toBe(500);
  });
});
