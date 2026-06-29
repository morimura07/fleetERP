import { Hono } from "hono";
import { computeAgingReport } from "@backend/services/collections";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok } from "@backend/lib/http";

export const collections = new Hono();

collections.get("/", requireAuth, requirePermission("collection:read"), async (c) => {
  const asOfParam = c.req.query("asOf");
  const asOf = asOfParam ? new Date(asOfParam) : new Date();
  const report = await computeAgingReport(asOf);
  return ok(c, report);
});
