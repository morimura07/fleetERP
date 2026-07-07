import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "@backend/lib/prisma";
import { paginationSchema } from "@backend/lib/validations";
import { hashPassword } from "@backend/lib/password";
import { logActivity } from "@backend/lib/activity";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";

const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "DISPATCHER", "FINANCE", "DRIVER", "STAFF"]),
  dataAreaId: z.string().min(1).max(10).optional(), // company the user belongs to
});

export const users = new Hono();

users.get("/", requireAuth, requirePermission("user:manage"), async (c) => {
  const { page, pageSize, q } = paginationSchema.parse(c.req.query());
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, role: true, dataAreaId: true, isActive: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

users.post("/", requireAuth, requirePermission("user:manage"), async (c) => {
  const admin = c.get("user");
  const body = userSchema.parse(await c.req.json());
  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email.toLowerCase(),
      role: body.role,
      dataAreaId: body.dataAreaId ?? admin.dataAreaId, // assign company (default: admin's)
      passwordHash: await hashPassword(body.password),
    },
    select: { id: true, name: true, email: true, role: true, dataAreaId: true },
  });
  await logActivity({ userId: admin.id, action: "CREATE", target: `User:${user.id}` });
  return created(c, user);
});
