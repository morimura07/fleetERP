-- Payroll (M9): employees, pay runs, payslips with statutory deductions.

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'TERMINATED');
CREATE TYPE "PayRunStatus" AS ENUM ('DRAFT', 'APPROVED', 'POSTED');

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nationalId" TEXT,
    "tin" TEXT,
    "country" TEXT NOT NULL DEFAULT 'TZ',
    "grossSalary" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "bankAccount" TEXT,
    "hiredAt" DATE NOT NULL,
    "driverId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_runs" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "PayRunStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "grossTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "payeTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "nssfTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "shifTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "memo" TEXT,
    "postingEntryId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "pay_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "payRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "gross" DECIMAL(18,2) NOT NULL,
    "paye" DECIMAL(18,2) NOT NULL,
    "nssf" DECIMAL(18,2) NOT NULL,
    "shif" DECIMAL(18,2) NOT NULL,
    "net" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_driverId_key" ON "employees"("driverId");
CREATE UNIQUE INDEX "employees_dataAreaId_code_key" ON "employees"("dataAreaId", "code");
CREATE INDEX "employees_status_idx" ON "employees"("status");
CREATE UNIQUE INDEX "pay_runs_postingEntryId_key" ON "pay_runs"("postingEntryId");
CREATE UNIQUE INDEX "pay_runs_dataAreaId_year_month_key" ON "pay_runs"("dataAreaId", "year", "month");
CREATE INDEX "pay_runs_status_idx" ON "pay_runs"("status");
CREATE UNIQUE INDEX "payslips_payRunId_employeeId_key" ON "payslips"("payRunId", "employeeId");
CREATE INDEX "payslips_employeeId_idx" ON "payslips"("employeeId");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_postingEntryId_fkey" FOREIGN KEY ("postingEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payRunId_fkey" FOREIGN KEY ("payRunId") REFERENCES "pay_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
