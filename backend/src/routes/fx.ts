import { Hono } from "hono";
import { Prisma, RateType } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { exchangeRateSchema, paginationSchema } from "@backend/lib/validations";
import { logActivity } from "@backend/lib/activity";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";

export const fx = new Hono();

fx.get("/", requireAuth, requirePermission("fx:read"), async (c) => {
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const rateType = sp.rateType;

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
  return ok(c, items, pageMeta(page, pageSize, total));
});

fx.post("/", requireAuth, requirePermission("fx:write"), async (c) => {
  const user = c.get("user");
  const body = exchangeRateSchema.parse(await c.req.json());
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
  return created(c, rate);
});
