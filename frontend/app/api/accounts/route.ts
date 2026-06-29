import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError, pageMeta } from "@/lib/api";
import { accountSchema, paginationSchema } from "@/lib/validations";
import { buildOrderBy } from "@/lib/utils";
import { logActivity } from "@/lib/activity";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("account:read");
    const sp = req.nextUrl.searchParams;
    const { page, pageSize, q, sort, order } = paginationSchema.parse(Object.fromEntries(sp));

    const where: Prisma.AccountWhereInput = q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      prisma.account.findMany({
        where,
        orderBy: buildOrderBy(sort, order, ["code", "name", "createdAt"], "code"),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.account.count({ where }),
    ]);
    return ok(items, pageMeta(page, pageSize, total));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("account:write");
    const body = accountSchema.parse(await req.json());
    const account = await prisma.account.create({ data: body });
    await logActivity({ userId: user.id, action: "CREATE", target: `Account:${account.id}` });
    return created(account);
  } catch (e) {
    return handleError(e);
  }
}
