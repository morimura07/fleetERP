import { Hono } from "hono";
import { prisma } from "@backend/lib/prisma";
import { dispatchSchema, paginationSchema } from "@backend/lib/validations";
import {
  checkDispatchConflict,
  availableDrivers,
  availableVehicles,
} from "@backend/services/dispatch";
import { logActivity } from "@backend/lib/activity";
import { notifyDriver } from "@backend/lib/notifications";
import { AuthError } from "@backend/lib/errors";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { updateWithVersion, requireVersion } from "@backend/lib/concurrency";
import { ok, created, pageMeta } from "@backend/lib/http";

export const dispatch = new Hono();

dispatch.get("/", requireAuth, requirePermission("dispatch:read"), async (c) => {
  const { page, pageSize } = paginationSchema.parse(c.req.query());

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
  return ok(c, items, pageMeta(page, pageSize, total));
});

dispatch.post("/", requireAuth, requirePermission("dispatch:write"), async (c) => {
  const user = c.get("user");
  const body = dispatchSchema.parse(await c.req.json());

  // Conflict check — driver & vehicle must be free in the window.
  const conflict = await checkDispatchConflict(body);
  if (conflict.hasConflict) {
    const parts = [
      conflict.driverConflict ? "driver" : null,
      conflict.vehicleConflict ? "vehicle" : null,
    ].filter(Boolean);
    throw new AuthError(`Scheduling conflict for ${parts.join(" and ")} in this window`, 409, conflict);
  }

  const created_ = await prisma.$transaction(async (tx) => {
    const d = await tx.dispatch.create({ data: { ...body, createdById: user.id } });
    await tx.deliveryJob.update({ where: { id: body.jobId }, data: { status: "ASSIGNED" } });
    return d;
  });

  await notifyDriver(body.driverId, {
    type: "DISPATCH",
    title: "A new dispatch has been assigned",
    body: "Please review the dispatch details.",
    link: `/driver/jobs/${body.jobId}`,
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `Dispatch:${created_.id}` });
  return created(c, created_);
});

/** GET /dispatch/available?start=ISO&end=ISO -> free drivers + vehicles */
dispatch.get("/available", requireAuth, requirePermission("dispatch:write"), async (c) => {
  const sp = c.req.query();
  const start = new Date(sp.start ?? "");
  const end = new Date(sp.end ?? "");
  if (isNaN(+start) || isNaN(+end) || end <= start) {
    throw new AuthError("Invalid start/end", 422);
  }
  const [driverList, vehicleList] = await Promise.all([
    availableDrivers(start, end),
    availableVehicles(start, end),
  ]);
  return ok(c, { drivers: driverList, vehicles: vehicleList });
});

dispatch.patch("/:id", requireAuth, requirePermission("dispatch:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const raw = await c.req.json();
  const version = requireVersion(raw);
  const body = dispatchSchema.parse(raw);

  const conflict = await checkDispatchConflict({ ...body, excludeDispatchId: id });
  if (conflict.hasConflict) {
    throw new AuthError("There is a scheduling conflict in this time window", 409, conflict);
  }

  const updated = await updateWithVersion(prisma.dispatch, id, version, user.id, body);
  await logActivity({ userId: user.id, action: "UPDATE", target: `Dispatch:${id}`, detail: body });
  return ok(c, updated);
});

dispatch.delete("/:id", requireAuth, requirePermission("dispatch:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const deleted = await prisma.$transaction(async (tx) => {
    const d = await tx.dispatch.delete({ where: { id } });
    await tx.deliveryJob.update({ where: { id: d.jobId }, data: { status: "WAITING_DISPATCH" } });
    return d;
  });
  await logActivity({ userId: user.id, action: "DELETE", target: `Dispatch:${id}` });
  return ok(c, { id: deleted.id });
});
