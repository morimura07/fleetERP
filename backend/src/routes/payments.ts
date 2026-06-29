import { Hono } from "hono";
import type { Context } from "hono";
import { computeMonthlyPayments, finalizeMonthlyPayments } from "@backend/services/payment";
import { logActivity } from "@backend/lib/activity";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok } from "@backend/lib/http";

export const payments = new Hono();

function ym(c: Context) {
  const sp = c.req.query();
  const now = new Date();
  return {
    year: Number(sp.year ?? now.getFullYear()),
    month: Number(sp.month ?? now.getMonth() + 1),
  };
}

/** GET /payments?year=&month= — live computed monthly summary. */
payments.get("/", requireAuth, requirePermission("payment:read"), async (c) => {
  const { year, month } = ym(c);
  const rows = await computeMonthlyPayments(year, month);
  return ok(c, { year, month, rows, total: rows.reduce((s, r) => s + r.totalAmount, 0) });
});

/** POST — finalize (persist) the month's payments. */
payments.post("/", requireAuth, requirePermission("payment:write"), async (c) => {
  const user = c.get("user");
  const { year, month } = ym(c);
  const rows = await finalizeMonthlyPayments(year, month);
  await logActivity({ userId: user.id, action: "UPDATE", target: `Payment:${year}-${month}`, detail: "finalize" });
  return ok(c, { year, month, rows });
});
