import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { TripsManager } from "./trips-manager";

export const metadata = { title: "Trips | FleetFlow" };

export default async function TripsPage() {
  const [orders, drivers, vehicles] = await Promise.all([
    // Orders ready to dispatch (confirmed/draft, no trip yet).
    prisma.order.findMany({
      where: { trip: null, status: { in: ["DRAFT", "CONFIRMED"] } },
      select: { id: true, orderCode: true, originZone: true, destinationZone: true, corridor: true },
      orderBy: { bookingDate: "desc" },
    }),
    prisma.driver.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.vehicle.findMany({ where: { status: "AVAILABLE" }, select: { id: true, vehicleNumber: true, plateNumber: true }, orderBy: { vehicleNumber: "asc" } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Trips"
        subtitle="Trip execution, expenses, and per-trip profit & loss."
      />
      <TripsManager orders={orders} drivers={drivers} vehicles={vehicles} />
    </div>
  );
}
