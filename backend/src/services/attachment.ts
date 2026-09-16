import { AttachmentKind } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import { areaScope } from "@backend/lib/scope";
import type { AuthUser } from "@backend/lib/auth";
import type { Permission } from "@backend/lib/rbac";

/**
 * Documents attached to business records.
 *
 * `Attachment.entityType` is a plain string because Postgres cannot foreign-key
 * one column to twelve tables. Everything that keeps it trustworthy lives here:
 * the allowlist below is the only set of values a write will accept, and every
 * write first proves the owning record exists inside the caller's tenant.
 *
 * Without that second check, `entityId` would be an oracle: attaching a file to
 * another tenant's asset id would either succeed, or fail differently depending
 * on whether the id existed.
 */

interface Attachable {
  /** Permission needed to see the record's documents. */
  read: Permission;
  /** Permission needed to add or remove them. */
  write: Permission;
  /** Scoped lookup returning the owner's tenant, or null when out of reach. */
  find: (id: string, user: AuthUser) => Promise<{ dataAreaId: string } | null>;
}

const area = { dataAreaId: true } as const;

/**
 * Written out per type rather than indexing Prisma dynamically: a dynamic
 * delegate lookup needs an `any` cast, which would give up exactly the checking
 * that makes this table safe.
 */
export const ATTACHABLE = {
  ExpenseClaim: {
    read: "expense:read", write: "expense:write",
    find: (id, u) => prisma.expenseClaim.findFirst({ where: { id, ...areaScope(u) }, select: area }),
  },
  FixedAsset: {
    read: "asset:read", write: "asset:write",
    find: (id, u) => prisma.fixedAsset.findFirst({ where: { id, ...areaScope(u) }, select: area }),
  },
  DamageReport: {
    read: "kpi:read", write: "kpi:write",
    find: (id, u) => prisma.damageReport.findFirst({ where: { id, ...areaScope(u) }, select: area }),
  },
  DockEvent: {
    read: "kpi:read", write: "kpi:write",
    find: (id, u) => prisma.dockEvent.findFirst({ where: { id, ...areaScope(u) }, select: area }),
  },
  Shipment: {
    read: "procurement:read", write: "procurement:write",
    find: (id, u) => prisma.shipment.findFirst({ where: { id, ...areaScope(u) }, select: area }),
  },
  Rfq: {
    read: "procurement:read", write: "procurement:write",
    find: (id, u) => prisma.rfq.findFirst({ where: { id, ...areaScope(u) }, select: area }),
  },
  Requisition: {
    read: "procurement:read", write: "procurement:write",
    find: (id, u) => prisma.requisition.findFirst({ where: { id, ...areaScope(u) }, select: area }),
  },
  ServiceOrder: {
    read: "service:read", write: "service:write",
    find: (id, u) => prisma.serviceOrder.findFirst({ where: { id, ...areaScope(u) }, select: area }),
  },
  Driver: {
    read: "driver:read", write: "driver:write",
    find: (id, u) => prisma.driver.findFirst({ where: { id, ...areaScope(u) }, select: area }),
  },
  Employee: {
    read: "hr:read", write: "hr:write",
    find: (id, u) => prisma.employee.findFirst({ where: { id, ...areaScope(u) }, select: area }),
  },
  Vehicle: {
    read: "vehicle:read", write: "vehicle:write",
    find: (id, u) => prisma.vehicle.findFirst({ where: { id, ...areaScope(u) }, select: area }),
  },
  Order: {
    read: "order:read", write: "order:write",
    find: (id, u) => prisma.order.findFirst({ where: { id, ...areaScope(u) }, select: area }),
  },
  Trip: {
    read: "trip:read", write: "trip:write",
    find: (id, u) => prisma.trip.findFirst({ where: { id, ...areaScope(u) }, select: area }),
  },
  Vendor: {
    read: "vendor:read", write: "vendor:write",
    find: (id, u) => prisma.vendor.findFirst({ where: { id, ...areaScope(u) }, select: area }),
  },
  PurchaseOrder: {
    read: "procurement:read", write: "procurement:write",
    find: (id, u) => prisma.purchaseOrder.findFirst({ where: { id, ...areaScope(u) }, select: area }),
  },
} satisfies Record<string, Attachable>;

