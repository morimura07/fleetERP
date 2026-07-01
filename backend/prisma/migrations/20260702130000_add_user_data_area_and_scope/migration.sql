-- Multi-company data isolation (PRD §6.2): every user belongs to a legal entity.
-- Existing users default to HQ01; assign real entities per user afterwards.
ALTER TABLE "users" ADD COLUMN "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01';

-- Helpful for entity-scoped user lookups.
CREATE INDEX "users_dataAreaId_idx" ON "users"("dataAreaId");
