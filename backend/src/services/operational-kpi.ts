import { Prisma, DockEventKind, DamageStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";

/**
 * Operational KPI capture (Tier C internal) — the data behind three dashboard
 * KPIs that need no external feed:
 *   • DockEvent    → truck-turnaround time (arrival→departure gap)
 *   • DamageReport → damage & claim rate (Σ damage ÷ Σ cargo value)
 *   • CustomerFeedback → CSAT / NPS
 * The KPI maths live in dashboard-kpi.ts (pure, unit-tested); this file just
 * records and lists the underlying events.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

// ── Dock events ──────────────────────────────────────────────────────────────

export interface DockEventInput {
  dataAreaId: string;
  vehicleId: string;
  tripId?: string | null;
  facility?: string | null;
  kind: DockEventKind;
  eventAt: Date;
  note?: string | null;
  createdById?: string | null;
}

export async function recordDockEvent(input: DockEventInput) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: input.vehicleId, dataAreaId: input.dataAreaId },
    select: { id: true },
  });
  if (!vehicle) throw new AuthError("Vehicle not found in this company", 404);
  return prisma.dockEvent.create({
    data: {
      dataAreaId: input.dataAreaId,
      vehicleId: input.vehicleId,
      tripId: input.tripId ?? null,
      facility: input.facility ?? null,
      kind: input.kind,
      eventAt: input.eventAt,
      note: input.note ?? null,
      createdById: input.createdById ?? null,
    },
  });
}

// ── Damage reports ───────────────────────────────────────────────────────────

async function nextDamageNumber(dataAreaId: string): Promise<string> {
  const n = await prisma.damageReport.count({ where: { dataAreaId } });
  return `DMG-${String(n + 1).padStart(6, "0")}`;
}

export interface DamageReportInput {
  dataAreaId: string;
  orderId?: string | null;
  tripId?: string | null;
  reportedAt: Date;
  cargoValue: Prisma.Decimal.Value;
  damageValue: Prisma.Decimal.Value;
  currency?: string;
  description?: string | null;
  createdById?: string | null;
}

export async function createDamageReport(input: DamageReportInput) {
  if (D(input.damageValue).greaterThan(input.cargoValue)) {
    throw new AuthError("Damage value cannot exceed the cargo value", 422);
  }
  return prisma.damageReport.create({
    data: {
      dataAreaId: input.dataAreaId,
      reportNumber: await nextDamageNumber(input.dataAreaId),
      orderId: input.orderId ?? null,
      tripId: input.tripId ?? null,
      reportedAt: input.reportedAt,
      cargoValue: D(input.cargoValue),
      damageValue: D(input.damageValue),
      currency: input.currency ?? "USD",
      description: input.description ?? null,
      createdById: input.createdById ?? null,
    },
  });
}

/** Advance a damage report's status (REPORTED → UNDER_REVIEW → APPROVED/REJECTED → SETTLED). */
export async function setDamageStatus(dataAreaId: string, id: string, status: DamageStatus, userId?: string | null) {
  const report = await prisma.damageReport.findFirst({ where: { id, dataAreaId } });
  if (!report) throw new AuthError("Damage report not found", 404);
  return prisma.damageReport.update({ where: { id: report.id }, data: { status, updatedById: userId ?? null } });
}

// ── Customer feedback ────────────────────────────────────────────────────────

export interface FeedbackInput {
  dataAreaId: string;
  customerId: string;
  orderId?: string | null;
  csat?: number | null;
  nps?: number | null;
  comment?: string | null;
  collectedAt: Date;
  createdById?: string | null;
}

export async function recordFeedback(input: FeedbackInput) {
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, dataAreaId: input.dataAreaId },
    select: { id: true },
  });
  if (!customer) throw new AuthError("Customer not found in this company", 404);
  if (input.csat != null && (input.csat < 1 || input.csat > 5)) throw new AuthError("CSAT must be 1–5", 422);
  if (input.nps != null && (input.nps < 0 || input.nps > 10)) throw new AuthError("NPS must be 0–10", 422);
  if (input.csat == null && input.nps == null) throw new AuthError("Provide at least a CSAT or NPS score", 422);
  return prisma.customerFeedback.create({
    data: {
      dataAreaId: input.dataAreaId,
      customerId: input.customerId,
      orderId: input.orderId ?? null,
      csat: input.csat ?? null,
      nps: input.nps ?? null,
      comment: input.comment ?? null,
      collectedAt: input.collectedAt,
      createdById: input.createdById ?? null,
    },
  });
}
