import {
  mkdir,
  writeFile,
  readFile,
  unlink,
  readdir,
  stat,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  GetBucketPolicyCommand,
  GetBucketAclCommand,
} from "@aws-sdk/client-s3";
import { del, get, head, list, put } from "@vercel/blob";
import { config, MAX_BYTES } from "./config.js";
export interface Storage {
  init(): Promise<void>;
  ready(): Promise<void>;
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  list(): Promise<{ key: string; modified: Date }[]>;
}
function validKey(key: string) {
  if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("Invalid storage key");
  return key;
}
class LocalStorage implements Storage {
  private root = resolve(
    fileURLToPath(new URL("../../../", import.meta.url)),
    config.LOCAL_STORAGE_DIR,
  );
  private path(key: string) {
    return join(this.root, validKey(key));
  }
  async init() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
  }
  async ready() {
    await stat(this.root);
  }
  async put(key: string, data: Buffer) {
    await writeFile(this.path(key), data, { mode: 0o600, flag: "wx" });
  }
  async get(key: string) {
    return readFile(this.path(key));
  }
  async delete(key: string) {
    try {
      await unlink(this.path(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  async list() {
    const names = await readdir(this.root);
    return Promise.all(
      names
        .filter((n) => /^[a-f0-9-]{36}$/.test(n))
        .map(async (key) => ({
          key,
          modified: (await stat(this.path(key))).mtime,
        })),
    );
  }
}
export class S3Storage implements Storage {
  private client = new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY!,
      secretAccessKey: config.S3_SECRET_KEY!,
    },
    requestHandler: { requestTimeout: 15000, connectionTimeout: 5000 },
  });
  async init() {
    try {
      await this.ready();
    } catch (error) {
      if ((error as { name: string }).name !== "NotFound") throw error;
      await this.client.send(
        new CreateBucketCommand({ Bucket: config.S3_BUCKET }),
      );
    }
    const acl = await this.client.send(
      new GetBucketAclCommand({ Bucket: config.S3_BUCKET }),
    );
    if (
      acl.Grants?.some(
        (grant) =>
          grant.Grantee?.URI?.endsWith("/AllUsers") ||
          grant.Grantee?.URI?.endsWith("/AuthenticatedUsers"),
      )
    )
      throw new Error("Storage bucket must have a private ACL");
    // Dedicated buckets only. Refuse ANY policy rather than silently accepting public access.
    try {
      await this.client.send(
        new GetBucketPolicyCommand({ Bucket: config.S3_BUCKET }),
      );
      throw new Error("Storage bucket policy must be absent");
    } catch (error) {
      if ((error as { name: string }).name !== "NoSuchBucketPolicy")
        throw error;
    }
  }
  async ready() {
    await this.client.send(new HeadBucketCommand({ Bucket: config.S3_BUCKET }));
  }
  async put(key: string, data: Buffer) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: config.S3_BUCKET,
        Key: validKey(key),
        Body: data,
        ContentType: "application/octet-stream",
      }),
    );
  }
  async get(key: string) {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: validKey(key) }),
    );
    if ((result.ContentLength || 0) > MAX_BYTES + 28)
      throw new Error("Oversized encrypted object");
    return Buffer.from(await result.Body!.transformToByteArray());
  }
  async delete(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: validKey(key) }),
    );
  }
  async list() {
    const all: { key: string; modified: Date }[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: config.S3_BUCKET,
          ContinuationToken: cursor,
        }),
      );
      for (const item of page.Contents || [])
        if (item.Key && item.LastModified)
          all.push({ key: validKey(item.Key), modified: item.LastModified });
      cursor = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (cursor);
    return all;
  }
}
export class VercelBlobStorage implements Storage {
  async init() {
    // Each cold start owns its probe so concurrent instances cannot delete each other's data.
    const probe = randomUUID();
    await put(probe, Buffer.from("sfs-private-probe"), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/octet-stream",
      token: config.BLOB_READ_WRITE_TOKEN,
    });
    try {
      await head(probe, { token: config.BLOB_READ_WRITE_TOKEN });
      const result = await get(probe, {
        access: "private",
        token: config.BLOB_READ_WRITE_TOKEN,
        useCache: false,
      });
      if (!result || result.statusCode !== 200)
        throw new Error("Blob probe failed");
      await result.stream.cancel();
    } finally {
      await del(probe, { token: config.BLOB_READ_WRITE_TOKEN });
    }
  }
  async ready() {
    await list({ limit: 1, token: config.BLOB_READ_WRITE_TOKEN });
  }
  async put(key: string, data: Buffer) {
    await put(validKey(key), data, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/octet-stream",
      token: config.BLOB_READ_WRITE_TOKEN,
    });
  }
  async get(key: string) {
    const result = await get(validKey(key), {
      access: "private",
      token: config.BLOB_READ_WRITE_TOKEN,
      useCache: false,
    });
    if (!result || result.statusCode !== 200)
      throw new Error("Object not found");
    if (result.blob.size > MAX_BYTES + 28)
      throw new Error("Oversized encrypted object");
    const reader = result.stream.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > MAX_BYTES + 28)
          throw new Error("Oversized encrypted object");
        chunks.push(Buffer.from(part.value));
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks);
  }
  async delete(key: string) {
    await del(validKey(key), { token: config.BLOB_READ_WRITE_TOKEN });
  }
  async list() {
    const all: { key: string; modified: Date }[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({
        cursor,
        limit: 1000,
        token: config.BLOB_READ_WRITE_TOKEN,
      });
      for (const blob of page.blobs)
        if (/^[a-f0-9-]{36}$/.test(blob.pathname))
          all.push({ key: blob.pathname, modified: blob.uploadedAt });
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return all;
  }
}
export const storage: Storage =
  config.STORAGE_DRIVER === "s3"
    ? new S3Storage()
    : config.STORAGE_DRIVER === "vercel-blob"
      ? new VercelBlobStorage()
      : new LocalStorage();
