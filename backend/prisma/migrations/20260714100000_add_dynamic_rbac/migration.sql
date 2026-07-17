-- Dynamic RBAC: role & permission management. Adds a permission catalog, a roles
-- table (system + custom), role→permission grants, and an optional custom-role
-- pointer on users. Additive: users.role (enum) is untouched, so all existing
-- ADMIN/DRIVER behavior and JWTs keep working. Role/permission *data* is loaded
-- by the seed from the code's permission list (idempotent upserts).

-- ── Permission catalog ──
CREATE TABLE "rbac_permissions" (
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rbac_permissions_pkey" PRIMARY KEY ("key")
);

-- ── Roles (system + custom) ──
CREATE TABLE "rbac_roles" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rbac_roles_pkey" PRIMARY KEY ("key")
);

-- ── Role → permission grants ──
CREATE TABLE "rbac_role_permissions" (
    "roleKey" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,

    CONSTRAINT "rbac_role_permissions_pkey" PRIMARY KEY ("roleKey", "permissionKey")
);
CREATE INDEX "rbac_role_permissions_permissionKey_idx" ON "rbac_role_permissions"("permissionKey");

-- ── Optional custom-role pointer on users ──
ALTER TABLE "users" ADD COLUMN "roleKey" TEXT;

-- ── Foreign keys ──
ALTER TABLE "rbac_role_permissions" ADD CONSTRAINT "rbac_role_permissions_roleKey_fkey" FOREIGN KEY ("roleKey") REFERENCES "rbac_roles"("key") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rbac_role_permissions" ADD CONSTRAINT "rbac_role_permissions_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "rbac_permissions"("key") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_roleKey_fkey" FOREIGN KEY ("roleKey") REFERENCES "rbac_roles"("key") ON DELETE SET NULL ON UPDATE CASCADE;
