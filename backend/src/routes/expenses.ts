import { Hono } from "hono";
import { Prisma, ExpenseClaimStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { expenseClaimSchema, paginationSchema } from "@backend/lib/validations";
import { createClaim, submitClaim, reviewClaim, postClaim } from "@backend/services/expense";
import { logActivity } from "@backend/lib/activity";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";

export const expenses = new Hono();

expenses.get("/", requireAuth, requirePermission("expense:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const status = sp.status;

  const where: Prisma.ExpenseClaimWhereInput = {
    ...areaScope(user),
    ...(q ? { OR: [{ claimNumber: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }] } : {}),
    ...(status && status in ExpenseClaimStatus ? { status: status as ExpenseClaimStatus } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.expenseClaim.findMany({
      where,
      include: { driver: { select: { name: true } }, _count: { select: { lines: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.expenseClaim.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

expenses.post("/", requireAuth, requirePermission("expense:write"), async (c) => {
  const user = c.get("user");
  const body = expenseClaimSchema.parse(await c.req.json());
  const claim = await createClaim({
    dataAreaId: areaForWrite(user, body.dataAreaId),
    driverId: body.driverId ?? null,
    title: body.title,
    currency: body.currency,
    advanceId: body.advanceId ?? null,
    costCenter: body.costCenter || null,
    branch: body.branch || null,
    lines: body.lines.map((l) => ({ ...l, receiptUrl: l.receiptUrl ?? null })),
    createdById: user.id,
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `ExpenseClaim:${claim.id}` });
  return created(c, claim);
});

expenses.get("/:id", requireAuth, requirePermission("expense:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const claim = await prisma.expenseClaim.findUnique({
    where: { id },
    include: {
      lines: true,
      driver: { select: { name: true } },
      advance: { select: { reference: true, amount: true, type: true } },
    },
  });
  assertSameArea(user, claim);
  return ok(c, claim);
});

/** DRAFT → SUBMITTED. */
expenses.post("/:id/submit", requireAuth, requirePermission("expense:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.expenseClaim.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const claim = await submitClaim(id);
  await logActivity({ userId: user.id, action: "SUBMIT", target: `ExpenseClaim:${id}` });
  return ok(c, claim);
});

/** SUBMITTED → APPROVED | REJECTED. Body: { approve: boolean } */
expenses.post("/:id/review", requireAuth, requirePermission("expense:approve"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.expenseClaim.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const { approve } = (await c.req.json()) as { approve?: boolean };
  const claim = await reviewClaim(id, approve !== false, user.id);
  await logActivity({ userId: user.id, action: approve !== false ? "APPROVE" : "REJECT", target: `ExpenseClaim:${id}` });
  return ok(c, claim);
});

/** Post an approved claim (reconciles the advance). */
expenses.post("/:id/post", requireAuth, requirePermission("expense:approve"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.expenseClaim.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const result = await postClaim(id, user.id);
  await logActivity({ userId: user.id, action: "POST", target: `ExpenseClaim:${id}`, detail: { voucherNumber: result.entry.voucherNumber } });
  return ok(c, { voucherNumber: result.entry.voucherNumber, reconciled: result.reconciliation.reconciled.toFixed(2) });
});
