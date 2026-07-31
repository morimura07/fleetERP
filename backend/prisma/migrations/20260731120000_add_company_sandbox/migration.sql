-- Demo / sandbox partition (M32): flag a company as a sandbox so it can be
-- safely reset without touching real entities. Additive.

ALTER TABLE "companies" ADD COLUMN "isSandbox" BOOLEAN NOT NULL DEFAULT false;
