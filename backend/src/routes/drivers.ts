import { Hono } from "hono";
import { Prisma, DriverEventKind } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import {
  driverSchema,
  paginationSchema,
  availabilitySchema,
  holidaySchema,
  driverDocumentSchema, driverEventSchema,
} from "@backend/lib/validations";
import { buildOrderBy } from "@backend/lib/format";
import { logActivity, logFieldChanges } from "@backend/lib/activity";
import { hashPassword } from "@backend/lib/password";
import { rateLimit } from "@backend/lib/rate-limit";
import { AuthError } from "@backend/lib/errors";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { updateWithVersion, requireVersion } from "@backend/lib/concurrency";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { ok, created, pageMeta } from "@backend/lib/http";
import { dispatchHolds, isClearToDrive, upcomingRenewals } from "@backend/services/driver-qualification";

export const drivers = new Hono();

drivers.get("/", requireAuth, requirePermission("driver:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q, sort, order } = paginationSchema.parse(sp);
  const status = sp.status;

  const where: Prisma.DriverWhereInput = {
    ...areaScope(user),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
          ],
        }
      : {}),
    ...(status ? { status: status as never } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.driver.findMany({
      where,
      orderBy: buildOrderBy(sort, order, ["name", "joinedAt", "status", "createdAt"], "createdAt"),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.driver.count({ where }),
  ]);

  return ok(c, items, pageMeta(page, pageSize, total));
});

drivers.post("/", requireAuth, requirePermission("driver:write"), async (c) => {
  const user = c.get("user");
  const ip = c.req.header("x-forwarded-for") ?? "local";
  if (!rateLimit(`driver:create:${ip}`, 30).success) {
    throw new AuthError("Too many requests", 429);
  }

  const body = driverSchema.parse(await c.req.json());
  const area = areaForWrite(user);

  const driver = await prisma.$transaction(async (tx) => {
    let userId: string | undefined;
    if (body.createLogin && body.password) {
      const account = await tx.user.create({
        data: {
          name: body.name,
          email: body.email.toLowerCase(),
          passwordHash: await hashPassword(body.password),
          role: "DRIVER",
          dataAreaId: area,
        },
      });
      userId = account.id;
    }
    // Persist every driver field (spec expansion) except the non-model
    // login helpers, which drive the optional User account above.
    const { createLogin: _cl, password: _pw, ...driverFields } = body;
    return tx.driver.create({
      data: {
        ...driverFields,
        dataAreaId: area,
        email: body.email.toLowerCase(),
        userId,
      },
    });
  });

  await logActivity({ userId: user.id, action: "CREATE", target: `Driver:${driver.id}`, ipAddress: ip });
  return created(c, driver);
});

drivers.get("/:id", requireAuth, requirePermission("driver:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const driver = await prisma.driver.findUnique({
    where: { id },
    include: { availability: true, holidays: { orderBy: { date: "asc" } } },
  });
  assertSameArea(user, driver);
  return ok(c, driver);
});

drivers.patch("/:id", requireAuth, requirePermission("driver:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const raw = await c.req.json();
  const version = requireVersion(raw);
  const body = driverSchema.partial().parse(raw);
  const before = await prisma.driver.findUnique({ where: { id } });
  assertSameArea(user, before);
  const driver = await updateWithVersion(prisma.driver, id, version, user.id, {
    name: body.name,
    email: body.email?.toLowerCase(),
    phone: body.phone,
    address: body.address,
    contractType: body.contractType,
    joinedAt: body.joinedAt,
    status: body.status,
  });
  // Field-level audit diff (PRD §7): only the columns this route can touch.
  await logFieldChanges({
    userId: user.id, target: `Driver:${id}`, before, after: driver,
    only: ["name", "email", "phone", "address", "contractType", "joinedAt", "status"],
  });
  return ok(c, driver);
});

drivers.delete("/:id", requireAuth, requirePermission("driver:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.driver.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  await prisma.driver.delete({ where: { id } });
  await logActivity({ userId: user.id, action: "DELETE", target: `Driver:${id}` });
  return ok(c, { id });
});

