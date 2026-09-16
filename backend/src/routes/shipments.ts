import { Hono } from "hono";
import { Prisma, ShipmentStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import {
  shipmentSchema, shipmentStatusSchema, clearanceSchema, shipmentEventSchema, dutySchema, shipmentDocumentSchema, verifyDocumentSchema, paginationSchema,
} from "@backend/lib/validations";
import {
  getShipment, createShipment, updateShipment, setShipmentStatus, setClearance, addEvent, recordDuty, addDocument, verifyDocument, removeDocument, estimateDuty,
} from "@backend/services/logistics";
import { logActivity } from "@backend/lib/activity";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { requireVersion } from "@backend/lib/concurrency";
import { ok, created, pageMeta } from "@backend/lib/http";

/** /api/shipments: consignments against purchase orders, their papers, log and clearance. */
export const shipments = new Hono();

const area = (id: string) => prisma.shipment.findUnique({ where: { id }, select: { dataAreaId: true } });

shipments.get("/", requireAuth, requirePermission("procurement:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const where: Prisma.ShipmentWhereInput = {
    ...areaScope(user),
    ...(sp.status && sp.status in ShipmentStatus ? { status: sp.status as ShipmentStatus } : {}),
    ...(sp.purchaseOrderId ? { purchaseOrderId: sp.purchaseOrderId } : {}),
    ...(q ? { OR: [{ shipmentNumber: { contains: q, mode: "insensitive" } }, { containerNo: { contains: q, mode: "insensitive" } }, { transportDocNo: { contains: q, mode: "insensitive" } }, { purchaseOrder: { poNumber: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.shipment.findMany({
      where,
      include: { purchaseOrder: { select: { poNumber: true, vendor: { select: { legalName: true } } } }, _count: { select: { documents: true } } },
      orderBy: [{ eta: "asc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize,
    }),
    prisma.shipment.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

shipments.post("/", requireAuth, requirePermission("procurement:write"), async (c) => {
  const user = c.get("user");
  const body = shipmentSchema.parse(await c.req.json());
  const s = await createShipment(areaForWrite(user, body.dataAreaId), user, body);
  await logActivity({ userId: user.id, action: "CREATE", target: `Shipment:${s.id}`, detail: { shipmentNumber: s.shipmentNumber } });
  return created(c, s);
});

/** The duty arithmetic without saving, for the calculator. */
shipments.post("/estimate-duty", requireAuth, requirePermission("procurement:read"), async (c) => {
  const body = dutySchema.parse(await c.req.json());
  const e = estimateDuty({ customsValue: body.customsValue, dutyRatePct: body.dutyRatePct, vatRatePct: body.vatRatePct, otherCharges: body.otherChargesEst });
  return ok(c, { duty: e.duty.toFixed(2), vat: e.vat.toFixed(2), other: e.other.toFixed(2), total: e.total.toFixed(2) });
});

shipments.get("/:id", requireAuth, requirePermission("procurement:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  assertSameArea(user, await area(id));
  return ok(c, await getShipment(id));
});

shipments.patch("/:id", requireAuth, requirePermission("procurement:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  assertSameArea(user, await area(id));
  const raw = await c.req.json();
  const version = requireVersion(raw);
  const body = shipmentSchema.partial().parse(raw);
  const s = await updateShipment(id, version, user, body);
  await logActivity({ userId: user.id, action: "UPDATE", target: `Shipment:${id}` });
  return ok(c, s);
});

const transition = (path: string, action: string, fn: (id: string, user: Parameters<typeof createShipment>[1], body: unknown) => Promise<unknown>) => {
  shipments.post(`/:id/${path}`, requireAuth, requirePermission("procurement:write"), async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    assertSameArea(user, await area(id));
    const body = await c.req.json().catch(() => ({}));
    const s = await fn(id, user, body);
    await logActivity({ userId: user.id, action, target: `Shipment:${id}` });
    return ok(c, s);
  });
};

transition("status", "STATUS", (id, user, body) => { const b = shipmentStatusSchema.parse(body); return setShipmentStatus(id, user, b.status, b.note, b.location); });
transition("clearance", "CLEARANCE", (id, user, body) => { const b = clearanceSchema.parse(body); return setClearance(id, user, b.clearanceStatus, b.note, b.clearanceRef); });
transition("events", "EVENT", (id, user, body) => addEvent(id, user, shipmentEventSchema.parse(body)));
transition("duty", "DUTY", (id, user, body) => recordDuty(id, user, dutySchema.parse(body)));
transition("documents", "DOCUMENT", (id, user, body) => addDocument(id, user, shipmentDocumentSchema.parse(body)));

shipments.post("/:id/documents/:docId/verify", requireAuth, requirePermission("procurement:approve"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  assertSameArea(user, await area(id));
  const body = verifyDocumentSchema.parse(await c.req.json());
  const s = await verifyDocument(id, c.req.param("docId"), user, body.verified, body.note);
  await logActivity({ userId: user.id, action: body.verified ? "VERIFY" : "UNVERIFY", target: `ShipmentDocument:${c.req.param("docId")}` });
  return ok(c, s);
});

shipments.delete("/:id/documents/:docId", requireAuth, requirePermission("procurement:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  assertSameArea(user, await area(id));
  return ok(c, await removeDocument(id, c.req.param("docId")));
});
