import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, handleError, error } from "@/lib/api";
import { idSchema, tripBaseSchema, tripReconSchema } from "@/lib/validations";
import { computeTripPnL } from "@/lib/services/freight";
import { logActivity } from "@/lib/activity";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("trip:read");
    const { id } = await params;
    idSchema.parse(id);
    const trip = await prisma.trip.findUnique({
      where: { id },
      include: {
        order: { include: { client: { select: { companyName: true } } } },
        driver: { select: { name: true } },
        vehicle: { select: { vehicleNumber: true, plateNumber: true } },
        expenses: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!trip) return error("Not found", 404);

    // Attach computed P&L (Decimals serialized as strings).
    const pnl = await computeTripPnL(id);
    return ok({
      ...trip,
      pnl: {
        revenue: pnl.revenue.toString(),
        expenses: pnl.expenses.toString(),
        profit: pnl.profit.toString(),
        marginPct: pnl.marginPct.toFixed(2),
        currency: pnl.currency,
        expenseByType: pnl.expenseByType,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("trip:write");
    const { id } = await params;
    idSchema.parse(id);
    const body = tripBaseSchema.partial().parse(await req.json());
    const trip = await prisma.trip.update({ where: { id }, data: body });
    await logActivity({ userId: user.id, action: "UPDATE", target: `Trip:${id}` });
    return ok(trip);
  } catch (e) {
    return handleError(e);
  }
}

/** Freight-bill reconciliation (M12): set recon status, carrier ref, fuel litres. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("trip:write");
    const { id } = await params;
    idSchema.parse(id);
    const body = tripReconSchema.parse(await req.json());
    const trip = await prisma.trip.update({
      where: { id },
      data: {
        reconStatus: body.reconStatus,
        carrierInvoiceRef: body.carrierInvoiceRef,
        ...(body.fuelLitres !== undefined ? { fuelLitres: body.fuelLitres } : {}),
      },
    });
    await logActivity({ userId: user.id, action: "RECONCILE", target: `Trip:${id}`, detail: { reconStatus: body.reconStatus } });
    return ok(trip);
  } catch (e) {
    return handleError(e);
  }
}
