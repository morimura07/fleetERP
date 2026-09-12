import { Hono } from "hono";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import { requireAuth, effectiveRoleKey } from "@backend/lib/auth";
import type { AuthUser } from "@backend/lib/auth";
import { can } from "@backend/lib/rbac";
import type { Permission } from "@backend/lib/rbac";
import { areaScope, areaForWrite } from "@backend/lib/scope";
import { logActivity } from "@backend/lib/activity";
import { requireVersion, updateWithVersion } from "@backend/lib/concurrency";
import { ok, created } from "@backend/lib/http";
import { partySiteSchema, partyContactSchema } from "@backend/lib/validations";

/**
 * Locations and named contacts for a trading partner.
 *
 * The September document's "Companies" section asks for operational branches,
 * primary contacts and communication preferences. Those belong to Client and
 * Vendor, the trading-partner records, not to Company: a Company's `code` is
 * the dataAreaId, so giving a customer one would make them a tenant partition.
 *
 * Both parties share these two tables, so the shape is the same on either side
 * and a screen can render one panel for both.
 */

interface Party {
  read: Permission;
  write: Permission;
  /** Confirm the partner exists inside the caller's tenant, or 404. */
  find: (id: string, user: AuthUser) => Promise<{ dataAreaId: string } | null>;
  /** Which foreign key the rows hang off. */
  column: "clientId" | "vendorId";
}

const PARTIES = {
  clients: {
    read: "client:read", write: "client:write", column: "clientId",
    find: (id, u) =>
      prisma.client.findFirst({ where: { id, ...areaScope(u) }, select: { dataAreaId: true } }),
  },
  vendors: {
    read: "vendor:read", write: "vendor:write", column: "vendorId",
    find: (id, u) =>
      prisma.vendor.findFirst({ where: { id, ...areaScope(u) }, select: { dataAreaId: true } }),
  },
} satisfies Record<string, Party>;

type PartyName = keyof typeof PARTIES;

function isParty(value: string): value is PartyName {
  return Object.prototype.hasOwnProperty.call(PARTIES, value);
}

/**
 * Resolve the partner and check the caller may act on it.
 *
 * Returns 404 rather than 403 for a partner in another tenant, so an id cannot
 * be used to discover that one exists.
 */
async function resolveParty(user: AuthUser, partyType: string, partyId: string, mode: "read" | "write") {
  if (!isParty(partyType)) {
    throw new AuthError(`Unknown party type "${partyType}". Use clients or vendors.`, 422);
  }
  const spec = PARTIES[partyType];
  if (!can(effectiveRoleKey(user), spec[mode])) throw new AuthError("You do not have permission", 403);
  const found = await spec.find(partyId, user);
  if (!found) throw new AuthError("Not found", 404);
  return { spec, dataAreaId: found.dataAreaId };
}

export const parties = new Hono();

/** Blank strings from a form mean "not given", not an empty value. */
const t = (v: string | null | undefined) => (v ? v : null);

// ── Sites ────────────────────────────────────────────────────────────────────

parties.get("/:partyType/:partyId/sites", requireAuth, async (c) => {
  const user = c.get("user");
  const { partyType, partyId } = c.req.param();
  const { spec } = await resolveParty(user, partyType, partyId, "read");
  const rows = await prisma.partySite.findMany({
    where: { ...areaScope(user), [spec.column]: partyId },
    // The registered address first, then alphabetically: an operator picking a
    // delivery point wants the head office at the top.
    orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
  });
  return ok(c, rows);
});

parties.post("/:partyType/:partyId/sites", requireAuth, async (c) => {
  const user = c.get("user");
  const { partyType, partyId } = c.req.param();
  const { spec, dataAreaId } = await resolveParty(user, partyType, partyId, "write");
  const body = partySiteSchema.parse(await c.req.json());

  const site = await prisma.$transaction(async (tx) => {
    // Only one address can be the registered one, so setting a new primary
    // clears the old rather than leaving two claiming to be it.
    if (body.isPrimary) {
      await tx.partySite.updateMany({
        where: { [spec.column]: partyId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return tx.partySite.create({
      data: {
        // The partner's tenant, not the caller's: a platform admin must not
        // file a customer's depot under their own entity.
        dataAreaId,
        [spec.column]: partyId,
        name: body.name,
        kind: body.kind,
        street: t(body.street),
        city: t(body.city),
        region: t(body.region),
        postalCode: t(body.postalCode),
        country: body.country ? body.country.toUpperCase() : null,
        phone: t(body.phone),
        email: t(body.email),
        isPrimary: body.isPrimary,
        notes: t(body.notes),
        createdById: user.id,
      },
    });
  });

  await logActivity({ userId: user.id, action: "CREATE", target: `PartySite:${site.id}`, detail: { partyType, partyId } });
  return created(c, site);
});

parties.patch("/sites/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const raw = await c.req.json();
  const version = requireVersion(raw);

  const existing = await prisma.partySite.findFirst({
    where: { id, ...areaScope(user) },
    select: { id: true, clientId: true, vendorId: true },
  });
  if (!existing) throw new AuthError("Not found", 404);
  const partyType = existing.clientId ? "clients" : "vendors";
  const partyId = existing.clientId ?? existing.vendorId!;
  const { spec } = await resolveParty(user, partyType, partyId, "write");

  const body = partySiteSchema.parse(raw);
  const site = await prisma.$transaction(async (tx) => {
    if (body.isPrimary) {
      await tx.partySite.updateMany({
        where: { [spec.column]: partyId, isPrimary: true, NOT: { id } },
        data: { isPrimary: false },
      });
    }
    return updateWithVersion(tx.partySite, id, version, user.id, {
      name: body.name,
      kind: body.kind,
      street: t(body.street),
      city: t(body.city),
      region: t(body.region),
      postalCode: t(body.postalCode),
      country: body.country ? body.country.toUpperCase() : null,
      phone: t(body.phone),
      email: t(body.email),
      isPrimary: body.isPrimary,
      notes: t(body.notes),
    });
  });

  await logActivity({ userId: user.id, action: "UPDATE", target: `PartySite:${id}` });
  return ok(c, site);
});

parties.delete("/sites/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.partySite.findFirst({
    where: { id, ...areaScope(user) },
    select: { id: true, clientId: true, vendorId: true },
  });
  if (!existing) throw new AuthError("Not found", 404);
  await resolveParty(user, existing.clientId ? "clients" : "vendors", existing.clientId ?? existing.vendorId!, "write");
  await prisma.partySite.delete({ where: { id } });
  await logActivity({ userId: user.id, action: "DELETE", target: `PartySite:${id}` });
  return ok(c, { id });
});

