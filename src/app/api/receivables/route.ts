import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError, pageMeta } from "@/lib/api";
import { customerInvoiceSchema, paginationSchema } from "@/lib/validations";
import { customerInvoiceTotal, nextArInvoiceNumber, postCustomerInvoice } from "@/lib/services/ap-ar";
import { logActivity } from "@/lib/activity";
import { Prisma, InvoiceStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("receivable:read");
    const sp = req.nextUrl.searchParams;
    const { page, pageSize, q } = paginationSchema.parse(Object.fromEntries(sp));
    const status = sp.get("status");

    const where: Prisma.CustomerInvoiceWhereInput = {
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
    return ok(items, pageMeta(page, pageSize, total));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = customerInvoiceSchema.parse(await req.json());
    const user = await requirePermission(body.post ? "receivable:post" : "receivable:write");

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
      return created({ invoice, entry });
    }
    return created({ invoice });
  } catch (e) {
    return handleError(e);
  }
}
