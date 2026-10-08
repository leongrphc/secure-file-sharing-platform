# Local operations

This document covers running the MVP. README.md is intentionally reserved for later discussion.

Requires Node 22.18+ (Node 22 LTS recommended), npm, and Docker Compose.

```sh
npm ci
npm run setup
# Private local storage is the default. No MinIO download is required.
docker compose up -d postgres redis
npm run db:generate -w @sfs/api
# Prisma CLI does not load the repository-root .env from its workspace automatically:
DATABASE_URL=postgresql://sfs:local_only_password@localhost:55473/sfs npm run db:migrate
npm run dev
```

Open http://localhost:33073. The API is on 34073, PostgreSQL on 55473 and Redis on 56373. All Docker host bindings are loopback-only. The database password is a deliberately public local development placeholder; encryption, signing and MinIO keys are random and generated into an ignored mode-0600 .env. Preserve MASTER_KEY when restarting or existing data cannot be decrypted.

For the full container stack:

```sh
docker compose config --quiet
docker compose up --build -d
curl --fail http://localhost:34073/api/ready
```

The API performs migrations on startup. The named local-data volume belongs to the non-root container user. Use `docker compose down` to stop without deleting volumes. `docker compose down -v` intentionally destroys local data. The web streaming gateway resolves API_INTERNAL_URL at runtime (set in the web container), and emits generic errors without logging capability URLs. Local npm runs default to 127.0.0.1:34073. No cloud credentials or production data are needed.

## Optional MinIO

Set STORAGE_DRIVER=s3 in .env, then `docker compose --profile minio up --build -d`. MinIO is on 39073 and its console on 39074. The API creates a dedicated private bucket and refuses buckets with any policy; no public storage route exists. It retries initialization during startup to allow MinIO to become available. A real deployment must use a dedicated least-privilege S3 account instead of the local MinIO root account. The application never silently switches drivers after a storage error: that could make existing files disappear.

The pinned upstream MinIO image was unavailable from Docker Hub and Quay during development. Local storage is the verified fallback. To run MinIO if that remains true, supply an available locally built MinIO image with a Compose override. See VALIDATION.md for actual checks and limits.

Changing drivers does not migrate data. Use a fresh database or migrate encrypted objects separately, keeping their object keys and the encryption master key unchanged.

## Verification

```sh
npm run lint
npm run typecheck
npm test
# First time only, provision the isolated test database:
docker compose exec -T postgres psql -U sfs -d postgres -c 'CREATE DATABASE sfs_test;'
DATABASE_URL=postgresql://sfs:local_only_password@localhost:55473/sfs_test npm run db:migrate
npm run test:integration
npx playwright install --with-deps chromium
npm run test:browser
npm run build
npm audit
```

Integration tests require only this project's PostgreSQL and Redis. They use the `_test` database, Redis DB 15, unique test users and temporary private storage. Never point TEST_DATABASE_URL at a production server. The browser test starts development servers when none are running and uses an isolated demo account. It deletes the file at the end; the demo account is cleaned up after 24 hours. Rate counters can temporarily block repeated smoke runs; wait for expiry or use a fresh local instance. No test flushes the application Redis database.

Health: `/api/health` checks process liveness; `/api/ready` checks database, Redis and storage. Request logs contain generated IDs, method and status, without URL, IP, filenames, credentials or share tokens. Shutdown stops new requests, drains cleanup and disconnects clients, with a 10-second deadline. Cleanup runs at startup and every minute; tombstoned objects retry deletion, expired tickets are removed, old demo files expire, audit records retain 30 days, and orphan objects older than one hour are deleted. Keep the bucket/directory dedicated to this app.

Local development permits HTTP cookies for localhost. Before any public deployment, configure HTTPS, COOKIE_SECURE=true, a matching APP_ORIGIN, disable demo auth unless intentionally offered, restrict database/Redis/storage networking, replace local DB credentials, and provision external key management/backups. No deployment has been performed.
