import { Hono } from "hono";
import { Prisma, InvoiceStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { vendorInvoiceSchema, vendorPaymentSchema, idSchema, paginationSchema } from "@backend/lib/validations";
import { vendorInvoiceTotal, postVendorInvoice, payVendorInvoice } from "@backend/services/ap-ar";
import { logActivity } from "@backend/lib/activity";
import { can } from "@backend/lib/rbac";
import { AuthError } from "@backend/lib/errors";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";

export const payables = new Hono();

payables.get("/", requireAuth, requirePermission("payable:read"), async (c) => {
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const status = sp.status;

  const where: Prisma.VendorInvoiceWhereInput = {
    ...(q
      ? {
          OR: [
            { invoiceNumber: { contains: q, mode: "insensitive" } },
            { vendor: { legalName: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
    ...(status && status in InvoiceStatus ? { status: status as InvoiceStatus } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.vendorInvoice.findMany({
      where,
      include: { vendor: { select: { legalName: true } } },
      orderBy: { invoiceDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.vendorInvoice.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

payables.post("/", requireAuth, async (c) => {
  const raw = await c.req.json();
  const body = vendorInvoiceSchema.parse(raw);
  const user = c.get("user");
  if (!can(user.role, body.post ? "payable:post" : "payable:write")) {
    throw new AuthError("You do not have permission", 403);
  }

  const vendor = await prisma.vendor.findUnique({ where: { id: body.vendorId } });
  const dataAreaId = vendor?.dataAreaId ?? "HQ01";
  const total = vendorInvoiceTotal(body.subtotal, body.vatAmount, body.whtAmount);

  const invoice = await prisma.vendorInvoice.create({
    data: {
      dataAreaId,
      vendorId: body.vendorId,
      invoiceNumber: body.invoiceNumber,
      invoiceDate: body.invoiceDate,
      dueDate: body.dueDate,
      currency: body.currency,
      subtotal: body.subtotal,
      vatAmount: body.vatAmount,
      whtAmount: body.whtAmount,
      total: total.toString(),
      expenseCode: body.expenseCode,
      memo: body.memo,
      createdById: user.id,
    },
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `VendorInvoice:${invoice.id}` });

  if (body.post) {
    const entry = await postVendorInvoice(invoice.id, user.id, { budgetOverride: raw.budgetOverride === true });
    await logActivity({ userId: user.id, action: "POST", target: `VendorInvoice:${invoice.id}`, detail: { voucherNumber: entry.voucherNumber } });
    return created(c, { invoice, entry });
  }
  return created(c, { invoice });
});

payables.get("/:id", requireAuth, requirePermission("payable:read"), async (c) => {
  const id = c.req.param("id");
  idSchema.parse(id);
  const invoice = await prisma.vendorInvoice.findUnique({
    where: { id },
    include: {
      vendor: { select: { legalName: true, code: true } },
      payments: { orderBy: { paidAt: "asc" } },
      postingEntry: { select: { voucherNumber: true } },
    },
  });
  if (!invoice) throw new AuthError("Not found", 404);
  return ok(c, invoice);
});

/** Actions: { action: "post" } | { action: "pay", ...payment } */
payables.post("/:id", requireAuth, requirePermission("payable:post"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  idSchema.parse(id);
  const body = await c.req.json();

  if (body.action === "post") {
    const entry = await postVendorInvoice(id, user.id, { budgetOverride: body.budgetOverride === true });
    await logActivity({ userId: user.id, action: "POST", target: `VendorInvoice:${id}`, detail: { voucherNumber: entry.voucherNumber } });
    return ok(c, entry);
  }
  if (body.action === "pay") {
    const p = vendorPaymentSchema.parse(body);
    const entry = await payVendorInvoice(id, p, user.id);
    await logActivity({ userId: user.id, action: "PAY", target: `VendorInvoice:${id}`, detail: { voucherNumber: entry.voucherNumber } });
    return ok(c, entry);
  }
  throw new AuthError("action must be 'post' or 'pay'", 400);
});
