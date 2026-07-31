import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { AttributesManager, type ProductAttribute } from "./attributes-manager";

export const metadata = { title: "Product Attributes | FleetFlow" };
export const dynamic = "force-dynamic";

export default async function ProductAttributesPage() {
  const attributes = await serverApi<ProductAttribute[]>("/api/product-attributes");
  return (
    <div className="space-y-6">
      <PageHeader title="Product Attributes" subtitle="Define custom specs for stock items — e.g. viscosity for lubricants, thread size for parts. Attributes can apply to one category or all, and are set per item from the inventory Specs editor." />
      <AttributesManager initial={attributes} />
    </div>
  );
}
