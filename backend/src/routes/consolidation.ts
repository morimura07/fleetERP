import { Hono } from "hono";
import { RateType } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { consolidationMapSchema } from "@backend/lib/validations";
import { runConsolidation } from "@backend/services/consolidation";
import { logActivity } from "@backend/lib/activity";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created } from "@backend/lib/http";
import { canReachArea } from "@backend/lib/scope";

export const consolidation = new Hono();

/** GET — run a consolidation report; also returns the mapping table. */
consolidation.get("/", requireAuth, requirePermission("consolidation:read"), async (c) => {
  const sp = c.req.query();
  const user = c.get("user");
  // parentArea arrives as a query parameter, so it has to be checked: without
  // this, any authenticated holder of consolidation:read could pass another
  // tenant's code and read their consolidated financials.
  const requested = sp.parentArea ?? user.dataAreaId;
  const parentArea = canReachArea(user, requested) ? requested : user.dataAreaId;
  const baseCurrency = sp.baseCurrency ?? "USD";
  const rateType = (sp.rateType && sp.rateType in RateType ? sp.rateType : "AVERAGE") as RateType;
  const asOf = sp.asOf ? new Date(sp.asOf) : undefined;

  const [result, maps] = await Promise.all([
    runConsolidation({ parentArea, baseCurrency, rateType, asOf }),
    prisma.consolidationMap.findMany({ where: { parentArea }, orderBy: [{ subsidiary: "asc" }, { subAccount: "asc" }] }),
  ]);
  return ok(c, { result, maps });
});

/** POST — add a subsidiary→parent account mapping row. */
consolidation.post("/", requireAuth, requirePermission("consolidation:run"), async (c) => {
  const user = c.get("user");
  const body = consolidationMapSchema.parse(await c.req.json());
  const map = await prisma.consolidationMap.create({
    data: {
      parentArea: body.parentArea,
      subsidiary: body.subsidiary,
      subAccount: body.subAccount,
      parentAccount: body.parentAccount,
    },
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `ConsolidationMap:${map.id}` });
  return created(c, map);
});
