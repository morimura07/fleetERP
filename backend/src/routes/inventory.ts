import { Hono } from "hono";
import { Prisma, StockCategory } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { stockItemSchema, stockMovementSchema, paginationSchema } from "@backend/lib/validations";
import { receiveStock, issueStock, itemValue } from "@backend/services/inventory";
import { logActivity } from "@backend/lib/activity";
import { updateWithVersion, requireVersion } from "@backend/lib/concurrency";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { AuthError } from "@backend/lib/errors";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";

export const inventory = new Hono();

// ── Items ──
inventory.get("/", requireAuth, requirePermission("inventory:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const category = sp.category;
  const lowOnly = sp.low === "1";

  const where: Prisma.StockItemWhereInput = {
    ...areaScope(user),
    ...(q
      ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }
      : {}),
    ...(category && category in StockCategory ? { category: category as StockCategory } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.stockItem.findMany({ where, orderBy: { code: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.stockItem.count({ where }),
  ]);

  // Attach computed value + low-stock flag; optionally filter to low stock only.
  const items = rows
    .map((it) => ({
      ...it,
      value: itemValue(it).toFixed(2),
      low: new Prisma.Decimal(it.quantityOnHand).lessThanOrEqualTo(it.reorderLevel),
    }))
    .filter((it) => (lowOnly ? it.low : true));

  return ok(c, items, pageMeta(page, pageSize, total));
});

/** Total on-hand inventory value for the entity (balance-sheet figure). */
inventory.get("/valuation", requireAuth, requirePermission("inventory:read"), async (c) => {
  const user = c.get("user");
  const rows = await prisma.stockItem.findMany({
    where: { ...areaScope(user), isActive: true },
    select: { quantityOnHand: true, avgCost: true, currency: true },
  });
  const total = rows.reduce((s, r) => s.plus(itemValue(r)), new Prisma.Decimal(0));
  return ok(c, { totalValue: total.toFixed(2), itemCount: rows.length });
});

inventory.post("/", requireAuth, requirePermission("inventory:write"), async (c) => {
  const user = c.get("user");
  const body = stockItemSchema.parse(await c.req.json());
  const item = await prisma.stockItem.create({
    data: {
      dataAreaId: areaForWrite(user, body.dataAreaId),
      code: body.code,
      name: body.name,
      category: body.category,
      unit: body.unit,
      glCode: body.glCode,
      expenseCode: body.expenseCode,
      reorderLevel: body.reorderLevel,
      currency: body.currency,
      isActive: body.isActive,
      createdById: user.id,
    },
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `StockItem:${item.id}` });
  return created(c, item);
});

inventory.get("/:id", requireAuth, requirePermission("inventory:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const item = await prisma.stockItem.findUnique({
    where: { id },
    include: { movements: { orderBy: { createdAt: "desc" }, take: 50 } },
  });
  assertSameArea(user, item);
  return ok(c, { ...item, value: itemValue(item!).toFixed(2) });
});

inventory.patch("/:id", requireAuth, requirePermission("inventory:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const raw = await c.req.json();
  const version = requireVersion(raw);
  const body = stockItemSchema.partial().parse(raw);
  // Guard cross-entity edits.
  const existing = await prisma.stockItem.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const item = await updateWithVersion(prisma.stockItem, id, version, user.id, {
    name: body.name,
    category: body.category,
    unit: body.unit,
    glCode: body.glCode,
    expenseCode: body.expenseCode,
    reorderLevel: body.reorderLevel,
    isActive: body.isActive,
  });
  await logActivity({ userId: user.id, action: "UPDATE", target: `StockItem:${id}` });
  return ok(c, item);
});

// ── Movements (receive / issue) ──
inventory.post("/:id/movements", requireAuth, requirePermission("inventory:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = stockMovementSchema.parse({ ...(await c.req.json()), stockItemId: id });

  // Ensure the item is in the caller's entity before moving stock.
  const item = await prisma.stockItem.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, item);

  if (body.type === "RECEIPT") {
    if (body.unitCost === undefined) throw new AuthError("unitCost is required for a receipt", 422);
    const mv = await receiveStock({
      stockItemId: id,
      quantity: body.quantity,
      unitCost: body.unitCost,
      reference: body.reference || null,
      memo: body.memo || null,
      warehouseId: body.warehouseId || null,
      createdById: user.id,
    });
    await logActivity({ userId: user.id, action: "RECEIVE", target: `StockItem:${id}`, detail: { movementId: mv.id } });
    return created(c, mv);
  }

  // ISSUE
  const mv = await issueStock({
    stockItemId: id,
    quantity: body.quantity,
    reference: body.reference || null,
    memo: body.memo || null,
    warehouseId: body.warehouseId || null,
    createdById: user.id,
  });
  await logActivity({ userId: user.id, action: "ISSUE", target: `StockItem:${id}`, detail: { movementId: mv.id } });
  return created(c, mv);
});
