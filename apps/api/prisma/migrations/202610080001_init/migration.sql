-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "metadata" TEXT NOT NULL,
    "wrappedKey" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Share" (
    "id" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "passwordHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxDownloads" INTEGER NOT NULL,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "fileId" UUID NOT NULL,
    "shareId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "resourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "File_objectKey_key" ON "File"("objectKey");

-- CreateIndex
CREATE INDEX "File_ownerId_createdAt_idx" ON "File"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Share_tokenHash_key" ON "Share"("tokenHash");

-- CreateIndex
CREATE INDEX "Share_fileId_createdAt_idx" ON "Share"("fileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_tokenHash_key" ON "Ticket"("tokenHash");

-- CreateIndex
CREATE INDEX "Ticket_expiresAt_idx" ON "Ticket"("expiresAt");

-- CreateIndex
CREATE INDEX "Audit_ownerId_createdAt_idx" ON "Audit"("ownerId", "createdAt");

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Share" ADD CONSTRAINT "Share_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "Share"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

