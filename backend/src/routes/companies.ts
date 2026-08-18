import { Hono } from "hono";
import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { companySchema, paginationSchema } from "@backend/lib/validations";
import { logActivity } from "@backend/lib/activity";
import { updateWithVersion, requireVersion } from "@backend/lib/concurrency";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { isPlatformAdmin } from "@backend/lib/scope";
import { noteCompanyChanged } from "@backend/services/organization";
import { AuthError } from "@backend/lib/errors";
import { ok, created, pageMeta } from "@backend/lib/http";

/**
 * Company / legal-entity registry (M34). Each company's `code` is the dataAreaId
 * that partitions every business record.
 *
 * Tenant rule: an ADMIN only ever sees and edits the companies inside their own
 * organization. Only SUPER_ADMIN reads across parents, and only SUPER_ADMIN may
 * place a company in an organization other than their own.
 */
export const companies = new Hono();

/** Restrict a company query to the caller's organization unless they are platform-level. */
function orgFilter(user: { role: string; organizationId: string | null }): Prisma.CompanyWhereInput {
  if (isPlatformAdmin(user as never)) return {};
  // A caller with no resolvable organization can reach nothing rather than everything.
  return { organizationId: user.organizationId ?? "__none__" };
}

companies.get("/", requireAuth, requirePermission("company:manage"), async (c) => {
  const user = c.get("user");
  const { page, pageSize, q } = paginationSchema.parse(c.req.query());
  const search: Prisma.CompanyWhereInput = q
    ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }
    : {};
  const where: Prisma.CompanyWhereInput = { AND: [orgFilter(user), search] };

  const [items, total] = await Promise.all([
    prisma.company.findMany({ where, orderBy: { code: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.company.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

companies.post("/", requireAuth, requirePermission("company:manage"), async (c) => {
  const user = c.get("user");
  const body = companySchema.parse(await c.req.json());

  // An ADMIN always creates inside their own parent; the field is ignored for
  // them so it can't be used to plant a company in someone else's organization.
  const organizationId = isPlatformAdmin(user) ? body.organizationId ?? user.organizationId : user.organizationId;
  if (!organizationId) {
    throw new AuthError("No organization to create this company under", 422);
  }

  const company = await prisma.company.create({
    data: {
      organizationId,
      code: body.code.toUpperCase(),
      name: body.name,
      baseCurrency: body.baseCurrency.toUpperCase(),
      country: body.country.toUpperCase(),
      isActive: body.isActive,
      createdById: user.id,
    },
  });
  // Keep the in-memory scope map current, or an ADMIN would not see the new
  // entity until the API restarts.
  noteCompanyChanged(company.code, company.organizationId);
  await logActivity({ userId: user.id, action: "CREATE", target: `Company:${company.code}` });
  return created(c, company);
});

companies.patch("/:id", requireAuth, requirePermission("company:manage"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const raw = await c.req.json();
  const version = requireVersion(raw);
  const body = companySchema.partial().parse(raw);

  // 404 (not 403) so a caller can't probe for companies in other organizations.
  const existing = await prisma.company.findUnique({ where: { id }, select: { organizationId: true } });
  if (!existing || (!isPlatformAdmin(user) && existing.organizationId !== user.organizationId)) {
    throw new AuthError("Not found", 404);
  }

  const company = await updateWithVersion(prisma.company, id, version, user.id, {
    name: body.name,
    baseCurrency: body.baseCurrency?.toUpperCase(),
    country: body.country?.toUpperCase(),
    isActive: body.isActive,
    // `code` is the partition key of existing data — not editable after creation.
    // `organizationId` is deliberately not editable either: moving a company
    // between parents would move its entire data history across a tenant line.
  });
  await logActivity({ userId: user.id, action: "UPDATE", target: `Company:${id}` });
  return ok(c, company);
});
