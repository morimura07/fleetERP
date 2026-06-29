import { Hono } from "hono";
import { getDashboardStats, getExecutiveStats } from "@backend/services/dashboard";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok } from "@backend/lib/http";

/** Dashboard routes — reference port of src/app/(admin)/dashboard data loads. */
export const dashboard = new Hono();

dashboard.get("/stats", requireAuth, requirePermission("dashboard:view"), async (c) =>
  ok(c, await getDashboardStats()),
);

dashboard.get("/executive", requireAuth, requirePermission("dashboard:view"), async (c) =>
  ok(c, await getExecutiveStats()),
);
