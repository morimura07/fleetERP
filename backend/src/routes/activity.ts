import { Hono } from "hono";
import { prisma } from "@backend/lib/prisma";
import { paginationSchema } from "@backend/lib/validations";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, pageMeta } from "@backend/lib/http";

export const activity = new Hono();

activity.get("/", requireAuth, requirePermission("activity:read"), async (c) => {
  const { page, pageSize } = paginationSchema.parse(c.req.query());
  const [items, total] = await Promise.all([
    prisma.activityLog.findMany({
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.activityLog.count(),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});
