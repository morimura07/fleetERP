-- Document upload against any business record (client requirements, Sept 2026).
--
-- Purely additive: one new enum and one new table. Nothing existing is altered,
-- so a running application that predates this migration keeps working unchanged.

CREATE TYPE "AttachmentKind" AS ENUM (
  'RECEIPT',
  'INVOICE',
  'PHOTO',
  'CONTRACT',
  'CERTIFICATE',
  'POLICE_REPORT',
  'SURVEY_REPORT',
  'PROOF_OF_DELIVERY',
  'LICENCE',
  'OTHER'
);

CREATE TABLE "attachments" (
  "id"          TEXT NOT NULL,
  "dataAreaId"  TEXT NOT NULL DEFAULT 'HQ01',
  "entityType"  TEXT NOT NULL,
  "entityId"    TEXT NOT NULL,
  "fileName"    TEXT NOT NULL,
  "fileUrl"     TEXT NOT NULL,
  "mimeType"    TEXT NOT NULL,
  "sizeBytes"   INTEGER NOT NULL,
  "kind"        "AttachmentKind" NOT NULL DEFAULT 'OTHER',
  "note"        TEXT,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- The tenant-scoped lookup every read goes through.
CREATE INDEX "attachments_dataAreaId_entityType_entityId_idx"
  ON "attachments"("dataAreaId", "entityType", "entityId");

-- Used when counting attachments for a set of records regardless of tenant
-- (platform admin views).
CREATE INDEX "attachments_entityType_entityId_idx"
  ON "attachments"("entityType", "entityId");
