import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, handleError, error } from "@/lib/api";
import { idSchema, orderSchema } from "@/lib/validations";
import { invoiceOrder } from "@/lib/services/freight";
import { logActivity } from "@/lib/activity";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("order:read");
    const { id } = await params;
    idSchema.parse(id);
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        client: { select: { companyName: true, contactPerson: true } },
        trip: { include: { driver: { select: { name: true } }, vehicle: { select: { vehicleNumber: true } } } },
        invoiceEntry: { select: { id: true, voucherNumber: true, status: true } },
      },
    });
    if (!order) return error("Not found", 404);
    return ok(order);
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("order:write");
    const { id } = await params;
    idSchema.parse(id);
    // Reuse the create schema but allow partial edits.
    const body = orderSchema.partial().parse(await req.json());
    const order = await prisma.order.update({ where: { id }, data: body });
    await logActivity({ userId: user.id, action: "UPDATE", target: `Order:${id}` });
    return ok(order);
  } catch (e) {
    return handleError(e);
  }
}

/** Action endpoint: { action: "invoice" } posts the AR invoice to the ledger. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("order:invoice");
    const { id } = await params;
    idSchema.parse(id);
    const { action } = (await req.json()) as { action?: string };

    if (action === "invoice") {
      const entry = await invoiceOrder(id, user.id);
      await logActivity({
        userId: user.id,
        action: "INVOICE",
        target: `Order:${id}`,
        detail: { voucherNumber: entry.voucherNumber },
      });
      return ok(entry);
    }
    return error("action must be 'invoice'", 400);
  } catch (e) {
    return handleError(e);
  }
}
