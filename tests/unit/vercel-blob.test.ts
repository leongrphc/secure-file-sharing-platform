import { afterEach, describe, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({
  del: vi.fn(),
  get: vi.fn(),
  head: vi.fn(),
  list: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@vercel/blob", () => blob);

import { MAX_BYTES } from "../../apps/api/src/config.js";
import { VercelBlobStorage } from "../../apps/api/src/storage.js";

const key = "123e4567-e89b-12d3-a456-426614174000";

function successfulBlob(bytes = Buffer.from("payload")) {
  return {
    statusCode: 200,
    blob: { size: bytes.length },
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
  };
}

afterEach(() => vi.clearAllMocks());

describe("VercelBlobStorage", () => {
  it("uses private, non-overwriting options for put and get", async () => {
    const storage = new VercelBlobStorage();
    const bytes = Buffer.from("encrypted");
    blob.put.mockResolvedValueOnce({});
    blob.get.mockResolvedValueOnce(successfulBlob(bytes));

    await storage.put(key, bytes);
    await storage.get(key);

    expect(blob.put).toHaveBeenCalledWith(key, bytes, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/octet-stream",
      token: undefined,
    });
    expect(blob.get).toHaveBeenCalledWith(key, {
      access: "private",
      token: undefined,
      useCache: false,
    });
  });

  it("rejects traversal and non-UUID keys before calling Blob", async () => {
    const storage = new VercelBlobStorage();

    await expect(storage.put("../../escape", Buffer.from("x"))).rejects.toThrow(
      "Invalid storage key",
    );
    await expect(storage.get("/etc/passwd")).rejects.toThrow(
      "Invalid storage key",
    );
    await expect(storage.delete("not-a-uuid")).rejects.toThrow(
      "Invalid storage key",
    );
    expect(blob.put).not.toHaveBeenCalled();
    expect(blob.get).not.toHaveBeenCalled();
    expect(blob.del).not.toHaveBeenCalled();
  });

  it("creates a unique probe for each concurrent init and deletes only its own probe", async () => {
    const storageA = new VercelBlobStorage();
    const storageB = new VercelBlobStorage();
    let releasePuts!: () => void;
    const bothPutsStarted = new Promise<void>((resolve) => {
      let count = 0;
      releasePuts = resolve;
      blob.put.mockImplementation(() => {
        count += 1;
        if (count === 2) resolve();
        return Promise.resolve({});
      });
    });
    blob.head.mockResolvedValue({});
    const probesRead = [] as string[];
    blob.get.mockImplementation((probe: string) =>
      Promise.resolve({
        statusCode: 200,
        stream: {
          cancel: vi.fn(() => {
            probesRead.push(probe);
          }),
        },
      }),
    );
    blob.del.mockResolvedValue({});

    const inits = Promise.all([storageA.init(), storageB.init()]);
    await bothPutsStarted;
    releasePuts();
    await inits;

    const probes = blob.put.mock.calls.map(([probe]) => probe as string);
    const deleted = blob.del.mock.calls.map(([probe]) => probe as string);
    expect(probes).toHaveLength(2);
    expect(new Set(probes).size).toBe(2);
    expect(deleted).toEqual(expect.arrayContaining(probes));
    expect(deleted).toEqual(probesRead);
    expect(deleted).toHaveLength(2);
    for (const probe of probes)
      expect(
        blob.del.mock.calls.filter(([path]) => path === probe),
      ).toHaveLength(1);
  });

  it("deletes its probe when the probe get fails", async () => {
    const storage = new VercelBlobStorage();
    const failure = new Error("probe get failed");
    blob.put.mockResolvedValue({});
    blob.head.mockResolvedValue({});
    blob.get.mockRejectedValue(failure);
    blob.del.mockResolvedValue({});

    await expect(storage.init()).rejects.toBe(failure);

    const probe = blob.put.mock.calls[0]?.[0];
    expect(blob.del).toHaveBeenCalledWith(probe, { token: undefined });
  });

  it("enforces encrypted-object size bounds from metadata and streamed bytes", async () => {
    const storage = new VercelBlobStorage();
    const limit = MAX_BYTES + 28;
    blob.get.mockResolvedValueOnce({
      statusCode: 200,
      blob: { size: limit + 1 },
      stream: new ReadableStream(),
    });
    await expect(storage.get(key)).rejects.toThrow(
      "Oversized encrypted object",
    );

    const oversized = new Uint8Array(limit + 1);
    blob.get.mockResolvedValueOnce({
      statusCode: 200,
      blob: { size: limit },
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(oversized);
          controller.close();
        },
      }),
    });
    await expect(storage.get(key)).rejects.toThrow(
      "Oversized encrypted object",
    );
  });
});
