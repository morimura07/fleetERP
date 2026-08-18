import { Prisma, Role } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import {
  ALL, DEFAULT_ROLE_PERMISSIONS, hydrateRbac, setRuntimeRole, removeRuntimeRole,
  type Permission,
} from "@backend/lib/rbac";

/**
 * Dynamic RBAC administration (M36 extension). Roles and their permission grants
 * live in the `rbac_*` tables so admins can create roles and re-map permissions
 * from the UI. The 5 built-in roles are seeded with `isSystem=true` and are
 * protected: their key can't change and they can't be deleted (but their grants
 * can be edited). The authoritative in-memory grant map (`rbac.ts`) is refreshed
 * on startup and after every change so `can()` stays synchronous.
 */

const SYSTEM_ROLE_NAMES: Record<Role, string> = {
  SUPER_ADMIN: "Platform Administrator",
  ADMIN: "Administrator",
  DISPATCHER: "Dispatcher",
  FINANCE: "Finance Controller",
  DRIVER: "Driver",
  STAFF: "Staff",
};

/** Idempotently seed the permission catalog + the 6 system roles with their default grants. */
export async function seedRbac() {
  // Permission catalog.
  for (const key of ALL) {
    await prisma.rbacPermission.upsert({ where: { key }, update: {}, create: { key } });
  }
  // System roles + their default grants (only seed grants when the role is new,
  // so we never clobber admin edits on re-seed).
  for (const [role, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS) as [Role, Permission[]][]) {
    const existing = await prisma.rbacRole.findUnique({ where: { key: role } });
    await prisma.rbacRole.upsert({
      where: { key: role },
      update: { isSystem: true, name: SYSTEM_ROLE_NAMES[role] },
      create: { key: role, name: SYSTEM_ROLE_NAMES[role], isSystem: true },
    });
    if (!existing) {
      await prisma.rbacRolePermission.createMany({
        data: perms.map((permissionKey) => ({ roleKey: role, permissionKey })),
        skipDuplicates: true,
      });
    } else if (role === "ADMIN") {
      // ADMIN is omnipotent by definition — additively ensure it holds every
      // permission even on a re-seed after new permissions are added to the app.
      // (skipDuplicates keeps this from clobbering or duplicating existing grants.)
      await prisma.rbacRolePermission.createMany({
        data: perms.map((permissionKey) => ({ roleKey: role, permissionKey })),
        skipDuplicates: true,
      });
    }
  }
  await refreshRuntime();
}

/** Reload the entire runtime grant map from the DB. */
export async function refreshRuntime() {
  const roles = await prisma.rbacRole.findMany({ include: { permissions: { select: { permissionKey: true } } } });
  hydrateRbac(roles.map((r) => ({ roleKey: r.key, permissions: r.permissions.map((p) => p.permissionKey) })));
}

// ── Queries ──────────────────────────────────────────────────────────────────

export async function listRoles() {
  const roles = await prisma.rbacRole.findMany({
    include: { permissions: { select: { permissionKey: true } }, _count: { select: { users: true } } },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });
  return roles.map((r) => ({
    key: r.key, name: r.name, description: r.description, isSystem: r.isSystem,
    permissions: r.permissions.map((p) => p.permissionKey),
    userCount: r._count.users,
  }));
}

/** The full permission catalog, grouped by resource prefix for the UI matrix. */
export async function listPermissions() {
  const perms = await prisma.rbacPermission.findMany({ orderBy: { key: "asc" } });
  return perms.map((p) => p.key);
}

// ── Mutations ────────────────────────────────────────────────────────────────

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;

export interface CreateRoleInput {
  key: string;
  name: string;
  description?: string | null;
  permissions?: string[];
}

export async function createRole(input: CreateRoleInput) {
  const key = input.key.trim().toUpperCase();
  if (!KEY_RE.test(key)) throw new AuthError("Role key must be UPPER_SNAKE_CASE (letters, digits, underscore)", 422);
  const clash = await prisma.rbacRole.findUnique({ where: { key } });
  if (clash) throw new AuthError(`A role with key ${key} already exists`, 409);

  const grants = await validPermissions(input.permissions ?? []);
  const role = await prisma.rbacRole.create({
    data: {
      key, name: input.name.trim(), description: input.description ?? null, isSystem: false,
      permissions: { create: grants.map((permissionKey) => ({ permissionKey })) },
    },
  });
  setRuntimeRole(key, grants);
  return role;
}

export async function updateRole(key: string, patch: { name?: string; description?: string | null }) {
  const role = await prisma.rbacRole.findUnique({ where: { key } });
  if (!role) throw new AuthError("Role not found", 404);
  return prisma.rbacRole.update({
    where: { key },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
    },
  });
}

/** Replace a role's permission grants wholesale (the UI sends the full checked set). */
export async function setRolePermissions(key: string, permissions: string[]) {
  const role = await prisma.rbacRole.findUnique({ where: { key } });
  if (!role) throw new AuthError("Role not found", 404);
  const grants = await validPermissions(permissions);
  await prisma.$transaction([
    prisma.rbacRolePermission.deleteMany({ where: { roleKey: key } }),
    prisma.rbacRolePermission.createMany({ data: grants.map((permissionKey) => ({ roleKey: key, permissionKey })) }),
  ]);
  setRuntimeRole(key, grants);
  return { key, permissions: grants };
}

export async function deleteRole(key: string) {
  const role = await prisma.rbacRole.findUnique({ where: { key }, include: { _count: { select: { users: true } } } });
  if (!role) throw new AuthError("Role not found", 404);
  if (role.isSystem) throw new AuthError("System roles cannot be deleted", 422);
  if (role._count.users > 0) throw new AuthError("Reassign the users on this role before deleting it", 422);
  await prisma.rbacRole.delete({ where: { key } });
  removeRuntimeRole(key);
}

/** Assign a user a custom role (or clear it, reverting to their system role). */
export async function assignUserRole(userId: string, roleKey: string | null) {
  if (roleKey) {
    const role = await prisma.rbacRole.findUnique({ where: { key: roleKey } });
    if (!role) throw new AuthError("Role not found", 404);
  }
  return prisma.user.update({ where: { id: userId }, data: { roleKey }, select: { id: true, roleKey: true } });
}

async function validPermissions(keys: string[]): Promise<string[]> {
  const unique = [...new Set(keys)];
  const known = new Set(ALL as readonly string[]);
  const bad = unique.filter((k) => !known.has(k));
  if (bad.length) throw new AuthError(`Unknown permission(s): ${bad.join(", ")}`, 422);
  return unique;
}