// ── Contacts ─────────────────────────────────────────────────────────────────

parties.get("/:partyType/:partyId/contacts", requireAuth, async (c) => {
  const user = c.get("user");
  const { partyType, partyId } = c.req.param();
  const { spec } = await resolveParty(user, partyType, partyId, "read");
  const rows = await prisma.partyContact.findMany({
    where: { ...areaScope(user), [spec.column]: partyId },
    orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
  });
  return ok(c, rows);
});

parties.post("/:partyType/:partyId/contacts", requireAuth, async (c) => {
  const user = c.get("user");
  const { partyType, partyId } = c.req.param();
  const { spec, dataAreaId } = await resolveParty(user, partyType, partyId, "write");
  const body = partyContactSchema.parse(await c.req.json());

  const contact = await prisma.$transaction(async (tx) => {
    if (body.isPrimary) {
      await tx.partyContact.updateMany({
        where: { [spec.column]: partyId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return tx.partyContact.create({
      data: {
        dataAreaId,
        [spec.column]: partyId,
        name: body.name,
        title: t(body.title),
        phone: t(body.phone),
        mobile: t(body.mobile),
        email: t(body.email),
        role: body.role,
        isPrimary: body.isPrimary,
        notifyDeliveryStatus: body.notifyDeliveryStatus,
        notifyInvoices: body.notifyInvoices,
        notes: t(body.notes),
        createdById: user.id,
      },
    });
  });

  await logActivity({ userId: user.id, action: "CREATE", target: `PartyContact:${contact.id}`, detail: { partyType, partyId } });
  return created(c, contact);
});

parties.patch("/contacts/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const raw = await c.req.json();
  const version = requireVersion(raw);

  const existing = await prisma.partyContact.findFirst({
    where: { id, ...areaScope(user) },
    select: { id: true, clientId: true, vendorId: true },
  });
  if (!existing) throw new AuthError("Not found", 404);
  const partyId = existing.clientId ?? existing.vendorId!;
  const { spec } = await resolveParty(user, existing.clientId ? "clients" : "vendors", partyId, "write");

  const body = partyContactSchema.parse(raw);
  const contact = await prisma.$transaction(async (tx) => {
    if (body.isPrimary) {
      await tx.partyContact.updateMany({
        where: { [spec.column]: partyId, isPrimary: true, NOT: { id } },
        data: { isPrimary: false },
      });
    }
    return updateWithVersion(tx.partyContact, id, version, user.id, {
      name: body.name,
      title: t(body.title),
      phone: t(body.phone),
      mobile: t(body.mobile),
      email: t(body.email),
      role: body.role,
      isPrimary: body.isPrimary,
      notifyDeliveryStatus: body.notifyDeliveryStatus,
      notifyInvoices: body.notifyInvoices,
      notes: t(body.notes),
    });
  });

  await logActivity({ userId: user.id, action: "UPDATE", target: `PartyContact:${id}` });
  return ok(c, contact);
});

parties.delete("/contacts/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.partyContact.findFirst({
    where: { id, ...areaScope(user) },
    select: { id: true, clientId: true, vendorId: true },
  });
  if (!existing) throw new AuthError("Not found", 404);
  await resolveParty(user, existing.clientId ? "clients" : "vendors", existing.clientId ?? existing.vendorId!, "write");
  await prisma.partyContact.delete({ where: { id } });
  await logActivity({ userId: user.id, action: "DELETE", target: `PartyContact:${id}` });
  return ok(c, { id });
});

/**
 * Who should be told about a delivery or an invoice.
 *
 * Read by the notification side rather than by a screen: without it, "automated
 * delivery status notifications" is a checkbox nothing consults.
 */
export async function contactsToNotify(
  dataAreaId: string,
  partyType: PartyName,
  partyId: string,
  about: "delivery" | "invoice",
) {
  const spec = PARTIES[partyType];
  return prisma.partyContact.findMany({
    where: {
      dataAreaId,
      [spec.column]: partyId,
      email: { not: null },
      ...(about === "delivery" ? { notifyDeliveryStatus: true } : { notifyInvoices: true }),
    },
    select: { name: true, email: true },
  });
}
