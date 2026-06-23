import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError, pageMeta } from "@/lib/api";
import { orderSchema, paginationSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import { Prisma, OrderStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("order:read");
    const sp = req.nextUrl.searchParams;
    const { page, pageSize, q } = paginationSchema.parse(Object.fromEntries(sp));
    const status = sp.get("status");

    const where: Prisma.OrderWhereInput = {
      ...(q
        ? {
            OR: [
              { orderCode: { contains: q, mode: "insensitive" } },
              { originZone: { contains: q, mode: "insensitive" } },
              { destinationZone: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(status && status in OrderStatus ? { status: status as OrderStatus } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: { client: { select: { companyName: true } }, trip: { select: { id: true, status: true } } },
        orderBy: { bookingDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.order.count({ where }),
    ]);
    return ok(items, pageMeta(page, pageSize, total));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("order:write");
    const body = orderSchema.parse(await req.json());
    const orderCode = `ORD-${Date.now().toString().slice(-8)}`;
    const order = await prisma.order.create({
      data: { ...body, orderCode, createdById: user.id },
    });
    await logActivity({ userId: user.id, action: "CREATE", target: `Order:${order.id}` });
    return created(order);
  } catch (e) {
    return handleError(e);
  }
}
