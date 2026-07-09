import { Hono } from "hono";
import { Prisma, ServiceOrderStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { serviceOrderSchema, servicePartSchema, serviceLaborSchema, paginationSchema } from "@backend/lib/validations";
import {
  createOrder, addPart, addLabor, removeLabor, completeOrder, postOrder, cancelOrder,
} from "@backend/services/service-orders";
import { logActivity } from "@backend/lib/activity";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";

export const serviceOrders = new Hono();

/** List service orders (paginated, searchable, filterable by status). */
serviceOrders.get("/", requireAuth, requirePermission("service:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const status = sp.status;

  const where: Prisma.ServiceOrderWhereInput = {
    ...areaScope(user),
    ...(q ? { OR: [{ orderNumber: { contains: q, mode: "insensitive" } }, { fault: { contains: q, mode: "insensitive" } }] } : {}),
    ...(status && status in ServiceOrderStatus ? { status: status as ServiceOrderStatus } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.serviceOrder.findMany({
      where,
      include: {
        vehicle: { select: { plateNumber: true, model: true } },
        vendor: { select: { legalName: true } },
        _count: { select: { parts: true, labor: true } },
      },
      orderBy: { openedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.serviceOrder.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

/** Open a new service order. */
serviceOrders.post("/", requireAuth, requirePermission("service:write"), async (c) => {
  const user = c.get("user");
  const body = serviceOrderSchema.parse(await c.req.json());
  const order = await createOrder({
    dataAreaId: areaForWrite(user, body.dataAreaId),
    vehicleId: body.vehicleId,
    kind: body.kind,
    vendorId: body.vendorId ?? null,
    odometerKm: body.odometerKm ?? null,
    fault: body.fault,
    currency: body.currency,
    createdById: user.id,
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `ServiceOrder:${order.id}` });
  return created(c, order);
});

/** Order detail with parts + labor. */
serviceOrders.get("/:id", requireAuth, requirePermission("service:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const order = await prisma.serviceOrder.findUnique({
    where: { id },
    include: {
      vehicle: { select: { plateNumber: true, model: true, vehicleNumber: true } },
      vendor: { select: { legalName: true, code: true } },
      parts: { orderBy: { createdAt: "asc" } },
      labor: { orderBy: { createdAt: "asc" } },
      postingEntry: { select: { voucherNumber: true } },
    },
  });
  assertSameArea(user, order);
  return ok(c, order);
});

/** Issue a part onto the order (relieves inventory + posts the GL cost). */
serviceOrders.post("/:id/parts", requireAuth, requirePermission("service:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.serviceOrder.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const body = servicePartSchema.parse(await c.req.json());
  const order = await addPart(existing.dataAreaId, id, { stockItemId: body.stockItemId, quantity: body.quantity, createdById: user.id });
  await logActivity({ userId: user.id, action: "ADD_PART", target: `ServiceOrder:${id}`, detail: { stockItemId: body.stockItemId, quantity: body.quantity } });
  return ok(c, order);
});

/** Add a labor line. */
serviceOrders.post("/:id/labor", requireAuth, requirePermission("service:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.serviceOrder.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const body = serviceLaborSchema.parse(await c.req.json());
  const order = await addLabor(existing.dataAreaId, id, { description: body.description, hours: body.hours, rate: body.rate, createdById: user.id });
  await logActivity({ userId: user.id, action: "ADD_LABOR", target: `ServiceOrder:${id}` });
  return ok(c, order);
});

/** Remove a labor line (while the order is still editable). */
serviceOrders.delete("/:id/labor/:laborId", requireAuth, requirePermission("service:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.serviceOrder.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const order = await removeLabor(existing.dataAreaId, id, c.req.param("laborId"));
  await logActivity({ userId: user.id, action: "REMOVE_LABOR", target: `ServiceOrder:${id}` });
  return ok(c, order);
});

/** Mark the work complete (ready to post). */
serviceOrders.post("/:id/complete", requireAuth, requirePermission("service:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.serviceOrder.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const order = await completeOrder(existing.dataAreaId, id);
  await logActivity({ userId: user.id, action: "COMPLETE", target: `ServiceOrder:${id}` });
  return ok(c, order);
});

/** Post a completed order (accrues external labor to the ledger; closes the order). */
serviceOrders.post("/:id/post", requireAuth, requirePermission("service:approve"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.serviceOrder.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const order = await postOrder(existing.dataAreaId, id, user.id);
  await logActivity({ userId: user.id, action: "POST", target: `ServiceOrder:${id}`, detail: { totalCost: order.totalCost.toString() } });
  return ok(c, order);
});

/** Cancel an order (only before any parts are issued). */
serviceOrders.post("/:id/cancel", requireAuth, requirePermission("service:approve"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.serviceOrder.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const order = await cancelOrder(existing.dataAreaId, id, user.id);
  await logActivity({ userId: user.id, action: "CANCEL", target: `ServiceOrder:${id}` });
  return ok(c, order);
});
