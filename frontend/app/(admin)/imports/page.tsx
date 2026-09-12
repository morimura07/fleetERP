import { PageHeader } from "@frontend/components/layout/page-header";
import { ImportsManager } from "./imports-manager";

export const metadata = { title: "Data Import | FleetFlow" };
export const dynamic = "force-dynamic";

export default function ImportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Import"
        subtitle="Bring master data across from another system. Every file is checked and reported on before anything is written, and an import either applies in full or not at all."
      />
      <ImportsManager />
    </div>
  );
}
