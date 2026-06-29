import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth-guard";
import { ok, handleError, error } from "@/lib/api";
import { idSchema } from "@/lib/validations";
import { settleTransfer, failTransfer } from "@/lib/services/cash-bank";
import { logActivity } from "@/lib/activity";

/** Actions: { action: "settle" } | { action: "fail" | "timeout", externalRef? } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    idSchema.parse(id);
    const body = await req.json();

    if (body.action === "settle") {
      const user = await requirePermission("bank:disburse");
      const entry = await settleTransfer(id, user.id);
      await logActivity({ userId: user.id, action: "SETTLE", target: `MoneyTransfer:${id}`, detail: { voucherNumber: entry.voucherNumber } });
      return ok(entry);
    }
    if (body.action === "fail" || body.action === "timeout") {
      const user = await requirePermission("bank:disburse");
      const status = body.action === "fail" ? "FAILED" : "TIMEOUT";
      const transfer = await failTransfer(id, status, body.externalRef);
      await logActivity({ userId: user.id, action: status, target: `MoneyTransfer:${id}` });
      return ok(transfer);
    }
    return error("action must be 'settle', 'fail', or 'timeout'", 400);
  } catch (e) {
    return handleError(e);
  }
}
