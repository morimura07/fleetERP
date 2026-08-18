import { prisma } from "@backend/lib/prisma";
import { hydrateOrganizations, registerCompany } from "@backend/lib/organization";
import { updateWithVersion } from "@backend/lib/concurrency";
import { AuthError } from "@backend/lib/errors";

/**
 * Organization (parent company) tenancy — the DB side of `lib/organization.ts`.
 *
 * The library holds the company → organization map in memory so `areaScope()`
 * can stay synchronous; this module is what fills it. Mirrors the split between
 * `lib/rbac.ts` (pure map) and `services/rbac-admin.ts` (DB reads).
 */

/** Reload the whole company → organization map from the database. */
export async function refreshOrganizations() {
  const companies = await prisma.company.findMany({ select: { code: true, organizationId: true } });
  hydrateOrganizations(companies);
}

/**
 * Keep the map current after a company is created or moved between parents.
 * Call this from any route that writes `Company.organizationId`, otherwise an
 * ADMIN would not see the new entity until the next restart.
 */
export function noteCompanyChanged(code: string, organizationId: string) {
  registerCompany(code, organizationId);
}

export interface OrganizationSummary {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  /** Required by the edit form: `updateWithVersion` rejects a stale write. */
  version: number;
  companies: { code: string; name: string; isSandbox: boolean }[];
}

/** Parent companies with the legal entities under each. */
export async function listOrganizations(): Promise<OrganizationSummary[]> {
  const rows = await prisma.organization.findMany({
    orderBy: { code: "asc" },
    include: {
      companies: {
        orderBy: { code: "asc" },
        select: { code: true, name: true, isSandbox: true },
      },
    },
  });
  return rows.map((o) => ({
    id: o.id,
    code: o.code,
    name: o.name,
    isActive: o.isActive,
    version: o.version,
    companies: o.companies,
  }));
}

/** Create a parent company. The code becomes permanent once entities hang off it. */
export async function createOrganization(
  input: { code: string; name: string; isActive: boolean },
  userId?: string | null,
) {
  const code = input.code.trim().toUpperCase();
  const clash = await prisma.organization.findUnique({ where: { code } });
  if (clash) throw new AuthError(`Organization ${code} already exists`, 409);

  return prisma.organization.create({
    data: { code, name: input.name.trim(), isActive: input.isActive, createdById: userId ?? null },
  });
}

/**
 * Rename or deactivate a parent.
 *
 * `code` is deliberately not editable: companies are resolved through it in the
 * runtime scope map, so renaming it would silently re-point their tenancy.
 */
export async function updateOrganization(
  id: string,
  version: number,
  patch: { name?: string; isActive?: boolean },
  userId?: string | null,
) {
  if (patch.isActive === false) {
    // Deactivating a parent locks out every user underneath it, so refuse while
    // it still holds live entities rather than stranding them.
    const live = await prisma.company.count({ where: { organizationId: id, isActive: true } });
    if (live > 0) {
      throw new AuthError(`Deactivate the ${live} active compan${live === 1 ? "y" : "ies"} first`, 422);
    }
  }
  return updateWithVersion(prisma.organization, id, version, userId ?? null, {
    name: patch.name?.trim(),
    isActive: patch.isActive,
  });
}
