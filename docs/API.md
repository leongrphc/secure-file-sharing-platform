# API reference

All routes are under `/api`. Responses and file downloads are `Cache-Control: no-store`. Errors are `{ "error": "message" }` and contain no stack traces. Every request gets a server-generated `X-Request-Id`. Mutation requests must include `Origin: http://localhost:33073` (or configured APP_ORIGIN). Dashboard requests use the same-origin Next proxy; direct CLI requests can target http://localhost:34073 with that Origin and a cookie jar.

| Method | Path                       | Authorization and behavior                                                                           |
| ------ | -------------------------- | ---------------------------------------------------------------------------------------------------- |
| GET    | /health                    | Process liveness                                                                                     |
| GET    | /ready                     | Database, Redis and storage readiness; 503 on failure                                                |
| POST   | /auth/register             | `{email,password}`; password 12–128 chars; returns user and session cookie                           |
| POST   | /auth/login                | `{email,password}`; returns user and session cookie                                                  |
| POST   | /auth/demo                 | Isolated demo user; enabled only by DEMO_ENABLED                                                     |
| GET    | /auth/me                   | Session required; user identity                                                                      |
| POST   | /auth/logout               | Invalidates current session, clears cookie                                                           |
| GET    | /files?page=1&q=name       | Owner session; 10 results/page; filename substring search                                            |
| POST   | /files                     | Owner session; multipart field `file`; one file, no other fields                                     |
| DELETE | /files/:id                 | Owner session; tombstones file, revokes shares, queues object deletion                               |
| POST   | /files/:id/download        | Owner session; issues one-use signed URL valid for at most 60 seconds                                |
| POST   | /files/:id/shares          | Owner session; `{expiresInHours,maxDownloads,password?}`; returns path with a one-time-visible token |
| GET    | /files/:id/shares          | Owner session; status/counters; no secrets returned                                                  |
| DELETE | /files/:id/shares/:shareId | Owner session; immediate revocation of future ticket claims                                          |
| POST   | /shares/redeem             | Public; `{token,password?}`; consumes one authorization and issues signed URL                        |
| GET    | /download/:signed          | Signed capability; atomic one-use claim, revocation and expiry rechecked; attachment bytes           |
| HEAD   | /download/:signed          | 405, does not consume a ticket                                                                       |
| GET    | /audit?page=1              | Owner session; 20 events/page; action, resource UUID and time                                        |

UUID parameters, strict JSON schemas, lengths, integer ranges and pagination bounds are validated before use. File IDs and owner IDs never authorize a public download. Share token checks return the same generic error for wrong password, unknown token, expiry, revocation and exhausted limit.

A share with `maxDownloads: 1` is one-time. Share expiry must be 1–168 hours; limits 1–100. Tickets expire at the earlier of share expiry or 60 seconds. Transfers do not refund consumed authorizations on failure. The share page does not redeem on GET, which avoids link-preview consumption.

Typical statuses: 400 invalid input/upload, 401 missing or expired session, 403 rejected Origin, 404 absent/other-owner resource or unavailable capability, 409 quota/conflict, 413 oversized JSON, 429 Redis rate limit with Retry-After, 503 transfer capacity/readiness failures. Unexpected infrastructure failures use a generic 500 response and redacted structured logs.
