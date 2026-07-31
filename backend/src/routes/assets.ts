import { Hono } from "hono";
import { Prisma, AssetStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { fixedAssetSchema, depreciationRunSchema, assetDisposalSchema, paginationSchema, assetAssignSchema, assetReturnSchema } from "@backend/lib/validations";
import { runDepreciation, disposeAsset, bookValue } from "@backend/services/fixed-assets";
import { assignAsset, returnAsset, getAssetCustody, warrantyStatus } from "@backend/services/asset-custody";
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
      // The open assignment (returnedAt = null) is the current custodian.
      include: { assignments: { where: { returnedAt: null }, take: 1, include: { employee: { select: { name: true } } } } },
      orderBy: { code: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.fixedAsset.count({ where }),
  ]);

  // Surface net book value, current custodian, and warranty status per row.
  const rows = items.map(({ assignments, ...a }) => {
    const open = assignments[0];
    return {
      ...a,
      bookValue: bookValue(a.acquisitionCost, a.accumulatedDepreciation).toFixed(2),
      custodian: open ? (open.employee?.name ?? open.custodian) : null,
      warrantyStatus: warrantyStatus(a.warrantyExpiresAt),
    };
  });
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
      warrantyProvider: body.warrantyProvider || null,
      warrantyExpiresAt: body.warrantyExpiresAt ?? null,
      createdById: user.id,
    },
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `FixedAsset:${asset.id}` });
  return created(c, asset);
});

// ── Custody / assignment (M19) ──

/** Current custodian + assignment history for an asset. */
assets.get("/:id/custody", requireAuth, requirePermission("asset:read"), async (c) => {
  const user = c.get("user");
  return ok(c, await getAssetCustody(areaForWrite(user), c.req.param("id")));
});

/** Assign the asset to a custodian (closes any current holder). */
assets.post("/:id/assign", requireAuth, requirePermission("asset:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = assetAssignSchema.parse(await c.req.json());
  const assignment = await assignAsset({
    dataAreaId: areaForWrite(user), assetId: id,
    employeeId: body.employeeId || null, custodian: body.custodian, location: body.location || null,
    assignedAt: body.assignedAt, note: body.note || null, createdById: user.id,
  });
  await logActivity({ userId: user.id, action: "ASSIGN_ASSET", target: `FixedAsset:${id}`, detail: { custodian: body.custodian } });
  return created(c, assignment);
});

/** Return the asset (close its open assignment). */
assets.post("/:id/return", requireAuth, requirePermission("asset:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = assetReturnSchema.parse(await c.req.json());
  const result = await returnAsset(areaForWrite(user), id, body.returnedAt);
  await logActivity({ userId: user.id, action: "RETURN_ASSET", target: `FixedAsset:${id}` });
  return ok(c, result);
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
