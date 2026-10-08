import { describe, it, expect, afterAll } from "vitest";
import { rm } from "node:fs/promises";
import { config } from "../../apps/api/src/config.js";
import { randomBytes, randomUUID } from "node:crypto";
import {
  seal,
  open,
  encryptFile,
  readMetadata,
  decryptContent,
  signTicket,
  verifyTicket,
} from "../../apps/api/src/crypto.js";
import {
  safeFilename,
  disposition,
  validateFile,
} from "../../apps/api/src/filesafety.js";
import { passwordHash, passwordMatches } from "../../apps/api/src/security.js";
import { db, redis } from "../../apps/api/src/db.js";
afterAll(async () => {
  await rm(config.LOCAL_STORAGE_DIR, { recursive: true, force: true });
  await db.$disconnect();
  redis.disconnect();
});
describe("authenticated envelope encryption", () => {
  it("roundtrips bytes and metadata, binding them to owner and file", () => {
    const id = randomUUID(),
      ownerId = randomUUID(),
      bytes = Buffer.from("private data");
    const e = encryptFile(id, ownerId, bytes, {
      name: "private.txt",
      type: "text/plain",
    });
    const file = { id, ownerId, ...e };
    expect(e.bytes.includes(bytes)).toBe(false);
    expect(e.metadata).not.toContain("private.txt");
    expect(readMetadata(file).name).toBe("private.txt");
    expect(decryptContent(file, e.bytes)).toEqual(bytes);
    expect(() => readMetadata({ ...file, ownerId: randomUUID() })).toThrow();
    expect(() =>
      decryptContent({ ...file, id: randomUUID() }, e.bytes),
    ).toThrow();
  });
  it("rejects ciphertext changes, wrong keys and different AAD", () => {
    const key = randomBytes(32),
      data = seal(Buffer.from("secret"), key, "context");
    data[data.length - 1] = data[data.length - 1]! ^ 1;
    expect(() => open(data, key, "context")).toThrow();
    expect(() => open(data, randomBytes(32), "context")).toThrow();
    expect(() => open(data, key, "other")).toThrow();
  });
});
describe("download signatures", () => {
  it("verifies fresh tickets and rejects forgery and expiry", () => {
    const ticket = signTicket(Math.floor(Date.now() / 1000) + 60);
    expect(() => verifyTicket(ticket)).not.toThrow();
    expect(() =>
      verifyTicket(ticket.slice(0, -1) + (ticket.endsWith("a") ? "b" : "a")),
    ).toThrow();
    expect(() =>
      verifyTicket(signTicket(Math.floor(Date.now() / 1000) - 1)),
    ).toThrow();
  });
});
describe("upload and response safety", () => {
  it("removes traversal, control characters and header injection", () => {
    const name = safeFilename('../../evil\r\nX-Test: true".txt');
    expect(name).not.toMatch(/[\r\n/\\"]/);
    const header = disposition("résumé\r\n.txt");
    expect(header).toContain("attachment;");
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).toContain("filename*=UTF-8''");
  });
  it("checks content against extension and MIME and rejects HTML/binary", () => {
    const base = {
      originalname: "hello.txt",
      mimetype: "text/plain",
      buffer: Buffer.from("hello"),
      size: 5,
    };
    expect(validateFile(base).type).toBe("text/plain");
    expect(() =>
      validateFile({ ...base, originalname: "a.png", mimetype: "image/png" }),
    ).toThrow();
    expect(() =>
      validateFile({ ...base, originalname: "a.html", mimetype: "text/html" }),
    ).toThrow();
    expect(() =>
      validateFile({ ...base, buffer: Buffer.from([0, 255]) }),
    ).toThrow();
    expect(() =>
      validateFile({ ...base, size: 10 * 1024 * 1024 + 1 }),
    ).toThrow();
    expect(() => validateFile({ ...base, size: 0 })).toThrow();
  });
});
describe("passwords", () => {
  it("uses random salts and rejects wrong passwords", async () => {
    const first = await passwordHash("long-test-password");
    const second = await passwordHash("long-test-password");
    expect(first).not.toBe(second);
    expect(await passwordMatches("long-test-password", first)).toBe(true);
    expect(await passwordMatches("incorrect", first)).toBe(false);
  });
});
