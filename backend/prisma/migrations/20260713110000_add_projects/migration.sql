-- Project Management (M29): projects/contracts grouping freight orders, tracked
-- against a planned budget. Additive: new table + a nullable orders.projectId.

CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- ── Project ──
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "projectCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT,
    "manager" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "budgetRevenue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "budgetCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "startDate" DATE,
    "endDate" DATE,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "projects_dataAreaId_projectCode_key" ON "projects"("dataAreaId", "projectCode");
CREATE INDEX "projects_dataAreaId_idx" ON "projects"("dataAreaId");
CREATE INDEX "projects_dataAreaId_status_idx" ON "projects"("dataAreaId", "status");
CREATE INDEX "projects_clientId_idx" ON "projects"("clientId");

-- ── Link freight orders to a project ──
ALTER TABLE "orders" ADD COLUMN "projectId" TEXT;
CREATE INDEX "orders_projectId_idx" ON "orders"("projectId");

-- ── Foreign keys ──
ALTER TABLE "projects" ADD CONSTRAINT "projects_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
