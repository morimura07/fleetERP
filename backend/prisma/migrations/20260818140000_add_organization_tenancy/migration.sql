-- Organization layer above Company (tenant boundary).
--
-- A parent company ("Organization") owns a group of legal entities. Two
-- organizations sharing this database must never see each other; each has its
-- own ADMIN, and only the new SUPER_ADMIN role sees across them.
--
-- Safe to apply to a running instance: nothing is dropped and no business table
-- is touched. Existing companies are backfilled into one default organization,
-- so behaviour is unchanged until a second organization is created.

-- 1. The new tenant table.
CREATE TABLE "organizations" (
    "id"          TEXT NOT NULL,
    "code"        TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "version"     INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizations_code_key" ON "organizations"("code");

-- 2. Everything that exists today belongs to one default parent.
INSERT INTO "organizations" ("id", "code", "name", "updatedAt")
VALUES ('org_seed_default_00000001', 'DEFAULT', 'Default Organization', CURRENT_TIMESTAMP);

-- 3. Add the link nullable, backfill it, then enforce it — a plain NOT NULL
--    column would fail against the companies already in the table.
ALTER TABLE "companies" ADD COLUMN "organizationId" TEXT;

UPDATE "companies" SET "organizationId" = 'org_seed_default_00000001'
WHERE "organizationId" IS NULL;

ALTER TABLE "companies" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "companies" ADD CONSTRAINT "companies_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "companies_organizationId_idx" ON "companies"("organizationId");

-- 4. The platform-operator role. Added last and not referenced here: Postgres
--    forbids using a new enum value in the transaction that creates it.
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';
