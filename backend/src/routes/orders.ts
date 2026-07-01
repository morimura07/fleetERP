import { Hono } from "hono";
import { Prisma, OrderStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { orderSchema, paginationSchema } from "@backend/lib/validations";
import { logActivity } from "@backend/lib/activity";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { areaScope, areaForWrite } from "@backend/lib/scope";
import { ok, created, pageMeta } from "@backend/lib/http";

/**
 * Orders routes — reference port of src/app/api/orders/route.ts.
 * The service/prisma/zod logic is reused verbatim; only the HTTP plumbing
 * (NextRequest → Hono Context, requirePermission middleware) changes.
 */
export const orders = new Hono();

orders.get("/", requireAuth, requirePermission("order:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const status = sp.status;

  const where: Prisma.OrderWhereInput = {
    ...areaScope(user),
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
  return ok(c, items, pageMeta(page, pageSize, total));
});

orders.post("/", requireAuth, requirePermission("order:write"), async (c) => {
  const user = c.get("user");
  const body = orderSchema.parse(await c.req.json());
  const orderCode = `ORD-${Date.now().toString().slice(-8)}`;
  const order = await prisma.order.create({ data: { ...body, dataAreaId: areaForWrite(user, body.dataAreaId), orderCode, createdById: user.id } });
  await logActivity({ userId: user.id, action: "CREATE", target: `Order:${order.id}` });
  return created(c, order);
});
