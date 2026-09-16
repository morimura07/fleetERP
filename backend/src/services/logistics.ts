import { Prisma } from "@prisma/client";
import type { Shipment, ShipmentDocument, ShipmentEvent, ShipmentStatus, ClearanceStatus, ShipmentDocType } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import type { AuthUser } from "@backend/lib/auth";
import { updateWithVersion } from "@backend/lib/concurrency";
import { policyFor } from "@backend/services/doa";
import type { ShipmentInput, ShipmentDocumentInput, ShipmentEventInput, DutyInput } from "@backend/lib/validations";

/**
 * Logistics, customs and import tracking (client requirements, Sept 2026,
 * Procurement §4; SOP steps 16 to 18): a shipment against a purchase
 * order, its papers, its log, and its way through clearing. The document
 * checklist is what gates the goods receipt.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export type ShipmentDetail = Shipment & {
  documents: ShipmentDocument[];
  events: ShipmentEvent[];
  purchaseOrder: { id: string; poNumber: string; vendorId: string; status: string; currency: string; subtotal: Prisma.Decimal; vendor: { code: string; legalName: string } };
  clearingAgent: { id: string; code: string; legalName: string } | null;
  checklist: Checklist;
};

export interface Checklist {
  /** Each required type with whether a verified document of that type exists. */
  required: { docType: string; present: boolean; verified: boolean }[];
  complete: boolean;
  /** Human-readable reason the GRN is blocked, or null. */
  blocking: string | null;
}

async function nextNumber(dataAreaId: string): Promise<string> {
  const n = await prisma.shipment.count({ where: { dataAreaId } });
  return `SHP-${String(n + 1).padStart(6, "0")}`;
}

/** The checklist verdict for a set of documents against the policy. Pure. */
export function checklistFor(docs: { docType: string; verified: boolean }[], required: string[], enforced: boolean): Checklist {
  const rows = required.map((docType) => {
    const matching = docs.filter((d) => d.docType === docType);
    return { docType, present: matching.length > 0, verified: matching.some((d) => d.verified) };
  });
  const missing = rows.filter((r) => !r.verified);
  const complete = missing.length === 0;
  const blocking = !enforced || complete ? null
    : `Verified ${missing.map((m) => m.docType.toLowerCase().replace(/_/g, " ")).join(", ")} needed before goods can be received`;
  return { required: rows, complete, blocking };
}

const include = {
  documents: { orderBy: { createdAt: "asc" as const } },
  events: { orderBy: { at: "desc" as const } },
  purchaseOrder: { select: { id: true, poNumber: true, vendorId: true, status: true, currency: true, subtotal: true, vendor: { select: { code: true, legalName: true } } } },
  clearingAgent: { select: { id: true, code: true, legalName: true } },
};

export async function getShipment(id: string): Promise<ShipmentDetail> {
  const s = await prisma.shipment.findUnique({ where: { id }, include });
  if (!s) throw new AuthError("Shipment not found", 404);
  const policy = await policyFor(s.dataAreaId);
  return { ...s, checklist: checklistFor(s.documents, policy.grnRequiredDocs, policy.shippingDocsBeforeGrn) };
}

async function log(tx: Prisma.TransactionClient | typeof prisma, shipmentId: string, user: AuthUser | null, kind: ShipmentEvent["kind"], data: { status?: string | null; location?: string | null; note?: string | null; at?: Date }) {
  await tx.shipmentEvent.create({ data: { shipmentId, kind, at: data.at ?? new Date(), status: data.status ?? null, location: data.location ?? null, note: data.note ?? null, userId: user?.id ?? null, userName: user?.name ?? null } });
}

