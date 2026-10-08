// Same-origin streaming gateway. Never let framework proxy failures log capability URLs.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function proxy(request: Request) {
  const incoming = new URL(request.url);
  const upstream = new URL(
    incoming.pathname + incoming.search,
    process.env.API_INTERNAL_URL || "http://127.0.0.1:34073",
  );
  const headers = new Headers();
  for (const name of ["content-type", "cookie", "origin"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (process.env.API_GATEWAY_SECRET) {
    headers.set("x-sfs-gateway-secret", process.env.API_GATEWAY_SECRET);
    // Vercel overwrites this header at its edge; never forward a client supplied IP.
    const clientIp = process.env.VERCEL
      ? request.headers.get("x-vercel-forwarded-for")
      : null;
    if (clientIp) headers.set("x-sfs-client-ip", clientIp);
  }
  const hasBody = !["GET", "HEAD"].includes(request.method);
  try {
    const options: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(35_000),
    };
    if (hasBody) {
      options.body = request.body;
      options.duplex = "half";
    }
    const response = await fetch(upstream, options);
    // fetch decompresses upstream bodies. Do not describe the decoded stream as compressed.
    const responseHeaders = new Headers(response.headers);
    for (const name of [
      "content-encoding",
      "content-length",
      "transfer-encoding",
      "connection",
    ])
      responseHeaders.delete(name);
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch {
    console.error(
      JSON.stringify({ kind: "api_proxy_unavailable", method: request.method }),
    );
    return Response.json(
      { error: "Service unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
  proxy as HEAD,
  proxy as OPTIONS,
};
