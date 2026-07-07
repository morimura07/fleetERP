import { Hono } from "hono";
import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { companySchema, paginationSchema } from "@backend/lib/validations";
import { logActivity } from "@backend/lib/activity";
import { updateWithVersion, requireVersion } from "@backend/lib/concurrency";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";

/**
 * Company / legal-entity registry (M34). ADMIN-only (company:manage). Each
 * company's `code` is the dataAreaId used to partition every business record.
 */
export const companies = new Hono();

companies.get("/", requireAuth, requirePermission("company:manage"), async (c) => {
  const { page, pageSize, q } = paginationSchema.parse(c.req.query());
  const where: Prisma.CompanyWhereInput = q
    ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }
    : {};
  const [items, total] = await Promise.all([
    prisma.company.findMany({ where, orderBy: { code: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.company.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

companies.post("/", requireAuth, requirePermission("company:manage"), async (c) => {
  const user = c.get("user");
  const body = companySchema.parse(await c.req.json());
  const company = await prisma.company.create({
    data: {
      code: body.code.toUpperCase(),
      name: body.name,
      baseCurrency: body.baseCurrency.toUpperCase(),
      country: body.country.toUpperCase(),
      isActive: body.isActive,
      createdById: user.id,
    },
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `Company:${company.code}` });
  return created(c, company);
});

companies.patch("/:id", requireAuth, requirePermission("company:manage"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const raw = await c.req.json();
  const version = requireVersion(raw);
  const body = companySchema.partial().parse(raw);
  const company = await updateWithVersion(prisma.company, id, version, user.id, {
    name: body.name,
    baseCurrency: body.baseCurrency?.toUpperCase(),
    country: body.country?.toUpperCase(),
    isActive: body.isActive,
    // `code` is the partition key of existing data — not editable after creation.
  });
  await logActivity({ userId: user.id, action: "UPDATE", target: `Company:${id}` });
  return ok(c, company);
});
