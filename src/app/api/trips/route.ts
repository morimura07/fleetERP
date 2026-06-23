import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError, error, pageMeta } from "@/lib/api";
import { tripSchema, paginationSchema } from "@/lib/validations";
import { checkDispatchConflict } from "@/lib/services/dispatch";
import { logActivity } from "@/lib/activity";
import { notifyDriver } from "@/lib/notifications";
import { Prisma, TripStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("trip:read");
    const sp = req.nextUrl.searchParams;
    const { page, pageSize, q } = paginationSchema.parse(Object.fromEntries(sp));
    const status = sp.get("status");

    const where: Prisma.TripWhereInput = {
      ...(q ? { tripCode: { contains: q, mode: "insensitive" } } : {}),
      ...(status && status in TripStatus ? { status: status as TripStatus } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.trip.findMany({
        where,
        include: {
          order: { select: { orderCode: true, originZone: true, destinationZone: true } },
          driver: { select: { name: true } },
          vehicle: { select: { vehicleNumber: true, plateNumber: true } },
        },
        orderBy: { scheduledStart: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.trip.count({ where }),
    ]);
    return ok(items, pageMeta(page, pageSize, total));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("trip:write");
    const body = tripSchema.parse(await req.json());

    // The driver & vehicle must be free in the window (reuses dispatch logic).
    const conflict = await checkDispatchConflict({
      driverId: body.driverId,
      vehicleId: body.vehicleId,
      scheduledStart: body.scheduledStart,
      scheduledEnd: body.scheduledEnd,
    });
    if (conflict.hasConflict) {
      const parts = [
        conflict.driverConflict ? "driver" : null,
        conflict.vehicleConflict ? "vehicle" : null,
      ].filter(Boolean);
      return error(`Scheduling conflict for ${parts.join(" and ")} in this window`, 409, conflict);
    }

    const tripCode = `TRP-${Date.now().toString().slice(-8)}`;
    const trip = await prisma.$transaction(async (tx) => {
      const t = await tx.trip.create({
        data: { ...body, tripCode, createdById: user.id },
      });
      await tx.order.update({ where: { id: body.orderId }, data: { status: "IN_TRANSIT" } });
      return t;
    });

    await notifyDriver(body.driverId, {
      type: "DISPATCH",
      title: "A new trip has been assigned",
      body: "Please review the trip details.",
      link: `/driver`,
    });
    await logActivity({ userId: user.id, action: "CREATE", target: `Trip:${trip.id}` });
    return created(trip);
  } catch (e) {
    return handleError(e);
  }
}
