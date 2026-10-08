# Vercel portfolio demo

The deployment uses two Vercel Hobby projects in Frankfurt, Neon Free PostgreSQL,
Upstash Free Redis (automatic paid upgrades disabled), and private Vercel Blob.
Files and metadata retain the existing server-side encryption. All service
credentials are server-side environment variables; never commit them.

Live demo: https://secure-file-sharing-pink.vercel.app

## Project settings

- API project: repository root, using root `vercel.json`.
- Web project: root directory `apps/web`, Next.js, using `apps/web/vercel.json`.
- Both production projects must allow public access (disable Vercel Authentication).
- Run database migrations against the direct Neon connection before deployment:
  `DATABASE_URL=<direct-url> npm run db:migrate -w @sfs/api`.

The API requires `DATABASE_URL` (pooled Neon URL), `REDIS_URL` (TLS Upstash URL),
`BLOB_READ_WRITE_TOKEN`, `STORAGE_DRIVER=vercel-blob`, `COOKIE_SECURE=true`,
`APP_ORIGIN` (exact production web origin), `DEMO_ENABLED=true`,
`MASTER_KEY`, `SIGNING_KEY`, `CRON_SECRET`, `API_GATEWAY_SECRET`, and
`MAX_FILE_BYTES=4194304`. The encryption and signing keys must each contain
64 lowercase hexadecimal characters. Preserve `MASTER_KEY` across deployments.

The web project requires `API_INTERNAL_URL` (production API origin), the same
`API_GATEWAY_SECRET`, and `NEXT_PUBLIC_MAX_FILE_BYTES=4194304` at build time.
The gateway forwards the platform-provided client IP and authenticates to the API;
direct calls to application endpoints are rejected. Preview domains do not match
the production origin and cannot mutate production data.

## Limits and cleanup

The deployed file limit is 4 MiB, below Vercel Functions' 4.5 MB body limit.
Local development retains the 10 MiB default. Larger files need a separate direct
upload design. Provider free quotas still apply; this is a personal portfolio demo.

Vercel invokes `/api/cron/cleanup` daily at 03:00 UTC with its `CRON_SECRET`.
Demo sessions expire after eight hours. Demo accounts become inaccessible after
24 hours; their objects are physically removed on the next cleanup run, so deletion
can take up to another day. Cron may run later within the hour on Hobby.

## Verification

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
Check `/api/health` and `/api/ready` on the API and web origins. Run the existing
browser flow against production without starting local services:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'https://your-web.vercel.app'
npm run test:browser
```

The browser test creates an isolated demo, uploads a sample, downloads a one-time
share anonymously, verifies repeat access is denied, revokes the share, and deletes
the sample. Never run database-resetting integration tests against production.
