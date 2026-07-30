import { Prisma, PeriodStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";

/**
 * Fiscal calendar / period-close (M34). Each legal entity can close an
 * accounting month; once closed, the ledger refuses any new posting dated in it
 * (enforced in `createJournalEntry`), which stops back-dated edits to a signed-
 * off period. A month with no row is OPEN, so enforcement is opt-in per month.
 */

/** The (year, month) a posting date falls in. Pure — uses local calendar parts
 * to match how the codebase constructs dates elsewhere (e.g. FX period-end). */
export function periodKey(date: Date): { year: number; month: number } {
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function periodLabel(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Throw if the posting date falls in a CLOSED period. Takes a Prisma client or
 * transaction client so it can run inside the ledger's posting transaction.
 * No period row → open → allowed.
 */
export async function assertPeriodOpen(
  db: Pick<Prisma.TransactionClient, "fiscalPeriod">,
  dataAreaId: string,
  postingDate: Date,
): Promise<void> {
  const { year, month } = periodKey(postingDate);
  const period = await db.fiscalPeriod.findUnique({
    where: { dataAreaId_year_month: { dataAreaId, year, month } },
    select: { status: true },
  });
  if (period?.status === "CLOSED") {
    throw new AuthError(`Accounting period ${periodLabel(year, month)} is closed — postings dated in it are blocked`, 422);
  }
}

export interface PeriodView {
  year: number;
  month: number;
  label: string;
  status: PeriodStatus;
  closedAt: string | null;
  note: string | null;
}

/**
 * The last `months` calendar months (most recent first) with their effective
 * status, plus any CLOSED months older than that window so closed history is
 * never hidden.
 */
export async function listPeriods(dataAreaId: string, months = 12): Promise<PeriodView[]> {
  const rows = await prisma.fiscalPeriod.findMany({ where: { dataAreaId } });
  const byKey = new Map(rows.map((r) => [`${r.year}-${r.month}`, r]));

  const out: PeriodView[] = [];
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear(), month = d.getMonth() + 1;
    const row = byKey.get(`${year}-${month}`);
    out.push({ year, month, label: periodLabel(year, month), status: row?.status ?? "OPEN", closedAt: row?.closedAt?.toISOString() ?? null, note: row?.note ?? null });
    byKey.delete(`${year}-${month}`);
  }
  for (const r of byKey.values()) {
    if (r.status === "CLOSED") {
      out.push({ year: r.year, month: r.month, label: periodLabel(r.year, r.month), status: r.status, closedAt: r.closedAt?.toISOString() ?? null, note: r.note });
    }
  }
  out.sort((a, b) => b.year - a.year || b.month - a.month);
  return out;
}

/** Close or reopen a period (upserts the row). Closing stamps who/when. */
export async function setPeriodStatus(
  dataAreaId: string,
  year: number,
  month: number,
  status: PeriodStatus,
  userId?: string | null,
  note?: string | null,
) {
  if (month < 1 || month > 12) throw new AuthError("Month must be 1–12", 422);
  if (year < 2000 || year > 2100) throw new AuthError("Year is out of range", 422);
  const closing = status === "CLOSED";
  return prisma.fiscalPeriod.upsert({
    where: { dataAreaId_year_month: { dataAreaId, year, month } },
    update: { status, closedAt: closing ? new Date() : null, closedById: closing ? (userId ?? null) : null, note: note ?? null },
    create: { dataAreaId, year, month, status, closedAt: closing ? new Date() : null, closedById: closing ? (userId ?? null) : null, note: note ?? null },
  });
}
