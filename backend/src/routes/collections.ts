import { Hono } from "hono";
import { Prisma, DisputeStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import {
  computeAgingReport, creditExposure, setDunningLevel, raiseDispute,
  recordPromiseToPay, logContact, writeOffInvoice, customerActivity,
} from "@backend/services/collections";
import { dunningSchema, disputeSchema, promiseToPaySchema, contactSchema, writeOffSchema, paginationSchema } from "@backend/lib/validations";
import { logActivity } from "@backend/lib/activity";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, pageMeta } from "@backend/lib/http";

export const collections = new Hono();

/** AR aging report. */
collections.get("/", requireAuth, requirePermission("collection:read"), async (c) => {
  const user = c.get("user");
  const asOfParam = c.req.query("asOf");
  const asOf = asOfParam ? new Date(asOfParam) : new Date();
  const report = await computeAgingReport(asOf, areaForWrite(user));
  return ok(c, report);
});

/** Outstanding invoices (with collections state) for the worklist. */
collections.get("/invoices", requireAuth, requirePermission("collection:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const dispute = sp.dispute;

  const where: Prisma.CustomerInvoiceWhereInput = {
    ...areaScope(user),
    status: { in: ["POSTED", "PARTIALLY_PAID"] },
    ...(dispute && dispute in DisputeStatus ? { disputeStatus: dispute as DisputeStatus } : {}),
    ...(q ? { OR: [{ invoiceNumber: { contains: q, mode: "insensitive" } }, { customer: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.customerInvoice.findMany({
      where,
      include: { customer: { select: { code: true, name: true } } },
      orderBy: { dueDate: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customerInvoice.count({ where }),
  ]);
  const rows = items.map((i) => ({
    ...i,
    outstanding: new Prisma.Decimal(i.total).minus(i.paidAmount).toFixed(2),
  }));
  return ok(c, rows, pageMeta(page, pageSize, total));
});

/** Credit exposure & available credit for a customer. */
collections.get("/customers/:id/exposure", requireAuth, requirePermission("collection:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.customer.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  return ok(c, await creditExposure(existing.dataAreaId, id));
});

/** Collection activity history for a customer. */
collections.get("/customers/:id/activity", requireAuth, requirePermission("collection:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.customer.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  return ok(c, await customerActivity(existing.dataAreaId, id));
});

type AuthedUser = Parameters<typeof assertSameArea>[0];
async function invoiceArea(user: AuthedUser, invoiceId: string) {
  const inv = await prisma.customerInvoice.findUnique({ where: { id: invoiceId }, select: { dataAreaId: true } });
  assertSameArea(user, inv);
  return inv.dataAreaId;
}

/** Advance an invoice's dunning level. */
collections.post("/dunning", requireAuth, requirePermission("collection:write"), async (c) => {
  const user = c.get("user");
  const body = dunningSchema.parse(await c.req.json());
  const area = await invoiceArea(user, body.invoiceId);
  const res = await setDunningLevel(area, body.invoiceId, body.level, body.note ?? null, user.id);
  await logActivity({ userId: user.id, action: "DUNNING", target: `Invoice:${body.invoiceId}`, detail: { level: body.level } });
  return ok(c, res);
});

/** Raise / update a dispute on an invoice. */
collections.post("/dispute", requireAuth, requirePermission("collection:write"), async (c) => {
  const user = c.get("user");
  const body = disputeSchema.parse(await c.req.json());
  const area = await invoiceArea(user, body.invoiceId);
  const res = await raiseDispute(area, body.invoiceId, body.status, body.disputedAmount, body.note ?? null, user.id);
  await logActivity({ userId: user.id, action: "DISPUTE", target: `Invoice:${body.invoiceId}`, detail: { status: body.status } });
  return ok(c, res);
});

/** Record a promise-to-pay. */
collections.post("/promise", requireAuth, requirePermission("collection:write"), async (c) => {
  const user = c.get("user");
  const body = promiseToPaySchema.parse(await c.req.json());
  const area = await invoiceArea(user, body.invoiceId);
  const res = await recordPromiseToPay(area, body.invoiceId, body.promiseDate, body.promiseAmount, body.note ?? null, user.id);
  await logActivity({ userId: user.id, action: "PROMISE_TO_PAY", target: `Invoice:${body.invoiceId}` });
  return ok(c, res);
});

/** Log a contact (call / email / letter / note). */
collections.post("/contact", requireAuth, requirePermission("collection:write"), async (c) => {
  const user = c.get("user");
  const body = contactSchema.parse(await c.req.json());
  const existing = await prisma.customer.findUnique({ where: { id: body.customerId }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const res = await logContact(existing.dataAreaId, body.customerId, body.type, body.note ?? null, body.invoiceId ?? null, user.id);
  await logActivity({ userId: user.id, action: "CONTACT", target: `Customer:${body.customerId}`, detail: { type: body.type } });
  return ok(c, res);
});

/** Write off an invoice's outstanding balance as bad debt (posts to the ledger). */
collections.post("/write-off", requireAuth, requirePermission("collection:approve"), async (c) => {
  const user = c.get("user");
  const body = writeOffSchema.parse(await c.req.json());
  const area = await invoiceArea(user, body.invoiceId);
  const res = await writeOffInvoice(area, body.invoiceId, body.note ?? null, user.id);
  await logActivity({ userId: user.id, action: "WRITE_OFF", target: `Invoice:${body.invoiceId}`, detail: { writtenOff: res.writtenOff, voucherNumber: res.voucherNumber } });
  return ok(c, res);
});
