-- Units-of-measure registry (M30 Common): a per-company catalog of trading units
-- with a conversion factor to each dimension's base unit. Additive.

CREATE TYPE "UomDimension" AS ENUM ('WEIGHT', 'VOLUME', 'LENGTH', 'AREA', 'COUNT', 'TIME');

CREATE TABLE "units_of_measure" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dimension" "UomDimension" NOT NULL DEFAULT 'COUNT',
    "symbol" TEXT,
    "factorToBase" DECIMAL(20,8) NOT NULL DEFAULT 1,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_of_measure_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "units_of_measure_dataAreaId_code_key" ON "units_of_measure"("dataAreaId", "code");
CREATE INDEX "units_of_measure_dataAreaId_idx" ON "units_of_measure"("dataAreaId");
