import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DriverDetail } from "./driver-detail";

export default async function DriverDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const driver = await prisma.driver.findUnique({
    where: { id },
    include: { availability: { orderBy: { weekday: "asc" } }, holidays: { orderBy: { date: "asc" } } },
  });
  if (!driver) notFound();

  return (
    <DriverDetail
      driverId={driver.id}
      name={driver.name}
      availability={driver.availability.map((a) => ({ ...a }))}
      holidays={driver.holidays.map((h) => ({ id: h.id, date: h.date.toISOString().slice(0, 10), reason: h.reason }))}
    />
  );
}
