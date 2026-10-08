# Security design and boundaries

## Data protection

The MVP uses **server-side envelope encryption**, not end-to-end encryption. The API sees plaintext on upload and download. Each file gets a random 256-bit data key. AES-256-GCM encrypts both contents and `{name,type}` metadata with independent random 96-bit nonces. The master key wraps the data key. Associated data binds each ciphertext to the file UUID, owner UUID and purpose (`content`, `metadata`, `key`) to prevent record swapping. Random object keys reveal no filename. PostgreSQL stores encrypted filename/MIME but does expose owner IDs, sizes, counts and timestamps. User email and audit event identifiers are not encrypted.

MASTER_KEY and SIGNING_KEY are separate 32-byte environment secrets; startup rejects absent or malformed values. This is intentionally scoped local key management, with no KMS, automatic rotation or claim of protection against a compromised API. Losing the master key loses the data. Backups must include it securely and separately. No client-side encryption is advertised.

Both local storage and S3 store authenticated ciphertext. Local objects use directory mode 0700 and object mode 0600 and are outside the web public directory. S3 uses a dedicated bucket with no bucket policy and no public URLs. The API checks bucket policy at startup; operators must also maintain private ACLs and external IAM/network controls. This MVP trusts the storage administrators. Objects are never returned directly by a public MinIO/S3 route.

## Authentication and authorization

Registration and login use salted scrypt (N=32768, r=8, p=1, 64-byte derived keys) and constant-time comparison. Input lengths cap scrypt work. Passwords require 12 characters; link passwords require 8. An opaque random session token is hashed before storing in Redis and carried by an HttpOnly SameSite=Strict cookie. Sessions expire after eight hours without sliding renewal. Logout deletes the current session. Redis failure fails closed. Demo auth creates a separate user every time, expires access after 24 hours and cleans up its files. Demo mode can be disabled. Account recovery, MFA and email verification are outside the MVP.

All file/share management endpoints check session and ownership. UUID validation precedes raw SQL; Prisma uses bound parameters. No user-supplied object key or owner ID is accepted. Unknown and other-owner files return the same 404. All mutations, including anonymous link redemption and authentication, require the exact configured Origin. This blocks CSRF and login CSRF. The API has no permissive CORS. CLI clients must explicitly supply the Origin header. Cookies are secure when configured for HTTPS. Registration conflicts return a generic conflict but still reveal that an address cannot be registered; email enumeration resistance is not complete.

## Sharing and downloads

Share tokens contain 256 random bits and only their SHA-256 hashes are retained. The UI generates `/share#TOKEN`; the fragment is not sent to servers or in referrers, and the recipient page removes it from the address bar. Token plaintext appears only in creation responses and redemption request bodies, neither of which are logged. Retrieval lists never reconstruct tokens. Share lifetime is 1–168 hours; limits are 1–100 authorizations. A limit of 1 is a one-time link. Link passwords are salted scrypt hashes.

Redemption takes PostgreSQL row locks (file then share), checks expiry/revocation/remaining count, increments the count and creates a ticket with an owner-visible audit event in the same transaction. A failed password does not increment. Limits count **issued download authorizations**, not complete byte transfers. Failed transfers therefore use an authorization. This avoids refunds enabling abuse or ambiguous disconnect accounting.

A download URL is an HMAC-SHA256 signed 256-bit capability with an expiry of at most 60 seconds, backed by a hashed ticket in PostgreSQL. The application signs URLs to its own download gateway rather than exposing S3 presigned ciphertext. An atomic ticket claim enforces single use; signature, database ticket expiry, file deletion, share expiry and revocation are checked at redemption. HEAD is rejected without consuming a ticket. Range/resume is not implemented. Delete and revoke serialize against ticket claims. Once a claim commits, the download is authorized; revocation cannot recall an in-flight response or a downloaded copy. No system can prevent recipients copying a file.

The gateway decrypts and authenticates the entire bounded object before responding. Responses force `application/octet-stream`, attachment disposition, `nosniff`, `no-store`, sandbox CSP and no-referrer policy. Filename normalization strips paths, controls, quotes and bidi overrides; a bounded safe ASCII fallback and RFC 5987 name avoid header injection. Filenames never select a storage path.

## Abuse controls and bounds

Uploads allow one file with no form fields, 1 byte–10 MiB. Extension and declared MIME must match content checks: UTF-8/no NUL for TXT, signature checks for PDF/PNG/JPEG. HTML and executable extensions are rejected. Magic checks do not establish that a PDF/image is harmless; there is no malware scanner. Always treat downloaded data as untrusted.

Owners are limited to 100 active files, enforced under an owner lock. Encrypted-name search decrypts at most those 100 owner records, then filters and paginates in memory (10/page). There is no plaintext search index or global scan. Share management has at most 100 records per file. Audit uses 20/page. Upload rate limits, bounded concurrent uploads and explicit request timeouts limit memory consumption.

Redis Lua INCR/EXPIRE counters limit registration, login, demo creation, upload, redemption, download and total traffic. API trust proxy is disabled. Requests forwarded by Next share the Next server's source IP; limits are intentionally conservative for this local MVP and are not a production per-person attribution scheme. A public deployment needs a trusted proxy topology with spoof-resistant client IP attribution and account/distributed abuse controls. Application sessions and rate keys are not logged. Unknown failures expose a generic service-unavailable message.

## Persistence and cleanup

Uploads write ciphertext before committing the record. Transaction failure attempts object deletion; process crashes can leave orphans. Cleanup deletes only objects older than one hour absent from the database, using a dedicated storage namespace. Deletion first commits a tombstone and revokes shares; cleanup subsequently removes the object and dependent rows. Storage deletion is idempotent and cleanup retries failures. Audit events contain action/UUID/time only and survive normal file deletion. Retention is 30 days for regular accounts; expired demo account removal also removes its audit history. Cleanup failures are logged without secrets. This is recoverable eventual cleanup, not a transactional database/object store or secure physical erasure guarantee.

Run one cleanup worker per deployment. Multi-instance worker coordination, retention governance, backup recovery, key rotation, malware scanning, email workflows and a third-party penetration test remain outside this local MVP. The focused tests cover the security mechanisms implemented here; they do not certify production readiness.
