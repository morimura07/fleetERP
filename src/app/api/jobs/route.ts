import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError, pageMeta } from "@/lib/api";
import { jobSchema, paginationSchema } from "@/lib/validations";
import { buildOrderBy } from "@/lib/utils";
import { logActivity } from "@/lib/activity";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("job:read");
    const sp = req.nextUrl.searchParams;
    const { page, pageSize, q, sort, order } = paginationSchema.parse(Object.fromEntries(sp));
    const status = sp.get("status");
    const clientId = sp.get("clientId");

    const where: Prisma.DeliveryJobWhereInput = {
      ...(q
        ? {
            OR: [
              { jobCode: { contains: q, mode: "insensitive" } },
              { deliveryAddress: { contains: q, mode: "insensitive" } },
              { cargoDescription: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(status ? { status: status as never } : {}),
      ...(clientId ? { clientId } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.deliveryJob.findMany({
        where,
        include: { client: { select: { companyName: true } }, dispatch: { select: { id: true } } },
        orderBy: buildOrderBy(sort, order, ["deliveryDate", "jobCode", "status", "rewardAmount", "createdAt"], "deliveryDate"),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.deliveryJob.count({ where }),
    ]);
    return ok(items, pageMeta(page, pageSize, total));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("job:write");
    const body = jobSchema.parse(await req.json());
    const job = await prisma.deliveryJob.create({ data: body });
    await logActivity({ userId: user.id, action: "CREATE", target: `DeliveryJob:${job.id}` });
    return created(job);
  } catch (e) {
    return handleError(e);
  }
}
