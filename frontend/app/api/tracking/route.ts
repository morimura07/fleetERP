import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, handleError } from "@/lib/api";

/**
 * Live vehicle tracking (PRD §5) — integration-gated on a telematics provider.
 * Until that's wired up, positions are STUB rows seeded/ingested manually. This
 * endpoint serves the last-known position per vehicle for the tracking map.
 */
export async function GET(_req: NextRequest) {
  try {
    await requirePermission("tracking:read");
    const positions = await prisma.vehiclePosition.findMany({
      include: { vehicle: { select: { plateNumber: true, model: true, status: true } } },
      orderBy: { pingedAt: "desc" },
    });
    const waypoints = await prisma.gpsWaypoint.findMany({
      where: { isActive: true },
      select: { code: true, name: true, kind: true, lat: true, lng: true },
      orderBy: { code: "asc" },
    });
    return ok({ positions, waypoints, source: "STUB" });
  } catch (e) {
    return handleError(e);
  }
}
