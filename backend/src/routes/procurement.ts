import { Hono } from "hono";
import { Prisma, PurchaseOrderStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { purchaseOrderSchema, goodsReceiptSchema, matchSchema, paginationSchema } from "@backend/lib/validations";
import {
  createPurchaseOrder,
  approvePurchaseOrder,
  receiveGoods,
  matchPurchaseOrder,
} from "@backend/services/procurement";
import { logActivity } from "@backend/lib/activity";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";

export const procurement = new Hono();

// ── Purchase orders ──
procurement.get("/", requireAuth, requirePermission("procurement:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const status = sp.status;

  const where: Prisma.PurchaseOrderWhereInput = {
    ...areaScope(user),
    ...(q
      ? { OR: [{ poNumber: { contains: q, mode: "insensitive" } }, { vendor: { legalName: { contains: q, mode: "insensitive" } } }] }
      : {}),
    ...(status && status in PurchaseOrderStatus ? { status: status as PurchaseOrderStatus } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      include: { vendor: { select: { legalName: true } }, _count: { select: { lines: true } } },
      orderBy: { orderDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.purchaseOrder.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

procurement.post("/", requireAuth, requirePermission("procurement:write"), async (c) => {
  const user = c.get("user");
  const body = purchaseOrderSchema.parse(await c.req.json());
  const po = await createPurchaseOrder({
    dataAreaId: areaForWrite(user, body.dataAreaId),
    vendorId: body.vendorId,
    currency: body.currency,
    orderDate: body.orderDate,
    expectedAt: body.expectedAt ?? null,
    memo: body.memo || null,
    lines: body.lines,
    createdById: user.id,
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `PurchaseOrder:${po.id}` });
  return created(c, po);
});

procurement.get("/:id", requireAuth, requirePermission("procurement:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      vendor: { select: { legalName: true, code: true } },
      lines: { include: { stockItem: { select: { code: true, unit: true } } } },
      receipts: { include: { lines: true }, orderBy: { createdAt: "desc" } },
      vendorInvoice: { select: { invoiceNumber: true, subtotal: true } },
    },
  });
  assertSameArea(user, po);
  return ok(c, po);
});

/** Approve a DRAFT PO (finance authority). */
procurement.post("/:id/approve", requireAuth, requirePermission("procurement:approve"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.purchaseOrder.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const po = await approvePurchaseOrder(id, user.id);
  await logActivity({ userId: user.id, action: "APPROVE", target: `PurchaseOrder:${id}` });
  return ok(c, po);
});

/** Record a goods receipt against the PO (feeds inventory). */
procurement.post("/:id/receive", requireAuth, requirePermission("procurement:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.purchaseOrder.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const body = goodsReceiptSchema.parse(await c.req.json());
  const receipt = await receiveGoods(id, body.lines, {
    receivedAt: body.receivedAt,
    note: body.note || null,
    createdById: user.id,
  });
  await logActivity({ userId: user.id, action: "RECEIVE", target: `PurchaseOrder:${id}`, detail: { receiptId: receipt.id } });
  return created(c, receipt);
});

/** 3-way match the PO against a vendor invoice (finance authority). */
procurement.post("/:id/match", requireAuth, requirePermission("procurement:approve"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.purchaseOrder.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const { vendorInvoiceId } = matchSchema.parse(await c.req.json());
  const result = await matchPurchaseOrder(id, vendorInvoiceId);
  await logActivity({ userId: user.id, action: "MATCH", target: `PurchaseOrder:${id}`, detail: { status: result.status } });
  return ok(c, result);
});
