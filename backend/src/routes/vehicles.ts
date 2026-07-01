import { Hono } from "hono";
import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { vehicleSchema, paginationSchema, maintenanceSchema } from "@backend/lib/validations";
import { buildOrderBy } from "@backend/lib/format";
import { logActivity } from "@backend/lib/activity";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { updateWithVersion, requireVersion } from "@backend/lib/concurrency";
import { ok, created, pageMeta } from "@backend/lib/http";

export const vehicles = new Hono();

vehicles.get("/", requireAuth, requirePermission("vehicle:read"), async (c) => {
  const sp = c.req.query();
  const { page, pageSize, q, sort, order } = paginationSchema.parse(sp);
  const status = sp.status;

  const where: Prisma.VehicleWhereInput = {
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
  const vehicle = await prisma.vehicle.create({ data: { ...body, createdById: user.id } });
  await logActivity({ userId: user.id, action: "CREATE", target: `Vehicle:${vehicle.id}` });
  return created(c, vehicle);
});

vehicles.get("/:id", requireAuth, requirePermission("vehicle:read"), async (c) => {
  const id = c.req.param("id");
  const vehicle = await prisma.vehicle.findUniqueOrThrow({
    where: { id },
    include: { maintenances: { orderBy: { date: "desc" } } },
  });
  return ok(c, vehicle);
});

vehicles.patch("/:id", requireAuth, requirePermission("vehicle:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const raw = await c.req.json();
  const version = requireVersion(raw);
  const body = vehicleSchema.partial().parse(raw);
  const vehicle = await updateWithVersion(prisma.vehicle, id, version, user.id, body);
  await logActivity({ userId: user.id, action: "UPDATE", target: `Vehicle:${id}`, detail: body });
  return ok(c, vehicle);
});

vehicles.delete("/:id", requireAuth, requirePermission("vehicle:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
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
  const body = maintenanceSchema.parse(await c.req.json());
  const item = await prisma.vehicleMaintenance.create({ data: { ...body, vehicleId: id } });
  await logActivity({ userId: user.id, action: "CREATE", target: `VehicleMaintenance:${item.id}` });
  return created(c, item);
});
