import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, handleError, error } from "@/lib/api";
import { idSchema, customerReceiptSchema } from "@/lib/validations";
import { postCustomerInvoice, receiveCustomerInvoice } from "@/lib/services/ap-ar";
import { logActivity } from "@/lib/activity";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("receivable:read");
    const { id } = await params;
    idSchema.parse(id);
    const invoice = await prisma.customerInvoice.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true, code: true } },
        receipts: { orderBy: { receivedAt: "asc" } },
        postingEntry: { select: { voucherNumber: true } },
      },
    });
    if (!invoice) return error("Not found", 404);
    return ok(invoice);
  } catch (e) {
    return handleError(e);
  }
}

/** Actions: { action: "post" } | { action: "receive", ...receipt } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    idSchema.parse(id);
    const body = await req.json();

    if (body.action === "post") {
      const user = await requirePermission("receivable:post");
      const entry = await postCustomerInvoice(id, user.id);
      await logActivity({ userId: user.id, action: "POST", target: `CustomerInvoice:${id}`, detail: { voucherNumber: entry.voucherNumber } });
      return ok(entry);
    }
    if (body.action === "receive") {
      const user = await requirePermission("receivable:post");
      const p = customerReceiptSchema.parse(body);
      const entry = await receiveCustomerInvoice(id, p, user.id);
      await logActivity({ userId: user.id, action: "RECEIVE", target: `CustomerInvoice:${id}`, detail: { voucherNumber: entry.voucherNumber } });
      return ok(entry);
    }
    return error("action must be 'post' or 'receive'", 400);
  } catch (e) {
    return handleError(e);
  }
}
