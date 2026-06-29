import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError, pageMeta } from "@/lib/api";
import { customerSchema, paginationSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("customer:read");
    const sp = req.nextUrl.searchParams;
    const { page, pageSize, q } = paginationSchema.parse(Object.fromEntries(sp));

    const where: Prisma.CustomerWhereInput = q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { tin: { contains: q, mode: "insensitive" } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      prisma.customer.findMany({ where, orderBy: { code: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.customer.count({ where }),
    ]);
    return ok(items, pageMeta(page, pageSize, total));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("customer:write");
    const body = customerSchema.parse(await req.json());
    const customer = await prisma.customer.create({
      data: { ...body, email: body.email || null },
    });
    await logActivity({ userId: user.id, action: "CREATE", target: `Customer:${customer.id}` });
    return created(customer);
  } catch (e) {
    return handleError(e);
  }
}
