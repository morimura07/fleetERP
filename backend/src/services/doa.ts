import { Prisma } from "@prisma/client";
import type { ApprovalSubject, DoaTier, ProcurementPolicy, ApprovalRequest, ApprovalDecision } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import type { AuthUser } from "@backend/lib/auth";
import { resolveRate } from "@backend/services/fx";
import {
  DEFAULT_TIERS, tierFor, planDecisions, outcome, openDecisionsFor, needsRetrigger, matrixProblems, type TierLike,
} from "@backend/services/doa-engine";

/**
 * Delegation of authority, the database-bound half: the policy and tiers a
 * company keeps, opening a request for a subject, recording decisions, and
 * the queue an approver sees. The rules live in doa-engine.ts.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export async function policyFor(dataAreaId: string): Promise<ProcurementPolicy> {
  return (await prisma.procurementPolicy.findUnique({ where: { dataAreaId } }))
    ?? prisma.procurementPolicy.create({ data: { dataAreaId } });
}

/** The company's tiers, seeded from the document's matrix on first use. */
export async function tiersFor(dataAreaId: string): Promise<DoaTier[]> {
  const existing = await prisma.doaTier.findMany({ where: { dataAreaId }, orderBy: [{ sortOrder: "asc" }, { minAmount: "asc" }] });
  if (existing.length > 0) return existing;
  await prisma.doaTier.createMany({
    data: DEFAULT_TIERS.map((t) => ({
      dataAreaId, name: t.name, minAmount: t.minAmount, maxAmount: t.maxAmount, currency: "USD",
      approverRoles: t.approverRoles, mode: t.mode, minSignatures: t.minSignatures, sortOrder: t.sortOrder, isActive: t.isActive,
      requiresBudgetSignOff: t.requiresBudgetSignOff ?? false, requiresBidSummary: t.requiresBidSummary ?? false, autoRelease: t.autoRelease ?? false,
    })),
  });
  return prisma.doaTier.findMany({ where: { dataAreaId }, orderBy: [{ sortOrder: "asc" }, { minAmount: "asc" }] });
}

/** Tiers plus what is wrong with them and which roles nobody holds. */
export async function matrixStatus(dataAreaId: string) {
  const tiers = await tiersFor(dataAreaId);
  const roleKeys = [...new Set(tiers.flatMap((t) => t.approverRoles))];
  const [customRoles, holders] = await Promise.all([
    prisma.rbacRole.findMany({ where: { key: { in: roleKeys } }, select: { key: true, name: true } }),
    prisma.user.groupBy({ by: ["roleKey"], where: { dataAreaId, isActive: true, roleKey: { in: roleKeys } }, _count: { _all: true } }),
  ]);
  const systemRoles = ["SUPER_ADMIN", "ADMIN", "DISPATCHER", "FINANCE", "DRIVER", "STAFF"];
  const held = new Set(holders.map((h) => h.roleKey));
  const roles = roleKeys.map((key) => ({
    key,
    name: customRoles.find((r) => r.key === key)?.name ?? (systemRoles.includes(key) ? key : null),
    exists: systemRoles.includes(key) || customRoles.some((r) => r.key === key),
    holders: systemRoles.includes(key) ? null : (holders.find((h) => h.roleKey === key)?._count._all ?? 0),
  }));
  const problems = matrixProblems(tiers);
  for (const r of roles) {
    if (!r.exists) problems.push(`Role "${r.key}" does not exist yet; create it under Roles and assign it to the right people.`);
    else if (r.holders === 0 && !held.has(r.key)) problems.push(`Nobody holds the role "${r.name ?? r.key}"; requests needing it will wait forever.`);
  }
  // Every role a tier could name, for the settings screen's picker.
  const allCustom = await prisma.rbacRole.findMany({ select: { key: true, name: true, isSystem: true }, orderBy: { name: "asc" } });
  const availableRoles = [
    ...allCustom.map((r) => ({ key: r.key, name: r.name })),
    ...systemRoles.filter((k) => !allCustom.some((r) => r.key === k)).map((k) => ({ key: k, name: k })),
  ];
  return { tiers, roles, problems, availableRoles };
}

