"use client";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { formatDate } from "@frontend/lib/utils";

interface Log {
  id: string; action: string; target: string; ipAddress: string | null; createdAt: string;
  user: { name: string; email: string } | null;
}

export default function ActivityPage() {
  const columns: Column<Log>[] = [
    { key: "createdAt", header: "Time", render: (r) => formatDate(r.createdAt, true) },
    { key: "user", header: "User", render: (r) => r.user?.name ?? "—" },
    { key: "action", header: "Action" },
    { key: "target", header: "Target" },
    { key: "ipAddress", header: "IP", render: (r) => r.ipAddress ?? "—" },
  ];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Activity Log</h1>
      <DataTable<Log> endpoint="/api/activity" columns={columns} searchPlaceholder="" />
    </div>
  );
}
