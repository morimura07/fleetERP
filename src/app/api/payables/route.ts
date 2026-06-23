import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError, pageMeta } from "@/lib/api";
import { vendorInvoiceSchema, paginationSchema } from "@/lib/validations";
import { vendorInvoiceTotal, postVendorInvoice } from "@/lib/services/ap-ar";
import { logActivity } from "@/lib/activity";
import { Prisma, InvoiceStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("payable:read");
    const sp = req.nextUrl.searchParams;
    const { page, pageSize, q } = paginationSchema.parse(Object.fromEntries(sp));
    const status = sp.get("status");

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
    return ok(items, pageMeta(page, pageSize, total));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = vendorInvoiceSchema.parse(await req.json());
    const user = await requirePermission(body.post ? "payable:post" : "payable:write");

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
      const entry = await postVendorInvoice(invoice.id, user.id);
      await logActivity({ userId: user.id, action: "POST", target: `VendorInvoice:${invoice.id}`, detail: { voucherNumber: entry.voucherNumber } });
      return created({ invoice, entry });
    }
    return created({ invoice });
  } catch (e) {
    return handleError(e);
  }
}
