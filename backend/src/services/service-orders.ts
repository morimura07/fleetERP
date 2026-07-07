import { Prisma, ServiceOrderStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import { createJournalEntry } from "@backend/services/ledger";
import { issueStock } from "@backend/services/inventory";

/**
 * Service Management (M22) — workshop service orders for the fleet.
 *
 * Lifecycle:  OPEN → IN_PROGRESS → COMPLETED → POSTED   (or CANCELLED)
 *
 * Costs come from two sources:
 *   • Parts — issued from Inventory. Each addPart() calls the inventory service,
 *     which relieves the item and posts Dr Maintenance (item expenseCode, 5100)
 *     / Cr Inventory (1300). So parts hit the ledger the moment they're issued.
 *   • Labor — tracked per line. INTERNAL labor (own mechanics) is a memo cost only
 *     (they're paid via Payroll). EXTERNAL labor accrues when the order is posted:
 *       Dr Maintenance (5100)  Cr Accrued Expenses (2300)   Σ labor
 *
 * The order keeps partsCost / laborCost / totalCost rollups for per-vehicle
 * maintenance reporting. Multi-tenant via dataAreaId.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const MAINTENANCE = "5100"; // Vehicle Maintenance & Repairs
const ACCRUED = "2300"; // Accrued Expenses (labor payable to the garage)

const EDITABLE: ServiceOrderStatus[] = ["OPEN", "IN_PROGRESS"];

async function accountId(dataAreaId: string, code: string): Promise<string> {
  const a = await prisma.account.findUnique({
    where: { dataAreaId_code: { dataAreaId, code } },
    select: { id: true },
  });
  if (!a) throw new AuthError(`Account ${code} not found (seed the chart of accounts)`, 404);
  return a.id;
}

async function nextOrderNumber(dataAreaId: string): Promise<string> {
  const n = await prisma.serviceOrder.count({ where: { dataAreaId } });
  return `SVC-${String(n + 1).padStart(6, "0")}`;
}

/** Pure cost rollup for a service order. Unit-tested. */
export function rollupCost(
  parts: { totalCost: Prisma.Decimal.Value }[],
  labor: { amount: Prisma.Decimal.Value }[],
): { partsCost: Prisma.Decimal; laborCost: Prisma.Decimal; totalCost: Prisma.Decimal } {
  const partsCost = parts.reduce((s, p) => s.plus(p.totalCost), D(0));
  const laborCost = labor.reduce((s, l) => s.plus(l.amount), D(0));
  return { partsCost, laborCost, totalCost: partsCost.plus(laborCost) };
}

/** Labor amount for a line = hours × rate. Unit-tested. */
export function laborAmount(hours: Prisma.Decimal.Value, rate: Prisma.Decimal.Value): Prisma.Decimal {
  return D(hours).times(rate);
}

export interface CreateOrderInput {
  dataAreaId: string;
  vehicleId: string;
  kind?: "INTERNAL" | "EXTERNAL";
  vendorId?: string | null;
  odometerKm?: number | null;
  fault: string;
  currency?: string;
  createdById?: string | null;
}

export async function createOrder(input: CreateOrderInput) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: input.vehicleId, dataAreaId: input.dataAreaId },
    select: { id: true },
  });
  if (!vehicle) throw new AuthError("Vehicle not found in this company", 404);

  const kind = input.kind ?? "INTERNAL";
  if (kind === "EXTERNAL" && input.vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: input.vendorId, dataAreaId: input.dataAreaId },
      select: { id: true },
    });
    if (!vendor) throw new AuthError("Vendor not found in this company", 404);
  }

  return prisma.serviceOrder.create({
    data: {
      dataAreaId: input.dataAreaId,
      orderNumber: await nextOrderNumber(input.dataAreaId),
      vehicleId: input.vehicleId,
      kind,
      vendorId: kind === "EXTERNAL" ? input.vendorId ?? null : null,
      odometerKm: input.odometerKm ?? null,
      fault: input.fault,
      currency: input.currency ?? "USD",
      createdById: input.createdById ?? null,
    },
  });
}

async function loadEditable(dataAreaId: string, orderId: string) {
  const order = await prisma.serviceOrder.findFirst({ where: { id: orderId, dataAreaId } });
  if (!order) throw new AuthError("Service order not found", 404);
  if (!EDITABLE.includes(order.status)) {
    throw new AuthError(`Cannot modify a ${order.status} order`, 409);
  }
  return order;
}

/** Recompute the cost rollups from the current parts + labor. */
async function refreshCosts(orderId: string, tx: Prisma.TransactionClient = prisma) {
  const [parts, labor] = await Promise.all([
    tx.servicePart.aggregate({ where: { serviceOrderId: orderId }, _sum: { totalCost: true } }),
    tx.serviceLabor.aggregate({ where: { serviceOrderId: orderId }, _sum: { amount: true } }),
  ]);
  const partsCost = D(parts._sum.totalCost ?? 0);
  const laborCost = D(labor._sum.amount ?? 0);
  return tx.serviceOrder.update({
    where: { id: orderId },
    data: {
      partsCost: partsCost.toFixed(2),
      laborCost: laborCost.toFixed(2),
      totalCost: partsCost.plus(laborCost).toFixed(2),
      status: "IN_PROGRESS",
    },
  });
}

export interface AddPartInput {
  stockItemId: string;
  quantity: Prisma.Decimal.Value;
  createdById?: string | null;
}