/** Ensure the driver in the URL belongs to the caller's entity; returns its area. */
async function driverArea(user: Parameters<typeof assertSameArea>[0], id: string): Promise<string> {
  const d = await prisma.driver.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, d);
  return d!.dataAreaId;
}

// ---- availability (per weekday) ----
drivers.get("/:id/availability", requireAuth, requirePermission("driver:read"), async (c) => {
  const id = c.req.param("id");
  const items = await prisma.driverAvailability.findMany({
    where: { driverId: id },
    orderBy: { weekday: "asc" },
  });
  return ok(c, items);
});

drivers.post("/:id/availability", requireAuth, requirePermission("driver:write"), async (c) => {
  const id = c.req.param("id");
  const area = await driverArea(c.get("user"), id);
  const body = availabilitySchema.parse(await c.req.json());
  const item = await prisma.driverAvailability.upsert({
    where: { driverId_weekday: { driverId: id, weekday: body.weekday } },
    create: { ...body, driverId: id, dataAreaId: area },
    update: body,
  });
  return created(c, item);
});

// ---- holidays ----
drivers.get("/:id/holidays", requireAuth, requirePermission("driver:read"), async (c) => {
  const id = c.req.param("id");
  const items = await prisma.holiday.findMany({
    where: { driverId: id },
    orderBy: { date: "asc" },
  });
  return ok(c, items);
});

drivers.post("/:id/holidays", requireAuth, requirePermission("driver:write"), async (c) => {
  const id = c.req.param("id");
  const area = await driverArea(c.get("user"), id);
  const body = holidaySchema.parse(await c.req.json());
  const item = await prisma.holiday.create({ data: { ...body, driverId: id, dataAreaId: area } });
  return created(c, item);
});

drivers.delete("/:id/holidays", requireAuth, requirePermission("driver:write"), async (c) => {
  const holidayId = c.req.query("holidayId");
  if (holidayId) await prisma.holiday.delete({ where: { id: holidayId } });
  return ok(c, { id: holidayId });
});

// ---- compliance documents (one row per (driver, type)) ----
drivers.get("/:id/documents", requireAuth, requirePermission("driver:read"), async (c) => {
  const id = c.req.param("id");
  const items = await prisma.driverDocument.findMany({
    where: { driverId: id },
    orderBy: { expiresAt: "asc" },
  });
  return ok(c, items);
});

drivers.post("/:id/documents", requireAuth, requirePermission("driver:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const area = await driverArea(user, id);
  const body = driverDocumentSchema.parse(await c.req.json());
  const item = await prisma.driverDocument.upsert({
    where: { driverId_type: { driverId: id, type: body.type } },
    create: { driverId: id, dataAreaId: area, ...body, issuer: body.issuer || null },
    update: { number: body.number, issuer: body.issuer || null, issuedAt: body.issuedAt, expiresAt: body.expiresAt, note: body.note },
  });
  await logActivity({ userId: user.id, action: "UPSERT", target: `DriverDocument:${item.id}` });
  return created(c, item);
});

drivers.delete("/:id/documents", requireAuth, requirePermission("driver:write"), async (c) => {
  const id = c.req.param("id");
  const docId = c.req.query("docId");
  if (docId) await prisma.driverDocument.delete({ where: { id: docId, driverId: id } });
  return ok(c, { id: docId });
});

// ── Qualification file (client requirements, Sept 2026, HR §2) ──────────────
//
// Road tests, record checks, violations, drug and alcohol tests and training,
// kept as a dated log rather than a set of flags, so the history is there when
// an insurer or a regulator asks for it.

/** Blank strings from a form mean "not given". */
const t = (v: string | null | undefined) => (v ? v : null);

