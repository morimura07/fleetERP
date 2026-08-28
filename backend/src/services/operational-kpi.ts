import { Prisma, DockEventKind, DamageStatus, IncidentType, IncidentCause, ClaimStatus, DockActivity, DockSource } from "@prisma/client";
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
  // Gate and yard detail (client amendments, Aug 2026).
  driverId?: string | null;
  trailerNumber?: string | null;
  dockBay?: string | null;
  activity?: DockActivity;
  sealNumber?: string | null;
  sealIntact?: boolean | null;
  odometerKm?: number | null;
  fuelLevel?: string | null;
  source?: DockSource;
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
      driverId: input.driverId ?? null,
      trailerNumber: input.trailerNumber ?? null,
      dockBay: input.dockBay ?? null,
      activity: input.activity ?? "OTHER",
      sealNumber: input.sealNumber ?? null,
      sealIntact: input.sealIntact ?? null,
      odometerKm: input.odometerKm ?? null,
      fuelLevel: input.fuelLevel ?? null,
      source: input.source ?? "MANUAL",
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
  // Incident detail (client amendments, Aug 2026).
  clientId?: string | null;
  vehicleId?: string | null;
  driverId?: string | null;
  incidentType?: IncidentType;
  location?: string | null;
  rootCause?: IncidentCause;
  liableParty?: string | null;
  insurerName?: string | null;
  claimNumber?: string | null;
  claimStatus?: ClaimStatus;
  settlementAmount?: Prisma.Decimal.Value;
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
      clientId: input.clientId ?? null,
      vehicleId: input.vehicleId ?? null,
      driverId: input.driverId ?? null,
      incidentType: input.incidentType ?? "TRANSIT_DAMAGE",
      location: input.location ?? null,
      rootCause: input.rootCause ?? "UNDETERMINED",
      liableParty: input.liableParty ?? null,
      insurerName: input.insurerName ?? null,
      claimNumber: input.claimNumber ?? null,
      claimStatus: input.claimStatus ?? "NOT_FILED",
      settlementAmount: D(input.settlementAmount ?? 0),
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

/**
 * Damage ratio for an incident, as a percentage of the shipment's value.
 *
 * Derived rather than stored: it is damageValue / cargoValue, and a stored copy
 * would go wrong the moment either figure is corrected during assessment.
 * A shipment with no recorded value yields 0 rather than a division by zero.
 */
export function damageRatioPct(cargoValue: Prisma.Decimal.Value, damageValue: Prisma.Decimal.Value): number {
  const cargo = D(cargoValue);
  if (cargo.lessThanOrEqualTo(0)) return 0;
  return Math.round(D(damageValue).dividedBy(cargo).times(1000).toNumber()) / 10;
}

/** Share of an incident's loss actually recovered from insurer or liable party. */
export function recoveryPct(damageValue: Prisma.Decimal.Value, settlementAmount: Prisma.Decimal.Value): number {
  const loss = D(damageValue);
  if (loss.lessThanOrEqualTo(0)) return 0;
  return Math.round(D(settlementAmount).dividedBy(loss).times(1000).toNumber()) / 10;
}

// ── Dwell time and detention (client amendments, Aug 2026) ───────────────────

/**
 * Hours a truck spent at the dock, and whether that exceeded the free period.
 *
 * Neither value is stored. Dwell is the gap between an arrival and its paired
 * departure, so a stored copy would go stale the moment either timestamp is
 * corrected, and the free period is a policy that can change retrospectively.
 */
export const DEFAULT_FREE_HOURS = 4;

export interface DwellResult {
  /** Hours at the dock, or null while the truck is still inside. */
  dwellHours: number | null;
  /** Hours beyond the free period. 0 when inside it, null while still on site. */
  detentionHours: number | null;
}

export function dwellFor(
  arrivalAt: Date | null,
  departureAt: Date | null,
  freeHours = DEFAULT_FREE_HOURS,
): DwellResult {
  if (!arrivalAt || !departureAt) return { dwellHours: null, detentionHours: null };
  // A departure recorded before its arrival is a data-entry error, not negative
  // dwell; report zero rather than a number that would flatter the average.
  const hours = Math.max(0, (departureAt.getTime() - arrivalAt.getTime()) / 3_600_000);
  return {
    dwellHours: Math.round(hours * 10) / 10,
    detentionHours: Math.round(Math.max(0, hours - freeHours) * 10) / 10,
  };
}

/** "3h 45m", or "—" while the truck has not left yet. */
export function formatDwell(hours: number | null): string {
  if (hours == null) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export interface DockEventRow {
  id: string;
  vehicleId: string;
  kind: "ARRIVAL" | "DEPARTURE";
  eventAt: Date;
}

/**
 * Attach dwell and detention to each ARRIVAL by pairing it with the next
 * DEPARTURE for the same vehicle.
 *
 * A second arrival with no departure between them supersedes the first: the
 * truck plainly left without being logged out, and pairing across that gap
 * would report a dwell of days.
 */
export function withDwell<T extends DockEventRow>(
  events: T[],
  freeHours = DEFAULT_FREE_HOURS,
): (T & DwellResult)[] {
  const byVehicle = new Map<string, T[]>();
  for (const e of events) {
    if (!byVehicle.has(e.vehicleId)) byVehicle.set(e.vehicleId, []);
    byVehicle.get(e.vehicleId)!.push(e);
  }

  const paired = new Map<string, DwellResult>();
  for (const list of byVehicle.values()) {
    const ordered = [...list].sort((a, b) => a.eventAt.getTime() - b.eventAt.getTime());
    let openArrival: T | null = null;
    for (const ev of ordered) {
      if (ev.kind === "ARRIVAL") {
        openArrival = ev; // a prior unmatched arrival is dropped on purpose
      } else if (openArrival) {
        paired.set(openArrival.id, dwellFor(openArrival.eventAt, ev.eventAt, freeHours));
        openArrival = null;
      }
    }
  }

  return events.map((e) => ({
    ...e,
    ...(paired.get(e.id) ?? { dwellHours: null, detentionHours: null }),
  }));
}
