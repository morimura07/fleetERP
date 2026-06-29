import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError, pageMeta } from "@/lib/api";
import { waypointSchema, paginationSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("waypoint:read");
    const sp = req.nextUrl.searchParams;
    const { page, pageSize, q } = paginationSchema.parse(Object.fromEntries(sp));
    const kind = sp.get("kind");

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
    return ok(items, pageMeta(page, pageSize, total));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("waypoint:write");
    const body = waypointSchema.parse(await req.json());
    const wp = await prisma.gpsWaypoint.create({
      data: {
        code: body.code, name: body.name, kind: body.kind,
        lat: body.lat.toString(), lng: body.lng.toString(),
        country: body.country || null, isActive: body.isActive,
      },
    });
    await logActivity({ userId: user.id, action: "CREATE", target: `GpsWaypoint:${wp.id}` });
    return created(wp);
  } catch (e) {
    return handleError(e);
  }
}
