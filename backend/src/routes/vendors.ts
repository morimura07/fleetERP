import { Hono } from "hono";
import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { vendorSchema, paginationSchema } from "@backend/lib/validations";
import { logActivity } from "@backend/lib/activity";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { areaScope, areaForWrite } from "@backend/lib/scope";
import { ok, created, pageMeta } from "@backend/lib/http";

export const vendors = new Hono();

vendors.get("/", requireAuth, requirePermission("vendor:read"), async (c) => {
  const user = c.get("user");
  const { page, pageSize, q } = paginationSchema.parse(c.req.query());

  const where: Prisma.VendorWhereInput = {
    ...areaScope(user),
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { legalName: { contains: q, mode: "insensitive" } },
            { tin: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.vendor.findMany({ where, orderBy: { code: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.vendor.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

vendors.post("/", requireAuth, requirePermission("vendor:write"), async (c) => {
  const user = c.get("user");
  const body = vendorSchema.parse(await c.req.json());
  const vendor = await prisma.vendor.create({
    data: { ...body, dataAreaId: areaForWrite(user, body.dataAreaId), email: body.email || null, createdById: user.id },
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `Vendor:${vendor.id}` });
  return created(c, vendor);
});
