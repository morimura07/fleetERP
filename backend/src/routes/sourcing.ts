import { Hono } from "hono";
import { Prisma, RfqStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import {
  rfqSchema, quotationSchema, negotiationSchema, quoteScoreSchema, singleSourceSchema, awardSchema, vendorAvlSchema, paginationSchema,
} from "@backend/lib/validations";
import {
  getRfq, createRfq, inviteVendors, removeVendor, sendRfq, closeRfq, cancelRfq, enterQuotation, declineQuotation, negotiate, scoreQuotation, singleSource, comparison,
} from "@backend/services/sourcing";
import { awardRfq } from "@backend/services/purchase-order";
import { logActivity } from "@backend/lib/activity";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";
import { AuthError } from "@backend/lib/errors";

/** /api/rfqs: requests for quotation, quotes, comparison and award; vendor AVL/KYC. */
export const sourcing = new Hono();

const area = (id: string) => prisma.rfq.findUnique({ where: { id }, select: { dataAreaId: true } });

sourcing.get("/", requireAuth, requirePermission("procurement:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const where: Prisma.RfqWhereInput = {
    ...areaScope(user),
    ...(sp.status && sp.status in RfqStatus ? { status: sp.status as RfqStatus } : {}),
    ...(sp.requisitionId ? { requisitionId: sp.requisitionId } : {}),
    ...(q ? { OR: [{ rfqNumber: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.rfq.findMany({ where, include: { _count: { select: { vendors: true, quotations: true, lines: true } }, requisition: { select: { prNumber: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.rfq.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

sourcing.post("/", requireAuth, requirePermission("procurement:write"), async (c) => {
  const user = c.get("user");
  const body = rfqSchema.parse(await c.req.json());
  const rfq = await createRfq(areaForWrite(user, body.dataAreaId), user, body);
  await logActivity({ userId: user.id, action: "CREATE", target: `Rfq:${rfq.id}`, detail: { rfqNumber: rfq.rfqNumber } });
  return created(c, rfq);
});

sourcing.get("/:id", requireAuth, requirePermission("procurement:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  assertSameArea(user, await area(id));
  return ok(c, await getRfq(id));
});

/** The side-by-side matrix with the award gate's verdict. */
sourcing.get("/:id/comparison", requireAuth, requirePermission("procurement:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  assertSameArea(user, await area(id));
  return ok(c, await comparison(id));
});

const transition = (path: string, permission: Parameters<typeof requirePermission>[0], action: string, fn: (id: string, user: Parameters<typeof createRfq>[1], body: unknown) => Promise<unknown>) => {
  sourcing.post(`/:id/${path}`, requireAuth, requirePermission(permission), async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    assertSameArea(user, await area(id));
    const body = await c.req.json().catch(() => ({}));
    const r = await fn(id, user, body);
    await logActivity({ userId: user.id, action, target: `Rfq:${id}` });
    return ok(c, r);
  });
};

transition("vendors", "procurement:write", "INVITE", (id, user, body) => inviteVendors(id, user, (body as { vendorIds?: string[] }).vendorIds ?? []));
transition("send", "procurement:write", "SEND", (id, user) => sendRfq(id, user));
transition("close", "procurement:write", "CLOSE", (id, user) => closeRfq(id, user));
transition("cancel", "procurement:write", "CANCEL", (id, user) => cancelRfq(id, user));
transition("quotations", "procurement:write", "QUOTE", (id, user, body) => enterQuotation(id, user, quotationSchema.parse(body)));
transition("decline", "procurement:write", "DECLINE", (id, _user, body) => { const b = body as { vendorId?: string; note?: string }; if (!b.vendorId) throw new AuthError("vendorId is required", 422); return declineQuotation(id, b.vendorId, b.note); });
transition("single-source", "procurement:approve", "SINGLE_SOURCE", (id, user, body) => singleSource(id, user, singleSourceSchema.parse(body).justification));

sourcing.delete("/:id/vendors/:vendorId", requireAuth, requirePermission("procurement:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  assertSameArea(user, await area(id));
  return ok(c, await removeVendor(id, c.req.param("vendorId")));
});

/** Award to one quotation: raises the PO and opens the matrix on it. */
sourcing.post("/:id/award", requireAuth, requirePermission("procurement:approve"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  assertSameArea(user, await area(id));
  const body = awardSchema.parse(await c.req.json());
  const po = await awardRfq(id, body.quotationId, user, body.note);
  await logActivity({ userId: user.id, action: "AWARD", target: `Rfq:${id}`, detail: { poNumber: po.poNumber, quotationId: body.quotationId } });
  return created(c, po);
});

// ── Quotations ───────────────────────────────────────────────────────────────

const quoteArea = (id: string) => prisma.quotation.findUnique({ where: { id }, select: { dataAreaId: true } });

sourcing.post("/quotations/:id/negotiate", requireAuth, requirePermission("procurement:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  assertSameArea(user, await quoteArea(id));
  const r = await negotiate(id, user, negotiationSchema.parse(await c.req.json()));
  await logActivity({ userId: user.id, action: "NEGOTIATE", target: `Quotation:${id}` });
  return ok(c, r);
});

sourcing.post("/quotations/:id/score", requireAuth, requirePermission("procurement:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  assertSameArea(user, await quoteArea(id));
  const r = await scoreQuotation(id, user, quoteScoreSchema.parse(await c.req.json()));
  return ok(c, r);
});

// ── Approved vendor list ─────────────────────────────────────────────────────

/** AVL and KYC on a vendor. Verifying KYC records who and when. */
sourcing.patch("/vendors/:id/avl", requireAuth, requirePermission("vendor:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const vendor = await prisma.vendor.findUnique({ where: { id }, select: { dataAreaId: true, kycStatus: true } });
  assertSameArea(user, vendor);
  const body = vendorAvlSchema.parse(await c.req.json());
  const data: Prisma.VendorUpdateInput = {};
  if (body.avlStatus) data.avlStatus = body.avlStatus;
  if (body.avlRegion !== undefined) data.avlRegion = body.avlRegion;
  if (body.categories) data.categories = body.categories;
  if (body.kycNote !== undefined) data.kycNote = body.kycNote || null;
  if (body.kycStatus) {
    data.kycStatus = body.kycStatus;
    if (body.kycStatus === "VERIFIED") { data.kycVerifiedAt = new Date(); data.kycVerifiedById = user.id; }
    else { data.kycVerifiedAt = null; data.kycVerifiedById = null; }
  }
  if (body.avlStatus === "APPROVED" && (body.kycStatus ?? vendor.kycStatus) !== "VERIFIED") {
    throw new AuthError("A vendor joins the approved list once its KYC is verified", 422);
  }
  const updated = await prisma.vendor.update({ where: { id }, data: { ...data, updatedById: user.id, version: { increment: 1 } } });
  await logActivity({ userId: user.id, action: "AVL", target: `Vendor:${id}`, detail: { avlStatus: updated.avlStatus, kycStatus: updated.kycStatus } });
  return ok(c, updated);
});

/** Vendors that may be invited to quote, optionally by category. */
sourcing.get("/vendors/approved", requireAuth, requirePermission("procurement:read"), async (c) => {
  const user = c.get("user");
  const category = c.req.query("category");
  const vendors = await prisma.vendor.findMany({
    where: { ...areaScope(user), isActive: true, avlStatus: "APPROVED", ...(category ? { categories: { has: category } } : {}) },
    select: { id: true, code: true, legalName: true, avlRegion: true, currency: true, email: true, categories: true, paymentTerm: true },
    orderBy: { legalName: "asc" },
  });
  return ok(c, vendors);
});
