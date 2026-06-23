import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, handleError, pageMeta } from "@/lib/api";
import { paginationSchema } from "@/lib/validations";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("activity:read");
    const { page, pageSize } = paginationSchema.parse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    const [items, total] = await Promise.all([
      prisma.activityLog.findMany({
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.activityLog.count(),
    ]);
    return ok(items, pageMeta(page, pageSize, total));
  } catch (e) {
    return handleError(e);
  }
}
