import { Hono } from "hono";
import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { clientSchema, paginationSchema } from "@backend/lib/validations";
import { buildOrderBy } from "@backend/lib/format";
import { logActivity } from "@backend/lib/activity";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";

export const clients = new Hono();

clients.get("/", requireAuth, requirePermission("client:read"), async (c) => {
  const { page, pageSize, q, sort, order } = paginationSchema.parse(c.req.query());

  const where: Prisma.ClientWhereInput = q
    ? {
        OR: [
          { companyName: { contains: q, mode: "insensitive" } },
          { contactPerson: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: buildOrderBy(sort, order, ["companyName", "createdAt"], "createdAt"),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.client.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

clients.post("/", requireAuth, requirePermission("client:write"), async (c) => {
  const user = c.get("user");
  const body = clientSchema.parse(await c.req.json());
  const client = await prisma.client.create({ data: body });
  await logActivity({ userId: user.id, action: "CREATE", target: `Client:${client.id}` });
  return created(c, client);
});

clients.get("/:id", requireAuth, requirePermission("client:read"), async (c) => {
  const id = c.req.param("id");
  const client = await prisma.client.findUniqueOrThrow({ where: { id } });
  return ok(c, client);
});

clients.patch("/:id", requireAuth, requirePermission("client:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = clientSchema.partial().parse(await c.req.json());
  const client = await prisma.client.update({ where: { id }, data: body });
  await logActivity({ userId: user.id, action: "UPDATE", target: `Client:${id}`, detail: body });
  return ok(c, client);
});

clients.delete("/:id", requireAuth, requirePermission("client:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await prisma.client.delete({ where: { id } });
  await logActivity({ userId: user.id, action: "DELETE", target: `Client:${id}` });
  return ok(c, { id });
});
