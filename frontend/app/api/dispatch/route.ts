import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError, error, pageMeta } from "@/lib/api";
import { dispatchSchema, paginationSchema } from "@/lib/validations";
import { checkDispatchConflict } from "@/lib/services/dispatch";
import { logActivity } from "@/lib/activity";
import { notifyDriver } from "@/lib/notifications";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("dispatch:read");
    const sp = req.nextUrl.searchParams;
    const { page, pageSize } = paginationSchema.parse(Object.fromEntries(sp));

    const [items, total] = await Promise.all([
      prisma.dispatch.findMany({
        include: {
          job: { select: { jobCode: true, deliveryAddress: true, deliveryDate: true } },
          driver: { select: { name: true } },
          vehicle: { select: { vehicleNumber: true, plateNumber: true } },
        },
        orderBy: { scheduledStart: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.dispatch.count(),
    ]);
    return ok(items, pageMeta(page, pageSize, total));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("dispatch:write");
    const body = dispatchSchema.parse(await req.json());

    // Conflict check — driver & vehicle must be free in the window.
    const conflict = await checkDispatchConflict(body);
    if (conflict.hasConflict) {
      const parts = [
        conflict.driverConflict ? "driver" : null,
        conflict.vehicleConflict ? "vehicle" : null,
      ].filter(Boolean);
      return error(`Scheduling conflict for ${parts.join(" and ")} in this window`, 409, conflict);
    }

    const dispatch = await prisma.$transaction(async (tx) => {
      const d = await tx.dispatch.create({
        data: { ...body, createdById: user.id },
      });
      await tx.deliveryJob.update({ where: { id: body.jobId }, data: { status: "ASSIGNED" } });
      return d;
    });

    await notifyDriver(body.driverId, {
      type: "DISPATCH",
      title: "A new dispatch has been assigned",
      body: "Please review the dispatch details.",
      link: `/driver/jobs/${body.jobId}`,
    });
    await logActivity({ userId: user.id, action: "CREATE", target: `Dispatch:${dispatch.id}` });
    return created(dispatch);
  } catch (e) {
    return handleError(e);
  }
}
