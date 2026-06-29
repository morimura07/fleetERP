import { Hono } from "hono";
import { prisma } from "@backend/lib/prisma";
import { requireAuth } from "@backend/lib/auth";
import { ok } from "@backend/lib/http";

export const notifications = new Hono();

notifications.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.notification.count({ where: { userId: user.id, isRead: false } }),
  ]);
  return ok(c, { items, unread });
});

/** Mark all (or one) as read. Body: { id?: string } */
notifications.patch("/", requireAuth, async (c) => {
  const user = c.get("user");
  const { id } = (await c.req.json().catch(() => ({}))) as { id?: string };
  await prisma.notification.updateMany({
    where: { userId: user.id, ...(id ? { id } : {}) },
    data: { isRead: true },
  });
  return ok(c, { success: true });
});
