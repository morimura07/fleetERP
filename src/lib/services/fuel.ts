import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Fuel-efficiency monitoring (PRD §2.2, M11, §8.2).
 *
 * Actual km/L per vehicle is derived from completed trips that recorded both
 * mileage and litres, compared to the vehicle's target (km/L loaded). A vehicle
 * meaningfully below target flags possible siphoning or a mechanical issue.
 *
 * `fuelEfficiency` is the pure calculation; `vehicleFuelStats` aggregates trips.
 */

const D = (v: Prisma.Decimal.Value | null | undefined) => new Prisma.Decimal(v ?? 0);

export type FuelStatus = "MEETS_TARGET" | "BELOW_EXPECTED" | "NO_DATA";

export interface FuelResult {
  actualKmPerL: string | null; // null when there's no usable trip data
  targetKmPerL: string | null;
  variancePct: string | null; // (actual − target) / target × 100
  status: FuelStatus;
}

/**
 * Pure efficiency calc. `tolerancePct` is how far below target still counts as
 * meeting it (default 10% — a truck within 10% of target is not flagged).
 */
export function fuelEfficiency(
  totalKm: Prisma.Decimal.Value,
  totalLitres: Prisma.Decimal.Value,
  target: Prisma.Decimal.Value | null,
  tolerancePct = 10,
): FuelResult {
  const km = D(totalKm);
  const litres = D(totalLitres);

  if (!litres.greaterThan(0) || !km.greaterThan(0)) {
    return { actualKmPerL: null, targetKmPerL: target ? D(target).toFixed(2) : null, variancePct: null, status: "NO_DATA" };
  }

  const actual = km.dividedBy(litres);
  if (!target || !D(target).greaterThan(0)) {
    return { actualKmPerL: actual.toFixed(2), targetKmPerL: null, variancePct: null, status: "NO_DATA" };
  }

  const t = D(target);
  const variance = actual.minus(t).dividedBy(t).times(100);
  // Below target by more than the tolerance ⇒ flag.
  const threshold = t.times((100 - tolerancePct) / 100);
  const status: FuelStatus = actual.greaterThanOrEqualTo(threshold) ? "MEETS_TARGET" : "BELOW_EXPECTED";

  return { actualKmPerL: actual.toFixed(2), targetKmPerL: t.toFixed(2), variancePct: variance.toFixed(1), status };
}

export interface VehicleFuelStat extends FuelResult {
  vehicleId: string;
  plateNumber: string;
  model: string;
  totalKm: string;
  totalLitres: string;
  tripCount: number;
}

/** Per-vehicle fuel efficiency across completed trips with mileage + litres. */
export async function vehicleFuelStats(): Promise<VehicleFuelStat[]> {
  const vehicles = await prisma.vehicle.findMany({
    select: {
      id: true, plateNumber: true, model: true, fuelTargetKmPerL: true,
      trips: {
        where: { status: "COMPLETED", fuelLitres: { not: null } },
        select: { mileageKm: true, fuelLitres: true },
      },
    },
    orderBy: { plateNumber: "asc" },
  });

  return vehicles.map((v) => {
    let km = new Prisma.Decimal(0);
    let litres = new Prisma.Decimal(0);
    for (const t of v.trips) {
      km = km.plus(t.mileageKm);
      litres = litres.plus(t.fuelLitres ?? 0);
    }
    const result = fuelEfficiency(km, litres, v.fuelTargetKmPerL);
    return {
      vehicleId: v.id,
      plateNumber: v.plateNumber,
      model: v.model,
      totalKm: km.toFixed(2),
      totalLitres: litres.toFixed(2),
      tripCount: v.trips.length,
      ...result,
    };
  });
}
