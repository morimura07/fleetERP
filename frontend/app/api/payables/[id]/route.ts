import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, handleError, error } from "@/lib/api";
import { idSchema, vendorPaymentSchema } from "@/lib/validations";
import { postVendorInvoice, payVendorInvoice } from "@/lib/services/ap-ar";
import { logActivity } from "@/lib/activity";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("payable:read");
    const { id } = await params;
    idSchema.parse(id);
    const invoice = await prisma.vendorInvoice.findUnique({
      where: { id },
      include: {
        vendor: { select: { legalName: true, code: true } },
        payments: { orderBy: { paidAt: "asc" } },
        postingEntry: { select: { voucherNumber: true } },
      },
    });
    if (!invoice) return error("Not found", 404);
    return ok(invoice);
  } catch (e) {
    return handleError(e);
  }
}

/** Actions: { action: "post" } | { action: "pay", ...payment } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    idSchema.parse(id);
    const body = await req.json();

    if (body.action === "post") {
      const user = await requirePermission("payable:post");
      const entry = await postVendorInvoice(id, user.id, { budgetOverride: body.budgetOverride === true });
      await logActivity({ userId: user.id, action: "POST", target: `VendorInvoice:${id}`, detail: { voucherNumber: entry.voucherNumber } });
      return ok(entry);
    }
    if (body.action === "pay") {
      const user = await requirePermission("payable:post");
      const p = vendorPaymentSchema.parse(body);
      const entry = await payVendorInvoice(id, p, user.id);
      await logActivity({ userId: user.id, action: "PAY", target: `VendorInvoice:${id}`, detail: { voucherNumber: entry.voucherNumber } });
      return ok(entry);
    }
    return error("action must be 'post' or 'pay'", 400);
  } catch (e) {
    return handleError(e);
  }
}
