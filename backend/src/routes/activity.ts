import { Hono } from "hono";
import { prisma } from "@backend/lib/prisma";
import { paginationSchema } from "@backend/lib/validations";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, pageMeta } from "@backend/lib/http";
import { areaScope, isPlatformAdmin } from "@backend/lib/scope";
import type { Prisma } from "@prisma/client";

export const activity = new Hono();

activity.get("/", requireAuth, requirePermission("activity:read"), async (c) => {
  const user = c.get("user");
  const { page, pageSize } = paginationSchema.parse(c.req.query());
  // ActivityLog carries no dataAreaId of its own, so its tenant is the one its
  // actor belongs to. A log whose user has since been deleted (userId is
  // nullable) cannot be attributed, so it stays visible to the platform
  // operator only, rather than being shown to whichever tenant happens to ask.
  const where: Prisma.ActivityLogWhereInput = isPlatformAdmin(user)
    ? {}
    : { user: { is: areaScope(user) } };
  const [items, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.activityLog.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});
