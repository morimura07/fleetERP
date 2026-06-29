import { prisma } from "@backend/lib/prisma";

export interface DriverMonthlySummary {
  driverId: string;
  driverName: string;
  year: number;
  month: number;
  jobCount: number;
  totalAmount: number;
}

/**
 * Reward = sum of rewardAmount over COMPLETED jobs whose deliveryDate falls in
 * the given month, grouped by the dispatched driver.
 */
export async function computeMonthlyPayments(
  year: number,
  month: number,
): Promise<DriverMonthlySummary[]> {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const jobs = await prisma.deliveryJob.findMany({
    where: {
      status: "COMPLETED",
      deliveryDate: { gte: start, lt: end },
      dispatch: { isNot: null },
    },
    select: {
      rewardAmount: true,
      dispatch: { select: { driver: { select: { id: true, name: true } } } },
    },
  });

  const map = new Map<string, DriverMonthlySummary>();
  for (const job of jobs) {
    const driver = job.dispatch?.driver;
    if (!driver) continue;
    const cur =
      map.get(driver.id) ??
      ({
        driverId: driver.id,
        driverName: driver.name,
        year,
        month,
        jobCount: 0,
        totalAmount: 0,
      } satisfies DriverMonthlySummary);
    cur.jobCount += 1;
    cur.totalAmount += job.rewardAmount;
    map.set(driver.id, cur);
  }

  return [...map.values()].sort((a, b) => b.totalAmount - a.totalAmount);
}

/** Recompute and persist Payment rows for a month (idempotent upsert). */
export async function finalizeMonthlyPayments(year: number, month: number) {
  const summaries = await computeMonthlyPayments(year, month);
  await prisma.$transaction(
    summaries.map((s) =>
      prisma.payment.upsert({
        where: { driverId_year_month: { driverId: s.driverId, year, month } },
        create: {
          driverId: s.driverId,
          year,
          month,
          totalAmount: s.totalAmount,
          jobCount: s.jobCount,
          finalizedAt: new Date(),
        },
        update: {
          totalAmount: s.totalAmount,
          jobCount: s.jobCount,
          finalizedAt: new Date(),
        },
      }),
    ),
  );
  return summaries;
}
