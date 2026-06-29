import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError, pageMeta } from "@/lib/api";
import { clientSchema, paginationSchema } from "@/lib/validations";
import { buildOrderBy } from "@/lib/utils";
import { logActivity } from "@/lib/activity";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("client:read");
    const sp = req.nextUrl.searchParams;
    const { page, pageSize, q, sort, order } = paginationSchema.parse(Object.fromEntries(sp));

    const where: Prisma.ClientWhereInput = q
      ? {
          OR: [
            { companyName: { contains: q, mode: "insensitive" } },
            { contactPerson: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      prisma.client.findMany({
        where,
        orderBy: buildOrderBy(sort, order, ["companyName", "createdAt"], "createdAt"),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.client.count({ where }),
    ]);
    return ok(items, pageMeta(page, pageSize, total));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("client:write");
    const body = clientSchema.parse(await req.json());
    const client = await prisma.client.create({ data: body });
    await logActivity({ userId: user.id, action: "CREATE", target: `Client:${client.id}` });
    return created(client);
  } catch (e) {
    return handleError(e);
  }
}
