import { Hono } from "hono";
import { z } from "zod";
import { Prisma, RateType } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { exchangeRateSchema, paginationSchema } from "@backend/lib/validations";
import { logActivity } from "@backend/lib/activity";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { can } from "@backend/lib/rbac";
import { AuthError } from "@backend/lib/errors";
import { areaScope, areaForWrite } from "@backend/lib/scope";
import { revaluePeriod } from "@backend/services/fx-revaluation";
import { ok, created, pageMeta } from "@backend/lib/http";

export const fx = new Hono();

const revalSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  baseCurrency: z.string().length(3).optional(),
  rateType: z.nativeEnum(RateType).optional(),
  post: z.boolean().optional(), // false/omitted = preview only
});

fx.get("/", requireAuth, requirePermission("fx:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const rateType = sp.rateType;

  const where: Prisma.ExchangeRateWhereInput = {
    ...areaScope(user),
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
      dataAreaId: areaForWrite(user, body.dataAreaId),
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

/**
 * Period-end FX revaluation (M8). Preview (post:false) needs fx:read; committing
 * the adjusting entry needs fx:write. Scoped to the caller's legal entity.
 */
fx.post("/revalue", requireAuth, async (c) => {
  const user = c.get("user");
  const body = revalSchema.parse(await c.req.json());

  // Posting is a finance action; previewing only needs read.
  const perm = body.post ? "fx:write" : "fx:read";
  if (!can(user.role, perm)) throw new AuthError("You do not have permission", 403);

  const result = await revaluePeriod({
    dataAreaId: user.dataAreaId,
    year: body.year,
    month: body.month,
    baseCurrency: body.baseCurrency,
    rateType: body.rateType,
    post: body.post,
    createdById: user.id,
  });

  if (result.posted) {
    await logActivity({
      userId: user.id,
      action: "FX_REVALUE",
      target: `FxRevaluation:${user.dataAreaId}:${body.year}-${body.month}`,
      detail: { voucherNumber: result.posted.voucherNumber, totalGain: result.totalGain },
    });
  }
  return ok(c, result);
});
