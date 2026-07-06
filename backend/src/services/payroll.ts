import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import { createJournalEntry } from "@backend/services/ledger";
import { computeStatutory } from "@backend/services/statutory";

/**
 * Payroll (M9) — monthly pay runs with statutory deductions and ledger posting.
 *
 * Lifecycle:  DRAFT (computed) → APPROVED → POSTED
 *
 * Posting (one entry per run):
 *   Dr Salaries & Wages (6000)          gross
 *     Cr PAYE Payable (2200)            Σ paye
 *     Cr NSSF/SHIF Payable (2210)       Σ nssf + Σ shif
 *     Cr Net Pay / Accrued (2300)       Σ net
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

const SALARIES = "6000";
const PAYE_PAYABLE = "2200";
const STATUTORY_PAYABLE = "2210"; // NSSF/SHIF
const NET_PAY = "2300"; // Accrued Expenses / net pay payable

async function accountId(dataAreaId: string, code: string): Promise<string> {
  const a = await prisma.account.findUnique({
    where: { dataAreaId_code: { dataAreaId, code } },
    select: { id: true },
  });
  if (!a) throw new AuthError(`Account ${code} not found (seed the chart of accounts)`, 404);
  return a.id;
}

/**
 * Compute (or recompute) a DRAFT pay run for a period: builds a payslip for every
 * ACTIVE employee in the entity and rolls up the totals. Idempotent — re-running
 * replaces the run's payslips. Fails if the run is already POSTED.
 */
export async function computePayRun(
  dataAreaId: string,
  year: number,
  month: number,
  createdById?: string | null,
) {
  const employees = await prisma.employee.findMany({
    where: { dataAreaId, status: "ACTIVE" },
    select: { id: true, grossSalary: true, country: true, currency: true },
  });
  if (employees.length === 0) throw new AuthError("No active employees to run payroll for", 422);

  const slips = employees.map((e) => {
    const s = computeStatutory(e.grossSalary, e.country);
    return {
      employeeId: e.id,
      gross: s.gross.toFixed(2),
      paye: s.paye.toFixed(2),
      nssf: s.nssf.toFixed(2),
      shif: s.shif.toFixed(2),
      net: s.net.toFixed(2),
    };
  });

  const sum = (k: "gross" | "paye" | "nssf" | "shif" | "net") =>
    slips.reduce((acc, sl) => acc.plus(sl[k]), new Prisma.Decimal(0));

  return prisma.$transaction(async (tx) => {
    const existing = await tx.payRun.findUnique({ where: { dataAreaId_year_month: { dataAreaId, year, month } } });
    if (existing?.status === "POSTED") throw new AuthError("This pay run is already posted", 409);

    const run = await tx.payRun.upsert({
      where: { dataAreaId_year_month: { dataAreaId, year, month } },
      update: {
        status: "DRAFT",
        grossTotal: sum("gross").toFixed(2),
        payeTotal: sum("paye").toFixed(2),
        nssfTotal: sum("nssf").toFixed(2),
        shifTotal: sum("shif").toFixed(2),
        netTotal: sum("net").toFixed(2),
        updatedById: createdById ?? null,
      },
      create: {
        dataAreaId, year, month,
        grossTotal: sum("gross").toFixed(2),
        payeTotal: sum("paye").toFixed(2),
        nssfTotal: sum("nssf").toFixed(2),
        shifTotal: sum("shif").toFixed(2),
        netTotal: sum("net").toFixed(2),
        createdById: createdById ?? null,
      },
    });

    // Replace payslips for a clean recompute.
    await tx.payslip.deleteMany({ where: { payRunId: run.id } });
    await tx.payslip.createMany({ data: slips.map((s) => ({ ...s, payRunId: run.id })) });

    return tx.payRun.findUniqueOrThrow({ where: { id: run.id }, include: { payslips: true } });
  });
}

/** Approve a DRAFT run (ready to post). */
export async function approvePayRun(id: string, approvedById: string) {
  const run = await prisma.payRun.findUnique({ where: { id } });
  if (!run) throw new AuthError("Pay run not found", 404);
  if (run.status !== "DRAFT") throw new AuthError("Only draft pay runs can be approved", 409);
  return prisma.payRun.update({ where: { id }, data: { status: "APPROVED", approvedById, approvedAt: new Date() } });
}

/** Post an APPROVED run to the ledger and mark it POSTED. */
export async function postPayRun(id: string, createdById?: string | null) {
  const run = await prisma.payRun.findUnique({ where: { id } });
  if (!run) throw new AuthError("Pay run not found", 404);
  if (run.postingEntryId || run.status !== "APPROVED") {
    throw new AuthError("Only approved, unposted runs can be posted", 409);
  }

  const gross = D(run.grossTotal);
  if (!gross.greaterThan(0)) throw new AuthError("Pay run total is zero", 422);
  const statutory = D(run.nssfTotal).plus(run.shifTotal);

  const [salId, payeId, statId, netId] = await Promise.all([
    accountId(run.dataAreaId, SALARIES),
    accountId(run.dataAreaId, PAYE_PAYABLE),
    accountId(run.dataAreaId, STATUTORY_PAYABLE),
    accountId(run.dataAreaId, NET_PAY),
  ]);

  const period = `${run.year}-${String(run.month).padStart(2, "0")}`;
  const lines = [
    { accountId: salId, debit: gross.toString(), memo: `Payroll ${period} gross` },
    ...(D(run.payeTotal).greaterThan(0) ? [{ accountId: payeId, credit: run.payeTotal.toString(), memo: "PAYE payable" }] : []),
    ...(statutory.greaterThan(0) ? [{ accountId: statId, credit: statutory.toString(), memo: "NSSF/SHIF payable" }] : []),
    { accountId: netId, credit: run.netTotal.toString(), memo: "Net pay payable" },
  ];

  const entry = await createJournalEntry(
    {
      dataAreaId: run.dataAreaId,
      postingDate: new Date(),
      currency: run.currency,
      memo: `Payroll ${period}`,
      lines,
      createdById,
    },
    { post: true },
  );

  await prisma.payRun.update({ where: { id: run.id }, data: { status: "POSTED", postingEntryId: entry.id } });
  return entry;
}
