import { Hono } from "hono";
import { Prisma, TripStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import {
  tripSchema,
  tripBatchSchema,
  tripBaseSchema,
  tripReconSchema,
  tripExpenseSchema,
  idSchema,
  paginationSchema,
} from "@backend/lib/validations";
import { checkDispatchConflict } from "@backend/services/dispatch";
import { computeTripPnL, postTripExpense } from "@backend/services/freight";
import { logActivity } from "@backend/lib/activity";
import { notifyDriver } from "@backend/lib/notifications";
import { AuthError } from "@backend/lib/errors";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { can } from "@backend/lib/rbac";
import { updateWithVersion, requireVersion } from "@backend/lib/concurrency";
import { areaScope, areaForWrite } from "@backend/lib/scope";
import { ok, created, pageMeta } from "@backend/lib/http";

export const trips = new Hono();

trips.get("/", requireAuth, requirePermission("trip:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const status = sp.status;

  const where: Prisma.TripWhereInput = {
    ...areaScope(user),
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
  return ok(c, items, pageMeta(page, pageSize, total));
});

trips.post("/", requireAuth, requirePermission("trip:write"), async (c) => {
  const user = c.get("user");
  const body = tripSchema.parse(await c.req.json());

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
    throw new AuthError(`Scheduling conflict for ${parts.join(" and ")} in this window`, 409, conflict);
  }

  const tripCode = `TRP-${Date.now().toString().slice(-8)}`;
  const trip = await prisma.$transaction(async (tx) => {
    const t = await tx.trip.create({ data: { ...body, dataAreaId: areaForWrite(user, body.dataAreaId), tripCode, createdById: user.id } });
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
  return created(c, trip);
});

/**
 * Assign several vehicles to one order at once.
 *
 * Conflicts are checked twice: against trips already in the database, and
 * within the batch itself, because the same truck or driver can easily be
 * picked on two rows of the same form. All legs are created in one transaction
 * so a clash on the last row does not leave the first fourteen behind.
 */
trips.post("/batch", requireAuth, requirePermission("trip:write"), async (c) => {
  const user = c.get("user");
  const body = tripBatchSchema.parse(await c.req.json());

  const overlaps = (a: { s: Date; e: Date }, b: { s: Date; e: Date }) => a.s < b.e && b.s < a.e;
  for (let i = 0; i < body.legs.length; i++) {
    for (let j = i + 1; j < body.legs.length; j++) {
      const A = body.legs[i], B = body.legs[j];
      const win = { a: { s: A.scheduledStart, e: A.scheduledEnd }, b: { s: B.scheduledStart, e: B.scheduledEnd } };
      if (!overlaps(win.a, win.b)) continue;
      if (A.vehicleId === B.vehicleId) {
        throw new AuthError(`The same vehicle is used twice in overlapping windows (rows ${i + 1} and ${j + 1})`, 409);
      }
      if (A.driverId === B.driverId) {
        throw new AuthError(`The same driver is used twice in overlapping windows (rows ${i + 1} and ${j + 1})`, 409);
      }
    }
  }

  for (const [i, leg] of body.legs.entries()) {
    const conflict = await checkDispatchConflict({
      driverId: leg.driverId,
      vehicleId: leg.vehicleId,
      scheduledStart: leg.scheduledStart,
      scheduledEnd: leg.scheduledEnd,
    });
    if (conflict.hasConflict) {
      const parts = [conflict.driverConflict ? "driver" : null, conflict.vehicleConflict ? "vehicle" : null].filter(Boolean);
      throw new AuthError(`Row ${i + 1}: scheduling conflict for ${parts.join(" and ")} in this window`, 409, conflict);
    }
  }

  const dataAreaId = areaForWrite(user, body.dataAreaId);
  // A per-row suffix — Date.now() alone repeats inside one millisecond and would
  // collide on the unique tripCode.
  const stamp = Date.now().toString().slice(-8);

  const createdTrips = await prisma.$transaction(async (tx) => {
    const out = [];
    for (const [i, leg] of body.legs.entries()) {
      out.push(
        await tx.trip.create({
          data: {
            ...leg,
            dataAreaId,
            orderId: body.orderId,
            corridor: body.corridor,
            tripCode: `TRP-${stamp}-${String(i + 1).padStart(2, "0")}`,
            createdById: user.id,
          },
        }),
      );
    }
    await tx.order.update({ where: { id: body.orderId }, data: { status: "IN_TRANSIT" } });
    return out;
  });

  for (const leg of body.legs) {
    await notifyDriver(leg.driverId, {
      type: "DISPATCH",
      title: "A new trip has been assigned",
      body: "Please review the trip details.",
      link: `/driver`,
    });
  }
  await logActivity({
    userId: user.id,
    action: "CREATE",
    target: `Order:${body.orderId}`,
    detail: `${createdTrips.length} trips assigned`,
  });
  return created(c, createdTrips);
});

trips.get("/:id", requireAuth, requirePermission("trip:read"), async (c) => {
  const id = c.req.param("id");
  idSchema.parse(id);
  const trip = await prisma.trip.findUnique({
    where: { id },
    include: {
      order: { include: { client: { select: { companyName: true } } } },
      driver: { select: { name: true } },
      vehicle: { select: { vehicleNumber: true, plateNumber: true } },
      expenses: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!trip) throw new AuthError("Not found", 404);

  // Attach computed P&L (Decimals serialized as strings).
  const pnl = await computeTripPnL(id);
  return ok(c, {
    ...trip,
    pnl: {
      revenue: pnl.revenue.toString(),
      expenses: pnl.expenses.toString(),
      profit: pnl.profit.toString(),
      marginPct: pnl.marginPct.toFixed(2),
      currency: pnl.currency,
      expenseByType: pnl.expenseByType,
    },
  });
});

trips.patch("/:id", requireAuth, requirePermission("trip:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  idSchema.parse(id);
  const raw = await c.req.json();
  const version = requireVersion(raw);
  const body = tripBaseSchema.partial().parse(raw);
  const trip = await updateWithVersion(prisma.trip, id, version, user.id, body);
  await logActivity({ userId: user.id, action: "UPDATE", target: `Trip:${id}` });
  return ok(c, trip);
});

/** Freight-bill reconciliation (M12): set recon status, carrier ref, fuel litres. */
trips.post("/:id", requireAuth, requirePermission("trip:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  idSchema.parse(id);
  const body = tripReconSchema.parse(await c.req.json());
  const trip = await prisma.trip.update({
    where: { id },
    data: {
      reconStatus: body.reconStatus,
      carrierInvoiceRef: body.carrierInvoiceRef,
      ...(body.fuelLitres !== undefined ? { fuelLitres: body.fuelLitres } : {}),
    },
  });
  await logActivity({ userId: user.id, action: "RECONCILE", target: `Trip:${id}`, detail: { reconStatus: body.reconStatus } });
  return ok(c, trip);
});

// ---- expenses ----
trips.get("/:id/expenses", requireAuth, requirePermission("trip:read"), async (c) => {
  const id = c.req.param("id");
  idSchema.parse(id);
  const expenses = await prisma.tripExpense.findMany({
    where: { tripId: id },
    orderBy: { createdAt: "asc" },
  });
  return ok(c, expenses);
});

trips.post("/:id/expenses", requireAuth, async (c) => {
  // Posting to the ledger requires order:invoice (finance authority);
  // recording an unposted expense only needs trip:write.
  const id = c.req.param("id");
  idSchema.parse(id);
  const raw = await c.req.json();
  const body = tripExpenseSchema.parse(raw);

  const user = c.get("user");
  const needed = body.post ? "order:invoice" : "trip:write";
  if (!can(user.role, needed)) throw new AuthError("You do not have permission", 403);

  const trip = await prisma.trip.findUnique({ where: { id }, select: { id: true } });
  if (!trip) throw new AuthError("Trip not found", 404);

  const expense = await prisma.tripExpense.create({
    data: { tripId: id, type: body.type, amount: body.amount, currency: body.currency, note: body.note },
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `TripExpense:${expense.id}` });

  if (body.post) {
    const entry = await postTripExpense(expense.id, user.id, { budgetOverride: raw.budgetOverride === true });
    await logActivity({
      userId: user.id,
      action: "POST",
      target: `TripExpense:${expense.id}`,
      detail: { voucherNumber: entry.voucherNumber },
    });
    return created(c, { expense, entry });
  }
  return created(c, { expense });
});
