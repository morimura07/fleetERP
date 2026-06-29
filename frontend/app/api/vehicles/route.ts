import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError, pageMeta } from "@/lib/api";
import { vehicleSchema, paginationSchema } from "@/lib/validations";
import { buildOrderBy } from "@/lib/utils";
import { logActivity } from "@/lib/activity";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("vehicle:read");
    const sp = req.nextUrl.searchParams;
    const { page, pageSize, q, sort, order } = paginationSchema.parse(Object.fromEntries(sp));
    const status = sp.get("status");

    const where: Prisma.VehicleWhereInput = {
      ...(q
        ? {
            OR: [
              { vehicleNumber: { contains: q, mode: "insensitive" } },
              { plateNumber: { contains: q, mode: "insensitive" } },
              { maker: { contains: q, mode: "insensitive" } },
              { model: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(status ? { status: status as never } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.vehicle.findMany({
        where,
        orderBy: buildOrderBy(sort, order, ["vehicleNumber", "inspectionExpiry", "insuranceExpiry", "createdAt"], "createdAt"),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.vehicle.count({ where }),
    ]);
    return ok(items, pageMeta(page, pageSize, total));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("vehicle:write");
    const body = vehicleSchema.parse(await req.json());
    const vehicle = await prisma.vehicle.create({ data: body });
    await logActivity({ userId: user.id, action: "CREATE", target: `Vehicle:${vehicle.id}` });
    return created(vehicle);
  } catch (e) {
    return handleError(e);
  }
}
