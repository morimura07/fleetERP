import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError, error } from "@/lib/api";
import { idSchema, tripExpenseSchema } from "@/lib/validations";
import { postTripExpense } from "@/lib/services/freight";
import { logActivity } from "@/lib/activity";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("trip:read");
    const { id } = await params;
    idSchema.parse(id);
    const expenses = await prisma.tripExpense.findMany({
      where: { tripId: id },
      orderBy: { createdAt: "asc" },
    });
    return ok(expenses);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Posting to the ledger requires order:invoice (finance authority);
    // recording an unposted expense only needs trip:write.
    const { id } = await params;
    idSchema.parse(id);
    const body = tripExpenseSchema.parse(await req.json());
    const user = await requirePermission(body.post ? "order:invoice" : "trip:write");

    const trip = await prisma.trip.findUnique({ where: { id }, select: { id: true } });
    if (!trip) return error("Trip not found", 404);

    const expense = await prisma.tripExpense.create({
      data: {
        tripId: id,
        type: body.type,
        amount: body.amount,
        currency: body.currency,
        note: body.note,
      },
    });
    await logActivity({ userId: user.id, action: "CREATE", target: `TripExpense:${expense.id}` });

    if (body.post) {
      const entry = await postTripExpense(expense.id, user.id);
      await logActivity({
        userId: user.id,
        action: "POST",
        target: `TripExpense:${expense.id}`,
        detail: { voucherNumber: entry.voucherNumber },
      });
      return created({ expense, entry });
    }
    return created({ expense });
  } catch (e) {
    return handleError(e);
  }
}
