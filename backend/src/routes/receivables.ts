import { Hono } from "hono";
import { Prisma, InvoiceStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { customerInvoiceSchema, customerReceiptSchema, idSchema, paginationSchema } from "@backend/lib/validations";
import {
  customerInvoiceTotal,
  nextArInvoiceNumber,
  postCustomerInvoice,
  receiveCustomerInvoice,
} from "@backend/services/ap-ar";
import { logActivity } from "@backend/lib/activity";
import { can } from "@backend/lib/rbac";
import { AuthError } from "@backend/lib/errors";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { areaScope } from "@backend/lib/scope";
import { ok, created, pageMeta } from "@backend/lib/http";

export const receivables = new Hono();

receivables.get("/", requireAuth, requirePermission("receivable:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const status = sp.status;

  const where: Prisma.CustomerInvoiceWhereInput = {
    ...areaScope(user),
    ...(q
      ? {
          OR: [
            { invoiceNumber: { contains: q, mode: "insensitive" } },
            { customer: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
    ...(status && status in InvoiceStatus ? { status: status as InvoiceStatus } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.customerInvoice.findMany({
      where,
      include: { customer: { select: { name: true } } },
      orderBy: { invoiceDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customerInvoice.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

receivables.post("/", requireAuth, async (c) => {
  const body = customerInvoiceSchema.parse(await c.req.json());
  const user = c.get("user");
  if (!can(user.role, body.post ? "receivable:post" : "receivable:write")) {
    throw new AuthError("You do not have permission", 403);
  }

  const customer = await prisma.customer.findUnique({ where: { id: body.customerId } });
  const dataAreaId = customer?.dataAreaId ?? "HQ01";
  const total = customerInvoiceTotal(body.subtotal, body.vatAmount);
  const invoiceNumber = await nextArInvoiceNumber(dataAreaId);

  const invoice = await prisma.customerInvoice.create({
    data: {
      dataAreaId,
      invoiceNumber,
      customerId: body.customerId,
      invoiceDate: body.invoiceDate,
      dueDate: body.dueDate,
      currency: body.currency,
      subtotal: body.subtotal,
      vatAmount: body.vatAmount,
      total: total.toString(),
      revenueCode: body.revenueCode,
      memo: body.memo,
      createdById: user.id,
    },
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `CustomerInvoice:${invoice.id}` });

  if (body.post) {
    const entry = await postCustomerInvoice(invoice.id, user.id);
    await logActivity({ userId: user.id, action: "POST", target: `CustomerInvoice:${invoice.id}`, detail: { voucherNumber: entry.voucherNumber } });
    return created(c, { invoice, entry });
  }
  return created(c, { invoice });
});

receivables.get("/:id", requireAuth, requirePermission("receivable:read"), async (c) => {
  const id = c.req.param("id");
  idSchema.parse(id);
  const invoice = await prisma.customerInvoice.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true, code: true } },
      receipts: { orderBy: { receivedAt: "asc" } },
      postingEntry: { select: { voucherNumber: true } },
    },
  });
  if (!invoice) throw new AuthError("Not found", 404);
  return ok(c, invoice);
});

/** Actions: { action: "post" } | { action: "receive", ...receipt } */
receivables.post("/:id", requireAuth, requirePermission("receivable:post"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  idSchema.parse(id);
  const body = await c.req.json();

  if (body.action === "post") {
    const entry = await postCustomerInvoice(id, user.id);
    await logActivity({ userId: user.id, action: "POST", target: `CustomerInvoice:${id}`, detail: { voucherNumber: entry.voucherNumber } });
    return ok(c, entry);
  }
  if (body.action === "receive") {
    const p = customerReceiptSchema.parse(body);
    const entry = await receiveCustomerInvoice(id, p, user.id);
    await logActivity({ userId: user.id, action: "RECEIVE", target: `CustomerInvoice:${id}`, detail: { voucherNumber: entry.voucherNumber } });
    return ok(c, entry);
  }
  throw new AuthError("action must be 'post' or 'receive'", 400);
});