export async function createShipment(dataAreaId: string, user: AuthUser, input: ShipmentInput): Promise<ShipmentDetail> {
  const po = await prisma.purchaseOrder.findFirst({ where: { id: input.purchaseOrderId, dataAreaId }, select: { id: true, status: true, poNumber: true } });
  if (!po) throw new AuthError("Purchase order not found in this company", 404);
  if (["DRAFT", "PENDING_APPROVAL", "CANCELLED", "CLOSED"].includes(po.status)) throw new AuthError(`A shipment needs an issued order (this one is ${po.status.toLowerCase().replace("_", " ")})`, 409);
  if (input.clearingAgentId) {
    const agent = await prisma.vendor.findFirst({ where: { id: input.clearingAgentId, dataAreaId }, select: { id: true } });
    if (!agent) throw new AuthError("Clearing agent not found in this company", 404);
  }
  const s = await prisma.$transaction(async (tx) => {
    const created = await tx.shipment.create({
      data: {
        dataAreaId, shipmentNumber: await nextNumber(dataAreaId), purchaseOrderId: po.id,
        incoterm: input.incoterm || null, mode: input.mode, carrier: input.carrier || null, vesselOrFlight: input.vesselOrFlight || null,
        containerNo: input.containerNo || null, transportDocNo: input.transportDocNo || null, portOfLoading: input.portOfLoading || null, portOfDischarge: input.portOfDischarge || null,
        etd: input.etd ?? null, eta: input.eta ?? null, clearingAgentId: input.clearingAgentId || null, dutyCurrency: input.dutyCurrency ?? "USD", notes: input.notes || null, createdById: user.id,
      },
    });
    await log(tx, created.id, user, "STATUS", { status: "PLANNED", note: `Shipment planned against ${po.poNumber}` });
    return created;
  });
  return getShipment(s.id);
}

export async function updateShipment(id: string, version: number, user: AuthUser, input: Partial<ShipmentInput>): Promise<ShipmentDetail> {
  const s = await prisma.shipment.findUnique({ where: { id }, select: { dataAreaId: true, status: true } });
  if (!s) throw new AuthError("Shipment not found", 404);
  if (["DELIVERED", "CANCELLED"].includes(s.status)) throw new AuthError(`A ${s.status.toLowerCase()} shipment cannot be edited`, 409);
  if (input.clearingAgentId) {
    const agent = await prisma.vendor.findFirst({ where: { id: input.clearingAgentId, dataAreaId: s.dataAreaId }, select: { id: true } });
    if (!agent) throw new AuthError("Clearing agent not found in this company", 404);
  }
  const data: Record<string, unknown> = {};
  for (const k of ["incoterm", "mode", "carrier", "vesselOrFlight", "containerNo", "transportDocNo", "portOfLoading", "portOfDischarge", "etd", "eta", "atd", "ata", "clearingAgentId", "dutyCurrency", "notes"] as const) {
    if (input[k] !== undefined) data[k] = input[k] === "" ? null : input[k];
  }
  await updateWithVersion(prisma.shipment, id, version, user.id, data);
  return getShipment(id);
}

const ORDER: ShipmentStatus[] = ["PLANNED", "IN_TRANSIT", "ARRIVED", "CLEARING", "CLEARED", "DELIVERED"];

/** Move the shipment along; dates that the status implies are stamped. */
export async function setShipmentStatus(id: string, user: AuthUser, status: ShipmentStatus, note?: string | null, location?: string | null): Promise<ShipmentDetail> {
  const s = await getShipment(id);
  if (s.status === "CANCELLED") throw new AuthError("The shipment is cancelled", 409);
  if (status !== "CANCELLED" && ORDER.indexOf(status) < ORDER.indexOf(s.status)) throw new AuthError(`Cannot go back from ${s.status.toLowerCase()} to ${status.toLowerCase()}`, 409);
  if (status === "DELIVERED" && s.checklist.blocking) throw new AuthError(s.checklist.blocking, 422);
  const today = new Date(new Date().toISOString().slice(0, 10));
  const stamps: Record<string, unknown> =
    status === "IN_TRANSIT" ? { atd: s.atd ?? today }
    : status === "ARRIVED" ? { ata: s.ata ?? today }
    : status === "DELIVERED" ? { deliveredAt: new Date() }
    : {};
  await prisma.$transaction(async (tx) => {
    await tx.shipment.update({ where: { id }, data: { status, ...stamps, updatedById: user.id, version: { increment: 1 } } });
    await log(tx, id, user, "STATUS", { status, note, location });
  });
  return getShipment(id);
}

