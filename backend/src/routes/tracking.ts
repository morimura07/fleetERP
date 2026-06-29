import { Hono } from "hono";
import { prisma } from "@backend/lib/prisma";
import { waypointSchema, paginationSchema } from "@backend/lib/validations";
import { logActivity } from "@backend/lib/activity";
import { Prisma } from "@prisma/client";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";

/**
 * Live vehicle tracking (PRD §5) — integration-gated on a telematics provider.
 * Until that's wired up, positions are STUB rows seeded/ingested manually.
 */
export const tracking = new Hono();

tracking.get("/", requireAuth, requirePermission("tracking:read"), async (c) => {
  const positions = await prisma.vehiclePosition.findMany({
    include: { vehicle: { select: { plateNumber: true, model: true, status: true } } },
    orderBy: { pingedAt: "desc" },
  });
  const waypoints = await prisma.gpsWaypoint.findMany({
    where: { isActive: true },
    select: { code: true, name: true, kind: true, lat: true, lng: true },
    orderBy: { code: "asc" },
  });
  return ok(c, { positions, waypoints, source: "STUB" });
});

// GPS waypoint registry (M30).
export const waypoints = new Hono();

waypoints.get("/", requireAuth, requirePermission("waypoint:read"), async (c) => {
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const kind = sp.kind;

  const where: Prisma.GpsWaypointWhereInput = {
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(kind ? { kind } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.gpsWaypoint.findMany({ where, orderBy: { code: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.gpsWaypoint.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

waypoints.post("/", requireAuth, requirePermission("waypoint:write"), async (c) => {
  const user = c.get("user");
  const body = waypointSchema.parse(await c.req.json());
  const wp = await prisma.gpsWaypoint.create({
    data: {
      code: body.code,
      name: body.name,
      kind: body.kind,
      lat: body.lat.toString(),
      lng: body.lng.toString(),
      country: body.country || null,
      isActive: body.isActive,
    },
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `GpsWaypoint:${wp.id}` });
  return created(c, wp);
});
