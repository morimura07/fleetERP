import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError, pageMeta } from "@/lib/api";
import { exchangeRateSchema, paginationSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import { Prisma, RateType } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("fx:read");
    const sp = req.nextUrl.searchParams;
    const { page, pageSize, q } = paginationSchema.parse(Object.fromEntries(sp));
    const rateType = sp.get("rateType");

    const where: Prisma.ExchangeRateWhereInput = {
      ...(q ? { currency: { contains: q.toUpperCase() } } : {}),
      ...(rateType && rateType in RateType ? { rateType: rateType as RateType } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.exchangeRate.findMany({
        where,
        orderBy: [{ validFrom: "desc" }, { currency: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.exchangeRate.count({ where }),
    ]);
    return ok(items, pageMeta(page, pageSize, total));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("fx:write");
    const body = exchangeRateSchema.parse(await req.json());
    const rate = await prisma.exchangeRate.create({
      data: {
        dataAreaId: body.dataAreaId,
        currency: body.currency.toUpperCase(),
        baseCurrency: body.baseCurrency.toUpperCase(),
        rateType: body.rateType,
        rate: body.rate,
        validFrom: body.validFrom,
      },
    });
    await logActivity({ userId: user.id, action: "CREATE", target: `ExchangeRate:${rate.id}` });
    return created(rate);
  } catch (e) {
    return handleError(e);
  }
}
