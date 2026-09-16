import { Hono } from "hono";
import { Prisma, PurchaseOrderStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { purchaseOrderSchema, goodsReceiptSchema, matchSchema, paginationSchema, decisionSchema, acknowledgeSchema, changeOrderSchema } from "@backend/lib/validations";
import {
  createPurchaseOrder,
  receiveGoods,
  matchPurchaseOrder,
} from "@backend/services/procurement";
import {
  getPo, submitPo, decidePo, issuePo, acknowledgePo, markInProduction, markDispatched, cancelPo, changeOrder,
} from "@backend/services/purchase-order";
import { purchaseOrderPdf } from "@backend/services/pdf";
import { requireVersion } from "@backend/lib/concurrency";
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
    costCenter: body.costCenter || null,
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
  const detail = await getPo(id);
  return ok(c, { ...po, approvals: detail.approvals, savings: detail.savings });
});

/** The order as sent to the supplier. */
procurement.get("/:id/pdf", requireAuth, requirePermission("procurement:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.purchaseOrder.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const po = await getPo(id);
  const [company, rfq, quote, requisition] = await Promise.all([
    prisma.company.findUnique({ where: { code: po.dataAreaId }, select: { name: true, code: true } }),
    po.rfqId ? prisma.rfq.findUnique({ where: { id: po.rfqId }, select: { rfqNumber: true } }) : null,
    po.quotationId ? prisma.quotation.findUnique({ where: { id: po.quotationId }, select: { quoteRef: true } }) : null,
    po.requisitionId ? prisma.requisition.findUnique({ where: { id: po.requisitionId }, select: { prNumber: true } }) : null,
  ]);
  const pdf = await purchaseOrderPdf({
    poNumber: po.poNumber, orderDate: po.orderDate, expectedAt: po.expectedAt, currency: po.currency, subtotal: po.subtotal.toFixed(2), status: po.status, memo: po.memo,
    company: company ?? { name: po.dataAreaId, code: po.dataAreaId },
    vendor: po.vendor,
    lines: po.lines.map((l) => ({ description: l.description, quantity: l.quantity.toFixed(3), unitPrice: l.unitPrice.toFixed(2), lineTotal: l.lineTotal.toFixed(2) })),
    reference: { requisition: requisition?.prNumber ?? null, rfq: rfq?.rfqNumber ?? null, quote: quote?.quoteRef ?? null },
  });
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${po.poNumber}.pdf"`, "Cache-Control": "no-store" },
  });
});

const transition = (path: string, permission: Parameters<typeof requirePermission>[0], action: string, fn: (id: string, user: Parameters<typeof submitPo>[1], body: unknown) => Promise<unknown>) => {
  procurement.post(`/:id/${path}`, requireAuth, requirePermission(permission), async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const existing = await prisma.purchaseOrder.findUnique({ where: { id }, select: { dataAreaId: true } });
    assertSameArea(user, existing);
    const body = await c.req.json().catch(() => ({}));
    const po = await fn(id, user, body);
    await logActivity({ userId: user.id, action, target: `PurchaseOrder:${id}` });
    return ok(c, po);
  });
};

/** DRAFT -> PENDING_APPROVAL through the DOA matrix. Kept at /approve for the existing screen. */
transition("approve", "procurement:write", "SUBMIT", (id, user) => submitPo(id, user));
transition("submit", "procurement:write", "SUBMIT", (id, user) => submitPo(id, user));
transition("decide", "procurement:read", "DECIDE", (id, user, body) => { const b = decisionSchema.parse(body); return decidePo(id, user, b.approve, b.note); });
transition("issue", "procurement:write", "ISSUE", (id, user) => issuePo(id, user));
transition("acknowledge", "procurement:write", "ACKNOWLEDGE", (id, user, body) => acknowledgePo(id, user, acknowledgeSchema.parse(body)));
transition("production", "procurement:write", "IN_PRODUCTION", (id, user, body) => markInProduction(id, user, (body as { note?: string }).note));
transition("dispatch", "procurement:write", "DISPATCHED", (id, user, body) => markDispatched(id, user, (body as { note?: string }).note));
transition("cancel", "procurement:write", "CANCEL", (id, user, body) => cancelPo(id, user, (body as { reason?: string }).reason));

/** Replace the lines before receipt; re-opens the matrix when the policy says so. */
procurement.put("/:id/lines", requireAuth, requirePermission("procurement:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.purchaseOrder.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const raw = await c.req.json();
  const version = requireVersion(raw);
  const body = changeOrderSchema.parse(raw);
  const po = await changeOrder(id, version, user, body);
  await logActivity({ userId: user.id, action: "CHANGE_ORDER", target: `PurchaseOrder:${id}`, detail: { retriggered: po.retriggered } });
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
