import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { checkDispatchConflict, availableDrivers } from "@/lib/services/dispatch";

/**
 * Integration test — requires a reachable PostgreSQL (DATABASE_URL) with the
 * schema applied. Run:
 *   DATABASE_URL=... npx prisma migrate deploy
 *   npm run test:integration
 */

let driverId = "";
let vehicleId = "";
let clientId = "";
const jobIds: string[] = [];
let dbAvailable = true;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbAvailable = false;
    return;
  }
  const client = await prisma.client.create({
    data: { companyName: "IT-Test", contactPerson: "t", phone: "00000000", address: "a", email: `it-${Date.now()}@t.local` },
  });
  clientId = client.id;
  const driver = await prisma.driver.create({
    data: { name: "IT Driver", email: `itd-${Date.now()}@t.local`, phone: "00000000", address: "a", contractType: "CONTRACTOR", joinedAt: new Date(), status: "ACTIVE" },
  });
  driverId = driver.id;
  const vehicle = await prisma.vehicle.create({
    data: { vehicleNumber: `IT-${Date.now()}`, plateNumber: `IT-${Date.now()}`, maker: "m", model: "x", insuranceExpiry: new Date(), inspectionExpiry: new Date() },
  });
  vehicleId = vehicle.id;
});

afterAll(async () => {
  if (!dbAvailable) return;
  await prisma.dispatch.deleteMany({ where: { driverId } });
  await prisma.deliveryJob.deleteMany({ where: { id: { in: jobIds } } });
  await prisma.driver.deleteMany({ where: { id: driverId } });
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
  await prisma.client.deleteMany({ where: { id: clientId } });
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DATABASE_URL)("dispatch conflict (integration)", () => {
  it("flags a driver double-booking and removes the driver from availability", async () => {
    if (!dbAvailable) return;
    const start = new Date("2099-01-01T10:00:00Z");
    const end = new Date("2099-01-01T14:00:00Z");

    const job = await prisma.deliveryJob.create({
      data: { jobCode: `IT-${Date.now()}`, clientId, pickupAddress: "p", deliveryAddress: "d", deliveryDate: start, cargoDescription: "c", rewardAmount: 1000 },
    });
    jobIds.push(job.id);

    await prisma.dispatch.create({ data: { jobId: job.id, driverId, vehicleId, scheduledStart: start, scheduledEnd: end } });

    // Overlapping window → conflict.
    const conflict = await checkDispatchConflict({
      driverId, vehicleId, scheduledStart: new Date("2099-01-01T12:00:00Z"), scheduledEnd: new Date("2099-01-01T16:00:00Z"),
    });
    expect(conflict.hasConflict).toBe(true);
    expect(conflict.driverConflict).toBe(true);

    // The booked driver should be excluded from availability for the same window.
    const free = await availableDrivers(start, end);
    expect(free.find((d) => d.id === driverId)).toBeUndefined();
  });
});
