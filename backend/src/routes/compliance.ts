import { Hono } from "hono";
import { complianceReport } from "@backend/services/compliance";
import { vehicleFuelStats } from "@backend/services/fuel";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok } from "@backend/lib/http";

export const compliance = new Hono();

compliance.get("/", requireAuth, requirePermission("compliance:read"), async (c) => {
  const sp = c.req.query();
  const warningDays = Number(sp.warningDays) || 14;
  const onlyAttention = sp.onlyAttention === "1";
  const report = await complianceReport({ warningDays, onlyAttention });
  return ok(c, report);
});

// Fuel-efficiency monitor (M11) — shares the compliance permission.
export const fuel = new Hono();

fuel.get("/", requireAuth, requirePermission("compliance:read"), async (c) => {
  const stats = await vehicleFuelStats();
  return ok(c, stats);
});
