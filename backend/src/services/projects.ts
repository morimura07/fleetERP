import { Prisma, ProjectStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";

/**
 * Project Management (M29). A Project groups freight orders under a contract and
 * is tracked against a planned budget. Actual revenue is the Σ freight+demurrage
 * of its orders; actual cost is the Σ of each linked trip's base costs and
 * expenses — the same cost basis used by Trip P&L (freight.ts) and the KPI
 * dashboard. The P&L arithmetic is a pure, unit-tested helper.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

// ── Pure P&L helpers (unit-tested) ───────────────────────────────────────────

export interface ProjectPnLFigures {
  budgetRevenue: Prisma.Decimal;
  budgetCost: Prisma.Decimal;
  budgetProfit: Prisma.Decimal;
  actualRevenue: Prisma.Decimal;
  actualCost: Prisma.Decimal;
  actualProfit: Prisma.Decimal;
  marginPct: Prisma.Decimal; // actual profit / actual revenue * 100
  costVariance: Prisma.Decimal; // actualCost − budgetCost (positive = over budget)
  revenueVariance: Prisma.Decimal; // actualRevenue − budgetRevenue
}

/**
 * Project P&L: profit = revenue − cost for both budget and actual; margin% is on
 * actual; variances compare actual to budget. Pure — no Prisma access.
 */
export function projectPnL(
  budgetRevenue: Prisma.Decimal.Value,
  budgetCost: Prisma.Decimal.Value,
  actualRevenue: Prisma.Decimal.Value,
  actualCost: Prisma.Decimal.Value,
): ProjectPnLFigures {
  const bRev = D(budgetRevenue), bCost = D(budgetCost);
  const aRev = D(actualRevenue), aCost = D(actualCost);
  const actualProfit = aRev.minus(aCost);
  return {
    budgetRevenue: bRev,
    budgetCost: bCost,
    budgetProfit: bRev.minus(bCost),
    actualRevenue: aRev,
    actualCost: aCost,
    actualProfit,
    marginPct: aRev.greaterThan(0) ? actualProfit.dividedBy(aRev).times(100) : new Prisma.Decimal(0),
    costVariance: aCost.minus(bCost),
    revenueVariance: aRev.minus(bRev),
  };
}

/** One order's contribution: revenue = freight + demurrage; cost = Σ trip costs. */
export function orderActuals(order: {
  freightAmount: Prisma.Decimal.Value;
  demurrageAmount: Prisma.Decimal.Value;
  trip: { driverWages: Prisma.Decimal.Value; tollPermitCost: Prisma.Decimal.Value; miscExpense: Prisma.Decimal.Value; expenses: { amount: Prisma.Decimal.Value }[] } | null;
}): { revenue: Prisma.Decimal; cost: Prisma.Decimal } {
  const revenue = D(order.freightAmount).plus(order.demurrageAmount);
  let cost = new Prisma.Decimal(0);
  if (order.trip) {
    const exp = order.trip.expenses.reduce((s, e) => s.plus(e.amount), new Prisma.Decimal(0));
    cost = exp.plus(order.trip.driverWages).plus(order.trip.tollPermitCost).plus(order.trip.miscExpense);
  }
  return { revenue, cost };
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

async function nextProjectCode(dataAreaId: string): Promise<string> {
  const n = await prisma.project.count({ where: { dataAreaId } });
  return `PRJ-${String(n + 1).padStart(6, "0")}`;
}

export interface ProjectInput {
  dataAreaId: string;
  name: string;
  clientId?: string | null;
  manager?: string | null;
  currency?: string;
  budgetRevenue?: Prisma.Decimal.Value;
  budgetCost?: Prisma.Decimal.Value;
  startDate?: Date | null;
  endDate?: Date | null;
  description?: string | null;
  createdById?: string | null;
}

export async function createProject(input: ProjectInput) {
  if (input.clientId) {
    const client = await prisma.client.findFirst({ where: { id: input.clientId, dataAreaId: input.dataAreaId }, select: { id: true } });
    if (!client) throw new AuthError("Client not found in this company", 404);
  }
  return prisma.project.create({
    data: {
      dataAreaId: input.dataAreaId,
      projectCode: await nextProjectCode(input.dataAreaId),
      name: input.name,
      clientId: input.clientId ?? null,
      manager: input.manager ?? null,
      currency: input.currency ?? "USD",
      budgetRevenue: D(input.budgetRevenue ?? 0),
      budgetCost: D(input.budgetCost ?? 0),
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      description: input.description ?? null,
      createdById: input.createdById ?? null,
    },
  });
}

/** Which status transitions are allowed. CANCELLED/COMPLETED are terminal. */
export const PROJECT_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  PLANNING: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["ON_HOLD", "COMPLETED", "CANCELLED"],
  ON_HOLD: ["ACTIVE", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return PROJECT_TRANSITIONS[from].includes(to);
}

export async function setProjectStatus(dataAreaId: string, id: string, status: ProjectStatus, userId?: string | null) {
  const project = await prisma.project.findFirst({ where: { id, dataAreaId }, select: { id: true, status: true } });
  if (!project) throw new AuthError("Project not found", 404);
  if (!canTransition(project.status, status)) {
    throw new AuthError(`Cannot move a ${project.status} project to ${status}`, 422);
  }
  return prisma.project.update({ where: { id: project.id }, data: { status, updatedById: userId ?? null } });
}

/** Attach or detach a freight order from a project (both must be in-company). */
export async function setOrderProject(dataAreaId: string, orderId: string, projectId: string | null, userId?: string | null) {
  const order = await prisma.order.findFirst({ where: { id: orderId, dataAreaId }, select: { id: true } });
  if (!order) throw new AuthError("Order not found in this company", 404);
  if (projectId) {
    const project = await prisma.project.findFirst({ where: { id: projectId, dataAreaId }, select: { id: true } });
    if (!project) throw new AuthError("Project not found in this company", 404);
  }
  return prisma.order.update({ where: { id: order.id }, data: { projectId, updatedById: userId ?? null } });
}

// ── Rollup ───────────────────────────────────────────────────────────────────

export interface ProjectPnL extends ProjectPnLFigures {
  projectId: string;
  projectCode: string;
  currency: string;
  orderCount: number;
}

/** Compute a project's budget-vs-actual P&L by rolling up its orders and trips. */
export async function computeProjectPnL(dataAreaId: string, id: string): Promise<ProjectPnL> {
  const project = await prisma.project.findFirst({
    where: { id, dataAreaId },
    include: {
      orders: {
        select: {
          freightAmount: true, demurrageAmount: true,
          trip: { select: { driverWages: true, tollPermitCost: true, miscExpense: true, expenses: { select: { amount: true } } } },
        },
      },
    },
  });
  if (!project) throw new AuthError("Project not found", 404);

  let actualRevenue = new Prisma.Decimal(0), actualCost = new Prisma.Decimal(0);
  for (const o of project.orders) {
    const a = orderActuals(o);
    actualRevenue = actualRevenue.plus(a.revenue);
    actualCost = actualCost.plus(a.cost);
  }

  const figures = projectPnL(project.budgetRevenue, project.budgetCost, actualRevenue, actualCost);
  return {
    projectId: project.id,
    projectCode: project.projectCode,
    currency: project.currency,
    orderCount: project.orders.length,
    ...figures,
  };
}
