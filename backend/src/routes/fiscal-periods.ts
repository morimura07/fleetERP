import { Hono } from "hono";
import { setPeriodSchema } from "@backend/lib/validations";
import { listPeriods, setPeriodStatus } from "@backend/services/fiscal-periods";
import { logActivity } from "@backend/lib/activity";
import { areaForWrite } from "@backend/lib/scope";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok } from "@backend/lib/http";

export const fiscalPeriods = new Hono();

/** The recent accounting months with their open/closed status. */
fiscalPeriods.get("/", requireAuth, requirePermission("period:read"), async (c) => {
  const user = c.get("user");
  return ok(c, await listPeriods(areaForWrite(user)));
});

/** Close or reopen an accounting period. */
fiscalPeriods.post("/", requireAuth, requirePermission("period:manage"), async (c) => {
  const user = c.get("user");
  const body = setPeriodSchema.parse(await c.req.json());
  const dataAreaId = areaForWrite(user);
  const period = await setPeriodStatus(dataAreaId, body.year, body.month, body.status, user.id, body.note || null);
  await logActivity({
    userId: user.id,
    action: body.status === "CLOSED" ? "CLOSE_PERIOD" : "REOPEN_PERIOD",
    target: `FiscalPeriod:${dataAreaId}:${body.year}-${String(body.month).padStart(2, "0")}`,
  });
  return ok(c, period);
});
