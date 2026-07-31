import { Hono } from "hono";
import { provisionSandboxSchema, resetSandboxSchema } from "@backend/lib/validations";
import { sandboxStatus, provisionSandbox, resetSandbox } from "@backend/services/sandbox";
import { logActivity } from "@backend/lib/activity";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created } from "@backend/lib/http";

// Sandbox administration is an org-admin action (same gate as the company registry).
export const sandbox = new Hono();

/** The sandbox partitions with their record counts. */
sandbox.get("/", requireAuth, requirePermission("company:manage"), async (c) => {
  return ok(c, await sandboxStatus());
});

/** Create (or ensure) a sandbox partition and seed its demo baseline. */
sandbox.post("/provision", requireAuth, requirePermission("company:manage"), async (c) => {
  const user = c.get("user");
  const body = provisionSandboxSchema.parse(await c.req.json());
  const company = await provisionSandbox(body.code, body.name, user.id);
  await logActivity({ userId: user.id, action: "PROVISION_SANDBOX", target: `Company:${company.code}` });
  return created(c, company);
});

/** Reset a sandbox partition (wipe + re-seed). Guarded to sandbox companies only. */
sandbox.post("/reset", requireAuth, requirePermission("company:manage"), async (c) => {
  const user = c.get("user");
  const body = resetSandboxSchema.parse(await c.req.json());
  const company = await resetSandbox(body.code);
  await logActivity({ userId: user.id, action: "RESET_SANDBOX", target: `Company:${company.code}` });
  return ok(c, company);
});
