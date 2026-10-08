import { afterAll, afterEach, it, expect, vi } from "vitest";
import { S3Client } from "@aws-sdk/client-s3";
import { S3Storage, storage } from "../../apps/api/src/storage.js";
import { db, redis } from "../../apps/api/src/db.js";
import { config } from "../../apps/api/src/config.js";
import { rm } from "node:fs/promises";
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await rm(config.LOCAL_STORAGE_DIR, { recursive: true, force: true });
  await db.$disconnect();
  redis.disconnect();
});
it("rejects public bucket ACLs before accepting storage", async () => {
  vi.spyOn(S3Client.prototype, "send")
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({
      Grants: [
        { Grantee: { URI: "http://acs.amazonaws.com/groups/global/AllUsers" } },
      ],
    });
  await expect(new S3Storage().init()).rejects.toThrow("private ACL");
});
it("rejects bucket policies and permission failures instead of falling back", async () => {
  vi.spyOn(S3Client.prototype, "send")
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ Grants: [] })
    .mockResolvedValueOnce({ Policy: "public-policy" });
  await expect(new S3Storage().init()).rejects.toThrow("policy must be absent");
  vi.restoreAllMocks();
  vi.spyOn(S3Client.prototype, "send").mockRejectedValue(
    Object.assign(new Error("denied"), { name: "AccessDenied" }),
  );
  await expect(new S3Storage().init()).rejects.toThrow("denied");
});
it("local storage never accepts traversal keys", async () => {
  await storage.init();
  await expect(storage.put("../../escape", Buffer.from("x"))).rejects.toThrow(
    "Invalid storage key",
  );
  await expect(storage.get("/etc/passwd")).rejects.toThrow(
    "Invalid storage key",
  );
});
