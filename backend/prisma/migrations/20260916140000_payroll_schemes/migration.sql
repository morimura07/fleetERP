-- Multi-country payroll (client requirements, Sept 2026, HR §4).
--
-- The statutory rules move from source code into the database, as Priyam
-- asked: the regulations sit in the backend as settings and the customer
-- selects a country. Additive throughout: three enums, three tables, and
-- columns that are all nullable or defaulted.

CREATE TYPE "PayoutMethod"    AS ENUM ('DIRECT_DEPOSIT', 'CHEQUE', 'MOBILE_MONEY', 'CASH');
CREATE TYPE "PayslipLineKind" AS ENUM ('EARNING', 'DEDUCTION', 'EMPLOYER');
CREATE TYPE "DeductionBasis"  AS ENUM ('BASIC', 'GROSS', 'TAXABLE');

-- ── Employee: earnings, banking, statutory numbers ───────────────────────────
ALTER TABLE "employees" ADD COLUMN "basicPay"           DECIMAL(18,2);
ALTER TABLE "employees" ADD COLUMN "payGrade"           TEXT;
ALTER TABLE "employees" ADD COLUMN "hourlyRate"         DECIMAL(18,2);
ALTER TABLE "employees" ADD COLUMN "overtimeRate"       DECIMAL(18,2);
ALTER TABLE "employees" ADD COLUMN "weeklyAllowance"    DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "employees" ADD COLUMN "housingAllowance"   DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "employees" ADD COLUMN "transportAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "employees" ADD COLUMN "nightShiftPremium"  DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "employees" ADD COLUMN "layoverPay"         DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "employees" ADD COLUMN "mileageBonus"       DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "employees" ADD COLUMN "bankName"           TEXT;
ALTER TABLE "employees" ADD COLUMN "bankBranch"         TEXT;
ALTER TABLE "employees" ADD COLUMN "routingNumber"      TEXT;
ALTER TABLE "employees" ADD COLUMN "paymentMethod"      "PayoutMethod" NOT NULL DEFAULT 'DIRECT_DEPOSIT';
ALTER TABLE "employees" ADD COLUMN "nhifNumber"         TEXT;
ALTER TABLE "employees" ADD COLUMN "wcfNumber"          TEXT;

-- ── Payslip: totals the wider slip needs ─────────────────────────────────────
ALTER TABLE "payslips" ADD COLUMN "basic"         DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "payslips" ADD COLUMN "allowances"    DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "payslips" ADD COLUMN "overtimePay"   DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "payslips" ADD COLUMN "taxable"       DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "payslips" ADD COLUMN "deductions"    DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "payslips" ADD COLUMN "employerCosts" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "payslips" ADD COLUMN "schemeCountry" TEXT;

-- ── One line per pay element ─────────────────────────────────────────────────
CREATE TABLE "payslip_lines" (
  "id"        TEXT NOT NULL,
  "payslipId" TEXT NOT NULL,
  "kind"      "PayslipLineKind" NOT NULL,
  "code"      TEXT NOT NULL,
  "label"     TEXT NOT NULL,
  "amount"    DECIMAL(18,2) NOT NULL,
  "basis"     DECIMAL(18,2),
  "ratePct"   DECIMAL(8,4),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "payslip_lines_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_payslipId_fkey"
  FOREIGN KEY ("payslipId") REFERENCES "payslips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "payslip_lines_payslipId_idx" ON "payslip_lines"("payslipId");

-- ── The regulations, as data ─────────────────────────────────────────────────
CREATE TABLE "statutory_schemes" (
  "id"          TEXT NOT NULL,
  "country"     TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "currency"    TEXT NOT NULL,
  "payeBands"   JSONB NOT NULL,
  "source"      TEXT,
  "verifiedAt"  DATE,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "version"     INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "statutory_schemes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "statutory_schemes_country_key" ON "statutory_schemes"("country");

CREATE TABLE "statutory_deductions" (
  "id"              TEXT NOT NULL,
  "schemeId"        TEXT NOT NULL,
  "code"            TEXT NOT NULL,
  "label"           TEXT NOT NULL,
  "employeeRatePct" DECIMAL(8,4) NOT NULL DEFAULT 0,
  "employerRatePct" DECIMAL(8,4) NOT NULL DEFAULT 0,
  "basis"           "DeductionBasis" NOT NULL DEFAULT 'BASIC',
  "basisCap"        DECIMAL(18,2),
  "minAmount"       DECIMAL(18,2),
  "fixedAmount"     DECIMAL(18,2),
  "reducesTaxable"  BOOLEAN NOT NULL DEFAULT false,
  "optIn"           BOOLEAN NOT NULL DEFAULT false,
  "sortOrder"       INTEGER NOT NULL DEFAULT 0,
  "isActive"        BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "statutory_deductions_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "statutory_deductions" ADD CONSTRAINT "statutory_deductions_schemeId_fkey"
  FOREIGN KEY ("schemeId") REFERENCES "statutory_schemes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "statutory_deductions_schemeId_code_key" ON "statutory_deductions"("schemeId", "code");

CREATE TABLE "employee_deduction_opt_ins" (
  "id"             TEXT NOT NULL,
  "employeeId"     TEXT NOT NULL,
  "code"           TEXT NOT NULL,
  "amountOverride" DECIMAL(18,2),
  "reference"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_deduction_opt_ins_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "employee_deduction_opt_ins" ADD CONSTRAINT "employee_deduction_opt_ins_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "employee_deduction_opt_ins_employeeId_code_key" ON "employee_deduction_opt_ins"("employeeId", "code");
