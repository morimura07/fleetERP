import { Hono } from "hono";
import { Prisma, RequisitionStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import {
  requisitionSchema, reviewSchema, decisionSchema, budgetOverrideSchema, doaTierSchema, doaTierUpdateSchema, procurementPolicySchema, paginationSchema,
} from "@backend/lib/validations";
import {
  createRequisition, updateRequisition, submitRequisition, reviewRequisition, overrideBudget, recheckBudget, decideRequisition,
  cancelRequisition, getRequisition,
} from "@backend/services/requisition";
import { policyFor, tiersFor, matrixStatus, queueFor, decide } from "@backend/services/doa";
import { logActivity } from "@backend/lib/activity";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { requireVersion, updateWithVersion } from "@backend/lib/concurrency";
import { ok, created, pageMeta } from "@backend/lib/http";
import { AuthError } from "@backend/lib/errors";

/**
 * /api/requisitions: purchase requisitions, the DOA queue and the
 * procurement settings (tiers and policy).
 */
export const requisitions = new Hono();

// ── Requisitions ─────────────────────────────────────────────────────────────

requisitions.get("/", requireAuth, requirePermission("procurement:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const where: Prisma.RequisitionWhereInput = {
    ...areaScope(user),
    ...(sp.status && sp.status in RequisitionStatus ? { status: sp.status as RequisitionStatus } : {}),
    ...(sp.mine === "true" ? { requestedById: user.id } : {}),
    ...(q ? { OR: [{ prNumber: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }, { department: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.requisition.findMany({ where, include: { _count: { select: { lines: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.requisition.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

requisitions.post("/", requireAuth, requirePermission("procurement:write"), async (c) => {
  const user = c.get("user");
  const body = requisitionSchema.parse(await c.req.json());
  const r = await createRequisition(areaForWrite(user, body.dataAreaId), user, body);
  await logActivity({ userId: user.id, action: "CREATE", target: `Requisition:${r.id}`, detail: { prNumber: r.prNumber } });
  return created(c, r);
});

async function loadArea(id: string) {
  const r = await prisma.requisition.findUnique({ where: { id }, select: { dataAreaId: true } });
  return r;
}

requisitions.get("/:id", requireAuth, requirePermission("procurement:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  assertSameArea(user, await loadArea(id));
  return ok(c, await getRequisition(id));
});

requisitions.put("/:id", requireAuth, requirePermission("procurement:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  assertSameArea(user, await loadArea(id));
  const raw = await c.req.json();
  const version = requireVersion(raw);
  const body = requisitionSchema.parse(raw);
  const r = await updateRequisition(id, version, user, body);
  await logActivity({ userId: user.id, action: "UPDATE", target: `Requisition:${id}` });
  return ok(c, r);
});

const transition = (path: string, permission: Parameters<typeof requirePermission>[0], action: string,
  fn: (id: string, user: Parameters<typeof createRequisition>[1], body: unknown) => Promise<unknown>) => {
  requisitions.post(`/:id/${path}`, requireAuth, requirePermission(permission), async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    assertSameArea(user, await loadArea(id));
    const body = await c.req.json().catch(() => ({}));
    const r = await fn(id, user, body);
    await logActivity({ userId: user.id, action, target: `Requisition:${id}` });
    return ok(c, r);
  });
};

transition("submit", "procurement:write", "SUBMIT", (id, user) => submitRequisition(id, user));
transition("review", "procurement:approve", "REVIEW", (id, user, body) => { const b = reviewSchema.parse(body); return reviewRequisition(id, user, b.pass, b.note); });
transition("budget-override", "budget:write", "BUDGET_OVERRIDE", (id, user, body) => overrideBudget(id, user, budgetOverrideSchema.parse(body).note));
transition("budget-recheck", "procurement:write", "BUDGET_RECHECK", (id, user) => recheckBudget(id, user));
transition("decide", "procurement:read", "DECIDE", (id, user, body) => { const b = decisionSchema.parse(body); return decideRequisition(id, user, b.approve, b.note); });
transition("cancel", "procurement:write", "CANCEL", (id, user, body) => cancelRequisition(id, user, (body as { reason?: string })?.reason));

// ── Approval queue ───────────────────────────────────────────────────────────

/** Requests this user may sign now, across subject types. */
requisitions.get("/approvals/queue", requireAuth, requirePermission("procurement:read"), async (c) => {
  const user = c.get("user");
  return ok(c, await queueFor(user, areaScope(user)));
});

/** Sign one request directly (the queue's button). */
requisitions.post("/approvals/:requestId/decide", requireAuth, requirePermission("procurement:read"), async (c) => {
  const user = c.get("user");
  const requestId = c.req.param("requestId");
  const req = await prisma.approvalRequest.findUnique({ where: { id: requestId }, select: { dataAreaId: true, subjectType: true, subjectId: true } });
  assertSameArea(user, req);
  const body = decisionSchema.parse(await c.req.json());
  // A requisition's status follows its request; route through its service.
  if (req.subjectType === "REQUISITION") {
    const r = await decideRequisition(req.subjectId, user, body.approve, body.note);
    await logActivity({ userId: user.id, action: body.approve ? "APPROVE" : "REJECT", target: `Requisition:${req.subjectId}` });
    return ok(c, { request: r.approvals[0], subject: r });
  }
  const result = await decide(requestId, user, body.approve, body.note);
  await logActivity({ userId: user.id, action: body.approve ? "APPROVE" : "REJECT", target: `ApprovalRequest:${requestId}` });
  return ok(c, result);
});

// ── Settings: DOA tiers and policy ───────────────────────────────────────────

requisitions.get("/settings/doa", requireAuth, requirePermission("procurement:read"), async (c) => {
  const user = c.get("user");
  const dataAreaId = areaForWrite(user, c.req.query("dataAreaId"));
  const [status, policy] = await Promise.all([matrixStatus(dataAreaId), policyFor(dataAreaId)]);
  return ok(c, { ...status, policy });
});

requisitions.post("/settings/doa/tiers", requireAuth, requirePermission("company:manage"), async (c) => {
  const user = c.get("user");
  const raw = await c.req.json();
  const body = doaTierSchema.parse(raw);
  const dataAreaId = areaForWrite(user, typeof raw.dataAreaId === "string" ? raw.dataAreaId : undefined);
  await tiersFor(dataAreaId); // seed first so the new tier joins a complete matrix
  const tier = await prisma.doaTier.create({ data: { dataAreaId, ...body, createdById: user.id } });
  await logActivity({ userId: user.id, action: "CREATE", target: `DoaTier:${tier.id}`, detail: { name: tier.name } });
  return created(c, tier);
});

requisitions.patch("/settings/doa/tiers/:id", requireAuth, requirePermission("company:manage"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.doaTier.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const raw = await c.req.json();
  const version = requireVersion(raw);
  const body = doaTierUpdateSchema.parse(raw);
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (v !== undefined) data[k] = v;
  // The band and signature rules apply to the merged row, not the patch.
  const current = await prisma.doaTier.findUniqueOrThrow({ where: { id } });
  const merged = { ...current, ...data } as { minAmount: Prisma.Decimal.Value; maxAmount: Prisma.Decimal.Value | null; minSignatures: number; approverRoles: string[] };
  if (merged.maxAmount != null && new Prisma.Decimal(merged.maxAmount).lessThan(merged.minAmount)) throw new AuthError("Maximum must not be below minimum", 422);
  if (merged.minSignatures > merged.approverRoles.length) throw new AuthError("Cannot need more signatures than there are roles", 422);
  const tier = await updateWithVersion(prisma.doaTier, id, version, user.id, data);
  await logActivity({ userId: user.id, action: "UPDATE", target: `DoaTier:${id}` });
  return ok(c, tier);
});

requisitions.delete("/settings/doa/tiers/:id", requireAuth, requirePermission("company:manage"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.doaTier.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const inUse = await prisma.approvalRequest.count({ where: { tierId: id, status: "PENDING" } });
  if (inUse) throw new AuthError(`${inUse} request(s) are waiting on this tier; resolve them first or deactivate the tier`, 409);
  await prisma.doaTier.delete({ where: { id } });
  await logActivity({ userId: user.id, action: "DELETE", target: `DoaTier:${id}` });
  return ok(c, { ok: true });
});

requisitions.patch("/settings/policy", requireAuth, requirePermission("company:manage"), async (c) => {
  const user = c.get("user");
  const raw = await c.req.json();
  const version = requireVersion(raw);
  const body = procurementPolicySchema.parse(raw);
  const dataAreaId = areaForWrite(user, typeof raw.dataAreaId === "string" ? raw.dataAreaId : undefined);
  const current = await policyFor(dataAreaId);
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (v !== undefined) data[k] = v;
  const policy = await updateWithVersion(prisma.procurementPolicy, current.id, version, user.id, data);
  await logActivity({ userId: user.id, action: "UPDATE", target: `ProcurementPolicy:${dataAreaId}` });
  return ok(c, policy);
});
