import { notFound } from "next/navigation";
import { serverApi, ServerApiError } from "@frontend/lib/server-api";
import { DriverDetail } from "./driver-detail";

type DriverWithRelations = {
  id: string;
  name: string;
  availability: { id: string; weekday: number; startTime: string; endTime: string; isActive: boolean; driverId: string }[];
  holidays: { id: string; date: string; reason: string | null }[];
};

export default async function DriverDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let driver: DriverWithRelations;
  try {
    driver = await serverApi<DriverWithRelations>(`/api/drivers/${id}`);
  } catch (e) {
    if (e instanceof ServerApiError && e.status === 404) notFound();
    throw e;
  }

  return (
    <DriverDetail
      driverId={driver.id}
      name={driver.name}
      availability={driver.availability.map((a) => ({ ...a }))}
      holidays={driver.holidays.map((h) => ({ id: h.id, date: h.date.slice(0, 10), reason: h.reason }))}
    />
  );
}
