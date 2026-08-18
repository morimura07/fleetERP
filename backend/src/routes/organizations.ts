import { Hono } from "hono";
import { organizationSchema } from "@backend/lib/validations";
import { listOrganizations, createOrganization, updateOrganization } from "@backend/services/organization";
import { logActivity } from "@backend/lib/activity";
import { requireVersion } from "@backend/lib/concurrency";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created } from "@backend/lib/http";

/**
 * Organization (parent company) registry.
 *
 * The tenant boundary itself, so every route here is gated on
 * `organization:manage` — a permission held only by the platform operator
 * (SUPER_ADMIN). An organization ADMIN can create companies inside their own
 * parent, but never another parent.
 *
 * There is no delete: organizations own companies which own every business
 * record, and `Company.organizationId` is Restrict on delete. Retire one by
 * setting `isActive` false instead.
 */
export const organizations = new Hono();

/** Every parent with the legal entities under it. */
organizations.get("/", requireAuth, requirePermission("organization:manage"), async (c) => {
  return ok(c, await listOrganizations());
});

organizations.post("/", requireAuth, requirePermission("organization:manage"), async (c) => {
  const user = c.get("user");
  const body = organizationSchema.parse(await c.req.json());
  const org = await createOrganization(body, user.id);
  await logActivity({ userId: user.id, action: "CREATE", target: `Organization:${org.code}` });
  return created(c, org);
});

organizations.patch("/:id", requireAuth, requirePermission("organization:manage"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const raw = await c.req.json();
  const version = requireVersion(raw);
  const body = organizationSchema.partial().parse(raw);
  const org = await updateOrganization(id, version, { name: body.name, isActive: body.isActive }, user.id);
  await logActivity({ userId: user.id, action: "UPDATE", target: `Organization:${id}` });
  return ok(c, org);
});
