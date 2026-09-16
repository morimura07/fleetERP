import { Prisma } from "@prisma/client";
import type { Requisition, RequisitionLine, BudgetGateStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import type { AuthUser } from "@backend/lib/auth";
import { updateWithVersion } from "@backend/lib/concurrency";
import { checkBudget } from "@backend/services/budget";
import { openRequest, pendingRequestFor, requestsFor, decide, policyFor, toTierCurrency, type RequestWithDecisions } from "@backend/services/doa";
import type { RequisitionInput, RequisitionLineInput } from "@backend/lib/validations";

/**
 * Purchase requisitions (client requirements, Sept 2026, Procurement §1,
 * SOP steps 1 to 3 and 9 to 12).
 *
 *   DRAFT -> PENDING_REVIEW -> (PENDING_BUDGET ->) PENDING_APPROVAL -> APPROVED -> SOURCING -> ORDERED
 *
 * Submitting sends the requisition to the user department for technical
 * review. A review that passes runs the budget gate: within budget or a
 * soft block goes straight to the DOA queue; a hard block parks it as
 * pending budget allocation until Finance overrides or the budget changes.
 * Approval is the DOA request's outcome.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export type RequisitionDetail = Requisition & { lines: RequisitionLine[]; approvals: RequestWithDecisions[] };

async function nextNumber(dataAreaId: string): Promise<string> {
  const n = await prisma.requisition.count({ where: { dataAreaId } });
  return `PR-${String(n + 1).padStart(6, "0")}`;
}

function lineRows(lines: RequisitionLineInput[]) {
  return lines.map((l, i) => {
    const total = D(l.quantity).times(l.estUnitPrice ?? 0).toDecimalPlaces(2);
    return {
      stockItemId: l.stockItemId || null, description: l.description, uom: l.uom || "PIECE",
      quantity: D(l.quantity), estUnitPrice: D(l.estUnitPrice ?? 0), lineTotal: total,
      expenseCode: l.expenseCode || "5100", specification: l.specification || null, sortOrder: i,
    };
  });
}

export async function getRequisition(id: string): Promise<RequisitionDetail> {
  const r = await prisma.requisition.findUnique({ where: { id }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
  if (!r) throw new AuthError("Requisition not found", 404);
  return { ...r, approvals: await requestsFor("REQUISITION", id) };
}

export async function createRequisition(dataAreaId: string, user: AuthUser, input: RequisitionInput): Promise<RequisitionDetail> {
  await assertItemsInArea(dataAreaId, input.lines);
  const rows = lineRows(input.lines);
  const subtotal = rows.reduce((s, l) => s.plus(l.lineTotal), D(0));
  const r = await prisma.requisition.create({
    data: {
      dataAreaId, prNumber: await nextNumber(dataAreaId), title: input.title, department: input.department || null,
      costCenter: input.costCenter || null, neededBy: input.neededBy ?? null, currency: input.currency, subtotal,
      justification: input.justification || null, requestedById: user.id, createdById: user.id,
      lines: { create: rows },
    },
  });
  return getRequisition(r.id);
}

async function assertItemsInArea(dataAreaId: string, lines: RequisitionLineInput[]) {
  const ids = [...new Set(lines.map((l) => l.stockItemId).filter((x): x is string => !!x))];
  if (ids.length === 0) return;
  const found = await prisma.stockItem.count({ where: { id: { in: ids }, dataAreaId } });
  if (found !== ids.length) throw new AuthError("A line refers to an item that is not in this company's item master", 404);
}

/** Edit a draft, or one sent back. Lines are replaced whole. */
export async function updateRequisition(id: string, version: number, user: AuthUser, input: RequisitionInput): Promise<RequisitionDetail> {
  const r = await prisma.requisition.findUnique({ where: { id }, select: { dataAreaId: true, status: true } });
  if (!r) throw new AuthError("Requisition not found", 404);
  if (!["DRAFT", "REJECTED"].includes(r.status)) throw new AuthError(`A ${r.status.toLowerCase().replace("_", " ")} requisition cannot be edited; cancel it and raise a new one`, 409);
  await assertItemsInArea(r.dataAreaId, input.lines);
  const rows = lineRows(input.lines);
  const subtotal = rows.reduce((s, l) => s.plus(l.lineTotal), D(0));
  await prisma.$transaction(async (tx) => {
    await updateWithVersion(tx.requisition, id, version, user.id, {
      title: input.title, department: input.department || null, costCenter: input.costCenter || null, neededBy: input.neededBy ?? null,
      currency: input.currency, subtotal, justification: input.justification || null,
      status: "DRAFT", rejectedReason: null, budgetStatus: "NOT_CHECKED", budgetNote: null,
    });
    await tx.requisitionLine.deleteMany({ where: { requisitionId: id } });
    await tx.requisitionLine.createMany({ data: rows.map((l) => ({ ...l, requisitionId: id })) });
  });
  return getRequisition(id);
}

/** DRAFT -> PENDING_REVIEW. */
export async function submitRequisition(id: string, user: AuthUser): Promise<RequisitionDetail> {
  const r = await getRequisition(id);
  if (r.status !== "DRAFT") throw new AuthError(`Only a draft can be submitted (this one is ${r.status.toLowerCase()})`, 409);
  if (r.lines.length === 0) throw new AuthError("Add at least one line before submitting", 422);
  if (D(r.subtotal).lessThanOrEqualTo(0)) throw new AuthError("Every line needs an estimated price so the approval tier can be worked out", 422);
  await prisma.requisition.update({ where: { id }, data: { status: "PENDING_REVIEW", submittedAt: new Date(), updatedById: user.id, version: { increment: 1 } } });
  return getRequisition(id);
}

export interface BudgetGate {
  status: BudgetGateStatus;
  note: string | null;
}

/**
 * The pre-commitment check (SOP step 2): each expense code's estimate against
 * the tightest budget line for the cost centre in the fiscal year the goods
 * are needed. Reads only; the commitment itself is recorded when the PO is
 * raised. No governing line means no constraint.
 */
export async function budgetGate(r: Requisition & { lines: RequisitionLine[] }): Promise<BudgetGate> {
  const fiscalYear = (r.neededBy ?? new Date()).getUTCFullYear();
  const byAccount = new Map<string, Prisma.Decimal>();
  for (const l of r.lines) byAccount.set(l.expenseCode, (byAccount.get(l.expenseCode) ?? D(0)).plus(l.lineTotal));
  let worst: BudgetGateStatus = "WITHIN";
  const notes: string[] = [];
  for (const [accountCode, amount] of byAccount) {
    const lines = await prisma.budgetLine.findMany({
      where: { accountCode, ...(r.costCenter ? { costCenter: r.costCenter } : {}), budget: { dataAreaId: r.dataAreaId, fiscalYear, isActive: true } },
      include: { budget: { select: { control: true, name: true } } },
    });
    if (lines.length === 0) continue;
    const line = lines.reduce((t, l) => (D(l.amount).minus(l.consumed).lessThan(D(t.amount).minus(t.consumed)) ? l : t));
    const decision = checkBudget(line.budget.control, D(line.amount), D(line.consumed), amount);
    if (!decision.warning) continue;
    const blocked = !decision.allowed || line.budget.control === "STRICT_BLOCK" || line.budget.control === "OVERRIDE";
    notes.push(`${accountCode} (${line.costCenter}): ${decision.warning}; remaining ${decision.remaining}`);
    if (blocked) worst = "HARD_BLOCK";
    else if (worst === "WITHIN") worst = "SOFT_BLOCK";
  }
  return { status: worst, note: notes.length ? notes.join(". ") : null };
}

/** Send the requisition through the matrix and mark it pending approval. */
async function toApproval(r: RequisitionDetail, user: AuthUser, reason: string): Promise<RequisitionDetail> {
  const policy = await policyFor(r.dataAreaId);
  const { amountBase, baseCurrency } = await toTierCurrency(r.subtotal, r.currency, r.dataAreaId, policy);
  await openRequest({
    dataAreaId: r.dataAreaId, subjectType: "REQUISITION", subjectId: r.id, subjectRef: r.prNumber,
    amount: r.subtotal, currency: r.currency, reason, requestedById: user.id,
  });
  await prisma.requisition.update({ where: { id: r.id }, data: { status: "PENDING_APPROVAL", amountBase, baseCurrency, updatedById: user.id, version: { increment: 1 } } });
  return getRequisition(r.id);
}

/**
 * Technical review (SOP step 3). Passing runs the budget gate and moves the
 * requisition on; failing sends it back as rejected with the reason.
 */
export async function reviewRequisition(id: string, user: AuthUser, pass: boolean, note?: string | null): Promise<RequisitionDetail> {
  const r = await getRequisition(id);
  if (r.status !== "PENDING_REVIEW") throw new AuthError(`Not awaiting review (status ${r.status.toLowerCase()})`, 409);
  if (!pass) {
    await prisma.requisition.update({ where: { id }, data: { status: "REJECTED", reviewedById: user.id, reviewedAt: new Date(), reviewNote: note || null, rejectedReason: note || "Failed technical review", updatedById: user.id, version: { increment: 1 } } });
    return getRequisition(id);
  }
  const gate = await budgetGate(r);
  await prisma.requisition.update({
    where: { id },
    data: {
      reviewedById: user.id, reviewedAt: new Date(), reviewNote: note || null,
      budgetStatus: gate.status, budgetNote: gate.note,
      ...(gate.status === "HARD_BLOCK" ? { status: "PENDING_BUDGET" } : {}),
      updatedById: user.id, version: { increment: 1 },
    },
  });
  if (gate.status === "HARD_BLOCK") return getRequisition(id);
  return toApproval(await getRequisition(id), user, "initial");
}

/** Finance lets a hard-blocked requisition through (SOP step 2 override). */
export async function overrideBudget(id: string, user: AuthUser, note: string): Promise<RequisitionDetail> {
  const r = await getRequisition(id);
  if (r.status !== "PENDING_BUDGET") throw new AuthError(`Not waiting for budget (status ${r.status.toLowerCase()})`, 409);
  await prisma.requisition.update({
    where: { id },
    data: { budgetStatus: "OVERRIDDEN", budgetOverrideById: user.id, budgetOverrideAt: new Date(), budgetOverrideNote: note, updatedById: user.id, version: { increment: 1 } },
  });
  return toApproval(await getRequisition(id), user, "initial, after budget override");
}

/** Run the budget gate again after a budget change; moves on if it now passes. */
export async function recheckBudget(id: string, user: AuthUser): Promise<RequisitionDetail> {
  const r = await getRequisition(id);
  if (r.status !== "PENDING_BUDGET") throw new AuthError(`Not waiting for budget (status ${r.status.toLowerCase()})`, 409);
  const gate = await budgetGate(r);
  await prisma.requisition.update({ where: { id }, data: { budgetStatus: gate.status, budgetNote: gate.note, updatedById: user.id, version: { increment: 1 } } });
  if (gate.status === "HARD_BLOCK") return getRequisition(id);
  return toApproval(await getRequisition(id), user, "initial, after budget re-check");
}

/** One DOA signature on the requisition's pending request. */
export async function decideRequisition(id: string, user: AuthUser, approve: boolean, note?: string | null): Promise<RequisitionDetail> {
  const r = await getRequisition(id);
  if (r.status !== "PENDING_APPROVAL") throw new AuthError(`Not awaiting approval (status ${r.status.toLowerCase()})`, 409);
  const pending = await pendingRequestFor("REQUISITION", id);
  if (!pending) throw new AuthError("No open approval request; submit the requisition again", 409);
  const { outcome } = await decide(pending.id, user, approve, note);
  if (outcome === "APPROVED") {
    await prisma.requisition.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date(), updatedById: user.id, version: { increment: 1 } } });
  } else if (outcome === "REJECTED") {
    await prisma.requisition.update({ where: { id }, data: { status: "REJECTED", rejectedReason: note || "Rejected in approval", updatedById: user.id, version: { increment: 1 } } });
  }
  return getRequisition(id);
}

export async function cancelRequisition(id: string, user: AuthUser, reason?: string | null): Promise<RequisitionDetail> {
  const r = await getRequisition(id);
  if (["ORDERED", "CANCELLED"].includes(r.status)) throw new AuthError(`Cannot cancel a ${r.status.toLowerCase()} requisition`, 409);
  await prisma.$transaction(async (tx) => {
    await tx.approvalRequest.updateMany({ where: { subjectType: "REQUISITION", subjectId: id, status: "PENDING" }, data: { status: "SUPERSEDED", resolvedAt: new Date() } });
    await tx.approvalDecision.updateMany({ where: { request: { subjectType: "REQUISITION", subjectId: id }, status: "PENDING" }, data: { status: "SKIPPED" } });
    await tx.requisition.update({ where: { id }, data: { status: "CANCELLED", rejectedReason: reason || null, updatedById: user.id, version: { increment: 1 } } });
  });
  return getRequisition(id);
}