drivers.get("/:id/events", requireAuth, requirePermission("driver:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await driverArea(user, id);
  const kind = c.req.query("kind");
  const rows = await prisma.driverEvent.findMany({
    where: { driverId: id, ...(kind && kind in DriverEventKind ? { kind: kind as DriverEventKind } : {}) },
    orderBy: { occurredAt: "desc" },
  });
  return ok(c, rows);
});

drivers.post("/:id/events", requireAuth, requirePermission("driver:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const area = await driverArea(user, id);
  const body = driverEventSchema.parse(await c.req.json());
  const row = await prisma.driverEvent.create({
    data: {
      dataAreaId: area,
      driverId: id,
      kind: body.kind,
      occurredAt: body.occurredAt,
      renewalDue: body.renewalDue ?? null,
      title: body.title,
      outcome: body.outcome,
      reference: t(body.reference),
      amount: body.amount == null ? null : new Prisma.Decimal(body.amount),
      reason: t(body.reason),
      sapReferral: body.sapReferral,
      atFault: body.atFault,
      note: t(body.note),
      createdById: user.id,
    },
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `DriverEvent:${row.id}`, detail: { driverId: id, kind: body.kind } });
  return created(c, row);
});

drivers.patch("/:id/events/:eventId", requireAuth, requirePermission("driver:write"), async (c) => {
  const user = c.get("user");
  const { id, eventId } = c.req.param();
  await driverArea(user, id);
  const raw = await c.req.json();
  const version = requireVersion(raw);
  const existing = await prisma.driverEvent.findFirst({ where: { id: eventId, driverId: id }, select: { id: true } });
  if (!existing) throw new AuthError("Not found", 404);
  const body = driverEventSchema.parse(raw);
  const row = await updateWithVersion(prisma.driverEvent, eventId, version, user.id, {
    kind: body.kind,
    occurredAt: body.occurredAt,
    renewalDue: body.renewalDue ?? null,
    title: body.title,
    outcome: body.outcome,
    reference: t(body.reference),
    amount: body.amount == null ? null : new Prisma.Decimal(body.amount),
    reason: t(body.reason),
    sapReferral: body.sapReferral,
    atFault: body.atFault,
    note: t(body.note),
  });
  await logActivity({ userId: user.id, action: "UPDATE", target: `DriverEvent:${eventId}` });
  return ok(c, row);
});

drivers.delete("/:id/events/:eventId", requireAuth, requirePermission("driver:write"), async (c) => {
  const user = c.get("user");
  const { id, eventId } = c.req.param();
  await driverArea(user, id);
  const existing = await prisma.driverEvent.findFirst({ where: { id: eventId, driverId: id }, select: { id: true } });
  if (!existing) throw new AuthError("Not found", 404);
  await prisma.driverEvent.delete({ where: { id: eventId } });
  await logActivity({ userId: user.id, action: "DELETE", target: `DriverEvent:${eventId}` });
  return ok(c, { id: eventId });
});

/**
 * Is this driver clear to dispatch, and what is about to lapse.
 *
 * The one call a dispatcher needs before assigning a trip. The rules are in
 * services/driver-qualification.ts and unit-tested there; this just gathers
 * the file and asks.
 */
drivers.get("/:id/qualification", requireAuth, requirePermission("driver:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await driverArea(user, id);
  const asOf = c.req.query("asOf") ? new Date(c.req.query("asOf")!) : new Date();
  const [driver, docs, events] = await Promise.all([
    prisma.driver.findUniqueOrThrow({ where: { id }, select: { status: true, licenseExpiry: true, medicalCertExpiry: true, name: true } }),
    prisma.driverDocument.findMany({ where: { driverId: id }, select: { type: true, expiresAt: true } }),
    prisma.driverEvent.findMany({ where: { driverId: id }, select: { kind: true, occurredAt: true, renewalDue: true, outcome: true, sapReferral: true } }),
  ]);
  const holds = dispatchHolds(driver, docs, events, asOf);
  return ok(c, {
    driver: driver.name,
    asOf,
    clearToDrive: isClearToDrive(holds),
    holds,
    renewals: upcomingRenewals(driver, docs, events, asOf),
  });
});
