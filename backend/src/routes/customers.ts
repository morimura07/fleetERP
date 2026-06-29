import { Hono } from "hono";
import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { customerSchema, paginationSchema } from "@backend/lib/validations";
import { logActivity } from "@backend/lib/activity";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";

export const customers = new Hono();

customers.get("/", requireAuth, requirePermission("customer:read"), async (c) => {
  const { page, pageSize, q } = paginationSchema.parse(c.req.query());

  const where: Prisma.CustomerWhereInput = q
    ? {
        OR: [
          { code: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          { tin: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.customer.findMany({ where, orderBy: { code: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.customer.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

customers.post("/", requireAuth, requirePermission("customer:write"), async (c) => {
  const user = c.get("user");
  const body = customerSchema.parse(await c.req.json());
  const customer = await prisma.customer.create({ data: { ...body, email: body.email || null } });
  await logActivity({ userId: user.id, action: "CREATE", target: `Customer:${customer.id}` });
  return created(c, customer);
});
