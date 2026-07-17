import { Hono } from "hono";
import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { vehicleSchema, paginationSchema, maintenanceSchema } from "@backend/lib/validations";
import { buildOrderBy } from "@backend/lib/format";
import { logActivity, logFieldChanges } from "@backend/lib/activity";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { updateWithVersion, requireVersion } from "@backend/lib/concurrency";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { ok, created, pageMeta } from "@backend/lib/http";

export const vehicles = new Hono();

vehicles.get("/", requireAuth, requirePermission("vehicle:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q, sort, order } = paginationSchema.parse(sp);
  const status = sp.status;

  const where: Prisma.VehicleWhereInput = {
    ...areaScope(user),
    ...(q
      ? {
          OR: [
            { vehicleNumber: { contains: q, mode: "insensitive" } },
            { plateNumber: { contains: q, mode: "insensitive" } },
            { maker: { contains: q, mode: "insensitive" } },
            { model: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(status ? { status: status as never } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      orderBy: buildOrderBy(sort, order, ["vehicleNumber", "inspectionExpiry", "insuranceExpiry", "createdAt"], "createdAt"),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.vehicle.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

vehicles.post("/", requireAuth, requirePermission("vehicle:write"), async (c) => {
  const user = c.get("user");
  const body = vehicleSchema.parse(await c.req.json());
  const vehicle = await prisma.vehicle.create({ data: { ...body, dataAreaId: areaForWrite(user), createdById: user.id } });
  await logActivity({ userId: user.id, action: "CREATE", target: `Vehicle:${vehicle.id}` });
  return created(c, vehicle);
});

vehicles.get("/:id", requireAuth, requirePermission("vehicle:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: { maintenances: { orderBy: { date: "desc" } } },
  });
  assertSameArea(user, vehicle);
  return ok(c, vehicle);
});

vehicles.patch("/:id", requireAuth, requirePermission("vehicle:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const raw = await c.req.json();
  const version = requireVersion(raw);
  const body = vehicleSchema.partial().parse(raw);
  const before = await prisma.vehicle.findUnique({ where: { id } });
  assertSameArea(user, before);
  const vehicle = await updateWithVersion(prisma.vehicle, id, version, user.id, body);
  // Field-level audit diff (PRD §7): compare only the columns the caller submitted.
  await logFieldChanges({
    userId: user.id, target: `Vehicle:${id}`, before, after: vehicle,
    only: Object.keys(body),
  });
  return ok(c, vehicle);
});

vehicles.delete("/:id", requireAuth, requirePermission("vehicle:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.vehicle.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  await prisma.vehicle.delete({ where: { id } });
  await logActivity({ userId: user.id, action: "DELETE", target: `Vehicle:${id}` });
  return ok(c, { id });
});

// ---- maintenance history ----
vehicles.get("/:id/maintenances", requireAuth, requirePermission("vehicle:read"), async (c) => {
  const id = c.req.param("id");
  const items = await prisma.vehicleMaintenance.findMany({
    where: { vehicleId: id },
    orderBy: { date: "desc" },
  });
  return ok(c, items);
});

vehicles.post("/:id/maintenances", requireAuth, requirePermission("vehicle:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const veh = await prisma.vehicle.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, veh);
  const body = maintenanceSchema.parse(await c.req.json());
  const item = await prisma.vehicleMaintenance.create({ data: { ...body, vehicleId: id, dataAreaId: veh!.dataAreaId } });
  await logActivity({ userId: user.id, action: "CREATE", target: `VehicleMaintenance:${item.id}` });
  return created(c, item);
});
