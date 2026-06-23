import { prisma } from "@/lib/prisma";
import { DispatchManager } from "./dispatch-manager";

export const metadata = { title: "Dispatch | FleetFlow" };
export const dynamic = "force-dynamic";

export default async function DispatchPage() {
  // Jobs that still need a dispatch.
  const undispatched = await prisma.deliveryJob.findMany({
    where: { dispatch: null, status: { in: ["PENDING", "WAITING_DISPATCH"] } },
    include: { client: { select: { companyName: true } } },
    orderBy: { deliveryDate: "asc" },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Dispatch</h1>
      <DispatchManager
        undispatched={undispatched.map((j) => ({
          id: j.id, jobCode: j.jobCode, client: j.client.companyName,
          deliveryAddress: j.deliveryAddress, deliveryDate: j.deliveryDate.toISOString(),
        }))}
      />
    </div>
  );
}
