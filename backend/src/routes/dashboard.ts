import { Hono } from "hono";
import { getDashboardStats, getExecutiveStats, getKpiDashboard } from "@backend/services/dashboard";
import { getCorridorProfitability } from "@backend/services/cost-accounting";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { areaForWrite } from "@backend/lib/scope";
import { ok } from "@backend/lib/http";

/** Dashboard routes — reference port of src/app/(admin)/dashboard data loads. */
export const dashboard = new Hono();

dashboard.get("/stats", requireAuth, requirePermission("dashboard:view"), async (c) =>
  ok(c, await getDashboardStats()),
);

dashboard.get("/executive", requireAuth, requirePermission("dashboard:view"), async (c) =>
  ok(c, await getExecutiveStats()),
);

/** Logistics KPI dashboard grouped into the client's 5 categories. */
dashboard.get("/kpi", requireAuth, requirePermission("dashboard:view"), async (c) =>
  ok(c, await getKpiDashboard(areaForWrite(c.get("user")))),
);

/** Per-corridor profitability (M6 cost accounting): revenue/cost/margin by route. */
dashboard.get("/corridor-profitability", requireAuth, requirePermission("dashboard:view"), async (c) =>
  ok(c, await getCorridorProfitability(areaForWrite(c.get("user")))),
);
