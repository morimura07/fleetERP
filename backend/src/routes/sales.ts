import { Hono } from "hono";
import { Prisma, LeadStage, QuoteStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import {
  leadSchema, leadStageSchema, quoteSchema, quoteStatusSchema, paginationSchema,
} from "@backend/lib/validations";
import {
  createLead, setLeadStage, createQuote, setQuoteStatus, convertQuoteToOrder,
} from "@backend/services/sales";
import { logActivity } from "@backend/lib/activity";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";

export const sales = new Hono();

// ── Leads ────────────────────────────────────────────────────────────────────

sales.get("/leads", requireAuth, requirePermission("sales:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const stage = sp.stage;
  const where: Prisma.LeadWhereInput = {
    ...areaScope(user),
    ...(q ? { OR: [{ companyName: { contains: q, mode: "insensitive" } }, { contactPerson: { contains: q, mode: "insensitive" } }] } : {}),
    ...(stage && stage in LeadStage ? { stage: stage as LeadStage } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: { owner: { select: { name: true } }, _count: { select: { quotes: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.lead.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

sales.post("/leads", requireAuth, requirePermission("sales:write"), async (c) => {
  const user = c.get("user");
  const body = leadSchema.parse(await c.req.json());
  const lead = await createLead({
    dataAreaId: areaForWrite(user, undefined),
    companyName: body.companyName,
    contactPerson: body.contactPerson || null,
    email: body.email || null,
    phone: body.phone || null,
    source: body.source || null,
    stage: body.stage,
    estimatedValue: body.estimatedValue,
    currency: body.currency,
    ownerId: body.ownerId || null,
    notes: body.notes || null,
    createdById: user.id,
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `Lead:${lead.id}` });
  return created(c, lead);
});

sales.post("/leads/:id/stage", requireAuth, requirePermission("sales:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.lead.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const body = leadStageSchema.parse(await c.req.json());
  const lead = await setLeadStage(existing.dataAreaId, id, body.stage, user.id);
  await logActivity({ userId: user.id, action: "SET_STAGE", target: `Lead:${id}`, detail: { stage: body.stage } });
  return ok(c, lead);
});

// ── Quotes ───────────────────────────────────────────────────────────────────

sales.get("/quotes", requireAuth, requirePermission("sales:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const status = sp.status;
  const where: Prisma.SalesQuoteWhereInput = {
    ...areaScope(user),
    ...(q ? { OR: [{ quoteNumber: { contains: q, mode: "insensitive" } }, { cargoDescription: { contains: q, mode: "insensitive" } }] } : {}),
    ...(status && status in QuoteStatus ? { status: status as QuoteStatus } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.salesQuote.findMany({
      where,
      include: {
        client: { select: { companyName: true } },
        convertedOrder: { select: { orderCode: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.salesQuote.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

sales.get("/quotes/:id", requireAuth, requirePermission("sales:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const quote = await prisma.salesQuote.findUnique({
    where: { id },
    include: {
      client: { select: { companyName: true } },
      lines: { orderBy: { createdAt: "asc" } },
      convertedOrder: { select: { orderCode: true } },
    },
  });
  assertSameArea(user, quote);
  return ok(c, quote);
});

sales.post("/quotes", requireAuth, requirePermission("sales:write"), async (c) => {
  const user = c.get("user");
  const body = quoteSchema.parse(await c.req.json());
  const quote = await createQuote({
    dataAreaId: areaForWrite(user, undefined),
    clientId: body.clientId || null,
    leadId: body.leadId || null,
    salesperson: body.salesperson || null,
    originZone: body.originZone || null,
    destinationZone: body.destinationZone || null,
    cargoDescription: body.cargoDescription || null,
    currency: body.currency,
    validUntil: body.validUntil,
    notes: body.notes || null,
    lines: body.lines,
    createdById: user.id,
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `SalesQuote:${quote.id}` });
  return created(c, quote);
});

sales.post("/quotes/:id/status", requireAuth, requirePermission("sales:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.salesQuote.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const body = quoteStatusSchema.parse(await c.req.json());
  const quote = await setQuoteStatus(existing.dataAreaId, id, body.status, user.id);
  await logActivity({ userId: user.id, action: "SET_STATUS", target: `SalesQuote:${id}`, detail: { status: body.status } });
  return ok(c, quote);
});

sales.post("/quotes/:id/convert", requireAuth, requirePermission("sales:convert"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.salesQuote.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const order = await convertQuoteToOrder(existing.dataAreaId, id, user.id);
  await logActivity({ userId: user.id, action: "CONVERT", target: `SalesQuote:${id}`, detail: { orderId: order.id, orderCode: order.orderCode } });
  return created(c, order);
});
