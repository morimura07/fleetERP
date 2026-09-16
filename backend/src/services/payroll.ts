import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import { createJournalEntry } from "@backend/services/ledger";
import { computePayslip } from "@backend/services/payslip-engine";
import { schemeFor } from "@backend/services/statutory-schemes";
import { approvedTimeEarningsByEmployee } from "@backend/services/attendance";

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
    include: { deductionOptIns: true },
  });
  if (employees.length === 0) throw new AuthError("No active employees to run payroll for", 422);

  // Approved time-based earnings for this period (overtime, rest-day and
  // night premium, shift allowances) are taxable earnings added before the
  // statutory deductions are computed. Each is its own payslip line.
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const timeEarnings = await approvedTimeEarningsByEmployee(dataAreaId, period);

  // One scheme load per country in the run, not per employee.
  const schemes = new Map<string, Awaited<ReturnType<typeof schemeFor>>>();
  for (const country of new Set(employees.map((e) => e.country))) {
    schemes.set(country, await schemeFor(country));
  }

  const slips = employees.map((e) => {
    const scheme = schemes.get(e.country)!;
    // Basic pay is what the statutory percentages work on. An employee
    // recorded before the field existed has only a gross salary, which is
    // then treated as all basic: the same figure the old engine used.
    const basic = e.basicPay ?? e.grossSalary;
    const time = timeEarnings.get(e.id);
    const result = computePayslip(
      {
        basicPay: basic,
        allowances: [
          { code: "HOUSING", label: "Housing allowance", amount: e.housingAllowance },
          { code: "TRANSPORT", label: "Transport allowance", amount: e.transportAllowance },
          { code: "WEEKLY", label: "Weekly allowance", amount: e.weeklyAllowance },
          { code: "PER_DIEM", label: "Per diem", amount: e.perDiem },
          { code: "OVERNIGHT", label: "Overnight allowance", amount: e.overnightAllowance },
          { code: "NIGHT_SHIFT", label: "Night shift premium", amount: e.nightShiftPremium },
          { code: "LAYOVER", label: "Layover pay", amount: e.layoverPay },
          { code: "MILEAGE", label: "Mileage bonus", amount: e.mileageBonus },
          { code: "PHONE", label: "Phone allowance", amount: e.phoneAllowance },
          { code: "OTHER", label: "Other allowance", amount: e.otherAllowance },
          { code: "PREMIUM", label: "Rest day and holiday premium", amount: time?.premiumPay ?? 0 },
          { code: "NIGHT", label: "Night work premium", amount: time?.nightPay ?? 0 },
          { code: "SHIFT_ALLOWANCE", label: "Shift allowances", amount: time?.shiftAllowances ?? 0 },
        ],
        overtimePay: time?.overtimePay ?? 0,
      },
      scheme,
      e.deductionOptIns.map((o) => ({ code: o.code, amountOverride: o.amountOverride })),
    );

    // The ledger posting credits PAYE, a statutory payable and net, and the
    // three must sum to gross. Pre-tax pension goes to nssfTotal; every other
    // employee deduction goes to shifTotal, which the posting treats as the
    // general statutory payable. Splitting union dues and loan repayments into
    // their own payables needs accounts the chart does not have yet.
    const preTax = result.lines.filter((l) => l.kind === "DEDUCTION" && scheme.deductions.find((d) => d.code === l.code)?.reducesTaxable);
    const otherDed = result.lines.filter((l) => l.kind === "DEDUCTION" && l.code !== "PAYE" && !preTax.includes(l));
    const sumLines = (ls: typeof result.lines) => ls.reduce((t, l) => t.plus(l.amount), new Prisma.Decimal(0));

    return {
      employeeId: e.id,
      gross: result.gross.toFixed(2),
      paye: result.paye.toFixed(2),
      nssf: sumLines(preTax).toFixed(2),
      shif: sumLines(otherDed).toFixed(2),
      net: result.net.toFixed(2),
      basic: result.basic.toFixed(2),
      allowances: result.allowances.toFixed(2),
      overtimePay: result.overtimePay.toFixed(2),
      taxable: result.taxable.toFixed(2),
      deductions: result.deductions.toFixed(2),
      employerCosts: result.employerCosts.toFixed(2),
      schemeCountry: scheme.country,
      lines: result.lines,
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
    for (const { lines, ...slip } of slips) {
      await tx.payslip.create({
        data: {
          ...slip,
          payRunId: run.id,
          lines: {
            create: lines.map((l) => ({
              kind: l.kind, code: l.code, label: l.label, amount: l.amount.toFixed(2),
              basis: l.basis?.toFixed(2) ?? null, ratePct: l.ratePct?.toFixed(4) ?? null, sortOrder: l.sortOrder,
            })),
          },
        },
      });
    }

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
