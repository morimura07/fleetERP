import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth-guard";
import { ok, handleError } from "@/lib/api";
import { computeMonthlyPayments, finalizeMonthlyPayments } from "@/lib/services/payment";
import { logActivity } from "@/lib/activity";

function ym(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const now = new Date();
  return {
    year: Number(sp.get("year") ?? now.getFullYear()),
    month: Number(sp.get("month") ?? now.getMonth() + 1),
  };
}

/** GET /api/payments?year=&month= — live computed monthly summary. */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("payment:read");
    const { year, month } = ym(req);
    const rows = await computeMonthlyPayments(year, month);
    return ok({ year, month, rows, total: rows.reduce((s, r) => s + r.totalAmount, 0) });
  } catch (e) {
    return handleError(e);
  }
}

/** POST — finalize (persist) the month's payments. */
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("payment:write");
    const { year, month } = ym(req);
    const rows = await finalizeMonthlyPayments(year, month);
    await logActivity({ userId: user.id, action: "UPDATE", target: `Payment:${year}-${month}`, detail: "finalize" });
    return ok({ year, month, rows });
  } catch (e) {
    return handleError(e);
  }
}
