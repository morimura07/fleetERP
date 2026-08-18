/**
 * Company → organization lookup, held in memory.
 *
 * `areaScope()` runs on every query and is synchronous, so resolving "which
 * companies may this user reach" cannot await a database round-trip. The map is
 * hydrated at startup and refreshed whenever a company or organization changes
 * — the same approach `lib/rbac.ts` uses to keep `can()` sync.
 *
 * The map is small by nature: one entry per legal entity, not per record.
 */

/** company code (dataAreaId) → organization id */
const companyToOrg = new Map<string, string>();
/** organization id → its company codes */
const orgToCompanies = new Map<string, Set<string>>();

/** Replace the whole map from DB rows (startup, and after any company change). */
export function hydrateOrganizations(companies: { code: string; organizationId: string }[]) {
  companyToOrg.clear();
  orgToCompanies.clear();
  for (const c of companies) registerCompany(c.code, c.organizationId);
}

/** Add or move a single company without a full reload. */
export function registerCompany(code: string, organizationId: string) {
  const previous = companyToOrg.get(code);
  if (previous && previous !== organizationId) orgToCompanies.get(previous)?.delete(code);

  companyToOrg.set(code, organizationId);
  const set = orgToCompanies.get(organizationId) ?? new Set<string>();
  set.add(code);
  orgToCompanies.set(organizationId, set);
}

export function forgetCompany(code: string) {
  const org = companyToOrg.get(code);
  if (org) orgToCompanies.get(org)?.delete(code);
  companyToOrg.delete(code);
}

/** The organization a legal entity belongs to, or null if it isn't known yet. */
export function organizationOf(companyCode: string): string | null {
  return companyToOrg.get(companyCode) ?? null;
}

/**
 * Every company code inside an organization.
 *
 * Returns `[]` for an unknown organization, and callers must treat that as
 * "reaches nothing" rather than "reaches everything" — an empty tenant must
 * never widen into a cross-tenant read.
 */
export function companiesInOrganization(organizationId: string): string[] {
  return [...(orgToCompanies.get(organizationId) ?? [])];
}

export function isHydrated(): boolean {
  return companyToOrg.size > 0;
}
