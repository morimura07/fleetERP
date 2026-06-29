import { serverApi } from "@frontend/lib/server-api";
import { DispatchManager } from "./dispatch-manager";

export const metadata = { title: "Dispatch | FleetFlow" };
export const dynamic = "force-dynamic";

type Undispatched = {
  id: string;
  jobCode: string;
  client: string;
  deliveryAddress: string;
  deliveryDate: string;
};

export default async function DispatchPage() {
  const undispatched = await serverApi<Undispatched[]>("/api/lookups/undispatched");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Dispatch</h1>
      <DispatchManager undispatched={undispatched} />
    </div>
  );
}