/** The roles a user signs with: their custom role, and their system role. */
export function rolesOf(user: Pick<AuthUser, "role" | "roleKey">): string[] {
  return [user.roleKey, user.role].filter((r): r is string => !!r);
}

/**
 * An amount in the tier currency at today's rate. The rate table is the
 * company's own; a missing rate is an error, not a silent 1:1, because the
 * tier chosen depends on it.
 */
export async function toTierCurrency(amount: Prisma.Decimal.Value, currency: string, dataAreaId: string, policy: ProcurementPolicy, asOf = new Date()) {
  const base = policy.thresholdCurrency;
  if (currency === base) return { amountBase: D(amount).toDecimalPlaces(2), baseCurrency: base, rate: D(1) };
  const rate = await resolveRate(currency, { dataAreaId, baseCurrency: base, rateType: "SPOT", asOf });
  if (!rate) throw new AuthError(`No ${currency} to ${base} spot rate is configured for ${dataAreaId}; add one under FX rates before approving in ${currency}`, 422);
  return { amountBase: D(amount).times(rate).toDecimalPlaces(2), baseCurrency: base, rate };
}

export interface OpenRequestInput {
  dataAreaId: string;
  subjectType: ApprovalSubject;
  subjectId: string;
  subjectRef: string;
  amount: Prisma.Decimal.Value;
  currency: string;
  reason: string;
  requestedById: string;
}

export type RequestWithDecisions = ApprovalRequest & { decisions: ApprovalDecision[]; tier: DoaTier | null };

/**
 * Put a subject through the matrix. Any pending request for the same
 * subject is superseded first, so a change order never leaves two trips
 * open. Returns the new request with its planned decisions.
 */
export async function openRequest(input: OpenRequestInput): Promise<RequestWithDecisions> {
  const [policy, tiers] = await Promise.all([policyFor(input.dataAreaId), tiersFor(input.dataAreaId)]);
  const { amountBase, baseCurrency, rate } = await toTierCurrency(input.amount, input.currency, input.dataAreaId, policy);
  const tier = tierFor(amountBase, tiers);
  if (!tier) throw new AuthError(`No approval tier covers ${amountBase.toFixed(2)} ${baseCurrency}; fix the DOA matrix under Procurement settings`, 422);
  const plan = planDecisions(tier);
  return prisma.$transaction(async (tx) => {
    await tx.approvalRequest.updateMany({
      where: { subjectType: input.subjectType, subjectId: input.subjectId, status: "PENDING" },
      data: { status: "SUPERSEDED", resolvedAt: new Date() },
    });
    await tx.approvalDecision.updateMany({
      where: { request: { subjectType: input.subjectType, subjectId: input.subjectId, status: "SUPERSEDED" }, status: "PENDING" },
      data: { status: "SKIPPED" },
    });
    return tx.approvalRequest.create({
      data: {
        dataAreaId: input.dataAreaId, subjectType: input.subjectType, subjectId: input.subjectId, subjectRef: input.subjectRef,
        amount: D(input.amount).toDecimalPlaces(2), currency: input.currency, amountBase, baseCurrency, rate,
        tierId: tier.id, tierName: tier.name, reason: input.reason, requestedById: input.requestedById,
        decisions: { create: plan.map((p) => ({ step: p.step, roleKey: p.roleKey })) },
      },
      include: { decisions: { orderBy: [{ step: "asc" }, { roleKey: "asc" }] }, tier: true },
    });
  });
}

/** The pending request for a subject, if any. */
export async function pendingRequestFor(subjectType: ApprovalSubject, subjectId: string): Promise<RequestWithDecisions | null> {
  return prisma.approvalRequest.findFirst({
    where: { subjectType, subjectId, status: "PENDING" },
    include: { decisions: { orderBy: [{ step: "asc" }, { roleKey: "asc" }] }, tier: true },
  });
}