/**
 * Consume a part on the order: issues the stock (relieving inventory and posting
 * the GL cost) and records the ServicePart. Issue cost is the item's current average.
 */
export async function addPart(dataAreaId: string, orderId: string, input: AddPartInput) {
  const order = await loadEditable(dataAreaId, orderId);

  const item = await prisma.stockItem.findFirst({
    where: { id: input.stockItemId, dataAreaId },
    select: { id: true, code: true, name: true, quantityOnHand: true },
  });
  if (!item) throw new AuthError("Stock item not found in this company", 404);
  if (D(item.quantityOnHand).lessThan(input.quantity)) {
    throw new AuthError(`Insufficient stock for ${item.code} (on hand ${item.quantityOnHand})`, 422);
  }

  // issueStock posts Dr expense / Cr inventory and relieves the item.
  const movement = await issueStock({
    stockItemId: item.id,
    quantity: input.quantity,
    reference: order.orderNumber,
    memo: `Service ${order.orderNumber} — ${item.name}`,
    createdById: input.createdById,
  });

  await prisma.servicePart.create({
    data: {
      dataAreaId,
      serviceOrderId: order.id,
      stockItemId: item.id,
      description: item.name,
      quantity: D(input.quantity).toFixed(3),
      unitCost: movement.unitCost,
      totalCost: movement.totalCost,
      stockMovementId: movement.id,
    },
  });

  return refreshCosts(order.id);
}

export interface AddLaborInput {
  description: string;
  hours: Prisma.Decimal.Value;
  rate: Prisma.Decimal.Value;
  createdById?: string | null;
}

/** Add a labor line (hours × rate). No GL impact until the order is posted. */
export async function addLabor(dataAreaId: string, orderId: string, input: AddLaborInput) {
  const order = await loadEditable(dataAreaId, orderId);
  const amount = laborAmount(input.hours, input.rate);
  await prisma.serviceLabor.create({
    data: {
      dataAreaId,
      serviceOrderId: order.id,
      description: input.description,
      hours: D(input.hours).toFixed(2),
      rate: D(input.rate).toFixed(2),
      amount: amount.toFixed(2),
    },
  });
  return refreshCosts(order.id);
}

/** Remove a labor line (only while the order is still editable). */
export async function removeLabor(dataAreaId: string, orderId: string, laborId: string) {
  const order = await loadEditable(dataAreaId, orderId);
  const line = await prisma.serviceLabor.findFirst({ where: { id: laborId, serviceOrderId: order.id } });
  if (!line) throw new AuthError("Labor line not found", 404);
  await prisma.serviceLabor.delete({ where: { id: line.id } });
  return refreshCosts(order.id);
}

/** IN_PROGRESS/OPEN → COMPLETED. */
export async function completeOrder(dataAreaId: string, orderId: string) {
  const order = await loadEditable(dataAreaId, orderId);
  return prisma.serviceOrder.update({
    where: { id: order.id },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
}

/**
 * Post a COMPLETED order. Parts were posted at issue time; this accrues EXTERNAL
 * labor to the ledger (Dr Maintenance 5100 / Cr Accrued 2300). INTERNAL orders
 * have no labor posting and simply close.
 */
export async function postOrder(dataAreaId: string, orderId: string, createdById?: string | null) {
  const order = await prisma.serviceOrder.findFirst({ where: { id: orderId, dataAreaId } });
  if (!order) throw new AuthError("Service order not found", 404);
  if (order.status !== "COMPLETED") throw new AuthError("Only a COMPLETED order can be posted", 409);

  const laborCost = D(order.laborCost);
  let postingEntryId: string | null = null;

  if (order.kind === "EXTERNAL" && laborCost.greaterThan(0)) {
    const [maintId, accruedId] = await Promise.all([
      accountId(dataAreaId, MAINTENANCE),
      accountId(dataAreaId, ACCRUED),
    ]);
    const entry = await createJournalEntry(
      {
        dataAreaId,
        postingDate: new Date(),
        currency: order.currency,
        memo: `Service ${order.orderNumber} labor`,
        lines: [
          { accountId: maintId, debit: laborCost.toString(), memo: `External labor ${order.orderNumber}` },
          { accountId: accruedId, credit: laborCost.toString(), memo: "Garage labor payable" },
        ],
        createdById,
      },
      { post: true },
    );
    postingEntryId = entry.id;
  }

  return prisma.serviceOrder.update({
    where: { id: order.id },
    data: { status: "POSTED", postingEntryId, updatedById: createdById ?? undefined },
  });
}

/**
 * Cancel an order. Only allowed before any parts have been issued — issued parts
 * have already posted inventory relief that cannot be silently reversed here.
 */
export async function cancelOrder(dataAreaId: string, orderId: string, createdById?: string | null) {
  const order = await prisma.serviceOrder.findFirst({
    where: { id: orderId, dataAreaId },
    include: { _count: { select: { parts: true } } },
  });
  if (!order) throw new AuthError("Service order not found", 404);
  if (order.status === "POSTED") throw new AuthError("Cannot cancel a posted order", 409);
  if (order._count.parts > 0) {
    throw new AuthError("Cannot cancel: parts already issued from inventory. Reverse the stock movements first.", 409);
  }
  return prisma.serviceOrder.update({
    where: { id: order.id },
    data: { status: "CANCELLED", updatedById: createdById ?? undefined },
  });
}