export async function setClearance(id: string, user: AuthUser, clearanceStatus: ClearanceStatus, note?: string | null, clearanceRef?: string | null): Promise<ShipmentDetail> {
  const s = await getShipment(id);
  if (["CANCELLED"].includes(s.status)) throw new AuthError("The shipment is cancelled", 409);
  const stamps: Record<string, unknown> = { clearanceStatus, ...(clearanceRef ? { clearanceRef } : {}), ...(note ? { clearanceNote: note } : {}) };
  // The shipment status follows the clearing milestones.
  const follow: ShipmentStatus | null = clearanceStatus === "RELEASED" ? "CLEARED" : ["DOCS_LODGED", "ASSESSED", "DUTY_PAID", "HELD"].includes(clearanceStatus) && ORDER.indexOf(s.status) < ORDER.indexOf("CLEARING") ? "CLEARING" : null;
  await prisma.$transaction(async (tx) => {
    await tx.shipment.update({ where: { id }, data: { ...stamps, ...(follow && ORDER.indexOf(follow) > ORDER.indexOf(s.status) ? { status: follow } : {}), updatedById: user.id, version: { increment: 1 } } });
    await log(tx, id, user, "CLEARANCE", { status: clearanceStatus, note: [clearanceRef && `entry ${clearanceRef}`, note].filter(Boolean).join(" · ") || null });
  });
  return getShipment(id);
}

/** Where the container was last seen, or a plain note. */
export async function addEvent(id: string, user: AuthUser, input: ShipmentEventInput): Promise<ShipmentDetail> {
  const s = await prisma.shipment.findUnique({ where: { id }, select: { id: true } });
  if (!s) throw new AuthError("Shipment not found", 404);
  await log(prisma, id, user, input.kind, { location: input.location || null, note: input.note || null, at: input.at ?? new Date() });
  return getShipment(id);
}

/**
 * Duty and taxes from the customs value. Pure: value x duty rate, VAT on
 * value plus duty, other charges on top. The customer's clearing agent
 * gives the rates; this only does the arithmetic and records it.
 */
export function estimateDuty(input: { customsValue: Prisma.Decimal.Value; dutyRatePct: Prisma.Decimal.Value; vatRatePct?: Prisma.Decimal.Value | null; otherCharges?: Prisma.Decimal.Value | null }) {
  const value = D(input.customsValue);
  const duty = value.times(input.dutyRatePct).dividedBy(100).toDecimalPlaces(2);
  const vat = input.vatRatePct == null ? D(0) : value.plus(duty).times(input.vatRatePct).dividedBy(100).toDecimalPlaces(2);
  const other = D(input.otherCharges ?? 0).toDecimalPlaces(2);
  return { duty, vat, other, total: duty.plus(vat).plus(other) };
}

export async function recordDuty(id: string, user: AuthUser, input: DutyInput): Promise<ShipmentDetail & { estimate: ReturnType<typeof estimateDuty> }> {
  const s = await prisma.shipment.findUnique({ where: { id }, select: { id: true } });
  if (!s) throw new AuthError("Shipment not found", 404);
  const estimate = estimateDuty({ customsValue: input.customsValue, dutyRatePct: input.dutyRatePct, vatRatePct: input.vatRatePct, otherCharges: input.otherChargesEst });
  await prisma.$transaction(async (tx) => {
    await tx.shipment.update({
      where: { id },
      data: {
        customsValue: D(input.customsValue), dutyRatePct: D(input.dutyRatePct), vatRatePct: input.vatRatePct == null ? null : D(input.vatRatePct),
        otherChargesEst: input.otherChargesEst == null ? null : D(input.otherChargesEst), dutyEstimate: estimate.total,
        ...(input.dutyPaid != null ? { dutyPaid: D(input.dutyPaid), dutyPaidAt: input.dutyPaidAt ?? new Date(new Date().toISOString().slice(0, 10)) } : {}),
        ...(input.dutyCurrency ? { dutyCurrency: input.dutyCurrency } : {}),
        updatedById: user.id, version: { increment: 1 },
      },
    });
    await log(tx, id, user, "CLEARANCE", { note: `Duty estimated at ${estimate.total.toFixed(2)} (duty ${estimate.duty.toFixed(2)}, VAT ${estimate.vat.toFixed(2)}, other ${estimate.other.toFixed(2)})${input.dutyPaid != null ? `; paid ${D(input.dutyPaid).toFixed(2)}` : ""}` });
  });
  return { ...(await getShipment(id)), estimate };
}

