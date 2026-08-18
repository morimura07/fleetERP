import { Hono } from "hono";
import {
  provisionSandboxSchema,
  resetSandboxSchema,
  sandboxCredentialsSchema,
  sandboxExpirySchema,
} from "@backend/lib/validations";
import {
  sandboxStatus,
  provisionSandbox,
  resetSandbox,
  issueSandboxCredentials,
  setSandboxExpiry,
} from "@backend/services/sandbox";
import { logActivity } from "@backend/lib/activity";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { isPlatformAdmin } from "@backend/lib/scope";
import { AuthError } from "@backend/lib/errors";
import { ok, created } from "@backend/lib/http";

/** The tenant a sandbox action applies to; null means platform-wide (SUPER_ADMIN). */
const tenantOf = (user: { role: string; organizationId: string | null }) =>
  isPlatformAdmin(user as never) ? null : user.organizationId;

// Sandbox administration is an org-admin action (same gate as the company registry).
export const sandbox = new Hono();

/** The sandbox partitions with their record counts, access window and demo logins. */
sandbox.get("/", requireAuth, requirePermission("company:manage"), async (c) => {
  return ok(c, await sandboxStatus(tenantOf(c.get("user"))));
});

/** Create (or ensure) a sandbox partition, seed its baseline and mint demo logins. */
sandbox.post("/provision", requireAuth, requirePermission("company:manage"), async (c) => {
  const user = c.get("user");
  const body = provisionSandboxSchema.parse(await c.req.json());
  const organizationId = user.organizationId;
  if (!organizationId) throw new AuthError("Select an organization before provisioning a sandbox", 422);
  const { company, credentials } = await provisionSandbox(body.code, body.name, organizationId, body.expiresInDays, user.id);
  await logActivity({ userId: user.id, action: "PROVISION_SANDBOX", target: `Company:${company.code}` });
  // The password is only ever readable here — the caller must surface it.
  return created(c, { company, credentials });
});

/** Reset a sandbox partition (wipe + re-seed). Guarded to sandbox companies only. */
sandbox.post("/reset", requireAuth, requirePermission("company:manage"), async (c) => {
  const user = c.get("user");
  const body = resetSandboxSchema.parse(await c.req.json());
  const company = await resetSandbox(body.code, tenantOf(user));
  await logActivity({ userId: user.id, action: "RESET_SANDBOX", target: `Company:${company.code}` });
  return ok(c, company);
});

/** Issue a fresh demo password, invalidating the previous one. */
sandbox.post("/credentials", requireAuth, requirePermission("company:manage"), async (c) => {
  const user = c.get("user");
  const body = sandboxCredentialsSchema.parse(await c.req.json());
  const credentials = await issueSandboxCredentials(body.code, tenantOf(user));
  await logActivity({ userId: user.id, action: "ISSUE_SANDBOX_CREDENTIALS", target: `Company:${body.code}` });
  return ok(c, credentials);
});

/** Extend, shorten or clear the demo access window. */
sandbox.patch("/expiry", requireAuth, requirePermission("company:manage"), async (c) => {
  const user = c.get("user");
  const body = sandboxExpirySchema.parse(await c.req.json());
  const company = await setSandboxExpiry(body.code, body.expiresInDays, tenantOf(user), user.id);
  await logActivity({
    userId: user.id,
    action: "UPDATE_SANDBOX_EXPIRY",
    target: `Company:${company.code}`,
    detail: body.expiresInDays == null ? "no expiry" : `${body.expiresInDays} days`,
  });
  return ok(c, company);
});
