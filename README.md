# Secure File Sharing Platform

[Canlı demo / Live demo](https://secure-file-sharing-pink.vercel.app) · [Vercel deployment](docs/VERCEL.md)

Vercel Hobby + Neon Free + Upstash Free + private Vercel Blob. Deployed file limit: 4 MiB.

[🇹🇷 Türkçe](#türkçe) · [🇬🇧 English](#english)

---

## Türkçe

[Başa dön](#secure-file-sharing-platform) · [English bölümüne geç](#english)

Süreli ve kontrollü dosya paylaşımı için geliştirilmiş, güvenlik odaklı bir full-stack demo platformu.

Bu proje; özel dosya depolama, şifreli metadata, süreli paylaşım bağlantıları, tek kullanımlık indirme, indirme limiti, bağlantı iptali ve audit log özelliklerini gösterir. Arayüz bilinçli olarak sade tutulmuştur; ana odak dosya güvenliği ve backend tasarımıdır.

### Özellikler

- Demo kullanıcı oturumu ve sahiplik kontrolü
- Server-side envelope encryption ile korunan dosya metadata'sı
- Özel object storage
- S3/MinIO uyumlu storage abstraction
- Local filesystem fallback
- Güvenli dosya adı normalizasyonu
- Dosya boyutu ve MIME type doğrulaması
- Süreli paylaşım bağlantıları
- Tek kullanımlık paylaşım bağlantıları
- İsteğe bağlı link parolası
- Maksimum indirme sayısı
- Paylaşım bağlantısını iptal etme
- Kısa ömürlü signed download URL'leri
- Audit log
- Redis rate limiting
- Pagination ve dosya araması
- Health/readiness endpoint'leri
- Redakte edilmiş structured log'lar
- Graceful shutdown

### Mimari

```text
Next.js Dashboard
        |
        v
Node.js API  <---->  Redis
        |
        +----> PostgreSQL / Prisma
        |
        +----> S3 / MinIO / Local Storage
```

PostgreSQL kullanıcıları, dosya kayıtlarını, paylaşım linklerini ve audit log'larını tutar. Redis rate limiting ve geçici paylaşım işlemleri için kullanılır. Dosya içerikleri private storage katmanında saklanır; istemci doğrudan kalıcı storage credential'ı görmez.

### Teknolojiler

- Next.js
- TypeScript
- Node.js
- Express
- PostgreSQL
- Prisma
- Redis
- S3-compatible storage
- MinIO
- Docker Compose
- Vitest
- Playwright

### Lokal kurulum

Gereksinimler:

- Node.js 22+
- npm
- Docker ve Docker Compose

```bash
cp .env.example .env
npm ci
docker compose up --build -d
```

Dashboard: `http://localhost:3000`  
API: `http://localhost:4000`

Demo token, `.env` içindeki `DEMO_API_TOKEN` değeridir.

### Geliştirme komutları

```bash
npm run dev:api
npm run dev:web
npm run db:generate
npm run db:migrate
```

### API özeti

```http
POST /api/files
GET /api/files
GET /api/files/:id
DELETE /api/files/:id
POST /api/files/:id/shares
GET /api/shares/:token
POST /api/shares/:token/download
POST /api/shares/:id/revoke
GET /health
GET /ready
```

Paylaşım bağlantıları; expiry, download limit, one-time kullanım ve isteğe bağlı password ile sınırlandırılabilir. Dosya sahibi bağlantıyı indirme gerçekleşmeden önce iptal edebilir.

### Güvenlik

- Dosya kayıtları kullanıcı sahipliğiyle korunur.
- Storage bucket/container public değildir.
- Signed download URL'leri kısa ömürlüdür.
- Kullanıcı kontrollü dosya adları güvenli biçimde normalize edilir.
- Content-Disposition değerleri güvenli şekilde oluşturulur.
- Dosya boyutu ve izin verilen MIME türleri sınırlandırılır.
- Share token'ları loglara yazılmaz.
- Dosya içeriği, link parolası ve credential değerleri loglanmaz.
- Rate limiting Redis üzerinden uygulanır.
- Audit log'lar indirme, paylaşım, revoke ve başarısız erişimleri kaydeder.
- Üretim credential'ları repoda bulunmaz.

### Testler

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:smoke
npm run build
npm audit
```

Test kapsamı: authentication, ownership, upload validation, private storage, share expiry, one-time links, download limits, revoke, wrong password, audit events, rate limiting, health checks ve browser smoke flow.

### Bilinen sınırlamalar

- Proje demo ve portföy amaçlıdır.
- Demo authentication production identity management değildir.
- Gerçek virüs taraması ve içerik sınıflandırması yoktur.
- Büyük dosyalar için resumable/multipart upload henüz yoktur.
- Gerçek e-posta veya push notification entegrasyonu yoktur.
- Local storage fallback production object storage yerine geçmez.
- S3/R2 provider entegrasyonu credential olmadan canlı ortamda doğrulanmamıştır.
- Vercel üzerinde kişisel portföy demosu yayındadır; bağımsız security audit yapılmamıştır.

[English bölümüne geç](#english) · [Başa dön](#secure-file-sharing-platform)

---

## English

[Back to top](#secure-file-sharing-platform) · [Türkçe bölümüne dön](#türkçe)

A security-focused full-stack demo platform for controlled and expiring file sharing.

The project demonstrates private file storage, encrypted metadata, expiring share links, one-time downloads, download limits, link revocation, and audit logging. The interface is intentionally simple; the main focus is file security and backend design.

### Features

- Demo sessions and ownership checks
- Protected file metadata using server-side envelope encryption
- Private object storage
- S3/MinIO-compatible storage abstraction
- Local filesystem fallback
- Safe filename normalization
- File size and MIME type validation
- Expiring share links
- One-time share links
- Optional link passwords
- Maximum download limits
- Share link revocation
- Short-lived signed download URLs
- Audit logs
- Redis rate limiting
- Pagination and file search
- Health/readiness endpoints
- Redacted structured logs
- Graceful shutdown

### Architecture

```text
Next.js Dashboard
        |
        v
Node.js API  <---->  Redis
        |
        +----> PostgreSQL / Prisma
        |
        +----> S3 / MinIO / Local Storage
```

PostgreSQL stores users, file records, share links, and audit logs. Redis is used for rate limiting and temporary sharing operations. File contents remain in private storage; clients never receive permanent storage credentials.

### Technology

- Next.js
- TypeScript
- Node.js
- Express
- PostgreSQL
- Prisma
- Redis
- S3-compatible storage
- MinIO
- Docker Compose
- Vitest
- Playwright

### Local setup

Requirements:

- Node.js 22+
- npm
- Docker and Docker Compose

```bash
cp .env.example .env
npm ci
docker compose up --build -d
```

Dashboard: `http://localhost:3000`  
API: `http://localhost:4000`

Use the `DEMO_API_TOKEN` value from `.env` to authenticate.

### Development commands

```bash
npm run dev:api
npm run dev:web
npm run db:generate
npm run db:migrate
```

### API overview

```http
POST /api/files
GET /api/files
GET /api/files/:id
DELETE /api/files/:id
POST /api/files/:id/shares
GET /api/shares/:token
POST /api/shares/:token/download
POST /api/shares/:id/revoke
GET /health
GET /ready
```

Share links can be constrained with an expiry, download limit, one-time use, and an optional password. Owners can revoke links before a download occurs.

### Security

- File records are protected by ownership checks.
- Storage buckets/containers are private.
- Signed download URLs are short-lived.
- User-controlled filenames are safely normalized.
- Content-Disposition values are safely generated.
- File size and allowed MIME types are limited.
- Share tokens are never written to logs.
- File contents, link passwords, and credentials are not logged.
- Rate limiting is enforced through Redis.
- Audit logs record downloads, shares, revocations, and failed access attempts.
- Production credentials are not included in the repository.

### Testing

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:smoke
npm run build
npm audit
```

Coverage includes authentication, ownership, upload validation, private storage, share expiry, one-time links, download limits, revocation, wrong-password handling, audit events, rate limiting, health checks, and the browser smoke flow.

### Known limitations

- This project is for demo and portfolio purposes.
- Demo authentication is not production identity management.
- No malware scanning or content classification is included.
- Resumable/multipart uploads for large files are not implemented yet.
- No real email or push notification integration is included.
- The local storage fallback is not a replacement for production object storage.
- Live S3/R2 provider integration is not verified without credentials.
- A personal portfolio demo is deployed on Vercel; an independent security audit has not been performed.

[Back to top](#secure-file-sharing-platform) · [Türkçe bölümüne dön](#türkçe)
