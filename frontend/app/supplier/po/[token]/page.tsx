import { SupplierOrder } from "./supplier-order";

export const metadata = { title: "Purchase order | FleetFlow" };
export const dynamic = "force-dynamic";

/** The supplier's page: reached by the secret link, no login. */
export default async function SupplierPoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SupplierOrder token={token} />;
}
