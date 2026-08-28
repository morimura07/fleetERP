import { Hono } from "hono";
import {
  createRoleSchema, updateRoleSchema, setPermissionsSchema, assignRoleSchema, approvalAuthoritySchema,
} from "@backend/lib/validations";
import {
  listRoles, listPermissions, createRole, updateRole, setRolePermissions, deleteRole, assignUserRole,
  setApprovalAuthority,
} from "@backend/services/rbac-admin";
import { logActivity } from "@backend/lib/activity";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created } from "@backend/lib/http";

// All role/permission administration is gated by `user:manage` (the same
// permission that guards user administration).
export const rbac = new Hono();

/** The full permission catalog (keys) for building the role matrix. */
rbac.get("/permissions", requireAuth, requirePermission("user:manage"), async (c) => {
  return ok(c, await listPermissions());
});

/** All roles with their grants and user counts. */
rbac.get("/roles", requireAuth, requirePermission("user:manage"), async (c) => {
  return ok(c, await listRoles());
});

/** Create a custom role. */
rbac.post("/roles", requireAuth, requirePermission("user:manage"), async (c) => {
  const user = c.get("user");
  const body = createRoleSchema.parse(await c.req.json());
  const role = await createRole({ key: body.key, name: body.name, description: body.description || null, permissions: body.permissions });
  await logActivity({ userId: user.id, action: "CREATE", target: `RbacRole:${role.key}` });
  return created(c, role);
});

/** Rename / re-describe a role. */
rbac.patch("/roles/:key", requireAuth, requirePermission("user:manage"), async (c) => {
  const user = c.get("user");
  const key = c.req.param("key");
  const body = updateRoleSchema.parse(await c.req.json());
  const role = await updateRole(key, { name: body.name, description: body.description });
  await logActivity({ userId: user.id, action: "UPDATE", target: `RbacRole:${key}` });
  return ok(c, role);
});

/** Replace a role's permission grants (the UI sends the full checked set). */
rbac.put("/roles/:key/permissions", requireAuth, requirePermission("user:manage"), async (c) => {
  const user = c.get("user");
  const key = c.req.param("key");
  const body = setPermissionsSchema.parse(await c.req.json());
  const result = await setRolePermissions(key, body.permissions);
  await logActivity({ userId: user.id, action: "SET_PERMISSIONS", target: `RbacRole:${key}`, detail: { count: result.permissions.length } });
  return ok(c, result);
});

/** Delete a custom role (system roles and in-use roles are protected). */
rbac.delete("/roles/:key", requireAuth, requirePermission("user:manage"), async (c) => {
  const user = c.get("user");
  const key = c.req.param("key");
  await deleteRole(key);
  await logActivity({ userId: user.id, action: "DELETE", target: `RbacRole:${key}` });
  return ok(c, { key });
});

/** Assign (or clear) a user's custom role. */
rbac.post("/users/:id/role", requireAuth, requirePermission("user:manage"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = assignRoleSchema.parse(await c.req.json());
  const result = await assignUserRole(id, body.roleKey);
  await logActivity({ userId: user.id, action: "ASSIGN_ROLE", target: `User:${id}`, detail: { roleKey: body.roleKey } });
  return ok(c, result);
});

/** Assign or remove a user's approval authority (client amendments, Aug 2026). */
rbac.patch("/users/:id/approval", requireAuth, requirePermission("user:manage"), async (c) => {
  const actor = c.get("user");
  const id = c.req.param("id");
  const body = approvalAuthoritySchema.parse(await c.req.json());
  const result = await setApprovalAuthority(id, body.approvalLimit, body.esignatory);
  await logActivity({
    userId: actor.id,
    action: "UPDATE",
    target: `User:${id}`,
    detail: body.approvalLimit == null ? "approval authority removed" : `approval limit ${body.approvalLimit}`,
  });
  return ok(c, result);
});
