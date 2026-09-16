import { Hono } from "hono";
import { z } from "zod";
import { rateLimit } from "@backend/lib/rate-limit";
import { AuthError } from "@backend/lib/errors";
import { ok } from "@backend/lib/http";
import { logActivity } from "@backend/lib/activity";
import { supplierView, supplierAct, supplierPo } from "@backend/services/supplier-portal";
import { purchaseOrderPdf } from "@backend/services/pdf";
import { prisma } from "@backend/lib/prisma";

/**
 * /api/supplier: reached with the secret link, no login. Rate-limited per
 * address because the token is the only credential.
 */
export const supplier = new Hono();

const guard = (c: { req: { header: (n: string) => string | undefined } }) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "unknown";
  if (!rateLimit(`supplier:${ip}`, 60, 60_000).success) throw new AuthError("Too many requests; try again in a minute", 429);
};

supplier.get("/po/:token", async (c) => {
  guard(c);
  return ok(c, await supplierView(c.req.param("token")));
});

supplier.get("/po/:token/pdf", async (c) => {
  guard(c);
  const po = await supplierPo(c.req.param("token"));
  const company = await prisma.company.findUnique({ where: { code: po.dataAreaId }, select: { name: true, code: true } });
  const pdf = await purchaseOrderPdf({
    poNumber: po.poNumber, orderDate: po.orderDate, expectedAt: po.expectedAt, currency: po.currency, subtotal: po.subtotal.toFixed(2), status: po.status, memo: null,
    company: company ?? { name: po.dataAreaId, code: po.dataAreaId }, vendor: po.vendor,
    lines: po.lines.map((l) => ({ description: l.description, quantity: l.quantity.toFixed(3), unitPrice: l.unitPrice.toFixed(2), lineTotal: l.lineTotal.toFixed(2) })),
    reference: { requisition: null, rfq: null, quote: null },
  });
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${po.poNumber}.pdf"`, "Cache-Control": "no-store" } });
});

const actSchema = z.object({
  accept: z.boolean().optional(),
  committedDeliveryDate: z.coerce.date().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

for (const action of ["acknowledge", "production", "dispatch"] as const) {
  supplier.post(`/po/:token/${action}`, async (c) => {
    guard(c);
    const body = actSchema.parse(await c.req.json().catch(() => ({})));
    const view = await supplierAct(c.req.param("token"), action, body);
    const po = await supplierPo(c.req.param("token"));
    await logActivity({ userId: null, action: `SUPPLIER_${action.toUpperCase()}`, target: `PurchaseOrder:${po.id}`, detail: { via: "supplier link", note: body.note ?? null } });
    return ok(c, view);
  });
}