export async function requestsFor(subjectType: ApprovalSubject, subjectId: string): Promise<RequestWithDecisions[]> {
  return prisma.approvalRequest.findMany({
    where: { subjectType, subjectId },
    include: { decisions: { orderBy: [{ step: "asc" }, { roleKey: "asc" }] }, tier: true },
    orderBy: { createdAt: "desc" },
  });
}

/** Whether a change order should re-open the matrix for a subject. */
export async function changeNeedsRetrigger(dataAreaId: string, oldAmountBase: Prisma.Decimal.Value, newAmountBase: Prisma.Decimal.Value) {
  const [policy, tiers] = await Promise.all([policyFor(dataAreaId), tiersFor(dataAreaId)]);
  return needsRetrigger(oldAmountBase, newAmountBase, tiers as TierLike[], policy);
}

export interface DecisionResult {
  request: RequestWithDecisions;
  outcome: "PENDING" | "APPROVED" | "REJECTED";
}

/**
 * Record one signature. The user must hold the role of a decision that is
 * open now (sequential tiers open one step at a time). The request resolves
 * as soon as the decisions add up; remaining pending decisions are skipped.
 */
export async function decide(requestId: string, user: AuthUser, approve: boolean, note?: string | null): Promise<DecisionResult> {
  const request = await prisma.approvalRequest.findUnique({ where: { id: requestId }, include: { decisions: true, tier: true } });
  if (!request) throw new AuthError("Approval request not found", 404);
  if (request.status !== "PENDING") throw new AuthError(`This request is already ${request.status.toLowerCase()}`, 409);
  const tier: Pick<TierLike, "mode" | "minSignatures" | "approverRoles"> = request.tier ?? { mode: "ANY", minSignatures: 1, approverRoles: request.decisions.map((d) => d.roleKey) };
  const open = openDecisionsFor(tier, request.decisions, rolesOf(user));
  if (open.length === 0) {
    const pending = request.decisions.filter((d) => d.status === "PENDING");
    if (pending.length === 0) throw new AuthError("Nothing left to decide on this request", 409);
    const mine = request.decisions.filter((d) => rolesOf(user).includes(d.roleKey));
    if (mine.length === 0) throw new AuthError(`This request needs ${pending.map((d) => d.roleKey).join(" and ")}; you do not hold those roles`, 403);
    throw new AuthError("It is not your step yet; an earlier signature is still pending", 409);
  }
  const mine = open[0];
  return prisma.$transaction(async (tx) => {
    await tx.approvalDecision.update({
      where: { id: mine.id },
      data: { status: approve ? "APPROVED" : "REJECTED", userId: user.id, userName: user.name, note: note || null, decidedAt: new Date() },
    });
    const decisions = await tx.approvalDecision.findMany({ where: { requestId } });
    const result = outcome(tier, decisions);
    if (result !== "PENDING") {
      await tx.approvalDecision.updateMany({ where: { requestId, status: "PENDING" }, data: { status: "SKIPPED" } });
      await tx.approvalRequest.update({ where: { id: requestId }, data: { status: result, resolvedAt: new Date() } });
    }
    const fresh = await tx.approvalRequest.findUniqueOrThrow({ where: { id: requestId }, include: { decisions: { orderBy: [{ step: "asc" }, { roleKey: "asc" }] }, tier: true } });
    return { request: fresh, outcome: result };
  });
}

/** Pending requests with a decision this user may sign now. */
export async function queueFor(user: AuthUser, where: Prisma.ApprovalRequestWhereInput) {
  const roles = rolesOf(user);
  const requests = await prisma.approvalRequest.findMany({
    where: { ...where, status: "PENDING", decisions: { some: { roleKey: { in: roles }, status: "PENDING" } } },
    include: { decisions: { orderBy: [{ step: "asc" }, { roleKey: "asc" }] }, tier: true },
    orderBy: { createdAt: "asc" },
  });
  // Sequential tiers: keep only the ones whose open step is this user's.
  return requests.filter((r) => openDecisionsFor(r.tier ?? { mode: "ANY" }, r.decisions, roles).length > 0);
}
