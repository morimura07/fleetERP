import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError, pageMeta } from "@/lib/api";
import { driverSchema, paginationSchema } from "@/lib/validations";
import { buildOrderBy } from "@/lib/utils";
import { logActivity } from "@/lib/activity";
import { hashPassword } from "@/lib/password";
import { rateLimit } from "@/lib/rate-limit";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("driver:read");
    const sp = req.nextUrl.searchParams;
    const { page, pageSize, q, sort, order } = paginationSchema.parse(
      Object.fromEntries(sp),
    );
    const status = sp.get("status");

    const where: Prisma.DriverWhereInput = {
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
            ],
          }
        : {}),
      ...(status ? { status: status as never } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.driver.findMany({
        where,
        orderBy: buildOrderBy(sort, order, ["name", "joinedAt", "status", "createdAt"], "createdAt"),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.driver.count({ where }),
    ]);

    return ok(items, pageMeta(page, pageSize, total));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("driver:write");
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    if (!rateLimit(`driver:create:${ip}`, 30).success) {
      return handleError(Object.assign(new Error("Too many requests"), { status: 429 }));
    }

    const body = driverSchema.parse(await req.json());

    const driver = await prisma.$transaction(async (tx) => {
      let userId: string | undefined;
      if (body.createLogin && body.password) {
        const account = await tx.user.create({
          data: {
            name: body.name,
            email: body.email.toLowerCase(),
            passwordHash: await hashPassword(body.password),
            role: "DRIVER",
          },
        });
        userId = account.id;
      }
      return tx.driver.create({
        data: {
          name: body.name,
          email: body.email.toLowerCase(),
          phone: body.phone,
          address: body.address,
          contractType: body.contractType,
          joinedAt: body.joinedAt,
          status: body.status,
          userId,
        },
      });
    });

    await logActivity({ userId: user.id, action: "CREATE", target: `Driver:${driver.id}`, ipAddress: ip });
    return created(driver);
  } catch (e) {
    return handleError(e);
  }
}
