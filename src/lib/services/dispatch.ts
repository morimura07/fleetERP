import { prisma } from "@/lib/prisma";

export interface ConflictResult {
  hasConflict: boolean;
  driverConflict: boolean;
  vehicleConflict: boolean;
}

/** Pure interval-overlap predicate: [aStart,aEnd) intersects [bStart,bEnd). */
export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Overlap test for two intervals [aStart,aEnd) and [bStart,bEnd):
 *   aStart < bEnd  &&  bStart < aEnd
 *
 * Checks whether the proposed driver/vehicle assignment overlaps any existing
 * non-cancelled dispatch. `excludeDispatchId` lets an edit ignore itself.
 */
export async function checkDispatchConflict(params: {
  driverId: string;
  vehicleId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  excludeDispatchId?: string;
}): Promise<ConflictResult> {
  const { driverId, vehicleId, scheduledStart, scheduledEnd, excludeDispatchId } =
    params;

  const overlap = {
    status: { not: "CANCELLED" as const },
    scheduledStart: { lt: scheduledEnd },
    scheduledEnd: { gt: scheduledStart },
    ...(excludeDispatchId ? { id: { not: excludeDispatchId } } : {}),
  };

  const [driverConflict, vehicleConflict] = await Promise.all([
    prisma.dispatch.count({ where: { ...overlap, driverId } }),
    prisma.dispatch.count({ where: { ...overlap, vehicleId } }),
  ]);

  return {
    driverConflict: driverConflict > 0,
    vehicleConflict: vehicleConflict > 0,
    hasConflict: driverConflict > 0 || vehicleConflict > 0,
  };
}

/** Drivers that are ACTIVE and free during the window (no overlapping dispatch). */
export async function availableDrivers(start: Date, end: Date) {
  const busy = await prisma.dispatch.findMany({
    where: {
      status: { not: "CANCELLED" },
      scheduledStart: { lt: end },
      scheduledEnd: { gt: start },
    },
    select: { driverId: true },
  });
  const busyIds = busy.map((d) => d.driverId);

  return prisma.driver.findMany({
    where: { status: "ACTIVE", id: { notIn: busyIds.length ? busyIds : undefined } },
    orderBy: { name: "asc" },
  });
}

/** Vehicles that are AVAILABLE and free during the window. */
export async function availableVehicles(start: Date, end: Date) {
  const busy = await prisma.dispatch.findMany({
    where: {
      status: { not: "CANCELLED" },
      scheduledStart: { lt: end },
      scheduledEnd: { gt: start },
    },
    select: { vehicleId: true },
  });
  const busyIds = busy.map((d) => d.vehicleId);

  return prisma.vehicle.findMany({
    where: {
      status: "AVAILABLE",
      id: { notIn: busyIds.length ? busyIds : undefined },
    },
    orderBy: { vehicleNumber: "asc" },
  });
}
