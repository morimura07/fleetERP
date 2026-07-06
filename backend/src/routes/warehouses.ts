import { Hono } from "hono";
import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { warehouseSchema, stockTransferSchema, paginationSchema } from "@backend/lib/validations";
import { transferStock } from "@backend/services/inventory";
import { logActivity } from "@backend/lib/activity";
import { updateWithVersion, requireVersion } from "@backend/lib/concurrency";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";

export const warehouses = new Hono();

warehouses.get("/", requireAuth, requirePermission("warehouse:read"), async (c) => {
  const user = c.get("user");
  const { page, pageSize, q } = paginationSchema.parse(c.req.query());
  const where: Prisma.WarehouseWhereInput = {
    ...areaScope(user),
    ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.warehouse.findMany({ where, orderBy: { code: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.warehouse.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

warehouses.post("/", requireAuth, requirePermission("warehouse:write"), async (c) => {
  const user = c.get("user");
  const body = warehouseSchema.parse(await c.req.json());
  const dataAreaId = areaForWrite(user, body.dataAreaId);

  const wh = await prisma.$transaction(async (tx) => {
    // Only one default warehouse per entity.
    if (body.isDefault) {
      await tx.warehouse.updateMany({ where: { dataAreaId, isDefault: true }, data: { isDefault: false } });
    }
    return tx.warehouse.create({
      data: {
        dataAreaId,
        code: body.code,
        name: body.name,
        location: body.location || null,
        isDefault: body.isDefault,
        isActive: body.isActive,
        createdById: user.id,
      },
    });
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `Warehouse:${wh.id}` });
  return created(c, wh);
});

warehouses.patch("/:id", requireAuth, requirePermission("warehouse:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const raw = await c.req.json();
  const version = requireVersion(raw);
  const body = warehouseSchema.partial().parse(raw);
  const existing = await prisma.warehouse.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  if (body.isDefault) {
    await prisma.warehouse.updateMany({ where: { dataAreaId: existing!.dataAreaId, isDefault: true }, data: { isDefault: false } });
  }
  const wh = await updateWithVersion(prisma.warehouse, id, version, user.id, {
    name: body.name,
    location: body.location,
    isDefault: body.isDefault,
    isActive: body.isActive,
  });
  await logActivity({ userId: user.id, action: "UPDATE", target: `Warehouse:${id}` });
  return ok(c, wh);
});

/** Per-warehouse stock balances (with the item roll-up). GET /:id/balances */
warehouses.get("/:id/balances", requireAuth, requirePermission("warehouse:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const wh = await prisma.warehouse.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, wh);
  const balances = await prisma.stockBalance.findMany({
    where: { warehouseId: id, quantity: { gt: 0 } },
    include: { stockItem: { select: { code: true, name: true, unit: true, avgCost: true, currency: true } } },
    orderBy: { stockItem: { code: "asc" } },
  });
  return ok(c, balances);
});

/** Inter-warehouse transfer (no P&L). POST /transfer */
warehouses.post("/transfer", requireAuth, requirePermission("warehouse:write"), async (c) => {
  const user = c.get("user");
  const body = stockTransferSchema.parse(await c.req.json());

  // Enforce that everything is in the caller's entity.
  const [item, from, to] = await Promise.all([
    prisma.stockItem.findUnique({ where: { id: body.stockItemId }, select: { dataAreaId: true } }),
    prisma.warehouse.findUnique({ where: { id: body.fromWarehouseId }, select: { dataAreaId: true } }),
    prisma.warehouse.findUnique({ where: { id: body.toWarehouseId }, select: { dataAreaId: true } }),
  ]);
  for (const row of [item, from, to]) assertSameArea(user, row);

  const result = await transferStock({
    stockItemId: body.stockItemId,
    fromWarehouseId: body.fromWarehouseId,
    toWarehouseId: body.toWarehouseId,
    quantity: body.quantity,
    reference: body.reference || null,
    memo: body.memo || null,
    createdById: user.id,
  });
  await logActivity({ userId: user.id, action: "TRANSFER", target: `StockItem:${body.stockItemId}`, detail: { from: body.fromWarehouseId, to: body.toWarehouseId, qty: body.quantity } });
  return created(c, result);
});
