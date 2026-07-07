import { Hono } from "hono";
import { Prisma, AssetStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { fixedAssetSchema, depreciationRunSchema, assetDisposalSchema, paginationSchema } from "@backend/lib/validations";
import { runDepreciation, disposeAsset, bookValue } from "@backend/services/fixed-assets";
import { logActivity } from "@backend/lib/activity";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";

export const assets = new Hono();

/** List the asset register (paginated, searchable, filterable by status). */
assets.get("/", requireAuth, requirePermission("asset:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const status = sp.status;

  const where: Prisma.FixedAssetWhereInput = {
    ...areaScope(user),
    ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
    ...(status && status in AssetStatus ? { status: status as AssetStatus } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.fixedAsset.findMany({
      where,
      orderBy: { code: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.fixedAsset.count({ where }),
  ]);

  // Surface current net book value on each row for the register view.
  const rows = items.map((a) => ({
    ...a,
    bookValue: bookValue(a.acquisitionCost, a.accumulatedDepreciation).toFixed(2),
  }));
  return ok(c, rows, pageMeta(page, pageSize, total));
});

/** Register a new asset. */
assets.post("/", requireAuth, requirePermission("asset:write"), async (c) => {
  const user = c.get("user");
  const body = fixedAssetSchema.parse(await c.req.json());
  const asset = await prisma.fixedAsset.create({
    data: {
      dataAreaId: areaForWrite(user, body.dataAreaId),
      code: body.code,
      name: body.name,
      category: body.category,
      acquisitionCost: new Prisma.Decimal(body.acquisitionCost),
      residualValue: new Prisma.Decimal(body.residualValue),
      usefulLifeMonths: body.usefulLifeMonths,
      acquisitionDate: body.acquisitionDate,
      inServiceDate: body.inServiceDate,
      assetAccountCode: body.assetAccountCode,
      accumDepCode: body.accumDepCode,
      expenseCode: body.expenseCode,
      createdById: user.id,
    },
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `FixedAsset:${asset.id}` });
  return created(c, asset);
});

/** Asset detail with its depreciation schedule (entries). */
assets.get("/:id", requireAuth, requirePermission("asset:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const asset = await prisma.fixedAsset.findUnique({
    where: { id },
    include: {
      entries: { orderBy: { period: "asc" }, include: { journalEntry: { select: { voucherNumber: true } } } },
      disposalEntry: { select: { voucherNumber: true } },
    },
  });
  assertSameArea(user, asset);
  return ok(c, { ...asset, bookValue: bookValue(asset.acquisitionCost, asset.accumulatedDepreciation).toFixed(2) });
});

/**
 * Run depreciation for a period across every eligible asset in the active company.
 * Body: { period: "YYYY-MM" }. Idempotent per (asset, period).
 */
assets.post("/depreciation/run", requireAuth, requirePermission("asset:approve"), async (c) => {
  const user = c.get("user");
  const { period } = depreciationRunSchema.parse(await c.req.json());
  const dataAreaId = areaForWrite(user);
  const result = await runDepreciation(dataAreaId, period, user.id);
  await logActivity({
    userId: user.id,
    action: "DEPRECIATE",
    target: `FixedAsset:${dataAreaId}:${period}`,
    detail: { charged: result.charged.length, total: result.totalCharged },
  });
  return ok(c, result);
});

/** Dispose of an asset. Body: { proceeds, disposalDate }. */
assets.post("/:id/dispose", requireAuth, requirePermission("asset:approve"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.fixedAsset.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const body = assetDisposalSchema.parse(await c.req.json());
  const asset = await disposeAsset(existing.dataAreaId, id, { proceeds: body.proceeds, disposalDate: body.disposalDate }, user.id);
  await logActivity({ userId: user.id, action: "DISPOSE", target: `FixedAsset:${id}`, detail: { proceeds: body.proceeds } });
  return ok(c, asset);
});
