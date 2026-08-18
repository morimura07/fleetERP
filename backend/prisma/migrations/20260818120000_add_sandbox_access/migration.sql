-- Sandbox demo access (M32).
--
-- Two additive, nullable/defaulted columns — no data is read, moved or dropped,
-- so this is safe to apply to a running instance with `prisma migrate deploy`.
--
--   companies.sandboxExpiresAt  access window for a demo partition (NULL = never expires)
--   users.isDemo                marks throwaway logins generated for a sandbox,
--                               so a wipe deletes exactly those and never a real account

ALTER TABLE "companies" ADD COLUMN "sandboxExpiresAt" TIMESTAMP(3);

ALTER TABLE "users" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- Demo logins are always looked up per partition when wiping/regenerating.
CREATE INDEX "users_isDemo_dataAreaId_idx" ON "users"("isDemo", "dataAreaId");
