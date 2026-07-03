import { Hono } from "hono";
import { prisma } from "@backend/lib/prisma";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { areaScope } from "@backend/lib/scope";
import { ok } from "@backend/lib/http";

/**
 * Reference datasets for the web app's create/edit forms (dropdowns).
 *
 * These small, unpaginated lookups previously came from direct Prisma reads in
 * the Next.js Server Components; the frontend now fetches them here so it keeps
 * no database access. Each sub-route requires the same read permission as the
 * screen it serves.
 */
export const lookups = new Hono();

/** Clients for order/job forms. */
lookups.get("/clients", requireAuth, requirePermission("client:read"), async (c) => {
  const clients = await prisma.client.findMany({
    select: { id: true, companyName: true },
    orderBy: { companyName: "asc" },
  });
  return ok(c, clients);
});

/** Active accounts for the journal entry form. */
lookups.get("/accounts", requireAuth, requirePermission("account:read"), async (c) => {
  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
  return ok(c, accounts);
});

/** Active vendors (with currency) for the payables form. */
lookups.get("/vendors", requireAuth, requirePermission("payable:read"), async (c) => {
  const vendors = await prisma.vendor.findMany({
    where: { isActive: true },
    select: { id: true, code: true, legalName: true, currency: true },
    orderBy: { code: "asc" },
  });
  return ok(c, vendors);
});

/** Vendors + stock items for the purchase-order form (procurement authority). */
lookups.get("/procurement-form", requireAuth, requirePermission("procurement:read"), async (c) => {
  const user = c.get("user");
  const [vendors, items] = await Promise.all([
    prisma.vendor.findMany({
      where: { ...areaScope(user), isActive: true },
      select: { id: true, code: true, legalName: true, currency: true },
      orderBy: { code: "asc" },
    }),
    prisma.stockItem.findMany({
      where: { ...areaScope(user), isActive: true },
      select: { id: true, code: true, name: true, unit: true, expenseCode: true },
      orderBy: { code: "asc" },
    }),
  ]);
  return ok(c, { vendors, items });
});

/** Stock items + warehouses for the transfer form (warehouse authority). */
lookups.get("/warehouse-form", requireAuth, requirePermission("warehouse:read"), async (c) => {
  const user = c.get("user");
  const [items, warehouses] = await Promise.all([
    prisma.stockItem.findMany({
      where: { ...areaScope(user), isActive: true },
      select: { id: true, code: true, name: true, unit: true },
      orderBy: { code: "asc" },
    }),
    prisma.warehouse.findMany({
      where: { ...areaScope(user), isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);
  return ok(c, { items, warehouses });
});

/** Active customers (with currency) for the receivables form. */
lookups.get("/customers", requireAuth, requirePermission("receivable:read"), async (c) => {
  const customers = await prisma.customer.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, currency: true },
    orderBy: { code: "asc" },
  });
  return ok(c, customers);
});

/** Dispatchable resources for the trips form: open orders + active drivers + available vehicles. */
lookups.get("/trip-form", requireAuth, requirePermission("trip:read"), async (c) => {
  const [orders, drivers, vehicles] = await Promise.all([
    prisma.order.findMany({
      where: { trip: null, status: { in: ["DRAFT", "CONFIRMED"] } },
      select: { id: true, orderCode: true, originZone: true, destinationZone: true, corridor: true },
      orderBy: { bookingDate: "desc" },
    }),
    prisma.driver.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.vehicle.findMany({
      where: { status: "AVAILABLE" },
      select: { id: true, vehicleNumber: true, plateNumber: true },
      orderBy: { vehicleNumber: "asc" },
    }),
  ]);
  return ok(c, { orders, drivers, vehicles });
});

/** Jobs still needing a dispatch, for the dispatch board. */
lookups.get("/undispatched", requireAuth, requirePermission("dispatch:read"), async (c) => {
  const rows = await prisma.deliveryJob.findMany({
    where: { dispatch: null, status: { in: ["PENDING", "WAITING_DISPATCH"] } },
    include: { client: { select: { companyName: true } } },
    orderBy: { deliveryDate: "asc" },
  });
  return ok(
    c,
    rows.map((j) => ({
      id: j.id,
      jobCode: j.jobCode,
      client: j.client.companyName,
      deliveryAddress: j.deliveryAddress,
      deliveryDate: j.deliveryDate.toISOString(),
    })),
  );
});
