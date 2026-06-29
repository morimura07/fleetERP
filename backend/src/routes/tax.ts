import { Hono } from "hono";
import { computeTaxReturn, TAX_COMPONENTS } from "@backend/services/tax";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok } from "@backend/lib/http";

export const tax = new Hono();

tax.get("/", requireAuth, requirePermission("tax:read"), async (c) => {
  const sp = c.req.query();
  const now = new Date();
  const year = Number(sp.year) || now.getFullYear();
  const month = Number(sp.month) || now.getMonth() + 1;
  const ret = await computeTaxReturn(year, month);
  return ok(c, { return: ret, components: TAX_COMPONENTS });
});
