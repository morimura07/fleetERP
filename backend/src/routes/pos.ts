import { Hono } from "hono";
import { Prisma, PosSaleStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { posSaleSchema, paginationSchema } from "@backend/lib/validations";
import { createSale, completeSale, voidSale } from "@backend/services/pos";
import { logActivity } from "@backend/lib/activity";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";

export const pos = new Hono();

/** List POS sales (paginated, searchable, filterable by status). */
pos.get("/", requireAuth, requirePermission("pos:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const status = sp.status;
  const where: Prisma.PosSaleWhereInput = {
    ...areaScope(user),
    ...(q ? { OR: [{ saleNumber: { contains: q, mode: "insensitive" } }, { customerName: { contains: q, mode: "insensitive" } }] } : {}),
    ...(status && status in PosSaleStatus ? { status: status as PosSaleStatus } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.posSale.findMany({
      where,
      include: { _count: { select: { lines: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.posSale.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

/** Sale detail with its lines. */
pos.get("/:id", requireAuth, requirePermission("pos:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const sale = await prisma.posSale.findUnique({
    where: { id },
    include: {
      lines: { include: { stockItem: { select: { code: true, name: true, unit: true } } }, orderBy: { createdAt: "asc" } },
      revenueEntry: { select: { voucherNumber: true } },
      cogsEntry: { select: { voucherNumber: true } },
    },
  });
  assertSameArea(user, sale);
  return ok(c, sale);
});

/** Open a new sale (DRAFT) with its line items. */
pos.post("/", requireAuth, requirePermission("pos:write"), async (c) => {
  const user = c.get("user");
  const body = posSaleSchema.parse(await c.req.json());
  const sale = await createSale({
    dataAreaId: areaForWrite(user, undefined),
    customerName: body.customerName || null,
    paymentMethod: body.paymentMethod,
    currency: body.currency,
    taxAmount: body.taxAmount,
    note: body.note || null,
    lines: body.lines,
    createdById: user.id,
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `PosSale:${sale.id}` });
  return created(c, sale);
});

/** Complete a sale: relieve inventory and post revenue + COGS to the ledger. */
pos.post("/:id/complete", requireAuth, requirePermission("pos:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.posSale.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const sale = await completeSale(existing.dataAreaId, id, user.id);
  await logActivity({ userId: user.id, action: "COMPLETE", target: `PosSale:${id}`, detail: { total: sale.total.toString(), cogs: sale.cogs.toString() } });
  return ok(c, sale);
});

/** Void a sale (restores stock if it was completed). */
pos.post("/:id/void", requireAuth, requirePermission("pos:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.posSale.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const sale = await voidSale(existing.dataAreaId, id, user.id);
  await logActivity({ userId: user.id, action: "VOID", target: `PosSale:${id}` });
  return ok(c, sale);
});