export type AttachableType = keyof typeof ATTACHABLE;

export function isAttachableType(value: string): value is AttachableType {
  return Object.prototype.hasOwnProperty.call(ATTACHABLE, value);
}

/** The allowlist, for the API to advertise and the UI to render. */
export function attachableTypes(): AttachableType[] {
  return Object.keys(ATTACHABLE) as AttachableType[];
}

/**
 * Prove the owner exists and is reachable, and return its tenant.
 *
 * 404 rather than 403 for a record in another tenant, matching every other
 * route: a 403 would confirm the id exists somewhere.
 */
export async function resolveOwner(
  user: AuthUser,
  entityType: string,
  entityId: string,
): Promise<{ type: AttachableType; dataAreaId: string }> {
  if (!isAttachableType(entityType)) {
    throw new AuthError(`Documents cannot be attached to ${entityType}`, 422);
  }
  const owner = await ATTACHABLE[entityType].find(entityId, user);
  if (!owner) throw new AuthError("Not found", 404);
  return { type: entityType, dataAreaId: owner.dataAreaId };
}

export interface AttachmentInput {
  entityType: string;
  entityId: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  kind?: AttachmentKind;
  note?: string | null;
}

export async function recordAttachment(user: AuthUser, input: AttachmentInput) {
  const owner = await resolveOwner(user, input.entityType, input.entityId);
  return prisma.attachment.create({
    data: {
      // The owner's tenant, not the uploader's. They are the same for everyone
      // except a platform admin, who would otherwise file the document under
      // their own entity and hide it from the people who need it.
      dataAreaId: owner.dataAreaId,
      entityType: owner.type,
      entityId: input.entityId,
      fileName: input.fileName,
      fileUrl: input.fileUrl,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      kind: input.kind ?? "OTHER",
      note: input.note ?? null,
      createdById: user.id,
    },
  });
}

/** Documents on one record, newest first. */
export async function listAttachments(user: AuthUser, entityType: string, entityId: string) {
  await resolveOwner(user, entityType, entityId);
  return prisma.attachment.findMany({
    where: { ...areaScope(user), entityType, entityId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * How many documents each of these records holds.
 *
 * Backs the evidence-count badge on a list screen. One grouped query rather
 * than one per row, which on a 20-row page would be 20 round trips.
 */
export async function countAttachments(
  user: AuthUser,
  entityType: string,
  entityIds: string[],
): Promise<Record<string, number>> {
  if (!isAttachableType(entityType) || entityIds.length === 0) return {};
  const rows = await prisma.attachment.groupBy({
    by: ["entityId"],
    where: { ...areaScope(user), entityType, entityId: { in: entityIds } },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.entityId, r._count._all]));
}

/**
 * Look up a document within the caller's tenant without removing it.
 *
 * Deleting is two steps because the permission needed depends on what the file
 * is attached to, and that is only knowable once the row has been read. The
 * caller checks the permission between the two.
 */
export async function findAttachment(user: AuthUser, id: string) {
  const found = await prisma.attachment.findFirst({
    where: { id, ...areaScope(user) },
    select: { id: true, entityType: true, entityId: true, fileName: true },
  });
  if (!found) throw new AuthError("Not found", 404);
  return found;
}

/** Remove a document. The file itself is left on disk; see the route. */
export async function deleteAttachment(user: AuthUser, id: string) {
  const found = await findAttachment(user, id);
  // Re-prove the owner is reachable: the attachment row alone does not
  // guarantee the record it hangs off is still inside this tenant.
  await resolveOwner(user, found.entityType, found.entityId);
  await prisma.attachment.delete({ where: { id: found.id } });
  return found;
}
