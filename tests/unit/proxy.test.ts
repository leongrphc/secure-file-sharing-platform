import { afterEach, expect, it, vi } from "vitest";
import { GET } from "../../apps/web/app/api/[...path]/route.js";

afterEach(() => vi.unstubAllGlobals());

it("forwards a decoded download without stale compression or length headers", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response("decoded sample", {
        headers: {
          "content-encoding": "br",
          "content-length": "5",
          "transfer-encoding": "chunked",
          connection: "keep-alive",
          "content-type": "application/octet-stream",
          "content-disposition": "attachment; filename=sample.txt",
          "set-cookie": "sfs_session=example; HttpOnly; Secure",
        },
      }),
    ),
  );
  const response = await GET(
    new Request("https://example.com/api/download/sample"),
  );
  expect(await response.text()).toBe("decoded sample");
  for (const name of [
    "content-encoding",
    "content-length",
    "transfer-encoding",
    "connection",
  ])
    expect(response.headers.has(name)).toBe(false);
  expect(response.headers.get("content-disposition")).toBe(
    "attachment; filename=sample.txt",
  );
  expect(response.headers.get("set-cookie")).toContain("HttpOnly; Secure");
});