// ── Documents ────────────────────────────────────────────────────────────────

export async function addDocument(id: string, user: AuthUser, input: ShipmentDocumentInput): Promise<ShipmentDetail> {
  const s = await prisma.shipment.findUnique({ where: { id }, select: { id: true, dataAreaId: true } });
  if (!s) throw new AuthError("Shipment not found", 404);
  if (input.attachmentId) {
    const att = await prisma.attachment.findFirst({ where: { id: input.attachmentId, entityType: "Shipment", entityId: id }, select: { id: true } });
    if (!att) throw new AuthError("That file is not attached to this shipment", 422);
  }
  await prisma.shipmentDocument.create({
    data: { shipmentId: id, docType: input.docType as ShipmentDocType, reference: input.reference || null, attachmentId: input.attachmentId || null, note: input.note || null, createdById: user.id },
  });
  return getShipment(id);
}

/** Someone checked the paper against the shipment. Verification is what the gate counts. */
export async function verifyDocument(id: string, docId: string, user: AuthUser, verified: boolean, note?: string | null): Promise<ShipmentDetail> {
  const doc = await prisma.shipmentDocument.findFirst({ where: { id: docId, shipmentId: id } });
  if (!doc) throw new AuthError("Document not found on this shipment", 404);
  await prisma.$transaction(async (tx) => {
    await tx.shipmentDocument.update({ where: { id: docId }, data: { verified, verifiedById: verified ? user.id : null, verifiedAt: verified ? new Date() : null, ...(note !== undefined ? { note } : {}) } });
    await log(tx, id, user, "NOTE", { note: `${doc.docType.toLowerCase().replace(/_/g, " ")} ${verified ? "verified" : "verification withdrawn"}${doc.reference ? ` (${doc.reference})` : ""}` });
  });
  return getShipment(id);
}

export async function removeDocument(id: string, docId: string): Promise<ShipmentDetail> {
  const doc = await prisma.shipmentDocument.findFirst({ where: { id: docId, shipmentId: id } });
  if (!doc) throw new AuthError("Document not found on this shipment", 404);
  await prisma.shipmentDocument.delete({ where: { id: docId } });
  return getShipment(id);
}

/**
 * Whether goods may be received against a purchase order: when the policy
 * enforces the checklist and the order has shipments, every shipment that
 * is not cancelled must have its papers verified. Local purchases with no
 * shipment are not gated.
 */
export async function grnGate(purchaseOrderId: string, dataAreaId: string): Promise<{ allowed: boolean; reason: string | null; shipmentId: string | null }> {
  const policy = await policyFor(dataAreaId);
  const shipments = await prisma.shipment.findMany({ where: { purchaseOrderId, status: { not: "CANCELLED" } }, include: { documents: { select: { docType: true, verified: true } } }, orderBy: { createdAt: "asc" } });
  if (shipments.length === 0 || !policy.shippingDocsBeforeGrn) return { allowed: true, reason: null, shipmentId: shipments[0]?.id ?? null };
  for (const s of shipments) {
    const c = checklistFor(s.documents, policy.grnRequiredDocs, true);
    if (c.blocking) return { allowed: false, reason: `${s.shipmentNumber}: ${c.blocking}`, shipmentId: s.id };
  }
  return { allowed: true, reason: null, shipmentId: shipments[shipments.length - 1].id };
}
