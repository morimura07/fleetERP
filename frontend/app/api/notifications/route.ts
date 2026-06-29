import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.notification.count({ where: { userId: user.id, isRead: false } }),
    ]);
    return ok({ items, unread });
  } catch (e) {
    return handleError(e);
  }
}

/** Mark all (or one) as read. Body: { id?: string } */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser();
    const { id } = (await req.json().catch(() => ({}))) as { id?: string };
    await prisma.notification.updateMany({
      where: { userId: user.id, ...(id ? { id } : {}) },
      data: { isRead: true },
    });
    return ok({ success: true });
  } catch (e) {
    return handleError(e);
  }
}
