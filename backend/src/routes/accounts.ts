import { Hono } from "hono";
import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { accountSchema, paginationSchema } from "@backend/lib/validations";
import { buildOrderBy } from "@backend/lib/format";
import { logActivity } from "@backend/lib/activity";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { areaScope, areaForWrite } from "@backend/lib/scope";
import { ok, created, pageMeta } from "@backend/lib/http";

export const accounts = new Hono();

accounts.get("/", requireAuth, requirePermission("account:read"), async (c) => {
  const user = c.get("user");
  const { page, pageSize, q, sort, order } = paginationSchema.parse(c.req.query());

  const where: Prisma.AccountWhereInput = {
    ...areaScope(user),
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.account.findMany({
      where,
      orderBy: buildOrderBy(sort, order, ["code", "name", "createdAt"], "code"),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.account.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

accounts.post("/", requireAuth, requirePermission("account:write"), async (c) => {
  const user = c.get("user");
  const body = accountSchema.parse(await c.req.json());
  const account = await prisma.account.create({
    data: { ...body, dataAreaId: areaForWrite(user, body.dataAreaId), createdById: user.id },
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `Account:${account.id}` });
  return created(c, account);
});
